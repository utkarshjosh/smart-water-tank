import { z } from 'zod';

/**
 * Response schemas mirroring backend-v2's user DTOs exactly.
 *
 * Every reading is nullable on purpose: the backend returns null when the
 * sensor could not be read this cycle or no tank profile exists yet, and is
 * rigorous that null means UNKNOWN, never zero. v1 of this app called
 * `.toString()` on those fields and crashed on real data. Parsing here means a
 * shape change breaks at the boundary with a readable error instead of inside
 * a render.
 */

/** Backend sends ISO strings; Date keeps "as of" maths honest downstream. */
const isoDate = z.coerce.date();
const nullableIsoDate = z.union([isoDate, z.null()]).catch(null);

export const deviceStatusSchema = z.enum(['online', 'offline']);

export const alertTypeSchema = z.enum([
  'tank_full',
  'tank_low',
  'battery_low',
  'device_offline',
  'leak_detected',
]);

export const alertSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: z.string(),
  tenant_id: z.string().nullable(),
  tenant_name: z.string().nullable(),
});
export type Me = z.infer<typeof meSchema>;

/** One row of GET /user/devices — the whole Tanks screen is built from this. */
export const deviceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: deviceStatusSchema,
  firmware_version: z.string().nullable(),
  last_seen: nullableIsoDate,
  current_volume: z.number().nullable(),
  level_percent: z.number().nullable(),
  /** True when level_percent came from an older reading than last_measurement. */
  level_percent_stale: z.boolean(),
  level_percent_as_of: nullableIsoDate,
  has_tank_profile: z.boolean(),
  last_measurement: nullableIsoDate,
  active_alert: z.enum(['leak', 'low']).nullable(),
});
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;

export const devicesSchema = z.object({ devices: z.array(deviceSummarySchema) });

/** What PUT /user/devices/:id echoes back after a rename — the bare device, no reading. */
export const deviceInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: deviceStatusSchema,
  firmware_version: z.string().nullable(),
  last_seen: nullableIsoDate,
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

const measurementFields = {
  timestamp: isoDate,
  level_cm: z.number().nullable(),
  volume_l: z.number().nullable(),
  temperature_c: z.number().nullable(),
  battery_v: z.number().nullable(),
  rssi: z.number().nullable(),
};

export const currentReadingSchema = z.object({
  device_id: z.string(),
  ...measurementFields,
  level_percent: z.number().nullable(),
  level_percent_stale: z.boolean(),
  level_percent_as_of: nullableIsoDate,
});
export type CurrentReading = z.infer<typeof currentReadingSchema>;

export const historyPointSchema = z.object({
  ...measurementFields,
  level_percent: z.number().nullable(),
});
export type HistoryPoint = z.infer<typeof historyPointSchema>;

export const historySchema = z.object({
  device_id: z.string(),
  measurements: z.array(historyPointSchema),
});

export const alertSchema = z.object({
  id: z.string(),
  type: alertTypeSchema,
  severity: alertSeveritySchema,
  message: z.string().nullable(),
  payload: z.unknown().nullable(),
  acknowledged: z.boolean(),
  /** Hidden from the default feed but kept as a record. */
  dismissed: z.boolean().default(false),
  created_at: isoDate,
});
export type Alert = z.infer<typeof alertSchema>;

export const deviceAlertsSchema = z.object({
  device_id: z.string(),
  alerts: z.array(alertSchema),
});

/** One row of the tenant-wide feed: the same alert, plus which tank it is about. */
export const feedAlertSchema = alertSchema.extend({
  device_id: z.string(),
  device_name: z.string(),
});
export type FeedAlert = z.infer<typeof feedAlertSchema>;

export const alertFeedSchema = z.object({
  alerts: z.array(feedAlertSchema),
  unacknowledged: z.number(),
  next_cursor: z.string().nullable(),
});

/**
 * Server-bucketed history (backend-v2 history.service.ts). Each point is
 * [epochMs, min, avg, max]; an all-null triple is a deliberate gap marker so a
 * chart breaks its line instead of drawing straight through days of missing
 * data. In `raw` mode min, avg and max are the same reading.
 */
export const seriesPointSchema = z.tuple([
  z.number(),
  z.number().nullable(),
  z.number().nullable(),
  z.number().nullable(),
]);
export type SeriesTuple = z.infer<typeof seriesPointSchema>;

/** The server's aggregation rungs. `auto` is only ever a request, never a result. */
export const BUCKETS = ['raw', '1m', '5m', '15m', '1h', '6h', '1d'] as const;
export const bucketSchema = z.enum(BUCKETS);
export type Bucket = z.infer<typeof bucketSchema>;
export type RequestedBucket = Bucket | 'auto';

/** Every metric the endpoint can bucket. Keys of `series` are drawn from this set. */
export const HISTORY_METRICS = ['level_percent', 'volume_l', 'temperature_c', 'battery_v', 'level_cm'] as const;
export type HistoryMetric = (typeof HISTORY_METRICS)[number];

export const historySeriesSchema = z.object({
  device_id: z.string(),
  /** Narrowed to the oldest reading actually returned when `truncated`. */
  from: isoDate,
  to: isoDate,
  requested_from: isoDate,
  bucket: bucketSchema,
  requested_bucket: z.enum(['auto', ...BUCKETS]),
  bucket_seconds: z.number().nullable(),
  point_count: z.number(),
  /** Raw mode held more readings than one response carries; see `from`. */
  truncated: z.boolean(),
  /** False means level_percent (and derived volume) is all gaps: no geometry, no percent. */
  has_tank_profile: z.boolean(),
  columns: z.tuple([z.literal('t'), z.literal('min'), z.literal('avg'), z.literal('max')]),
  series: z.record(
    z.string(),
    z.object({ unit: z.string(), points: z.array(seriesPointSchema) })
  ),
  /** [epochMs, readings in that bucket] — how much data each point stands on. */
  samples: z.array(z.tuple([z.number(), z.number()])),
});
export type HistorySeries = z.infer<typeof historySeriesSchema>;

export const tankProfileSchema = z.object({
  shape: z.enum(['cylindrical', 'cuboidal']),
  parallel_unit_count: z.number(),
  height_cm: z.number(),
  diameter_cm: z.number().nullable(),
  length_cm: z.number().nullable(),
  width_cm: z.number().nullable(),
  nominal_unit_volume_l: z.number().nullable(),
  sensor_offset_cm: z.number(),
  dead_zone_cm: z.number(),
  unit_capacity_l: z.number(),
  total_capacity_l: z.number(),
});
export type TankProfile = z.infer<typeof tankProfileSchema>;

export const tankProfileResponseSchema = z.object({ profile: tankProfileSchema.nullable() });

export const claimCodeSchema = z.object({
  claim_code: z.string(),
  expires_at: isoDate,
  expires_in_seconds: z.number(),
});

export const claimStatusSchema = z.object({
  status: z.enum(['pending', 'claimed', 'expired']),
  device: z
    .object({ id: z.string(), name: z.string(), status: deviceStatusSchema })
    .nullable(),
});
