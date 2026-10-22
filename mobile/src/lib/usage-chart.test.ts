import { describe, expect, it } from 'vitest';
import { chartGeometry, defaultSelection, detailText, fillRuns, showsNumber, type UsageSlot } from './usage-chart';

const slot = (usedL: number | null, filledL = 0, extra: Partial<UsageSlot> = {}): UsageSlot => ({
  key: String(Math.random()),
  tick: '',
  title: 'T',
  usedL,
  filledL,
  ...extra,
});
const L = (v: number) => `${Math.round(v)} L`;

describe('usage chart rules (shared with the webapp)', () => {
  it('days with in and out balanced share one scale, split by the biggest of each', () => {
    // The live tank, 14-18 Oct: 802 L used / 834 L added at most.
    const geo = chartGeometry([slot(802, 834), slot(540, 540), slot(720, 622)], 164);
    expect(geo.layout).toBe('shared');
    // Same litres per pixel on both sides.
    expect(geo.upHeight / geo.maxUp).toBeCloseTo(geo.downHeight / geo.maxDown, 6);
    expect(geo.upHeight + geo.downHeight).toBe(164);
    // 834 L added draws longer than 802 L used.
    expect(geo.downHeight).toBeGreaterThan(geo.upHeight);
  });

  it('an hour with a refill far bigger than use turns fills into markers, bars keep full height', () => {
    const geo = chartGeometry([slot(92, 380), slot(30), slot(55, 260)], 140);
    expect(geo.layout).toBe('markers');
    expect(geo.upHeight).toBe(140);
  });

  it('no fills, or fills switched off: used bars only', () => {
    expect(chartGeometry([slot(40), slot(10)], 100).layout).toBe('used-only');
    expect(chartGeometry([slot(40, 30)], 100, false).layout).toBe('used-only');
  });

  it('consecutive fill hours merge into one marker', () => {
    expect(fillRuns([slot(65, 327), slot(0, 294), slot(10), slot(20, 260)])).toEqual([
      { from: 0, to: 1, litres: 621 },
      { from: 3, to: 3, litres: 260 },
    ]);
  });

  it('numbers on bars a fifth of the tallest; on a month of days only the tallest', () => {
    expect(showsNumber(0.25, 24)).toBe(true);
    expect(showsNumber(0.1, 24)).toBe(false);
    expect(showsNumber(0.9, 30)).toBe(false);
    expect(showsNumber(1, 30)).toBe(true);
  });

  it('selects the latest slot with readings, and says "no readings" rather than zero', () => {
    const slots = [slot(10), slot(20), slot(null)];
    expect(defaultSelection(slots)).toBe(1);
    expect(detailText(slot(null, 0, { title: '3 AM – 4 AM' }), true, L)).toBe('3 AM – 4 AM · no readings');
    expect(detailText(slot(92, 380, { title: '7 AM – 8 AM' }), true, L)).toBe('7 AM – 8 AM · 92 L used · 380 L added');
  });
});
