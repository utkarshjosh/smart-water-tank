import express from 'express';
import * as crypto from 'crypto';
import { authenticateDevice, DeviceAuthRequest, createDeviceToken } from '../middleware/deviceAuth.middleware';
import { query } from '../config/database';
import { z } from 'zod';
import { processAlertsForMeasurement } from '../services/alert.service';
import * as fs from 'fs';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Per-IP limiter: this route is unauthenticated (the device has no token
// yet), so it's the real brute-force surface for guessing claim codes.
const deviceClaimLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const claimSchema = z.object({
  claim_code: z.string().min(1),
  hardware_id: z.string().min(1),
});

// POST /api/v1/devices/claim - Device exchanges a short-lived claim code
// (typed into its setup portal, see plans/first-launch-plan.md) for a
// permanent device token bound to the account that minted the code.
router.post('/devices/claim', deviceClaimLimiter, async (req, res) => {
  try {
    const validated = claimSchema.parse(req.body);
    const codeHash = crypto.createHash('sha256').update(validated.claim_code.toUpperCase()).digest('hex');

    const claimResult = await query(
      `SELECT * FROM device_claim_codes
       WHERE code_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()`,
      [codeHash]
    );

    if (claimResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired claim code' });
    }

    const claim = claimResult.rows[0];

    const existingDevice = await query(
      'SELECT * FROM devices WHERE device_id = $1',
      [validated.hardware_id]
    );

    let deviceUuid: string;

    if (existingDevice.rows.length > 0) {
      const device = existingDevice.rows[0];
      if (String(device.tenant_id) !== String(claim.tenant_id)) {
        return res.status(409).json({ error: 'Device already claimed by a different account' });
      }
      // Same tenant re-claiming (e.g. after a factory reset) - reuse the row.
      deviceUuid = device.id;
    } else {
      const inserted = await query(
        `INSERT INTO devices (device_id, tenant_id, status)
         VALUES ($1, $2, 'offline')
         RETURNING *`,
        [validated.hardware_id, claim.tenant_id]
      );
      deviceUuid = inserted.rows[0].id;
    }

    // Mark the code consumed; a 0 affected-row count means a concurrent
    // request already won the race.
    const consumeResult = await query(
      `UPDATE device_claim_codes
       SET consumed_at = NOW(), device_id = $1
       WHERE id = $2 AND consumed_at IS NULL
       RETURNING id`,
      [deviceUuid, claim.id]
    );

    if (consumeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired claim code' });
    }

    const deviceToken = await createDeviceToken(validated.hardware_id);

    res.json({
      device_token: deviceToken,
      device_id: validated.hardware_id,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    console.error('Error claiming device:', error);
    res.status(500).json({ error: 'Failed to claim device' });
  }
});

// Validation schema for measurement data
const measurementSchema = z.object({
  device_id: z.string(),
  firmware_version: z.string().optional(),
  timestamp: z.number().optional(),
  level_cm: z.number(),
  volume_l: z.number(),
  temperature_c: z.number().optional(),
  battery_v: z.number().optional(),
  rssi: z.number().optional(),
});

// POST /api/v1/measurements - Device sends sensor data
router.post('/measurements', authenticateDevice, async (req: DeviceAuthRequest, res) => {
  try {
    // Validate request body
    const validated = measurementSchema.parse(req.body);

    if (!req.device) {
      return res.status(401).json({ error: 'Device not authenticated' });
    }

    // Insert measurement
    const result = await query(
      `INSERT INTO measurements 
       (device_id, timestamp, level_cm, volume_l, temperature_c, battery_v, rssi)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.device.id,
        validated.level_cm,
        validated.volume_l,
        validated.temperature_c || null,
        validated.battery_v || null,
        validated.rssi || null,
      ]
    );

    // Update device last_seen and status
    await query(
      `UPDATE devices 
       SET last_seen = NOW(), 
           status = 'online',
           firmware_version = COALESCE($1, firmware_version),
           updated_at = NOW()
       WHERE id = $2`,
      [validated.firmware_version, req.device.id]
    );

    // Get device config to return (if any updates)
    const configResult = await query(
      'SELECT * FROM device_configs WHERE device_id = $1',
      [req.device.id]
    );

    const response: any = {
      success: true,
      measurement_id: result.rows[0].id,
    };

    // Include config if available
    if (configResult.rows.length > 0) {
      const config = configResult.rows[0];
      response.config = {
        measurement_interval_ms: config.measurement_interval_ms,
        report_interval_ms: config.report_interval_ms,
        tank_full_threshold_l: config.tank_full_threshold_l,
        tank_low_threshold_l: config.tank_low_threshold_l,
        battery_low_threshold_v: config.battery_low_threshold_v,
        level_empty_cm: config.level_empty_cm,
        level_full_cm: config.level_full_cm,
        ...(config.config_json || {}),
      };
    }

    // Process alerts asynchronously (don't wait for it)
    processAlertsForMeasurement(req.device.id, result.rows[0]).catch(err => {
      console.error('Error processing alerts:', err);
    });

    res.status(201).json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    console.error('Error processing measurement:', error);
    res.status(500).json({ error: 'Failed to process measurement' });
  }
});

// GET /api/v1/devices/:deviceId/config - Device pulls configuration
router.get('/devices/:deviceId/config', authenticateDevice, async (req: DeviceAuthRequest, res) => {
  try {
    if (!req.device) {
      return res.status(401).json({ error: 'Device not authenticated' });
    }

    const configResult = await query(
      'SELECT * FROM device_configs WHERE device_id = $1',
      [req.device.id]
    );

    if (configResult.rows.length === 0) {
      // Return default config
      return res.json({
        measurement_interval_ms: 60000,
        report_interval_ms: 300000,
        tank_full_threshold_l: 900.0,
        tank_low_threshold_l: 100.0,
        battery_low_threshold_v: 3.3,
      });
    }

    const config = configResult.rows[0];
    res.json({
      measurement_interval_ms: config.measurement_interval_ms,
      report_interval_ms: config.report_interval_ms,
      tank_full_threshold_l: config.tank_full_threshold_l,
      tank_low_threshold_l: config.tank_low_threshold_l,
      battery_low_threshold_v: config.battery_low_threshold_v,
      level_empty_cm: config.level_empty_cm,
      level_full_cm: config.level_full_cm,
      ...(config.config_json || {}),
    });
  } catch (error: any) {
    console.error('Error fetching device config:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// GET /api/v1/devices/:deviceId/ota/latest - OTA firmware check
router.get('/devices/:deviceId/ota/latest', authenticateDevice, async (req: DeviceAuthRequest, res) => {
  try {
    if (!req.device) {
      return res.status(401).json({ error: 'Device not authenticated' });
    }

    const currentVersion = (req.headers['x-firmware-version'] as string) || req.device.firmware_version || '0.0.0';

    // Get active firmware assignment for this device
    const assignmentResult = await query(
      `SELECT fb.* FROM firmware_binaries fb
       INNER JOIN device_firmware_assignments dfa ON dfa.firmware_id = fb.id
       WHERE dfa.device_id = $1 
       AND dfa.status = 'pending'
       AND fb.is_active = true
       ORDER BY fb.created_at DESC
       LIMIT 1`,
      [req.device.id]
    );

    if (assignmentResult.rows.length === 0) {
      return res.json({
        update_available: false,
        current_version: currentVersion,
      });
    }

    const firmware = assignmentResult.rows[0];

    // Simple version comparison (you might want to use semver library)
    if (firmware.version !== currentVersion) {
      // Construct download URL using device-authenticated endpoint
      const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const downloadUrl = `${baseUrl}/api/v1/devices/${req.device.device_id}/ota/download/${firmware.id}`;

      return res.json({
        update_available: true,
        current_version: currentVersion,
        latest_version: firmware.version,
        download_url: downloadUrl,
        file_size: firmware.file_size,
        checksum: firmware.checksum,
      });
    }

    res.json({
      update_available: false,
      current_version: currentVersion,
    });
  } catch (error: any) {
    console.error('Error checking OTA update:', error);
    res.status(500).json({ error: 'Failed to check for updates' });
  }
});

// GET /api/v1/devices/:deviceId/ota/download/:firmwareId - Download firmware (device-authenticated)
router.get('/devices/:deviceId/ota/download/:firmwareId', authenticateDevice, async (req: DeviceAuthRequest, res) => {
  try {
    if (!req.device) {
      return res.status(401).json({ error: 'Device not authenticated' });
    }

    const firmwareId = req.params.firmwareId;

    // Verify this firmware is assigned to this device
    const assignmentResult = await query(
      `SELECT fb.* FROM firmware_binaries fb
       INNER JOIN device_firmware_assignments dfa ON dfa.firmware_id = fb.id
       WHERE dfa.device_id = $1 
       AND fb.id = $2
       AND dfa.status = 'pending'
       AND fb.is_active = true`,
      [req.device.id, firmwareId]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Firmware not found or not assigned to this device' });
    }

    const firmware = assignmentResult.rows[0];
    const filePath = firmware.file_path;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Firmware file not found on server' });
    }

    // Set headers for binary download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="firmware-${firmware.version}.bin"`);
    res.setHeader('Content-Length', firmware.file_size);
    if (firmware.checksum) {
      res.setHeader('X-Firmware-Checksum', firmware.checksum);
    }

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // Update assignment status to 'downloading' (optional tracking)
    await query(
      `UPDATE device_firmware_assignments 
       SET status = 'downloading', updated_at = NOW()
       WHERE device_id = $1 AND firmware_id = $2`,
      [req.device.id, firmwareId]
    ).catch(err => {
      // Log but don't fail the download
      console.error('Error updating assignment status:', err);
    });
  } catch (error: any) {
    console.error('Error downloading firmware:', error);
    res.status(500).json({ error: 'Failed to download firmware' });
  }
});

export default router;

