import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TankBand, alertForTransition, isInBlindZone, nextBand } from '../lib/tank-band';

const pct = { fullAt: 90, lowAt: 20, margin: 10 };

/** Feeds readings through the tracker and returns the alerts it would send. */
function alertsFor(readings: Array<number | { value: number; inBlindZone: boolean }>, start: TankBand | null = 'normal') {
  let band = start;
  const sent: string[] = [];
  for (const r of readings) {
    const input = typeof r === 'number' ? { ...pct, value: r } : { ...pct, ...r };
    const next = nextBand(band, input);
    const alert = alertForTransition(band, next);
    if (alert) sent.push(alert);
    band = next;
  }
  return sent;
}

test('a tank that stays full alerts once, not on every reading', () => {
  assert.deepEqual(alertsFor([70, 85, 92, 100, 100, 100, 98, 100]), ['tank_full']);
});

test('wobbling just under the full line does not re-alert', () => {
  // 89 and 85 are inside the 10-point margin, so the tank is still full.
  assert.deepEqual(alertsFor([95, 89, 91, 85, 92]), ['tank_full']);
});

test('dropping past the re-arm line and refilling alerts again', () => {
  assert.deepEqual(alertsFor([95, 79, 95]), ['tank_full', 'tank_full']);
});

test('low works the same way, mirrored', () => {
  assert.deepEqual(alertsFor([30, 18, 15, 25, 10, 35, 19]), ['tank_low', 'tank_low']);
});

test('a reading in the blind zone counts as full whatever percentage came back', () => {
  // The sensor can report nonsense when the water is too close; a low
  // percentage with the blind-zone flag must not read as "tank emptied".
  assert.deepEqual(alertsFor([95, { value: 40, inBlindZone: true }, { value: 100, inBlindZone: true }]), ['tank_full']);
  assert.equal(nextBand('normal', { ...pct, value: 12, inBlindZone: true }), 'full');
});

test('the blind zone does not invent a full alert when the full rule has no threshold', () => {
  assert.equal(nextBand('normal', { fullAt: null, lowAt: 20, margin: 10, value: 50, inBlindZone: true }), 'normal');
});

test('the first reading only seeds the tracker', () => {
  assert.deepEqual(alertsFor([100, 100], null), []);
  assert.equal(alertForTransition(null, 'low'), null);
});

test('leaving a band never alerts', () => {
  assert.equal(alertForTransition('full', 'normal'), null);
  assert.equal(alertForTransition('low', 'normal'), null);
});

test('a null threshold makes that band unreachable', () => {
  assert.equal(nextBand('normal', { fullAt: null, lowAt: null, margin: 10, value: 100 }), 'normal');
  assert.equal(nextBand('full', { fullAt: null, lowAt: 20, margin: 10, value: 100 }), 'normal');
});

test('blind zone is any distance nearer than the dead-zone edge or sensor offset', () => {
  assert.equal(isInBlindZone(18, { sensorOffsetCm: 0, deadZoneCm: 20 }), true);
  assert.equal(isInBlindZone(20, { sensorOffsetCm: 0, deadZoneCm: 20 }), false);
  assert.equal(isInBlindZone(25, { sensorOffsetCm: 30, deadZoneCm: 20 }), true);
});
