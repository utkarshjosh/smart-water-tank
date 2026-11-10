import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fullLineShortfallCm, isTooClose, levelModel, levelPercent, waterDepthCm } from '../lib/tank-level';

const base = { heightCm: 90, sensorOffsetCm: 5, deadZoneCm: 25 };

test('levelModel: empty is height plus offset; unmeasured full is the nearest the sensor sees', () => {
  assert.deepEqual(levelModel(base), { emptyCm: 95, fullCm: 25, blindCm: 25, topCm: 25, spanCm: 70 });
  // Sensor mounted further above the tank than its blind zone: full is the tank top.
  assert.equal(levelModel({ ...base, sensorOffsetCm: 30 }).fullCm, 30);
});

test('levelModel: a measured full line is used as it is, either side of the blind zone', () => {
  assert.deepEqual(levelModel({ ...base, fullDistanceCm: 14 }), {
    emptyCm: 95,
    fullCm: 14,
    blindCm: 25,
    topCm: 25,
    spanCm: 81,
  });
  assert.equal(levelModel({ ...base, fullDistanceCm: 30 }).topCm, 30);
});

test('waterDepthCm: held at the top line for anything nearer, zero at or past empty', () => {
  assert.equal(waterDepthCm(60, base), 35);
  assert.equal(waterDepthCm(25, base), 70);
  assert.equal(waterDepthCm(20, base), 70);
  assert.equal(waterDepthCm(95, base), 0);
  assert.equal(waterDepthCm(400, base), 0);
});

test('levelPercent: null stays null, and a tank with nothing measurable reads 0', () => {
  assert.equal(levelPercent(null, base), null);
  assert.equal(levelPercent(5, { heightCm: 10, sensorOffsetCm: 0, deadZoneCm: 20 }), 0);
  assert.equal(levelPercent(5, { ...base, fullDistanceCm: 95 }), 0);
});

test('isTooClose: the blind-zone edge counts, because a sensor never reports nearer than its minimum', () => {
  assert.equal(isTooClose(18, base), true);
  assert.equal(isTooClose(25, base), true);
  assert.equal(isTooClose(26, base), false);
  // Water above the tank top but still measurable is full, not too close.
  assert.equal(isTooClose(28, { ...base, sensorOffsetCm: 30 }), false);
});

test('fullLineShortfallCm: how far the sensor must move for the full line to be seen', () => {
  assert.equal(fullLineShortfallCm({ ...base, fullDistanceCm: 14 }), 11);
  assert.equal(fullLineShortfallCm({ ...base, fullDistanceCm: 25 }), null);
  assert.equal(fullLineShortfallCm({ ...base, fullDistanceCm: 30 }), null);
  assert.equal(fullLineShortfallCm(base), null);
});
