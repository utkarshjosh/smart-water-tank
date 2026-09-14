import { expect, it } from 'vitest';
import { estimateUsage } from './usage-estimate';
import type { SeriesPoint } from './metrics';
const points = (...values: (number | null)[]): SeriesPoint[] =>
  values.map((v, i) => [i * 60000, v, v, v]);
it('counts drawdown and ignores refills', () => {
  expect(estimateUsage(points(100, 80, 150, 120))).toBe(50);
});
it('never invents usage across a missing-data gap', () => {
  expect(estimateUsage(points(100, null, 20))).toBeNull();
});
it('distinguishes no data from zero consumption and refuses truncated windows', () => {
  expect(estimateUsage([])).toBeNull();
  expect(estimateUsage(points(0, 0))).toBe(0);
  expect(estimateUsage(points(100, 90), true)).toBeNull();
});
