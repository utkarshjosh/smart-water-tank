import express from 'express';
import * as fs from 'fs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { deviceAuth, DeviceAuthRequest } from '../middleware/deviceAuth.middleware';
import { asyncHandler } from '../lib/async-handler';
import { HttpError } from '../lib/http-error';
import * as deviceService from '../services/device.service';
import * as firmwareService from '../services/firmware.service';

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
// (typed into its setup portal) for a permanent device token bound to the
// account that minted the code.
router.post(
  '/devices/claim',
  deviceClaimLimiter,
  asyncHandler(async (req, res) => {
    const validated = claimSchema.parse(req.body);
    const result = await deviceService.claimDevice(validated.claim_code, validated.hardware_id);
    res.json({ device_token: result.deviceToken, device_id: result.deviceId });
  })
);

// Identity comes entirely from the bearer token (see deviceAuth); the device
// has no reliable RTC so the server always stamps its own receipt time.
const measurementSchema = z.object({
  firmware_version: z.string().optional(),
  // null means the sensor couldn't be read this cycle (e.g. no echo /
  // disconnected) - it must be stored as "no data", never coerced to 0.
  level_cm: z.number().nullable(),
  volume_l: z.number().nullable(),
  temperature_c: z.number().nullable().optional(),
  battery_v: z.number().optional(),
  rssi: z.number().optional(),
  // Config version the device currently holds. The server piggybacks the full
  // config on the response only when this is missing or older than its own.
  config_version: z.number().int().optional(),
});

// POST /api/v1/measurements - Device sends sensor data
router.post(
  '/measurements',
  deviceAuth,
  asyncHandler(async (req: DeviceAuthRequest, res) => {
    const validated = measurementSchema.parse(req.body);
    const result = await deviceService.recordMeasurement(req.device!, {
      firmwareVersion: validated.firmware_version,
      levelCm: validated.level_cm,
      volumeL: validated.volume_l,
      temperatureC: validated.temperature_c,
      batteryV: validated.battery_v,
      rssi: validated.rssi,
      configVersion: validated.config_version,
    });

    res.status(201).json({
      success: true,
      measurement_id: result.measurementId,
      // Always echo the current version so the device can confirm it's in sync
      // even when no full config is piggybacked.
      config_version: result.configVersion,
      // Full merged config included only when the device is stale.
      ...(result.config ? { config: result.config } : {}),
    });
  })
);

// GET /api/v1/devices/:deviceId/config - Device pulls configuration
router.get(
  '/devices/:deviceId/config',
  deviceAuth,
  asyncHandler(async (req: DeviceAuthRequest, res) => {
    res.json(await deviceService.getDeviceConfig(req.device!));
  })
);

// GET /api/v1/devices/:deviceId/ota/latest - OTA firmware check
router.get(
  '/devices/:deviceId/ota/latest',
  deviceAuth,
  asyncHandler(async (req: DeviceAuthRequest, res) => {
    const headerVersion = req.headers['x-firmware-version'] as string | undefined;
    res.json(await firmwareService.checkOtaUpdate(req.device!, headerVersion));
  })
);

// GET /api/v1/devices/:deviceId/ota/download/:firmwareId - Download firmware (device-authenticated)
router.get(
  '/devices/:deviceId/ota/download/:firmwareId',
  deviceAuth,
  asyncHandler(async (req: DeviceAuthRequest, res) => {
    const device = req.device!;
    const firmware = await firmwareService.getAssignedFirmwareOrThrow(device, req.params.firmwareId);

    if (!fs.existsSync(firmware.filePath)) {
      throw new HttpError(404, 'Firmware file not found on server');
    }

    const actualSize = fs.statSync(firmware.filePath).size;
    if (firmware.fileSize == null || actualSize !== firmware.fileSize) {
      throw new HttpError(500, 'Stored firmware size does not match its release record');
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="firmware-${firmware.version}.bin"`);
    res.setHeader('Content-Length', actualSize);
    if (firmware.checksum) {
      res.setHeader('X-Firmware-Checksum', firmware.checksum);
    }

    const stream = fs.createReadStream(firmware.filePath);
    stream.once('error', (error) => {
      if (!res.headersSent) return res.destroy(error);
      res.destroy(error);
    });
    res.once('close', () => {
      if (!res.writableEnded) stream.destroy();
    });
    stream.once('end', () => {
      // This is only a delivery-start signal. The device still retries a
      // `downloading` assignment until it has booted the matching version.
      void firmwareService.markFirmwareDownloading(device.id, firmware.id);
    });
    stream.pipe(res);
  })
);

export default router;
