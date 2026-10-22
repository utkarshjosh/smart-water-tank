import { describe, expect, it } from 'vitest';
import {
  waterChartModel,
  usageObservationNote,
  preferredWaterMetric,
  usageCoverageLabel,
  type WaterChartSlot,
} from './usage-display';
const slots = (values: Array<[number | null, (number | null)?]>): WaterChartSlot[] =>
  values.map(([usedL, filledL], i) => ({
    key: String(i),
    tick: '',
    title: '',
    usedL,
    filledL,
  }));

describe('water chart display', () => {
  it('distinguishes a sensor outage from measured zero use', () => {
    const m = waterChartModel(
      slots([
        [null, 0],
        [0, 0],
        [25, 0],
        [null, 0],
      ]),
    );
    expect(m.values).toEqual([null, 0, 25, null]);
    expect(m.recorded).toBe(2);
    expect(m.latest).toBe(2);
    expect(m.total).toBe(25);
    expect(waterChartModel(slots([[null, 0]])).total).toBeNull();
  });
  it('uses a labelled positive scale for refills even when they dwarf use', () => {
    const s = slots([
      [20, 600],
      [40, 0],
    ]);
    expect(waterChartModel(s).maximum).toBe(50);
    expect(waterChartModel(s, 'filled').maximum).toBe(1000);
    expect(waterChartModel(s, 'filled').values).toEqual([600, 0]);
    expect(waterChartModel(slots([[null, 0]]), 'filled').values).toEqual([null]);
  });
  it('ignores invalid amounts and selects a measured peak', () => {
    const m = waterChartModel(slots([[NaN], [-2], [Infinity], [0], [88], [null]]));
    expect(m.values).toEqual([null, null, null, 0, 88, null]);
    expect(m.maximum).toBe(100);
    expect(m.peak).toBe(4);
    expect(waterChartModel([]).latest).toBe(-1);
  });
});

describe('usage coverage explanations', () => {
  const window = { from: '2026-10-22T00:00:00Z', to: '2026-10-22T12:00:00Z' };
  it('never describes missing observations as measured zero use', () => {
    expect(usageObservationNote({ ...window, totals: { observed_seconds: 0 } })).toContain(
      'No usage estimate yet',
    );
    expect(usageObservationNote({ ...window, totals: { observed_seconds: 3600 } })).toContain(
      'Water use during gaps is unknown',
    );
  });
  it('does not claim verified coverage for an older server', () => {
    expect(usageObservationNote({ ...window, totals: {} })).toContain('Coverage is not available');
  });
});

describe('a useful first chart view', () => {
  it('leads with the only recorded movement and keeps measured zero separate from missing data', () => {
    expect(
      preferredWaterMetric(
        slots([
          [0, 409],
          [0, 0],
        ]),
      ),
    ).toBe('filled');
    expect(preferredWaterMetric(slots([[20, 409]]))).toBe('used');
    expect(preferredWaterMetric(slots([[null, 0]]))).toBe('used');
    expect(waterChartModel(slots([[0, 0]])).total).toBe(0);
    expect(waterChartModel(slots([[null, 0]])).total).toBeNull();
  });
  it('qualifies a reconnect-day summary with actual recorded duration', () => {
    const data = {
      from: '2026-10-21T18:30:00Z',
      to: '2026-10-22T13:00:00Z',
      totals: { observed_seconds: 5651 },
    };
    expect(usageCoverageLabel(data)).toBe('Partial readings · 1 hr 34 min recorded');
    expect(usageCoverageLabel({ ...data, totals: { observed_seconds: 0 } })).toBe(
      'Waiting for valid readings',
    );
    expect(usageCoverageLabel({ ...data, totals: {} })).toBe('Coverage unavailable');
  });
});
