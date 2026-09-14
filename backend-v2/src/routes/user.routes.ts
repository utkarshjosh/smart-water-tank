import express from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { AuthRequest, firebaseAuth, requireTenant } from '../middleware/firebaseAuth.middleware';
import { DeviceAccessRequest, requireDeviceAccess } from '../lib/access';
import { asyncHandler } from '../lib/async-handler';
import { sendJson } from '../lib/send-json';
import { alertThresholdsSchema } from '../lib/alert-thresholds';
import {
  alertFeedResponseSchema,
  alertRulesResponseSchema,
  claimCodeSchema,
  claimStatusSchema,
  configDtoSchema,
  currentReadingSchema,
  deviceAlertsResponseSchema,
  deviceConfigPayloadSchema,
  deviceInfoSchema,
  devicesResponseSchema,
  firmwareStatusSchema,
  historyResponseSchema,
  historySeriesSchema,
  meSchema,
  okSchema,
  registerResponseSchema,
  shareCreatedSchema,
  sharesResponseSchema,
  syncModeResponseSchema,
  tankProfileResponseSchema,
  usageResponseSchema,
} from '@aquamind/contracts';
import * as userService from '../services/user.service';
import * as deviceService from '../services/device.service';
import * as tankProfileService from '../services/tank-profile.service';
import * as firmwareService from '../services/firmware.service';
import * as alertRulesService from '../services/alert-rules.service';
import { registerPushToken, removePushToken, updateUserFCMToken } from '../services/fcm.service';
import { exportUserMeasurements } from '../services/measurement-export.service';
import { BUCKETS, getDeviceHistorySeries } from '../services/history.service';
import { getDeviceUsage } from '../services/usage.service';

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

    sendJson(
      res,
      registerResponseSchema,
      {
        user: result.user,
        message: result.created ? 'User registered successfully' : 'User already registered. Profile updated.',
      },
      result.created ? 201 : 200
    );
  })
);

// GET /api/v1/user/me - Who am I / what's my tenant (Firebase auth only, no
// tenant requirement, so a freshly-registered user can always call this).
router.get(
  '/me',
  firebaseAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    sendJson(res, meSchema, await userService.getMe(req.user!.id));
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

const updateMeSchema = z.object({
  name: z.string().min(1).max(255),
});

// PUT /api/v1/user/me - Edit your own profile. Email and role stay server-owned.
router.put(
  '/me',
  firebaseAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const validated = updateMeSchema.parse(req.body);
    sendJson(res, meSchema, await userService.updateMe(req.user!.id, validated));
  })
);

// POST /api/v1/user/devices/claim-code - Mint a short-lived claim code the
// user types into their device's setup portal.
router.post(
  '/devices/claim-code',
  claimCodeMintLimiter,
  asyncHandler(async (req: AuthRequest, res) => {
    sendJson(res, claimCodeSchema, await userService.mintClaimCode(req.user!.tenantId!, req.user!.id), 201);
  })
);

// GET /api/v1/user/devices/claim-code/:code/status - Poll target for the
// Add Device wizard while waiting for the physical device to pair.
router.get(
  '/devices/claim-code/:code/status',
  asyncHandler(async (req: AuthRequest, res) => {
    sendJson(res, claimStatusSchema, await userService.getClaimCodeStatus(req.user!.tenantId!, req.params.code));
  })
);

// DELETE /api/v1/user/devices/claim-code/:code - Kill a live code early, for a
// code that was read aloud or shared by mistake.
router.delete(
  '/devices/claim-code/:code',
  asyncHandler(async (req: AuthRequest, res) => {
    await userService.revokeClaimCode(req.user!.tenantId!, req.params.code);
    res.status(204).send();
  })
);

// GET /api/v1/user/devices - List user's accessible devices
router.get(
  '/devices',
  asyncHandler(async (req: AuthRequest, res) => {
    sendJson(res, devicesResponseSchema, { devices: await userService.listDevicesForTenant(req.user!.tenantId!, req.user!.id) });
  })
);

const measurementExportBodySchema = z.object({
  device_ids: z.array(z.string().min(1)).min(1).max(100),
  from: z.coerce.date(),
  to: z.coerce.date(),
});

const userAlertsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  include_dismissed: z.coerce.boolean().default(false),
  unacknowledged: z.coerce.boolean().default(false),
  // Optional: omitting it returns the first page exactly as before.
  cursor: z.string().uuid().optional(),
});

// GET /api/v1/user/alerts - One inbox across every device the caller can see.
// Alerts could previously only be read one device at a time.
router.get(
  '/alerts',
  asyncHandler(async (req: AuthRequest, res) => {
    const { limit, include_dismissed, unacknowledged, cursor } = userAlertsQuerySchema.parse(req.query);
    sendJson(
      res,
      alertFeedResponseSchema,
      await userService.getUserAlerts(
        { id: req.user!.id, tenantId: req.user!.tenantId },
        { limit, includeDismissed: include_dismissed, onlyUnacknowledged: unacknowledged, cursor }
      )
    );
  })
);

// POST /api/v1/user/measurements/export - Tenant-scoped multi-device CSV export.
router.post(
  '/measurements/export',
  asyncHandler(async (req: AuthRequest, res) => {
    const { device_ids, from, to } = measurementExportBodySchema.parse(req.body);
    const result = await exportUserMeasurements(req.user!.tenantId!, req.user!.id, {
      hardwareDeviceIds: device_ids,
      from,
      to,
    });
    const dateSuffix = `${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="aquamind-measurements-${dateSuffix}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Export-Row-Count', result.rowCount.toString());
    res.send(result.csv);
  })
);

// GET /api/v1/user/devices/:deviceId - Basic device info (name/status/firmware)
router.get(
  '/devices/:deviceId',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    sendJson(res, deviceInfoSchema, await userService.getDeviceInfo(req.device!));
  })
);

// GET /api/v1/user/devices/:deviceId/current - Latest measurement
router.get(
  '/devices/:deviceId/current',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    sendJson(res, currentReadingSchema, await userService.getDeviceCurrent(req.device!));
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
    sendJson(res, historyResponseSchema, await userService.getDeviceHistory(req.device!, days, limit));
  })
);

const renameDeviceSchema = z.object({
  // null clears the name, falling back to the hardware ID in the UI.
  name: z.string().max(255).nullable(),
});

// PUT /api/v1/user/devices/:deviceId - Rename a device. Devices paired through
// the self-claim flow arrive with no name at all, so this is the only way one
// ever gets a human label.
router.put(
  '/devices/:deviceId',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const { name } = renameDeviceSchema.parse(req.body);
    sendJson(res, deviceInfoSchema, await userService.renameDevice(req.device!, name));
  })
);

// DELETE /api/v1/user/devices/:deviceId - Unpair. The reverse of the claim
// flow: the device leaves the account and can be claimed again, while its
// readings and alerts stay on file. Nothing is sent to the device.
router.delete(
  '/devices/:deviceId',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest & AuthRequest, res) => {
    await userService.unpairDevice(req.device!, req.user!);
    res.status(204).send();
  })
);

const historySeriesQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  days: z.coerce.number().positive().optional(),
  bucket: z.enum(['auto', ...BUCKETS]).default('auto'),
  metrics: z.string().optional(),
});

// GET /api/v1/user/devices/:deviceId/history/series - Bucketed history for
// browsable charts. Unlike /history (raw rows, newest-first) this aggregates
// MIN/AVG/MAX per time bucket in SQL, so any span costs a bounded number of
// points and the min/max band shows the draw and refill swings a mean hides.
router.get(
  '/devices/:deviceId/history/series',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const options = historySeriesQuerySchema.parse(req.query);
    sendJson(res, historySeriesSchema, await getDeviceHistorySeries(req.device!, options));
  })
);

// GET /api/v1/user/devices/:deviceId/shares - Who can see this device
router.get(
  '/devices/:deviceId/shares',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    sendJson(res, sharesResponseSchema, await userService.listDeviceShares(req.device!));
  })
);

const shareSchema = z.object({ email: z.string().email() });

// POST /api/v1/user/devices/:deviceId/shares - Grant a household member
// access to one device. This is the writer user_device_mappings never had.
router.post(
  '/devices/:deviceId/shares',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const { email } = shareSchema.parse(req.body);
    sendJson(res, shareCreatedSchema, await userService.shareDevice(req.device!, email), 201);
  })
);

// DELETE /api/v1/user/devices/:deviceId/shares/:userId - Revoke a share.
// Access that comes from tenant membership is not affected.
router.delete(
  '/devices/:deviceId/shares/:userId',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    await userService.unshareDevice(req.device!, req.params.userId);
    res.status(204).send();
  })
);

const usageQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).default(30),
});

// GET /api/v1/user/devices/:deviceId/usage - Daily usage history. Finally
// reads daily_summaries, which the nightly aggregation job has been writing
// since the beginning with nothing consuming it.
router.get(
  '/devices/:deviceId/usage',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const { days } = usageQuerySchema.parse(req.query);
    sendJson(res, usageResponseSchema, await getDeviceUsage(req.device!, days));
  })
);

// GET /api/v1/user/devices/:deviceId/tank-profile - Tank shape/dimensions setup
router.get(
  '/devices/:deviceId/tank-profile',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    sendJson(res, tankProfileResponseSchema, { profile: await tankProfileService.getTankProfile(req.device!) });
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
  dead_zone_cm: z.coerce.number().nonnegative().optional(),
});

// PUT /api/v1/user/devices/:deviceId/tank-profile - Set/edit tank setup
router.put(
  '/devices/:deviceId/tank-profile',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const validated = tankProfileSchema.parse(req.body);
    sendJson(res, tankProfileResponseSchema, { profile: await tankProfileService.upsertTankProfile(req.device!, validated) });
  })
);

// DELETE /api/v1/user/devices/:deviceId/tank-profile - Back to "no profile".
// The upsert could correct a wrong profile but never remove it (#9).
router.delete(
  '/devices/:deviceId/tank-profile',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    await tankProfileService.deleteTankProfile(req.device!);
    res.status(204).send();
  })
);

// Cadence limits: the ultrasonic sensor needs time to settle, and a device
// that reports less than once a day is indistinguishable from one that is
// offline. Report must be at least measurement; the service checks that pair.
const intervalsSchema = z
  .object({
    measurement_interval_ms: z.number().int().min(10_000).max(3_600_000).optional(),
    report_interval_ms: z.number().int().min(60_000).max(86_400_000).optional(),
  })
  .refine((body) => body.measurement_interval_ms !== undefined || body.report_interval_ms !== undefined, {
    message: 'Provide measurement_interval_ms or report_interval_ms',
  });

// PUT /api/v1/user/devices/:deviceId/config - Tenant-side cadence settings.
// Previously admin-only (#9). Bumps config_version so the device applies it.
router.put(
  '/devices/:deviceId/config',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const validated = intervalsSchema.parse(req.body);
    sendJson(res, deviceConfigPayloadSchema, await deviceService.updateIntervals(req.device!, validated));
  })
);

// GET /api/v1/user/devices/:deviceId/config - Read-only device config display
router.get(
  '/devices/:deviceId/config',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    sendJson(res, deviceConfigPayloadSchema, await deviceService.getDeviceConfig(req.device!));
  })
);

// PUT /api/v1/user/devices/:deviceId/alert-thresholds - Tenant-editable alert
// thresholds. Omitting a field keeps it; sending null clears it, which turns
// that alert off for this device. Predates /alert-rules; kept for the web app,
// same columns.
router.put(
  '/devices/:deviceId/alert-thresholds',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const validated = alertThresholdsSchema.parse(req.body);
    sendJson(res, configDtoSchema, await deviceService.updateAlertThresholds(req.device!, validated));
  })
);

// GET /api/v1/user/devices/:deviceId/alert-rules - Every alert type this
// device can raise, with its switch and threshold. The catalog is server-owned
// so the app renders whatever comes back and a new rule needs no app release.
router.get(
  '/devices/:deviceId/alert-rules',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    sendJson(res, alertRulesResponseSchema, await alertRulesService.getAlertRules(req.device!));
  })
);

// Keyed by rule type; unknown types and out-of-range thresholds are rejected
// by the service, which owns the catalog. threshold null clears the override.
const alertRulesSchema = z.object({
  rules: z.record(
    z.string(),
    z.object({
      enabled: z.boolean().optional(),
      threshold: z.number().nullable().optional(),
    })
  ),
});

// PUT /api/v1/user/devices/:deviceId/alert-rules - Partial merge: only the
// types and fields present change. Responds with the full resolved set.
router.put(
  '/devices/:deviceId/alert-rules',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const { rules } = alertRulesSchema.parse(req.body);
    sendJson(res, alertRulesResponseSchema, await alertRulesService.updateAlertRules(req.device!, rules));
  })
);

const syncModeSchema = z.object({
  sync_mode: z.enum(['live', 'piggyback']),
});

// PUT /api/v1/user/devices/:deviceId/sync-mode - Toggle a device's MQTT config
// sync mode (live push vs. piggyback). Bumps config version + pushes on change.
router.put(
  '/devices/:deviceId/sync-mode',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const { sync_mode } = syncModeSchema.parse(req.body);
    const applied = await deviceService.setSyncMode(req.device!, sync_mode);
    sendJson(res, syncModeResponseSchema, { sync_mode: applied });
  })
);

// GET /api/v1/user/devices/:deviceId/firmware-status - Read-only OTA status
router.get(
  '/devices/:deviceId/firmware-status',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    sendJson(res, firmwareStatusSchema, await firmwareService.getTenantFacingOtaStatus(req.device!));
  })
);

const deviceAlertsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  include_dismissed: z.coerce.boolean().default(false),
});

// GET /api/v1/user/devices/:deviceId/alerts - Alert history for one device
router.get(
  '/devices/:deviceId/alerts',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    const { limit, include_dismissed } = deviceAlertsQuerySchema.parse(req.query);
    sendJson(res, deviceAlertsResponseSchema, await userService.getDeviceAlerts(req.device!, limit, include_dismissed));
  })
);

// DELETE /api/v1/user/devices/:deviceId/alerts/:alertId - Dismiss an alert.
// The row is kept and merely hidden from the feed, so the operational record
// of a leak survives the user clearing it off their screen.
router.delete(
  '/devices/:deviceId/alerts/:alertId',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    await userService.dismissAlert(req.device!, req.params.alertId);
    res.status(204).send();
  })
);

// POST /api/v1/user/devices/:deviceId/alerts/:alertId/restore - Undo a dismiss
router.post(
  '/devices/:deviceId/alerts/:alertId/restore',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest, res) => {
    await userService.restoreAlert(req.device!, req.params.alertId);
    res.status(204).send();
  })
);

// POST /api/v1/user/devices/:deviceId/alerts/:alertId/acknowledge - Acknowledge alert
router.post(
  '/devices/:deviceId/alerts/:alertId/acknowledge',
  requireDeviceAccess,
  asyncHandler(async (req: DeviceAccessRequest & AuthRequest, res) => {
    await userService.acknowledgeAlert(req.device!, req.params.alertId, req.user!.id);
    sendJson(res, okSchema, { success: true });
  })
);

// POST /api/v1/user/alerts/:alertId/acknowledge - Acknowledge by alert id
// alone, which is all a notification action carries.
router.post(
  '/alerts/:alertId/acknowledge',
  asyncHandler(async (req: AuthRequest, res) => {
    await userService.acknowledgeAlertById({ id: req.user!.id, tenantId: req.user!.tenantId }, req.params.alertId);
    sendJson(res, okSchema, { success: true });
  })
);

const pushTokenSchema = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(['android', 'ios', 'web']).default('android'),
});

// POST /api/v1/user/push-tokens - Register this install for push.
// One row per install, so a phone and a tablet both ring.
router.post(
  '/push-tokens',
  asyncHandler(async (req: AuthRequest, res) => {
    const { token, platform } = pushTokenSchema.parse(req.body);
    await registerPushToken(req.user!.id, token, platform);
    sendJson(res, okSchema, { success: true }, 201);
  })
);

// DELETE /api/v1/user/push-tokens - Revoke on sign-out, so the backend stops
// pushing this tenant's alerts to a phone nobody is signed in on.
router.delete(
  '/push-tokens',
  asyncHandler(async (req: AuthRequest, res) => {
    const { token } = pushTokenSchema.pick({ token: true }).parse(req.body);
    await removePushToken(req.user!.id, token);
    sendJson(res, okSchema, { success: true });
  })
);

const fcmTokenSchema = z.object({
  fcm_token: z.string().min(1),
});

// POST /api/v1/user/fcm-token - Deprecated alias of POST /push-tokens, kept
// while v1 app builds are still installed.
router.post(
  '/fcm-token',
  asyncHandler(async (req: AuthRequest, res) => {
    const { fcm_token } = fcmTokenSchema.parse(req.body);
    await updateUserFCMToken(req.user!.id, fcm_token);
    sendJson(res, okSchema, { success: true });
  })
);

// DELETE /api/v1/user/fcm-token - Drop the push token on sign-out. Without
// this a signed-out phone keeps receiving this account's alerts until some
// other login happens to overwrite the token.
router.delete(
  '/fcm-token',
  asyncHandler(async (req: AuthRequest, res) => {
    await userService.clearFCMToken(req.user!.id);
    res.status(204).send();
  })
);

export default router;
