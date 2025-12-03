import express from 'express';
import { authenticateFirebase, AuthRequest, requireRole } from '../middleware/auth.middleware';
import { query } from '../config/database';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createDeviceToken } from '../middleware/deviceAuth.middleware';
import { z } from 'zod';
import { Device, FirmwareBinary } from '../database/models';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateFirebase);
router.use(requireRole('admin', 'super_admin'));

// Configure multer for firmware uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.FIRMWARE_STORAGE_PATH || './storage/firmware';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `firmware-${uniqueSuffix}.bin`);
  },
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// GET /api/v1/admin/devices - List all devices
router.get('/devices', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.query.tenant_id as string | undefined;
    const status = req.query.status as string | undefined;

    let queryStr = `
      SELECT d.*, t.name as tenant_name,
             (SELECT volume_l FROM measurements WHERE device_id = d.id ORDER BY timestamp DESC LIMIT 1) as current_volume,
             (SELECT timestamp FROM measurements WHERE device_id = d.id ORDER BY timestamp DESC LIMIT 1) as last_measurement
      FROM devices d
      LEFT JOIN tenants t ON t.id = d.tenant_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (tenantId) {
      paramCount++;
      queryStr += ` AND d.tenant_id = $${paramCount}`;
      params.push(tenantId);
    }

    if (status) {
      paramCount++;
      queryStr += ` AND d.status = $${paramCount}`;
      params.push(status);
    }

    queryStr += ' ORDER BY d.created_at DESC';

    const result = await query(queryStr, params);

    res.json({
      devices: result.rows.map((device: any) => ({
        id: device.id,
        device_id: device.device_id,
        name: device.name,
        tenant_id: device.tenant_id,
        tenant_name: device.tenant_name,
        status: device.status,
        firmware_version: device.firmware_version,
        last_seen: device.last_seen,
        current_volume: device.current_volume,
        last_measurement: device.last_measurement,
        created_at: device.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// GET /api/v1/admin/devices/:deviceId - Device details
router.get('/devices/:deviceId', async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;

    const deviceResult = await query(
      `SELECT d.*, t.name as tenant_name, dc.*
       FROM devices d
       LEFT JOIN tenants t ON t.id = d.tenant_id
       LEFT JOIN device_configs dc ON dc.device_id = d.id
       WHERE d.device_id = $1`,
      [deviceId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const device = deviceResult.rows[0];

    // Get latest measurement
    const measurementResult = await query(
      `SELECT * FROM measurements 
       WHERE device_id = $1 
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [device.id]
    );

    // Get recent alerts
    const alertsResult = await query(
      `SELECT * FROM alerts 
       WHERE device_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [device.id]
    );

    res.json({
      id: device.id,
      device_id: device.device_id,
      name: device.name,
      tenant_id: device.tenant_id,
      tenant_name: device.tenant_name,
      status: device.status,
      firmware_version: device.firmware_version,
      last_seen: device.last_seen,
      created_at: device.created_at,
      config: device.measurement_interval_ms ? {
        measurement_interval_ms: device.measurement_interval_ms,
        report_interval_ms: device.report_interval_ms,
        tank_full_threshold_l: device.tank_full_threshold_l,
        tank_low_threshold_l: device.tank_low_threshold_l,
        battery_low_threshold_v: device.battery_low_threshold_v,
        level_empty_cm: device.level_empty_cm,
        level_full_cm: device.level_full_cm,
        config_json: device.config_json,
      } : null,
      latest_measurement: measurementResult.rows[0] || null,
      recent_alerts: alertsResult.rows,
    });
  } catch (error: any) {
    console.error('Error fetching device details:', error);
    res.status(500).json({ error: 'Failed to fetch device details' });
  }
});

// POST /api/v1/admin/devices/:deviceId/config - Update device config
router.post('/devices/:deviceId/config', async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;
    const config = req.body;

    // Get device UUID
    const deviceResult = await query(
      'SELECT id FROM devices WHERE device_id = $1',
      [deviceId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceUuid = deviceResult.rows[0].id;

    // Upsert config
    await query(
      `INSERT INTO device_configs 
       (device_id, measurement_interval_ms, report_interval_ms, tank_full_threshold_l, 
        tank_low_threshold_l, battery_low_threshold_v, level_empty_cm, level_full_cm, config_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (device_id) 
       DO UPDATE SET
         measurement_interval_ms = EXCLUDED.measurement_interval_ms,
         report_interval_ms = EXCLUDED.report_interval_ms,
         tank_full_threshold_l = EXCLUDED.tank_full_threshold_l,
         tank_low_threshold_l = EXCLUDED.tank_low_threshold_l,
         battery_low_threshold_v = EXCLUDED.battery_low_threshold_v,
         level_empty_cm = EXCLUDED.level_empty_cm,
         level_full_cm = EXCLUDED.level_full_cm,
         config_json = EXCLUDED.config_json,
         updated_at = NOW()`,
      [
        deviceUuid,
        config.measurement_interval_ms || 60000,
        config.report_interval_ms || 300000,
        config.tank_full_threshold_l || null,
        config.tank_low_threshold_l || null,
        config.battery_low_threshold_v || null,
        config.level_empty_cm || null,
        config.level_full_cm || null,
        config.config_json ? JSON.stringify(config.config_json) : null,
      ]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating device config:', error);
    res.status(500).json({ error: 'Failed to update device config' });
  }
});

// POST /api/v1/admin/firmware/upload - Upload firmware
router.post('/firmware/upload', upload.single('firmware'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { version, description } = req.body;

    if (!version) {
      // Delete uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Version is required' });
    }

    // Calculate file checksum
    const fileBuffer = fs.readFileSync(req.file.path);
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Insert firmware record
    const result = await query(
      `INSERT INTO firmware_binaries 
       (version, file_path, file_size, checksum, description, is_active)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING *`,
      [
        version,
        req.file.path,
        req.file.size,
        checksum,
        description || null,
      ]
    );

    res.json({
      success: true,
      firmware: {
        id: result.rows[0].id,
        version: result.rows[0].version,
        file_size: result.rows[0].file_size,
        checksum: result.rows[0].checksum,
        description: result.rows[0].description,
      },
    });
  } catch (error: any) {
    console.error('Error uploading firmware:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload firmware' });
  }
});

// GET /api/v1/admin/firmware - List firmware versions
router.get('/firmware', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT * FROM firmware_binaries 
       ORDER BY created_at DESC`
    );

    res.json({
      firmware: result.rows.map((fw: any) => ({
        id: fw.id,
        version: fw.version,
        file_size: fw.file_size,
        checksum: fw.checksum,
        description: fw.description,
        is_active: fw.is_active,
        rollout_percentage: fw.rollout_percentage,
        created_at: fw.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching firmware:', error);
    res.status(500).json({ error: 'Failed to fetch firmware' });
  }
});

// GET /api/v1/admin/firmware/:firmwareId/download - Download firmware
router.get('/firmware/:firmwareId/download', async (req: AuthRequest, res) => {
  try {
    const firmwareId = req.params.firmwareId;

    const result = await query(
      'SELECT * FROM firmware_binaries WHERE id = $1',
      [firmwareId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Firmware not found' });
    }

    const firmware = result.rows[0];
    const filePath = firmware.file_path;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Firmware file not found' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="firmware-${firmware.version}.bin"`);
    res.setHeader('Content-Length', firmware.file_size);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error: any) {
    console.error('Error downloading firmware:', error);
    res.status(500).json({ error: 'Failed to download firmware' });
  }
});

// POST /api/v1/admin/firmware/:version/rollout - Rollout firmware
router.post('/firmware/:version/rollout', async (req: AuthRequest, res) => {
  try {
    const version = req.params.version;
    const { device_ids, tenant_ids, rollout_percentage } = req.body;

    // Get firmware
    const firmwareResult = await query(
      'SELECT * FROM firmware_binaries WHERE version = $1',
      [version]
    );

    if (firmwareResult.rows.length === 0) {
      return res.status(404).json({ error: 'Firmware version not found' });
    }

    const firmware = firmwareResult.rows[0];

    // Build device query
    let deviceQuery = 'SELECT id FROM devices WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (device_ids && device_ids.length > 0) {
      paramCount++;
      deviceQuery += ` AND device_id = ANY($${paramCount})`;
      params.push(device_ids);
    } else if (tenant_ids && tenant_ids.length > 0) {
      paramCount++;
      deviceQuery += ` AND tenant_id = ANY($${paramCount})`;
      params.push(tenant_ids);
    } else if (rollout_percentage) {
      // Percentage-based rollout
      const totalDevicesResult = await query('SELECT COUNT(*) as count FROM devices');
      const totalDevices = parseInt(totalDevicesResult.rows[0].count);
      const targetCount = Math.ceil((rollout_percentage / 100) * totalDevices);

      deviceQuery += ` ORDER BY RANDOM() LIMIT $${++paramCount}`;
      params.push(targetCount);
    } else {
      return res.status(400).json({ error: 'Must specify device_ids, tenant_ids, or rollout_percentage' });
    }

    const devicesResult = await query(deviceQuery, params);
    const deviceIds = devicesResult.rows.map((row: any) => row.id);

    // Create assignments
    for (const deviceId of deviceIds) {
      await query(
        `INSERT INTO device_firmware_assignments (device_id, firmware_id, status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (device_id, firmware_id) 
         DO UPDATE SET status = 'pending', assigned_at = NOW()`,
        [deviceId, firmware.id]
      );
    }

    // Update firmware rollout percentage
    await query(
      'UPDATE firmware_binaries SET rollout_percentage = $1, is_active = true WHERE id = $2',
      [rollout_percentage || 0, firmware.id]
    );

    res.json({
      success: true,
      assigned_devices: deviceIds.length,
    });
  } catch (error: any) {
    console.error('Error rolling out firmware:', error);
    res.status(500).json({ error: 'Failed to rollout firmware' });
  }
});

// GET /api/v1/admin/analytics/summary - System-wide analytics
router.get('/analytics/summary', async (req: AuthRequest, res) => {
  try {
    // Get total devices
    const devicesResult = await query('SELECT COUNT(*) as count FROM devices');
    const totalDevices = parseInt(devicesResult.rows[0].count);

    // Get online devices
    const onlineResult = await query("SELECT COUNT(*) as count FROM devices WHERE status = 'online'");
    const onlineDevices = parseInt(onlineResult.rows[0].count);

    // Get total tenants
    const tenantsResult = await query('SELECT COUNT(*) as count FROM tenants');
    const totalTenants = parseInt(tenantsResult.rows[0].count);

    // Get recent alerts
    const alertsResult = await query(
      `SELECT COUNT(*) as count FROM alerts 
       WHERE created_at > NOW() - INTERVAL '24 hours'`
    );
    const recentAlerts = parseInt(alertsResult.rows[0].count);

    // Get total measurements today
    const measurementsResult = await query(
      `SELECT COUNT(*) as count FROM measurements 
       WHERE timestamp > CURRENT_DATE`
    );
    const todayMeasurements = parseInt(measurementsResult.rows[0].count);

    res.json({
      total_devices: totalDevices,
      online_devices: onlineDevices,
      offline_devices: totalDevices - onlineDevices,
      total_tenants: totalTenants,
      recent_alerts_24h: recentAlerts,
      measurements_today: todayMeasurements,
    });
  } catch (error: any) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /api/v1/admin/tenants - List tenants
router.get('/tenants', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT t.*, 
              COUNT(DISTINCT d.id) as device_count,
              COUNT(DISTINCT u.id) as user_count
       FROM tenants t
       LEFT JOIN devices d ON d.tenant_id = t.id
       LEFT JOIN users u ON u.tenant_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at DESC`
    );

    res.json({
      tenants: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

// POST /api/v1/admin/devices/:deviceId/token - Generate device token
router.post('/devices/:deviceId/token', async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;
    const token = await createDeviceToken(deviceId);

    res.json({
      success: true,
      token,
      device_id: deviceId,
    });
  } catch (error: any) {
    console.error('Error generating device token:', error);
    res.status(500).json({ error: 'Failed to generate device token' });
  }
});

export default router;

