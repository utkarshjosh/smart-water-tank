import { z } from 'zod';
import {
  alertSeveritySchema,
  alertTypeSchema,
  deviceStatusSchema,
  isoDate,
  isoDateTime,
  nullableIsoDateTime,
  roleSchema,
  syncModeSchema,
} from './primitives';

// Responses of /api/v1/user/* — what the web console's tenant pages and the
// Android app read. Field order follows the backend DTO builders in
// backend-v2/src/services/user.service.ts so the two are easy to diff.

// --- Account -----------------------------------------------------------------

/** GET /me, PUT /me — user.service toUserDto. */
export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: roleSchema,
  tenant_id: z.string().nullable(),
  tenant_name: z.string().nullable(),
});
export type Me = z.infer<typeof meSchema>;

/** POST /register — 201 on first registration, 200 when the profile already existed. */
export const registerResponseSchema = z.object({
  user: meSchema,
  message: z.string(),
});
export type RegisterResponse = z.infer<typeof registerResponseSchema>;

// --- Devices -----------------------------------------------------------------

/**
 * One row of GET /devices — listDevicesForTenant. Every reading is nullable on
 * purpose: null means the sensor could not be read this cycle or no tank
 * profile exists yet. It never means zero.
 */
export const deviceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: deviceStatusSchema,
  firmware_version: z.string().nullable(),
  last_seen: nullableIsoDateTime,
  current_volume: z.number().nullable(),
  level_percent: z.number().nullable(),
  /** True when level_percent came from an older reading than last_measurement. */
  level_percent_stale: z.boolean(),
  level_percent_as_of: nullableIsoDateTime,
  has_tank_profile: z.boolean(),
  last_measurement: nullableIsoDateTime,
  active_alert: z.enum(['leak', 'low']).nullable(),
});
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;

export const devicesResponseSchema = z.object({ devices: z.array(deviceSummarySchema) });
export type DevicesResponse = z.infer<typeof devicesResponseSchema>;

/** GET /devices/:id and what PUT /devices/:id echoes after a rename — getDeviceInfo. */
export const deviceInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: deviceStatusSchema,
  firmware_version: z.string().nullable(),
  last_seen: nullableIsoDateTime,
  created_at: isoDateTime,
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

// --- Readings ----------------------------------------------------------------

/** device.service toMeasurementDto. Shared by /current and the legacy /history rows. */
export const measurementFields = {
  timestamp: isoDateTime,
  level_cm: z.number().nullable(),
  volume_l: z.number().nullable(),
  temperature_c: z.number().nullable(),
  battery_v: z.number().nullable(),
  rssi: z.number().nullable(),
};

/** GET /devices/:id/current — getDeviceCurrent. 404 when the device has never reported. */
export const currentReadingSchema = z.object({
  device_id: z.string(),
  ...measurementFields,
  level_percent: z.number().nullable(),
  level_percent_stale: z.boolean(),
  level_percent_as_of: nullableIsoDateTime,
});
export type CurrentReading = z.infer<typeof currentReadingSchema>;

/** One row of the legacy GET /devices/:id/history (raw rows, newest first). */
export const historyPointSchema = z.object({
  ...measurementFields,
  level_percent: z.number().nullable(),
});
export type HistoryPoint = z.infer<typeof historyPointSchema>;

/** @deprecated Superseded by /history/series (see history.ts). Removed once mobile-app/ is gone (#8). */
export const historyResponseSchema = z.object({
  device_id: z.string(),
  measurements: z.array(historyPointSchema),
});
export type HistoryResponse = z.infer<typeof historyResponseSchema>;

// --- Alerts ------------------------------------------------------------------

/** user.service toAlertDto without the device fields. */
export const alertSchema = z.object({
  id: z.string(),
  type: alertTypeSchema,
  severity: alertSeveritySchema,
  message: z.string().nullable(),
  payload: z.unknown().nullable(),
  acknowledged: z.boolean(),
  /** Hidden from the default feed but kept as a record. */
  dismissed: z.boolean(),
  created_at: isoDateTime,
});
export type Alert = z.infer<typeof alertSchema>;

/** GET /devices/:id/alerts — getDeviceAlerts. */
export const deviceAlertsResponseSchema = z.object({
  device_id: z.string(),
  alerts: z.array(alertSchema),
});
export type DeviceAlertsResponse = z.infer<typeof deviceAlertsResponseSchema>;

/** One row of the tenant-wide inbox: the same alert plus which tank it is about. */
export const feedAlertSchema = alertSchema.extend({
  device_id: z.string(),
  device_name: z.string(),
});
export type FeedAlert = z.infer<typeof feedAlertSchema>;

/** GET /alerts — getUserAlerts. `next_cursor` is null on the last page. */
export const alertFeedResponseSchema = z.object({
  alerts: z.array(feedAlertSchema),
  unacknowledged: z.number(),
  next_cursor: z.string().nullable(),
});
export type AlertFeedResponse = z.infer<typeof alertFeedResponseSchema>;

// --- Pairing -----------------------------------------------------------------

/** POST /devices/claim-code — mintClaimCode. 201. */
export const claimCodeSchema = z.object({
  claim_code: z.string(),
  expires_at: isoDateTime,
  expires_in_seconds: z.number(),
});
export type ClaimCode = z.infer<typeof claimCodeSchema>;

/** GET /devices/claim-code/:code/status — getClaimCodeStatus. */
export const claimStatusSchema = z.object({
  status: z.enum(['pending', 'claimed', 'expired']),
  device: z.object({ id: z.string(), name: z.string(), status: deviceStatusSchema }).nullable(),
});
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

// --- Sharing -----------------------------------------------------------------

/** listDeviceShares: a person who can see the device and how they got access. */
export const deviceShareSchema = z.object({
  user_id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: roleSchema,
  via: z.enum(['tenant', 'share']),
  /** Tenant membership cannot be revoked per device; explicit grants can. */
  revocable: z.boolean(),
  /** Only on explicit grants: the person is also a tenant member, so the grant is harmless but unneeded. */
  redundant: z.boolean().optional(),
  shared_at: isoDateTime.optional(),
});
export type DeviceShare = z.infer<typeof deviceShareSchema>;

/** GET /devices/:id/shares. */
export const sharesResponseSchema = z.object({
  device_id: z.string(),
  members: z.array(deviceShareSchema),
  shares: z.array(deviceShareSchema),
});
export type SharesResponse = z.infer<typeof sharesResponseSchema>;

/** POST /devices/:id/shares — shareDevice. 201. */
export const shareCreatedSchema = z.object({
  user_id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
});
export type ShareCreated = z.infer<typeof shareCreatedSchema>;

// --- Usage -------------------------------------------------------------------

export const usageDaySchema = z.object({
  date: isoDate,
  used_l: z.number().nullable(),
  min_l: z.number().nullable(),
  avg_l: z.number().nullable(),
  max_l: z.number().nullable(),
  refill_events: z.number(),
  leak_suspected: z.boolean(),
  readings: z.number(),
});
export type UsageDay = z.infer<typeof usageDaySchema>;

/** GET /devices/:id/usage — usage.service getDeviceUsage. */
export const usageResponseSchema = z.object({
  device_id: z.string(),
  from: isoDateTime,
  to: isoDateTime,
  has_tank_profile: z.boolean(),
  capacity_l: z.number().nullable(),
  days: z.array(usageDaySchema),
  totals: z.object({
    used_l: z.number().nullable(),
    daily_average_l: z.number().nullable(),
    refill_events: z.number(),
    leak_days: z.number(),
    days_with_data: z.number(),
    days_aggregated: z.number(),
  }),
});
export type UsageResponse = z.infer<typeof usageResponseSchema>;

// --- Configuration -----------------------------------------------------------

/**
 * device.service toConfigDto — the legacy admin-facing config row, returned by
 * PUT /devices/:id/alert-thresholds and inside the admin device detail. Loose
 * because DeviceConfig.configJson is spread into it; anything in there rides
 * along untyped.
 */
export const configDtoSchema = z.looseObject({
  measurement_interval_ms: z.number(),
  report_interval_ms: z.number(),
  tank_full_threshold_l: z.number().nullable(),
  tank_low_threshold_l: z.number().nullable(),
  tank_full_threshold_pct: z.number().nullable(),
  tank_low_threshold_pct: z.number().nullable(),
  battery_low_threshold_v: z.number().nullable(),
  level_empty_cm: z.number().nullable(),
  level_full_cm: z.number().nullable(),
});
export type ConfigDto = z.infer<typeof configDtoSchema>;

/** PUT /devices/:id/sync-mode. */
export const syncModeResponseSchema = z.object({ sync_mode: syncModeSchema });
export type SyncModeResponse = z.infer<typeof syncModeResponseSchema>;

// --- Alert rules -------------------------------------------------------------

export const alertRuleThresholdSchema = z.object({
  /** The stored per-device override; null = not set. */
  value: z.number().nullable(),
  /** What the rule falls back to when no override is set; null = cannot fire until one is set. */
  default: z.number().nullable(),
  unit: z.enum(['%', 'V', 'min']),
  min: z.number(),
  max: z.number(),
  comparison: z.enum(['below', 'above']),
});
export type AlertRuleThreshold = z.infer<typeof alertRuleThresholdSchema>;

/** alert-rules.service AlertRule: the catalog resolved against one device. */
export const alertRuleSchema = z.object({
  type: alertTypeSchema,
  label: z.string(),
  description: z.string(),
  severity: alertSeveritySchema,
  source: z.enum(['reading', 'pattern', 'schedule']),
  enabled: z.boolean(),
  /** null for rules with no tunable number (leak detection). */
  threshold: alertRuleThresholdSchema.nullable(),
});
export type AlertRule = z.infer<typeof alertRuleSchema>;

/** GET and PUT /devices/:id/alert-rules. */
export const alertRulesResponseSchema = z.object({ rules: z.array(alertRuleSchema) });
export type AlertRulesResponse = z.infer<typeof alertRulesResponseSchema>;

// --- Firmware ----------------------------------------------------------------

/** GET /devices/:id/firmware-status — firmware.service getTenantFacingOtaStatus. */
export const firmwareStatusSchema = z.object({
  current_version: z.string().nullable(),
  latest_known_version: z.string().nullable(),
  update_pending: z.boolean(),
  last_checked_at: nullableIsoDateTime,
});
export type FirmwareStatus = z.infer<typeof firmwareStatusSchema>;
