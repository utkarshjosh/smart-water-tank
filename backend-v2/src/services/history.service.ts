import { Device, Prisma, TankProfile } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { computeLevelPercent, computeTotalCapacityL, getTankProfileRaw } from './tank-profile.service';

// Bucketed history for browsable charts. The old `/history` endpoint returns
// raw rows newest-first capped at 10k, which cannot answer "show me a year" -
// at the default 5-minute report interval that is ~105k rows per device. Here
// the database does the aggregation, so any span costs a bounded number of
// points.

export const BUCKETS = ['raw', '1m', '5m', '15m', '1h', '6h', '1d'] as const;
export type Bucket = (typeof BUCKETS)[number];
export type RequestedBucket = Bucket | 'auto';

export const HISTORY_METRICS = ['level_percent', 'volume_l', 'temperature_c', 'battery_v', 'level_cm'] as const;
export type HistoryMetric = (typeof HISTORY_METRICS)[number];

export const DEFAULT_METRICS: HistoryMetric[] = ['level_percent', 'volume_l', 'temperature_c', 'battery_v'];

const METRIC_UNITS: Record<HistoryMetric, string> = {
  level_percent: '%',
  volume_l: 'L',
  temperature_c: '°C',
  battery_v: 'V',
  level_cm: 'cm',
};

/** Hard ceiling on points per series. An explicit bucket that would exceed it is rejected. */
export const MAX_POINTS = 5000;
/**
 * Ceiling `bucket=auto` stays under - dense enough to see refills, light enough
 * to render. The densest rung (7 days at 5 minutes) lands at 2016 points.
 */
export const AUTO_TARGET_POINTS = 2500;
/** Widest span accepted in one request. */
export const MAX_SPAN_MS = 400 * 24 * 60 * 60 * 1000;
const DEFAULT_SPAN_MS = 7 * 24 * 60 * 60 * 1000;

/** Fallback gap threshold in raw mode when the device has no config row. */
const DEFAULT_RAW_GAP_MS = 15 * 60 * 1000;
/** A gap wider than (report interval x this) is a real outage, not jitter. */
const RAW_GAP_INTERVAL_FACTOR = 2.5;

const BUCKET_SECONDS: Record<Exclude<Bucket, 'raw'>, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '6h': 21600,
  '1d': 86400,
};

export function bucketSeconds(bucket: Bucket): number | null {
  return bucket === 'raw' ? null : BUCKET_SECONDS[bucket];
}

/**
 * Ladder for `bucket=auto`. Each rung keeps the series at or under
 * AUTO_TARGET_POINTS for the widest span that selects it.
 */
export function chooseAutoBucket(spanMs: number): Bucket {
  const hours = spanMs / 3_600_000;
  if (hours <= 24) return 'raw';
  if (hours <= 7 * 24) return '5m';
  if (hours <= 30 * 24) return '1h';
  if (hours <= 180 * 24) return '6h';
  return '1d';
}

export function estimateBucketCount(spanMs: number, bucket: Bucket): number | null {
  const seconds = bucketSeconds(bucket);
  if (seconds == null) return null;
  return Math.ceil(spanMs / (seconds * 1000));
}

export interface RangeInput {
  from?: string;
  to?: string;
  days?: number;
}

export interface ResolvedRange {
  from: Date;
  to: Date;
}

/**
 * `from`/`to` win; `days` is the shorthand the old endpoint used and stays
 * supported so callers can migrate one at a time.
 */
export function resolveRange(input: RangeInput, now: Date = new Date()): ResolvedRange {
  const to = input.to ? new Date(input.to) : now;
  if (Number.isNaN(to.getTime())) throw new HttpError(400, '`to` is not a valid ISO timestamp');

  let from: Date;
  if (input.from) {
    from = new Date(input.from);
    if (Number.isNaN(from.getTime())) throw new HttpError(400, '`from` is not a valid ISO timestamp');
  } else {
    const spanMs = input.days != null ? input.days * 86_400_000 : DEFAULT_SPAN_MS;
    from = new Date(to.getTime() - spanMs);
  }

  if (from.getTime() >= to.getTime()) throw new HttpError(400, '`from` must be earlier than `to`');
  if (to.getTime() - from.getTime() > MAX_SPAN_MS) {
    throw new HttpError(400, `Requested range exceeds the ${Math.floor(MAX_SPAN_MS / 86_400_000)}-day maximum`);
  }

  return { from, to };
}

export function resolveBucket(requested: RequestedBucket, spanMs: number): Bucket {
  if (requested === 'auto') return chooseAutoBucket(spanMs);

  const count = estimateBucketCount(spanMs, requested);
  if (count != null && count > MAX_POINTS) {
    throw new HttpError(
      400,
      `bucket=${requested} over this range would return ${count} points (max ${MAX_POINTS}). Use a coarser bucket or a shorter range.`
    );
  }
  return requested;
}

export function parseMetrics(raw: string | undefined): HistoryMetric[] {
  if (!raw) return DEFAULT_METRICS;

  const requested = raw
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  if (requested.length === 0) return DEFAULT_METRICS;

  const unknown = requested.filter((m) => !HISTORY_METRICS.includes(m as HistoryMetric));
  if (unknown.length > 0) {
    throw new HttpError(400, `Unknown metric(s): ${unknown.join(', ')}. Valid: ${HISTORY_METRICS.join(', ')}`);
  }
  // De-duplicate while keeping the caller's order.
  return [...new Set(requested)] as HistoryMetric[];
}

/** [epochMs, min, avg, max] - a null triple marks a gap so the line breaks. */
export type SeriesPoint = [number, number | null, number | null, number | null];

interface Aggregate {
  min: number | null;
  avg: number | null;
  max: number | null;
}

const EMPTY: Aggregate = { min: null, avg: null, max: null };

function round(value: number | null, digits: number): number | null {
  if (value == null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** $queryRaw hands back number | string | Decimal | bigint depending on the column. */
function toNum(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

type LevelCalibration = { heightCm: number; sensorOffsetCm: number; deadZoneCm: number };

function calibrationOf(profile: TankProfile): LevelCalibration {
  return {
    heightCm: profile.heightCm.toNumber(),
    sensorOffsetCm: profile.sensorOffsetCm.toNumber(),
    deadZoneCm: profile.deadZoneCm.toNumber(),
  };
}

/**
 * level_cm is the ultrasonic DISTANCE from the sensor down to the water, so it
 * runs opposite to fill: the smallest distance in a bucket is its fullest
 * moment. Every derived metric therefore swaps min and max.
 */
export function levelAggregateToPercent(level: Aggregate, cal: LevelCalibration): Aggregate {
  return {
    min: round(computeLevelPercent(level.max, cal), 2),
    avg: round(computeLevelPercent(level.avg, cal), 2),
    max: round(computeLevelPercent(level.min, cal), 2),
  };
}

export function levelAggregateToVolume(level: Aggregate, cal: LevelCalibration, capacityL: number): Aggregate {
  const pct = levelAggregateToPercent(level, cal);
  const toLitres = (p: number | null) => (p == null ? null : round((p / 100) * capacityL, 2));
  return { min: toLitres(pct.min), avg: toLitres(pct.avg), max: toLitres(pct.max) };
}

interface BucketRow {
  bucket_start: unknown;
  level_min: unknown;
  level_avg: unknown;
  level_max: unknown;
  volume_min: unknown;
  volume_avg: unknown;
  volume_max: unknown;
  temp_min: unknown;
  temp_avg: unknown;
  temp_max: unknown;
  battery_min: unknown;
  battery_avg: unknown;
  battery_max: unknown;
  sample_count: unknown;
}

interface NormalizedBucket {
  t: number;
  level: Aggregate;
  volume: Aggregate;
  temperature: Aggregate;
  battery: Aggregate;
  samples: number;
}

/**
 * Insert one null point after any run that is followed by a gap wider than
 * `gapMs`, so a line chart breaks across an outage instead of drawing a
 * straight line through days of missing data.
 */
export function withGapBreaks(points: SeriesPoint[], gapMs: number): SeriesPoint[] {
  if (points.length < 2) return points;

  const out: SeriesPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    out.push(points[i]);
    const next = points[i + 1];
    if (next && next[0] - points[i][0] > gapMs) {
      out.push([points[i][0] + Math.floor(gapMs / 2), null, null, null]);
    }
  }
  return out;
}

function buildSeries(
  buckets: NormalizedBucket[],
  metrics: HistoryMetric[],
  profile: TankProfile | null,
  gapMs: number
) {
  const cal = profile ? calibrationOf(profile) : null;
  const capacityL = profile
    ? computeTotalCapacityL({
        shape: profile.shape,
        parallelUnitCount: profile.parallelUnitCount,
        heightCm: profile.heightCm.toNumber(),
        diameterCm: profile.diameterCm?.toNumber() ?? null,
        lengthCm: profile.lengthCm?.toNumber() ?? null,
        widthCm: profile.widthCm?.toNumber() ?? null,
        nominalUnitVolumeL: profile.nominalUnitVolumeL?.toNumber() ?? null,
      })
    : null;

  const aggregateFor = (bucket: NormalizedBucket, metric: HistoryMetric): Aggregate => {
    switch (metric) {
      case 'level_cm':
        return bucket.level;
      case 'level_percent':
        // Without a calibrated tank there is no honest percentage.
        return cal ? levelAggregateToPercent(bucket.level, cal) : EMPTY;
      case 'volume_l':
        // Mirrors read-time derivation elsewhere: derive from the current
        // profile when there is one, else fall back to the stored snapshot.
        return cal && capacityL != null ? levelAggregateToVolume(bucket.level, cal, capacityL) : bucket.volume;
      case 'temperature_c':
        return bucket.temperature;
      case 'battery_v':
        return bucket.battery;
    }
  };

  const series: Record<string, { unit: string; points: SeriesPoint[] }> = {};
  for (const metric of metrics) {
    const points: SeriesPoint[] = buckets.map((bucket) => {
      const agg = aggregateFor(bucket, metric);
      return [bucket.t, agg.min, agg.avg, agg.max];
    });
    series[metric] = { unit: METRIC_UNITS[metric], points: withGapBreaks(points, gapMs) };
  }
  return series;
}

async function fetchBucketed(
  deviceRowId: string,
  from: Date,
  to: Date,
  seconds: number,
  profile: TankProfile | null
): Promise<NormalizedBucket[]> {
  // Clamp inside SQL so AVG matches what computeLevelPercent would produce
  // per-reading: averaging unclamped distances first would let readings inside
  // the sensor's dead zone drag the mean past the 100% ceiling.
  const levelExpr = profile
    ? Prisma.sql`LEAST(GREATEST(\`level_cm\`, ${Math.max(
        profile.sensorOffsetCm.toNumber(),
        profile.deadZoneCm.toNumber()
      )}), ${profile.sensorOffsetCm.toNumber() + profile.heightCm.toNumber()})`
    : Prisma.sql`\`level_cm\``;

  // TIMESTAMPDIFF against a fixed epoch is plain datetime arithmetic - unlike
  // UNIX_TIMESTAMP it does not depend on the session time zone, so bucket
  // boundaries are stable wherever this runs.
  const rows = await prisma.$queryRaw<BucketRow[]>`
    SELECT
      FLOOR(TIMESTAMPDIFF(SECOND, '1970-01-01 00:00:00', \`timestamp\`) / ${seconds}) * ${seconds} AS bucket_start,
      MIN(${levelExpr}) AS level_min,
      AVG(${levelExpr}) AS level_avg,
      MAX(${levelExpr}) AS level_max,
      MIN(\`volume_l\`) AS volume_min,
      AVG(\`volume_l\`) AS volume_avg,
      MAX(\`volume_l\`) AS volume_max,
      MIN(\`temperature_c\`) AS temp_min,
      AVG(\`temperature_c\`) AS temp_avg,
      MAX(\`temperature_c\`) AS temp_max,
      MIN(\`battery_v\`) AS battery_min,
      AVG(\`battery_v\`) AS battery_avg,
      MAX(\`battery_v\`) AS battery_max,
      COUNT(*) AS sample_count
    FROM \`measurements\`
    WHERE \`device_id\` = ${deviceRowId}
      AND \`timestamp\` >= ${from}
      AND \`timestamp\` < ${to}
    GROUP BY bucket_start
    ORDER BY bucket_start ASC
  `;

  return rows.map((row) => ({
    t: (toNum(row.bucket_start) ?? 0) * 1000,
    level: { min: toNum(row.level_min), avg: toNum(row.level_avg), max: toNum(row.level_max) },
    volume: {
      min: round(toNum(row.volume_min), 2),
      avg: round(toNum(row.volume_avg), 2),
      max: round(toNum(row.volume_max), 2),
    },
    temperature: {
      min: round(toNum(row.temp_min), 2),
      avg: round(toNum(row.temp_avg), 2),
      max: round(toNum(row.temp_max), 2),
    },
    battery: {
      min: round(toNum(row.battery_min), 2),
      avg: round(toNum(row.battery_avg), 2),
      max: round(toNum(row.battery_max), 2),
    },
    samples: toNum(row.sample_count) ?? 0,
  }));
}

async function fetchRaw(deviceRowId: string, from: Date, to: Date) {
  // One over the cap tells us the window was wider than we can serve.
  const rows = await prisma.measurement.findMany({
    where: { deviceId: deviceRowId, timestamp: { gte: from, lt: to } },
    orderBy: { timestamp: 'desc' },
    take: MAX_POINTS + 1,
    select: { timestamp: true, levelCm: true, volumeL: true, temperatureC: true, batteryV: true },
  });

  const truncated = rows.length > MAX_POINTS;
  const kept = truncated ? rows.slice(0, MAX_POINTS) : rows;
  kept.reverse();

  const buckets: NormalizedBucket[] = kept.map((row) => {
    const level = toNum(row.levelCm);
    const volume = round(toNum(row.volumeL), 2);
    const temperature = round(toNum(row.temperatureC), 2);
    const battery = round(toNum(row.batteryV), 2);
    return {
      t: row.timestamp.getTime(),
      level: { min: level, avg: level, max: level },
      volume: { min: volume, avg: volume, max: volume },
      temperature: { min: temperature, avg: temperature, max: temperature },
      battery: { min: battery, avg: battery, max: battery },
      samples: 1,
    };
  });

  return { buckets, truncated };
}

export interface HistorySeriesOptions extends RangeInput {
  bucket?: RequestedBucket;
  metrics?: string;
}

export async function getDeviceHistorySeries(device: Device, options: HistorySeriesOptions) {
  const { from, to } = resolveRange(options);
  const metrics = parseMetrics(options.metrics);
  const requestedBucket = options.bucket ?? 'auto';
  const bucket = resolveBucket(requestedBucket, to.getTime() - from.getTime());
  const seconds = bucketSeconds(bucket);

  const [profile, config] = await Promise.all([
    getTankProfileRaw(device.id),
    prisma.deviceConfig.findUnique({ where: { deviceId: device.id }, select: { reportIntervalMs: true } }),
  ]);

  const { buckets, truncated } =
    seconds == null
      ? await fetchRaw(device.id, from, to)
      : { buckets: await fetchBucketed(device.id, from, to, seconds, profile), truncated: false };

  // In raw mode a gap is judged against how often this device actually
  // reports; in bucketed mode a single empty bucket already is the gap.
  const gapMs =
    seconds == null
      ? (config?.reportIntervalMs ?? DEFAULT_RAW_GAP_MS / RAW_GAP_INTERVAL_FACTOR) * RAW_GAP_INTERVAL_FACTOR
      : seconds * 1000 * 1.5;

  const effectiveFrom = truncated && buckets.length > 0 ? new Date(buckets[0].t) : from;

  return {
    device_id: device.deviceId,
    from: effectiveFrom.toISOString(),
    to: to.toISOString(),
    requested_from: from.toISOString(),
    bucket,
    requested_bucket: requestedBucket,
    bucket_seconds: seconds,
    point_count: buckets.length,
    // True when the raw window held more readings than one response can carry;
    // `from` has been narrowed to the oldest reading actually returned.
    truncated,
    has_tank_profile: profile != null,
    columns: ['t', 'min', 'avg', 'max'],
    series: buildSeries(buckets, metrics, profile, gapMs),
    samples: buckets.map((b) => [b.t, b.samples] as [number, number]),
  };
}
