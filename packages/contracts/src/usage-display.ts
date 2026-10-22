/** Shared chart rules: one positive series at a time, with gaps preserved. */
export interface WaterChartSlot {
  key: string;
  tick: string;
  title: string;
  usedL: number | null;
  filledL?: number | null;
  note?: string;
  alert?: boolean;
}
export type WaterChartMetric = 'used' | 'filled';

export function waterChartModel(slots: WaterChartSlot[], metric: WaterChartMetric = 'used') {
  const valid = (n: number | null | undefined): number | null =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
  const values = slots.map((s) =>
    metric === 'used'
      ? valid(s.usedL)
      : // Callers sometimes pass 0 for missing hours. No use reading and no fill
        // is a gap, not evidence that the tank did not refill.
        valid(s.usedL) === null && !(valid(s.filledL)! > 0)
        ? null
        : valid(s.filledL),
  );
  const largest = Math.max(0, ...values.map((v) => v ?? 0));
  const power = 10 ** Math.floor(Math.log10(largest || 1));
  const fraction = largest / power;
  const maximum = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  const recorded = values.filter((v) => v !== null).length;
  let latest = -1;
  let peak = -1;
  values.forEach((v, i) => {
    if (v === null) return;
    latest = i;
    if (v > 0 && (peak < 0 || v > values[peak]!)) peak = i;
  });
  return {
    values,
    maximum,
    recorded,
    latest,
    peak,
    total: recorded ? values.reduce<number>((sum, v) => sum + (v ?? 0), 0) : null,
  };
}

/** Explain the limits of a level-derived estimate in the selected window. */
export function usageObservationNote(data: {
  from: string;
  to: string;
  totals: { observed_seconds?: number };
}): string {
  const observed = data.totals.observed_seconds;
  if (observed == null)
    return 'Estimated from tank-level changes. Coverage is not available for this history.';
  if (observed <= 0) return 'Waiting for consecutive valid readings. No usage estimate yet.';
  const window = Math.max(0, (Date.parse(data.to) - Date.parse(data.from)) / 1000);
  if (window - observed > 900) {
    const hours = Math.floor(observed / 3600);
    const minutes = Math.floor((observed % 3600) / 60);
    const duration = hours
      ? `${hours} hr${minutes ? ` ${minutes} min` : ''}`
      : minutes
        ? `${minutes} min`
        : 'less than 1 min';
    return `Partial coverage · ${duration} recorded. Water use during gaps is unknown.`;
  }
  return 'Estimated from recorded tank-level changes, not a flow meter.';
}

/** Prefer the movement actually recorded, while keeping the user's choice explicit. */
export function preferredWaterMetric(slots: WaterChartSlot[]): WaterChartMetric {
  const used = waterChartModel(slots, 'used').total;
  const filled = waterChartModel(slots, 'filled').total;
  return !(used != null && used > 0) && filled != null && filled > 0 ? 'filled' : 'used';
}

/** Compact coverage text for the daily summary, beside the amounts it qualifies. */
export function usageCoverageLabel(data: {
  from: string;
  to: string;
  totals: { observed_seconds?: number };
}): string {
  const seconds = data.totals.observed_seconds;
  if (seconds == null || !Number.isFinite(seconds)) return 'Coverage unavailable';
  if (seconds <= 0) return 'Waiting for valid readings';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const duration = hours
    ? `${hours} hr${minutes ? ` ${minutes} min` : ''}`
    : minutes
      ? `${minutes} min`
      : 'less than 1 min';
  const window = (Date.parse(data.to) - Date.parse(data.from)) / 1000;
  return `${window - seconds > 900 ? 'Partial readings · ' : ''}${duration} recorded`;
}
