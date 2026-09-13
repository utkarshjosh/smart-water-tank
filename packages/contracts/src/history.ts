import { z } from 'zod';
import { isoDateTime } from './primitives';

// GET /api/v1/user/devices/:id/history/series — history.service. Server-side
// MIN/AVG/MAX per time bucket, so a span of any length costs a bounded number
// of points.

/** The server's aggregation rungs. `auto` is only ever a request, never a result. */
export const BUCKETS = ['raw', '1m', '5m', '15m', '1h', '6h', '1d'] as const;
export const bucketSchema = z.enum(BUCKETS);
export type Bucket = z.infer<typeof bucketSchema>;

export const requestedBucketSchema = z.enum(['auto', ...BUCKETS]);
export type RequestedBucket = z.infer<typeof requestedBucketSchema>;

/** Every metric the endpoint can bucket. Keys of `series` are drawn from this set. */
export const HISTORY_METRICS = ['level_percent', 'volume_l', 'temperature_c', 'battery_v', 'level_cm'] as const;
export const historyMetricSchema = z.enum(HISTORY_METRICS);
export type HistoryMetric = z.infer<typeof historyMetricSchema>;

/**
 * [epochMs, min, avg, max]. An all-null triple is a deliberate gap marker so a
 * chart breaks its line instead of drawing through days of missing data. In
 * `raw` mode min, avg and max are the same reading.
 */
export const seriesPointSchema = z.tuple([
  z.number(),
  z.number().nullable(),
  z.number().nullable(),
  z.number().nullable(),
]);
export type SeriesPoint = z.infer<typeof seriesPointSchema>;

export const historySeriesSchema = z.object({
  device_id: z.string(),
  /** Narrowed to the oldest reading actually returned when `truncated`. */
  from: isoDateTime,
  to: isoDateTime,
  requested_from: isoDateTime,
  bucket: bucketSchema,
  requested_bucket: requestedBucketSchema,
  bucket_seconds: z.number().nullable(),
  point_count: z.number(),
  /** Raw mode held more readings than one response carries; see `from`. */
  truncated: z.boolean(),
  /** False means level_percent (and derived volume) is all gaps: no geometry, no percent. */
  has_tank_profile: z.boolean(),
  columns: z.tuple([z.literal('t'), z.literal('min'), z.literal('avg'), z.literal('max')]),
  series: z.record(z.string(), z.object({ unit: z.string(), points: z.array(seriesPointSchema) })),
  /** [epochMs, readings in that bucket] — how much data each point stands on. */
  samples: z.array(z.tuple([z.number(), z.number()])),
});
export type HistorySeries = z.infer<typeof historySeriesSchema>;
