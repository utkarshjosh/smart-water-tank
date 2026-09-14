import type { SeriesPoint } from './metrics';

/** Sum measured drawdowns, excluding refills and never bridging explicit gaps. */
export function estimateUsage(points: SeriesPoint[], truncated = false): number | null {
  if (truncated) return null;
  let previous: number | null = null;
  let pairs = 0;
  let total = 0;
  for (const [, , value] of points) {
    if (value == null || !Number.isFinite(value)) {
      previous = null;
      continue;
    }
    if (previous != null) {
      total += Math.max(0, previous - value);
      pairs++;
    }
    previous = value;
  }
  return pairs ? Math.round(total) : null;
}
