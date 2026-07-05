import express from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { AuthRequest, firebaseAuth, requireTenant } from '../middleware/firebaseAuth.middleware';
import { DeviceAccessRequest, requireDeviceAccess } from '../lib/access';
import { asyncHandler } from '../lib/async-handler';
import * as userService from '../services/user.service';
import * as deviceService from '../services/device.service';
import * as tankProfileService from '../services/tank-profile.service';
import * as firmwareService from '../services/firmware.service';
import { updateUserFCMToken } from '../services/fcm.service';

const router = express.Router();

// POST /api/v1/user/register - Self-registration (requires Firebase auth).
// A brand-new user auto-provisions their own personal tenant unless an
// explicit tenant_id is given (the ops-driven admin-linking flow).
const registerSchema = z.object({
  name: z.string().min(1).max(255),
  tenant_id: z.string().uuid().optional(),
});

router.post(
  '/register',
  firebaseAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { name, tenant_id } = registerSchema.parse(req.body);
    const result = await userService.registerUser(req.firebaseUid!, name, tenant_id);

    res.status(result.created ? 201 : 200).json({
      user: result.user,
      message: result.created ? 'User registered successfully' : 'User already registered. Profile updated.',
    });
  })
);

// GET /api/v1/user/me - Who am I / what's my tenant (Firebase auth only, no
// tenant requirement, so a freshly-registered user can always call this).
router.get(
  '/me',
  firebaseAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    res.json(await userService.getMe(req.user!.id));
  })
);

// All other user routes require Firebase authentication and a tenant.
router.use(firebaseAuth);
router.use(requireTenant);

// Rate limiter for claim-code minting: per-account, not per-IP, since the
// caller is already authenticated - stops a compromised account from
// farming codes rather than a shared NAT/IP.
const claimCodeMintLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: AuthRequest) => req.user!.id,
});

// POST /api/v1/user/devices/claim-code - Mint a short-lived claim code the
// user types into their device's setup portal.
router.post(
  '/devices/claim-code',
  claimCodeMintLimiter,
  asyncHandler(async (req: AuthRequest, res) => {
    res.status(201).json(await userService.mintClaimCode(req.user!.tenantId!, req.user!.id));
  })
);

// GET /api/v1/user/devices/claim-code/:code/status - Poll target for the
// Add Device wizard while waiting for the physical device to pair.
router.get(
  '/devices/claim-code/:code/status',
  asyncHandler(async (req: AuthRequest, res) => {
    res.json(await userService.getClaimCodeStatus(req.user!.tenantId!, req.params.code));
  })
);

// GET /api/v1/user/devices - List user's accessible devices
router.get(
  '/devices',
  asyncHandler(async (req: AuthRequest, res) => {
    res.json({ devices: await userService.listDevicesForTenant(req.user!.tenantId!, req.user!.id) });
  })
);

// GET /api/v1/user/devices/:deviceId - Basic device info (name/status/firmware)
router.get(
  '/devices/:deviceId',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    res.json(await userService.getDeviceInfo(req.device!));
  })
);

// GET /api/v1/user/devices/:deviceId/current - Latest measurement
router.get(
  '/devices/:deviceId/current',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    res.json(await userService.getDeviceCurrent(req.device!));
  })
);

const historyQuerySchema = z.object({
  days: z.coerce.number().int().positive().default(7),
  limit: z.coerce.number().int().positive().max(10000).default(1000),
});

// GET /api/v1/user/devices/:deviceId/history - Historical data
router.get(
  '/devices/:deviceId/history',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const { days, limit } = historyQuerySchema.parse(req.query);
    res.json(await userService.getDeviceHistory(req.device!, days, limit));
  })
);

// GET /api/v1/user/devices/:deviceId/tank-profile - Tank shape/dimensions setup
router.get(
  '/devices/:deviceId/tank-profile',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    res.json({ profile: await tankProfileService.getTankProfile(req.device!) });
  })
);

const tankProfileSchema = z.object({
  shape: z.enum(['cylindrical', 'cuboidal']),
  parallel_unit_count: z.coerce.number().int().min(1).max(6).optional(),
  height_cm: z.coerce.number().positive(),
  diameter_cm: z.coerce.number().positive().nullable().optional(),
  length_cm: z.coerce.number().positive().nullable().optional(),
  width_cm: z.coerce.number().positive().nullable().optional(),
  nominal_unit_volume_l: z.coerce.number().positive().nullable().optional(),
  sensor_offset_cm: z.coerce.number().min(0).optional(),
});

// PUT /api/v1/user/devices/:deviceId/tank-profile - Set/edit tank setup
router.put(
  '/devices/:deviceId/tank-profile',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const validated = tankProfileSchema.parse(req.body);
    res.json({ profile: await tankProfileService.upsertTankProfile(req.device!, validated) });
  })
);

// GET /api/v1/user/devices/:deviceId/config - Read-only device config display
router.get(
  '/devices/:deviceId/config',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    res.json(await deviceService.getDeviceConfig(req.device!));
  })
);

const alertThresholdsSchema = z.object({
  tank_low_threshold_pct: z.coerce.number().min(0).max(100).optional(),
  tank_full_threshold_pct: z.coerce.number().min(0).max(100).optional(),
  battery_low_threshold_v: z.coerce.number().min(0).optional(),
});

// PUT /api/v1/user/devices/:deviceId/alert-thresholds - Tenant-editable alert thresholds
router.put(
  '/devices/:deviceId/alert-thresholds',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const validated = alertThresholdsSchema.parse(req.body);
    res.json(await deviceService.updateAlertThresholds(req.device!, validated));
  })
);

// GET /api/v1/user/devices/:deviceId/firmware-status - Read-only OTA status
router.get(
  '/devices/:deviceId/firmware-status',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    res.json(await firmwareService.getTenantFacingOtaStatus(req.device!));
  })
);

const alertsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(50),
});

// GET /api/v1/user/devices/:deviceId/alerts - Alert history
router.get(
  '/devices/:deviceId/alerts',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const { limit } = alertsQuerySchema.parse(req.query);
    res.json(await userService.getDeviceAlerts(req.device!, limit));
  })
);

// POST /api/v1/user/devices/:deviceId/alerts/:alertId/acknowledge - Acknowledge alert
router.post(
  '/devices/:deviceId/alerts/:alertId/acknowledge',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest & AuthRequest, res) => {
    await userService.acknowledgeAlert(req.device!, req.params.alertId, req.user!.id);
    res.json({ success: true });
  })
);

const fcmTokenSchema = z.object({
  fcm_token: z.string().min(1),
});

// POST /api/v1/user/fcm-token - Update FCM token
router.post(
  '/fcm-token',
  asyncHandler(async (req: AuthRequest, res) => {
    const { fcm_token } = fcmTokenSchema.parse(req.body);
    await updateUserFCMToken(req.user!.id, fcm_token);
    res.json({ success: true });
  })
);

export default router;
