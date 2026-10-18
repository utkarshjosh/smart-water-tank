import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isValidTimeZone, localDate, localHourStart, offsetMs, startOfLocalDay } from '../lib/local-time';
import { despike, noiseFloorL, rollupDay, rollupHours } from '../lib/rollup';

const IST = 'Asia/Kolkata';
const at = (iso: string) => new Date(iso);

// --- local time --------------------------------------------------------------

test('India is UTC+5:30, so local hours start at :30 past the UTC hour', () => {
  assert.equal(offsetMs(at('2026-10-18T00:00:00Z'), IST), 5.5 * 3600 * 1000);
  // 08:10 UTC is 13:40 IST; that local hour began at 13:00 IST = 07:30 UTC.
  assert.equal(localHourStart(at('2026-10-18T08:10:42.500Z'), IST).toISOString(), '2026-10-18T07:30:00.000Z');
});

test('the local day starts at local midnight, not UTC midnight', () => {
  assert.equal(startOfLocalDay('2026-10-18', IST).toISOString(), '2026-10-17T18:30:00.000Z');
  // 20:00 UTC on the 17th is already the 18th in India.
  assert.equal(localDate(at('2026-10-17T20:00:00Z'), IST), '2026-10-18');
  assert.equal(localDate(at('2026-10-17T18:29:59Z'), IST), '2026-10-17');
});

test('DST zones get the right midnight on both sides of the change', () => {
  // New York: EDT (UTC-4) until 1 Nov 2026, EST (UTC-5) after.
  assert.equal(startOfLocalDay('2026-10-31', 'America/New_York').toISOString(), '2026-10-31T04:00:00.000Z');
  assert.equal(startOfLocalDay('2026-11-02', 'America/New_York').toISOString(), '2026-11-02T05:00:00.000Z');
});

test('calendar arithmetic and zone validation', () => {
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(isValidTimeZone('Asia/Kolkata'), true);
  assert.equal(isValidTimeZone('Mars/Olympus'), false);
});

// --- hourly rollup -----------------------------------------------------------

/** Readings at IST wall-clock times on 18 Oct 2026. */
const ist = (hhmm: string, litres: number) => ({ at: at(`2026-10-18T${hhmm}:00+05:30`), litres });

test('use and fill are booked to the local hour they happen in', () => {
  const hours = rollupHours(
    [ist('06:05', 500), ist('06:40', 450), ist('07:10', 430), ist('07:50', 900)],
    null,
    IST,
    2
  );
  assert.deepEqual(
    hours.map((h) => [h.hourStart.toISOString(), h.usedL, h.filledL, h.readings]),
    [
      ['2026-10-18T00:30:00.000Z', 50, 0, 2], // 06:00 IST
      ['2026-10-18T01:30:00.000Z', 20, 470, 2], // 07:00 IST
    ]
  );
});

test('sensor jitter inside the noise floor is not counted as use', () => {
  const hours = rollupHours([ist('06:00', 500), ist('06:10', 499), ist('06:20', 501), ist('06:30', 500)], null, IST, 2);
  assert.equal(hours[0].usedL, 0);
  assert.equal(hours[0].filledL, 0);
});

test('a slow draw below the noise floor per reading still adds up', () => {
  // Half a litre per reading never clears a 2 L floor on its own.
  const readings = Array.from({ length: 21 }, (_, i) => ist(`06:${String(i * 2).padStart(2, '0')}`, 500 - i * 0.5));
  const [hour] = rollupHours(readings, null, IST, 2);
  // 10 L drawn; up to one noise floor may still be pending at the end.
  assert.ok(hour.usedL >= 8 && hour.usedL <= 10, `usedL ${hour.usedL}`);
});

test('the first change in the window is measured from the reading before it', () => {
  const [hour] = rollupHours([ist('00:10', 400)], { at: at('2026-10-17T23:50:00+05:30'), litres: 450 }, IST, 2);
  assert.equal(hour.usedL, 50);
});

test('min, max and average per hour', () => {
  const [hour] = rollupHours([ist('06:00', 300), ist('06:20', 600), ist('06:40', 450)], null, IST, 2);
  assert.equal(hour.minL, 300);
  assert.equal(hour.maxL, 600);
  assert.equal(hour.avgL, 450);
});

test('noise floor scales with the tank', () => {
  assert.equal(noiseFloorL(null), 5);
  assert.equal(noiseFloorL(100), 2);
  assert.equal(noiseFloorL(1000), 15);
});

// --- daily rollup ------------------------------------------------------------

const hour = (hh: number, usedL: number, filledL = 0, readings = 4) => ({
  hourStart: at(`2026-10-18T${String(hh).padStart(2, '0')}:00:00+05:30`),
  usedL,
  filledL,
  minL: 100,
  maxL: 900,
  avgL: 500,
  readings,
});
const opts = { fillEvents: 0, leakLPerHour: 50 };

test('a day adds up its hours and takes its refill count from fill episodes', () => {
  const day = rollupDay([hour(6, 0, 300), hour(7, 0, 200), hour(8, 40), hour(18, 0, 400)], { ...opts, fillEvents: 2 });
  assert.equal(day.refillEvents, 2);
  assert.equal(day.usedL, 40);
  assert.equal(day.filledL, 900);
  assert.equal(day.readings, 16);
});

test('a steady heavy draw with no refill is a suspected leak', () => {
  assert.equal(rollupDay([hour(1, 60), hour(2, 70), hour(3, 55)], opts).leakSuspected, true);
  // Same draw on a day the tank was refilled: normal use.
  assert.equal(rollupDay([hour(1, 60), hour(2, 70), hour(3, 55)], { ...opts, fillEvents: 1 }).leakSuspected, false);
  assert.equal(rollupDay([hour(1, 10), hour(2, 20)], opts).leakSuspected, false);
});

// --- spikes ------------------------------------------------------------------

test('a one-reading glitch is not booked as water used and then refilled', () => {
  // What the live tank showed at 1:27 PM: one bad echo 115 L low, then back.
  const raw = [ist('13:20', 1000), ist('13:22', 1001), ist('13:24', 999), ist('13:27', 885), ist('13:29', 1000), ist('13:31', 1000), ist('13:33', 998)];
  const [glitchy] = rollupHours(raw, null, IST, 15);
  assert.equal(glitchy.usedL, 115);
  assert.equal(glitchy.filledL, 115);

  const [clean] = rollupHours(despike(raw), null, IST, 15);
  assert.equal(clean.usedL, 0);
  assert.equal(clean.filledL, 0);
});

test('despike keeps a real change: the level stays at its new value', () => {
  const raw = [ist('06:00', 400), ist('06:02', 400), ist('06:04', 400), ist('06:06', 900), ist('06:08', 900), ist('06:10', 900), ist('06:12', 900)];
  const [hour] = rollupHours(despike(raw), null, IST, 15);
  assert.equal(hour.filledL, 500);
  assert.deepEqual(despike(raw).map((r) => r.litres), [400, 400, 400, 900, 900, 900, 900]);
});
