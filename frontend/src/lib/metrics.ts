/**
 * Pure chart vocabulary - no imports, deliberately. The chart components used
 * to reach into lib/history for these, which dragged the axios + Firebase
 * module chain into the chart chunk (and made the chart impossible to render
 * without a configured Firebase app).
 */

export type Bucket = 'raw' | '1m' | '5m' | '15m' | '1h' | '6h' | '1d';
export type RequestedBucket = Bucket | 'auto';
export type Metric = 'level_percent' | 'volume_l' | 'temperature_c' | 'battery_v';

/** [epochMs, min, avg, max] - a null triple is an explicit gap. */
export type SeriesPoint = [number, number | null, number | null, number | null];

export const METRICS: { value: Metric; label: string; unit: string; color: string }[] = [
  { value: 'level_percent', label: 'Level', unit: '%', color: 'var(--series-level)' },
  { value: 'volume_l', label: 'Volume', unit: 'L', color: 'var(--series-volume)' },
  { value: 'temperature_c', label: 'Temp', unit: '°C', color: 'var(--series-temperature)' },
  { value: 'battery_v', label: 'Battery', unit: 'V', color: 'var(--series-battery)' },
];

export const METRIC_BY_VALUE = Object.fromEntries(METRICS.map((m) => [m.value, m])) as Record<
  Metric,
  (typeof METRICS)[number]
>;

/** Maps a metric onto its `--series-*` token suffix. */
export const METRIC_SLUG: Record<Metric, string> = {
  level_percent: 'level',
  volume_l: 'volume',
  temperature_c: 'temperature',
  battery_v: 'battery',
};

export const RANGES = [
  { value: '24h', label: '24h', hours: 24 },
  { value: '7d', label: '7d', hours: 24 * 7 },
  { value: '30d', label: '30d', hours: 24 * 30 },
  { value: '90d', label: '90d', hours: 24 * 90 },
  { value: '1y', label: '1y', hours: 24 * 365 },
] as const;

export type RangeKey = (typeof RANGES)[number]['value'];

export const rangeToWindow = (key: RangeKey, now = Date.now()) => {
  const hours = RANGES.find((r) => r.value === key)!.hours;
  return { from: new Date(now - hours * 3_600_000).toISOString(), to: new Date(now).toISOString() };
};
