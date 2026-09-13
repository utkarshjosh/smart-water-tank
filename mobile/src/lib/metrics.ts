import type { Bucket, HistoryMetric } from '@/api/schemas';
import type { Colors } from '@/ui/theme';

/**
 * Chart vocabulary shared by the device screen and SeriesChart. Mirrors
 * frontend/src/lib/metrics.ts so both clients label, colour and window the
 * same series the same way; keep the two in step when a metric is added.
 *
 * `level_cm` is deliberately absent: the server can bucket it, but the raw
 * sensor distance runs opposite to fill and would read as the tank draining
 * while it refills.
 */

export type Metric = Exclude<HistoryMetric, 'level_cm'>;

export const METRICS: { value: Metric; label: string; unit: string; color: keyof Colors }[] = [
  { value: 'level_percent', label: 'Level', unit: '%', color: 'seriesLevel' },
  { value: 'volume_l', label: 'Volume', unit: 'L', color: 'seriesVolume' },
  { value: 'temperature_c', label: 'Temp', unit: '°C', color: 'seriesTemperature' },
  { value: 'battery_v', label: 'Battery', unit: 'V', color: 'seriesBattery' },
];

export const METRIC_BY_VALUE = Object.fromEntries(METRICS.map((m) => [m.value, m])) as Record<
  Metric,
  (typeof METRICS)[number]
>;

export const RANGES = [
  { value: '24h', label: '24h', hours: 24 },
  { value: '7d', label: '7d', hours: 24 * 7 },
  { value: '30d', label: '30d', hours: 24 * 30 },
  { value: '90d', label: '90d', hours: 24 * 90 },
  { value: '1y', label: '1y', hours: 24 * 365 },
] as const;

export type RangeKey = (typeof RANGES)[number]['value'];

/** ISO `from`/`to` for a preset, anchored at `now` so the pair is stable once computed. */
export const rangeToWindow = (key: RangeKey, now = Date.now()) => {
  const hours = RANGES.find((r) => r.value === key)!.hours;
  return { from: new Date(now - hours * 3_600_000).toISOString(), to: new Date(now).toISOString() };
};

/** What the server's chosen bucket means, for the caption under the chart. */
export const BUCKET_LABEL: Record<Bucket, string> = {
  raw: 'raw readings',
  '1m': '1-minute averages',
  '5m': '5-minute averages',
  '15m': '15-minute averages',
  '1h': 'hourly averages',
  '6h': '6-hour averages',
  '1d': 'daily averages',
};
