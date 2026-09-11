import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../lib/http-error';
import {
  AUTO_TARGET_POINTS,
  MAX_POINTS,
  bucketSeconds,
  chooseAutoBucket,
  estimateBucketCount,
  levelAggregateToPercent,
  levelAggregateToVolume,
  parseMetrics,
  resolveBucket,
  resolveRange,
  withGapBreaks,
  type SeriesPoint,
} from '../services/history.service';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Same real tank the tank-profile tests use: sensor flush at the full line
// (s=0), 90 cm column, 20 cm dead zone => levelEmpty=90, fullEff=20, span=70.
const cal = { heightCm: 90, sensorOffsetCm: 0, deadZoneCm: 20 };

// --- bucket selection -------------------------------------------------------

test('chooseAutoBucket keeps every rung at or under the auto target', () => {
  const widestSpanFor: [number, ReturnType<typeof chooseAutoBucket>][] = [
    [7 * DAY, '5m'],
    [30 * DAY, '1h'],
    [180 * DAY, '6h'],
  ];

  for (const [span, expected] of widestSpanFor) {
    assert.equal(chooseAutoBucket(span), expected);
    assert.ok(
      estimateBucketCount(span, expected)! <= AUTO_TARGET_POINTS,
      `${expected} over ${span / DAY}d yields ${estimateBucketCount(span, expected)} points`
    );
  }
});

test('chooseAutoBucket serves a day or less as raw readings', () => {
  assert.equal(chooseAutoBucket(6 * HOUR), 'raw');
  assert.equal(chooseAutoBucket(24 * HOUR), 'raw');
  assert.equal(bucketSeconds('raw'), null);
});

test('chooseAutoBucket falls back to daily beyond six months', () => {
  assert.equal(chooseAutoBucket(365 * DAY), '1d');
});

test('resolveBucket rejects an explicit bucket that would blow the point cap', () => {
  assert.throws(
    () => resolveBucket('1m', 365 * DAY),
    (err: unknown) => err instanceof HttpError && err.status === 400 && /max 5000/.test(err.message)
  );
});

test('resolveBucket honours an explicit bucket that fits', () => {
  assert.equal(resolveBucket('1h', 30 * DAY), '1h');
  assert.ok(estimateBucketCount(30 * DAY, '1h')! <= MAX_POINTS);
});

// --- range resolution -------------------------------------------------------

test('resolveRange defaults to the last seven days', () => {
  const now = new Date('2026-09-11T12:00:00.000Z');
  const { from, to } = resolveRange({}, now);
  assert.equal(to.toISOString(), now.toISOString());
  assert.equal(from.toISOString(), '2026-09-04T12:00:00.000Z');
});

test('resolveRange still accepts the legacy days shorthand', () => {
  const now = new Date('2026-09-11T12:00:00.000Z');
  const { from } = resolveRange({ days: 1 }, now);
  assert.equal(from.toISOString(), '2026-09-10T12:00:00.000Z');
});

test('resolveRange rejects an inverted range', () => {
  assert.throws(
    () => resolveRange({ from: '2026-09-11T00:00:00Z', to: '2026-09-10T00:00:00Z' }),
    (err: unknown) => err instanceof HttpError && err.status === 400
  );
});

test('resolveRange rejects an unparseable timestamp', () => {
  assert.throws(
    () => resolveRange({ from: 'last tuesday' }),
    (err: unknown) => err instanceof HttpError && err.status === 400
  );
});

test('resolveRange caps how far back one request may reach', () => {
  assert.throws(
    () => resolveRange({ days: 500 }),
    (err: unknown) => err instanceof HttpError && err.status === 400 && /maximum/.test(err.message)
  );
});

// --- metric parsing ---------------------------------------------------------

test('parseMetrics defaults to the four dashboard metrics', () => {
  assert.deepEqual(parseMetrics(undefined), ['level_percent', 'volume_l', 'temperature_c', 'battery_v']);
  assert.deepEqual(parseMetrics(''), ['level_percent', 'volume_l', 'temperature_c', 'battery_v']);
});

test('parseMetrics trims, de-duplicates and preserves caller order', () => {
  assert.deepEqual(parseMetrics(' battery_v , level_percent,battery_v '), ['battery_v', 'level_percent']);
});

test('parseMetrics rejects an unknown metric by name', () => {
  assert.throws(
    () => parseMetrics('level_percent,humidity'),
    (err: unknown) => err instanceof HttpError && err.status === 400 && /humidity/.test(err.message)
  );
});

// --- the min/max inversion --------------------------------------------------

test('levelAggregateToPercent inverts min and max: the closest reading is the fullest', () => {
  // Distances across the bucket: closest 20 cm (full), farthest 90 cm (empty).
  const percent = levelAggregateToPercent({ min: 20, avg: 50, max: 90 }, cal);
  assert.equal(percent.min, 0); // farthest distance -> emptiest
  assert.equal(percent.max, 100); // closest distance -> fullest
  assert.equal(percent.avg, 57.14);
});

test('levelAggregateToVolume carries the same inversion into litres', () => {
  // 90 cm column, 900 L nameplate capacity.
  const volume = levelAggregateToVolume({ min: 20, avg: 50, max: 90 }, cal, 900);
  assert.equal(volume.min, 0);
  assert.equal(volume.max, 900);
  assert.equal(volume.avg, 514.26);
});

test('levelAggregateToPercent keeps an all-null bucket null rather than reading 0%', () => {
  const percent = levelAggregateToPercent({ min: null, avg: null, max: null }, cal);
  assert.deepEqual(percent, { min: null, avg: null, max: null });
});

test('levelAggregateToPercent clamps readings beyond either end of the span', () => {
  // 10 cm sits inside the dead zone, 120 cm below the empty line.
  const percent = levelAggregateToPercent({ min: 10, avg: 60, max: 120 }, cal);
  assert.equal(percent.max, 100);
  assert.equal(percent.min, 0);
});

// --- gap breaks -------------------------------------------------------------

test('withGapBreaks leaves a densely sampled series untouched', () => {
  const points: SeriesPoint[] = [
    [1000, 1, 1, 1],
    [2000, 2, 2, 2],
    [3000, 3, 3, 3],
  ];
  assert.deepEqual(withGapBreaks(points, 5000), points);
});

test('withGapBreaks inserts a null point so the line breaks across an outage', () => {
  const points: SeriesPoint[] = [
    [1000, 1, 1, 1],
    [50_000, 2, 2, 2],
  ];
  const out = withGapBreaks(points, 5000);
  assert.equal(out.length, 3);
  assert.deepEqual(out[1], [3500, null, null, null]);
  assert.deepEqual(out[2], [50_000, 2, 2, 2]);
});

test('withGapBreaks handles a series too short to have a gap', () => {
  assert.deepEqual(withGapBreaks([], 5000), []);
  assert.deepEqual(withGapBreaks([[1000, 1, 1, 1]], 5000), [[1000, 1, 1, 1]]);
});
