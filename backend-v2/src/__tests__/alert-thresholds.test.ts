import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertThresholdsSchema } from '../lib/alert-thresholds';
import { thresholdCrossed } from '../services/alert.service';

const parse = (body: unknown) => alertThresholdsSchema.parse(body);

// The point of the schema: three distinct intents have to survive it.
// undefined = leave alone, null = turn off, number = set.

test('alert thresholds: an absent key stays absent, so the service keeps the stored value', () => {
  assert.deepEqual(parse({}), {});
});

test('alert thresholds: null clears a threshold rather than coercing to 0', () => {
  assert.deepEqual(parse({ tank_low_threshold_pct: null }), { tank_low_threshold_pct: null });
  assert.deepEqual(parse({ tank_full_threshold_pct: null }), { tank_full_threshold_pct: null });
  assert.deepEqual(parse({ battery_low_threshold_v: null }), { battery_low_threshold_v: null });
});

// The regression this guards: Number('') and Number(null) are both 0, so a
// cleared field used to store a 0% full threshold - which matches every
// reading at or above 0%, i.e. an alert on every single measurement.
test('alert thresholds: an empty string from a cleared form field clears, never 0', () => {
  assert.deepEqual(parse({ tank_full_threshold_pct: '' }), { tank_full_threshold_pct: null });
});

test('alert thresholds: a real value still passes through, as a number', () => {
  assert.deepEqual(parse({ tank_low_threshold_pct: 20 }), { tank_low_threshold_pct: 20 });
});

test('alert thresholds: a numeric string still coerces, for form posts', () => {
  assert.deepEqual(parse({ tank_low_threshold_pct: '20' }), { tank_low_threshold_pct: 20 });
});

test('alert thresholds: 0 is still a settable threshold, distinct from null', () => {
  assert.deepEqual(parse({ tank_low_threshold_pct: 0 }), { tank_low_threshold_pct: 0 });
});

test('alert thresholds: bounds are still enforced', () => {
  assert.throws(() => parse({ tank_low_threshold_pct: 101 }));
  assert.throws(() => parse({ tank_full_threshold_pct: -1 }));
  assert.throws(() => parse({ battery_low_threshold_v: -0.5 }));
});

test('alert thresholds: nonsense is still rejected, not silently turned into 0', () => {
  assert.throws(() => parse({ tank_low_threshold_pct: 'abc' }));
});

test('alert thresholds: clearing one field leaves the others untouched', () => {
  assert.deepEqual(parse({ tank_low_threshold_pct: null, tank_full_threshold_pct: 90 }), {
    tank_low_threshold_pct: null,
    tank_full_threshold_pct: 90,
  });
});

// ---------------------------------------------------------------------------
// The rule side of the same contract: null is off, 0 is a real threshold.
// ---------------------------------------------------------------------------

test('thresholdCrossed: a null threshold means the alert is off, whatever the reading', () => {
  assert.equal(thresholdCrossed(100, null, 'at-or-above'), false);
  assert.equal(thresholdCrossed(0, null, 'at-or-below'), false);
  assert.equal(thresholdCrossed(2.9, null, 'below'), false);
});

test('thresholdCrossed: a null reading never alerts - the sensor was unreadable', () => {
  assert.equal(thresholdCrossed(null, 90, 'at-or-above'), false);
  assert.equal(thresholdCrossed(null, 10, 'at-or-below'), false);
});

test('thresholdCrossed: at-or-above fires on and past the mark', () => {
  assert.equal(thresholdCrossed(89, 90, 'at-or-above'), false);
  assert.equal(thresholdCrossed(90, 90, 'at-or-above'), true);
  assert.equal(thresholdCrossed(91, 90, 'at-or-above'), true);
});

test('thresholdCrossed: at-or-below fires on and under the mark', () => {
  assert.equal(thresholdCrossed(11, 10, 'at-or-below'), false);
  assert.equal(thresholdCrossed(10, 10, 'at-or-below'), true);
  assert.equal(thresholdCrossed(9, 10, 'at-or-below'), true);
});

test('thresholdCrossed: below is strict, matching the battery rule', () => {
  assert.equal(thresholdCrossed(3.3, 3.3, 'below'), false);
  assert.equal(thresholdCrossed(3.29, 3.3, 'below'), true);
});

// The bug this whole change is about: a 0 threshold used to be read two
// different ways. The litre and battery rules treated it as "off" (truthy
// check), while the percentage rules treated it as a real threshold - so a
// 0% full threshold alerted on every reading at or above 0%, i.e. all of them.
test('thresholdCrossed: 0 is a real threshold, not an accidental off switch', () => {
  assert.equal(thresholdCrossed(0, 0, 'at-or-above'), true);
  assert.equal(thresholdCrossed(50, 0, 'at-or-above'), true);
  assert.equal(thresholdCrossed(0, 0, 'at-or-below'), true);
  assert.equal(thresholdCrossed(0.1, 0, 'at-or-below'), false);
  assert.equal(thresholdCrossed(0, 0, 'below'), false);
});
