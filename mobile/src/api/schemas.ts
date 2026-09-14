import { z } from 'zod';
import * as contracts from '@aquamind/contracts';

/**
 * The app's view of the API: @aquamind/contracts (the wire, shared with the
 * backend and the web console) with timestamps turned into Date objects.
 *
 * The contract describes what the server sends — ISO strings — because that
 * is what the backend validates against. This app keeps "as of" maths honest
 * by working in Date, so each schema that carries a timestamp is extended
 * here with `z.coerce.date()` on exactly those fields. Every other field's
 * type comes straight from the contract: a field dropped on the server fails
 * the backend's own check first, and if it somehow reached us it fails here
 * at the boundary with a readable error instead of inside a render.
 *
 * Every reading is nullable on purpose: the backend returns null when the
 * sensor could not be read this cycle or no tank profile exists yet, and is
 * rigorous that null means UNKNOWN, never zero.
 */

const isoDate = z.coerce.date();
/**
 * A missing or unparsable timestamp reads as "unknown", never as a crash.
 * `z.null()` must be tried FIRST: `z.coerce.date()` runs `new Date(null)`,
 * which is a perfectly valid 1970-01-01, so with the branches the other way
 * round every null the server sent became the epoch.
 */
const nullableIsoDate = z.union([z.null(), isoDate]).catch(null);

// --- Straight from the contract (no timestamps) --------------------------------

export const {
  deviceStatusSchema,
  alertTypeSchema,
  alertSeveritySchema,
  meSchema,
  claimStatusSchema,
  tankProfileSchema,
  tankProfileResponseSchema,
  seriesPointSchema,
  BUCKETS,
  bucketSchema,
  HISTORY_METRICS,
} = contracts;

export type Me = contracts.Me;
export type TankProfile = contracts.TankProfile;
export type SeriesTuple = contracts.SeriesPoint;
export type Bucket = contracts.Bucket;
export type RequestedBucket = contracts.RequestedBucket;
export type HistoryMetric = contracts.HistoryMetric;

// --- Contract schemas with their timestamps as Date ----------------------------

/** One row of GET /user/devices — the whole Tanks screen is built from this. */
export const deviceSummarySchema = contracts.deviceSummarySchema.extend({
  last_seen: nullableIsoDate,
  level_percent_as_of: nullableIsoDate,
  last_measurement: nullableIsoDate,
});
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;

export const devicesSchema = z.object({ devices: z.array(deviceSummarySchema) });

/** What PUT /user/devices/:id echoes back after a rename — the bare device, no reading. */
export const deviceInfoSchema = contracts.deviceInfoSchema.extend({
  last_seen: nullableIsoDate,
  created_at: isoDate,
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

export const currentReadingSchema = contracts.currentReadingSchema.extend({
  timestamp: isoDate,
  level_percent_as_of: nullableIsoDate,
});
export type CurrentReading = z.infer<typeof currentReadingSchema>;

export const historyPointSchema = contracts.historyPointSchema.extend({ timestamp: isoDate });
export type HistoryPoint = z.infer<typeof historyPointSchema>;

export const historySchema = z.object({
  device_id: z.string(),
  measurements: z.array(historyPointSchema),
});

export const alertSchema = contracts.alertSchema.extend({ created_at: isoDate });
export type Alert = z.infer<typeof alertSchema>;

export const deviceAlertsSchema = z.object({
  device_id: z.string(),
  alerts: z.array(alertSchema),
});

/** One row of the tenant-wide feed: the same alert, plus which tank it is about. */
export const feedAlertSchema = contracts.feedAlertSchema.extend({ created_at: isoDate });
export type FeedAlert = z.infer<typeof feedAlertSchema>;

export const alertFeedSchema = contracts.alertFeedResponseSchema.extend({
  alerts: z.array(feedAlertSchema),
});

/**
 * Server-bucketed history. Each point is [epochMs, min, avg, max]; an all-null
 * triple is a deliberate gap marker so a chart breaks its line instead of
 * drawing straight through days of missing data.
 */
export const historySeriesSchema = contracts.historySeriesSchema.extend({
  from: isoDate,
  to: isoDate,
  requested_from: isoDate,
});
export type HistorySeries = z.infer<typeof historySeriesSchema>;

export const claimCodeSchema = contracts.claimCodeSchema.extend({ expires_at: isoDate });
