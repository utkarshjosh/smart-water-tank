import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  isValidTimeZone,
  localDate,
  localHourStart,
  offsetMs,
  startOfLocalDay,
} from '../lib/local-time';
import { noiseFloorL, removeExcursions, rollupDay, rollupHours } from '../lib/rollup';

const IST = 'Asia/Kolkata';
const at = (iso: string) => new Date(iso);

// --- local time --------------------------------------------------------------

test('India is UTC+5:30, so local hours start at :30 past the UTC hour', () => {
  assert.equal(offsetMs(at('2026-10-18T00:00:00Z'), IST), 5.5 * 3600 * 1000);
  // 08:10 UTC is 13:40 IST; that local hour began at 13:00 IST = 07:30 UTC.
  assert.equal(
    localHourStart(at('2026-10-18T08:10:42.500Z'), IST).toISOString(),
    '2026-10-18T07:30:00.000Z',
  );
});

test('the local day starts at local midnight, not UTC midnight', () => {
  assert.equal(startOfLocalDay('2026-10-18', IST).toISOString(), '2026-10-17T18:30:00.000Z');
  // 20:00 UTC on the 17th is already the 18th in India.
  assert.equal(localDate(at('2026-10-17T20:00:00Z'), IST), '2026-10-18');
  assert.equal(localDate(at('2026-10-17T18:29:59Z'), IST), '2026-10-17');
});

test('DST zones get the right midnight on both sides of the change', () => {
  // New York: EDT (UTC-4) until 1 Nov 2026, EST (UTC-5) after.
  assert.equal(
    startOfLocalDay('2026-10-31', 'America/New_York').toISOString(),
    '2026-10-31T04:00:00.000Z',
  );
  assert.equal(
    startOfLocalDay('2026-11-02', 'America/New_York').toISOString(),
    '2026-11-02T05:00:00.000Z',
  );
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
    [ist('06:50', 500), ist('06:55', 450), ist('07:00', 430), ist('07:05', 900)],
    null,
    IST,
    2,
  );
  assert.deepEqual(
    hours.map((h) => [h.hourStart.toISOString(), h.usedL, h.filledL, h.readings]),
    [
      ['2026-10-18T00:30:00.000Z', 50, 0, 2], // 06:00 IST
      ['2026-10-18T01:30:00.000Z', 20, 470, 2], // 07:00 IST
    ],
  );
});

test('sensor jitter inside the noise floor is not counted as use', () => {
  const hours = rollupHours(
    [ist('06:00', 500), ist('06:10', 499), ist('06:20', 501), ist('06:30', 500)],
    null,
    IST,
    2,
  );
  assert.equal(hours[0].usedL, 0);
  assert.equal(hours[0].filledL, 0);
});

test('a slow draw below the noise floor per reading still adds up', () => {
  // Half a litre per reading never clears a 2 L floor on its own.
  const readings = Array.from({ length: 21 }, (_, i) =>
    ist(`06:${String(i * 2).padStart(2, '0')}`, 500 - i * 0.5),
  );
  const [hour] = rollupHours(readings, null, IST, 2);
  // 10 L drawn; up to one noise floor may still be pending at the end.
  assert.ok(hour.usedL >= 8 && hour.usedL <= 10, `usedL ${hour.usedL}`);
});

test('the first change in the window is measured from the reading before it', () => {
  const hour = rollupHours(
    [ist('00:00', 400)],
    { at: at('2026-10-17T23:50:00+05:30'), litres: 450 },
    IST,
    2,
  ).find((h) => h.hourStart >= at('2026-10-17T18:30:00Z'))!;
  assert.equal(hour.usedL, 50);
});

test('min, max and average per hour', () => {
  const [hour] = rollupHours(
    [ist('06:00', 300), ist('06:05', 600), ist('06:10', 450)],
    null,
    IST,
    2,
  );
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
  observedSeconds: 3600,
});
const opts = { fillEvents: 0, leakLPerHour: 50 };

test('a day adds up its hours and takes its refill count from fill episodes', () => {
  const day = rollupDay([hour(6, 0, 300), hour(7, 0, 200), hour(8, 40), hour(18, 0, 400)], {
    ...opts,
    fillEvents: 2,
  });
  assert.equal(day.refillEvents, 2);
  assert.equal(day.usedL, 40);
  assert.equal(day.filledL, 900);
  assert.equal(day.readings, 16);
});

test('a steady heavy draw with no refill is a suspected leak', () => {
  assert.equal(rollupDay([hour(1, 60), hour(2, 70), hour(3, 55)], opts).leakSuspected, true);
  // Same draw on a day the tank was refilled: normal use.
  assert.equal(
    rollupDay([hour(1, 60), hour(2, 70), hour(3, 55)], { ...opts, fillEvents: 1 }).leakSuspected,
    false,
  );
  assert.equal(rollupDay([hour(1, 10), hour(2, 20)], opts).leakSuspected, false);
});

// --- sensor blips -------------------------------------------------------------

/** Readings at IST minutes, one per minute (the sensor's real rate). */
const series = (from: string, litres: number[]) => {
  const [h, m] = from.split(':').map(Number);
  return litres.map((l, i) => {
    const mm = m + i;
    return ist(
      `${String(h + Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`,
      l,
    );
  });
};

test('the live tank at 1 PM on 18 Oct: blips at the top are not use and refill', () => {
  // Real readings, 13:10-13:33, after the tank filled at 13:07 and nothing
  // was drawn. The sensor wandered into 26-32 cm for one to four minutes.
  const raw = series(
    '13:10',
    [
      1145, 1145, 1145, 1063, 1129, 1145, 1145, 1129, 1145, 1145, 1145, 1145, 1145, 1145, 1145,
      1145, 1096, 1145, 1080, 1031, 1047, 1047, 1145, 1145,
    ],
  );
  const [before] = rollupHours(raw, null, IST, 17);
  assert.ok(before.usedL > 150 && before.filledL > 150, 'the raw readings book phantom water');

  const [after] = rollupHours(removeExcursions(raw, 17), null, IST, 17);
  assert.equal(after.usedL, 0);
  assert.equal(after.filledL, 0);
});

test('a real draw stays drawn and a real fill stays filled', () => {
  const drawn = removeExcursions(series('07:00', [900, 900, 870, 840, 800, 800, 800, 800]), 17);
  assert.deepEqual(
    drawn.map((r) => r.litres),
    [900, 900, 870, 840, 800, 800, 800, 800],
  );
  const filled = removeExcursions(
    series('12:51', [491, 507, 540, 589, 638, 671, 720, 769, 802, 834, 883]),
    17,
  );
  assert.deepEqual(
    filled.map((r) => r.litres),
    [491, 507, 540, 589, 638, 671, 720, 769, 802, 834, 883],
  );
});

test('a slow draw is kept, even in steps smaller than the noise floor', () => {
  const slow = series(
    '10:00',
    Array.from({ length: 31 }, (_, i) => 1000 - i * 2),
  );
  const [hour] = rollupHours(removeExcursions(slow, 17), null, IST, 17);
  assert.ok(hour.usedL >= 40 && hour.usedL <= 60, `usedL ${hour.usedL}`);
});

test('a draw that is refilled more than ten minutes later is real', () => {
  const readings = series('08:00', [1000, 1000, ...Array(14).fill(900), 1000, 1000]);
  const [hour] = rollupHours(removeExcursions(readings, 17), null, IST, 17);
  assert.equal(hour.usedL, 100);
  assert.equal(hour.filledL, 100);
});

/** Readings every 20 s (how the live device reports) from run-length pairs. */
const every20s = (fromIso: string, runs: [number, number][], gapsAfter: Record<number, number> = {}) => {
  let t = at(fromIso).getTime();
  const out: { at: Date; litres: number }[] = [];
  for (const [litres, count] of runs) {
    for (let n = 0; n < count; n++) {
      out.push({ at: new Date(t), litres });
      t += 20_000 + (gapsAfter[out.length - 1] ?? 0);
    }
  }
  return out;
};

test('the live tank at 9 AM on 31 Oct: a slow phantom drain that snaps back is not use and refill', () => {
  // Real readings, 08:35-10:05 IST, rounded to the litre. The tank was full
  // and filling; the sensor drifted down to 867 L over an hour, then read
  // 196 L higher 20 s later and was full again within 3 minutes. The device
  // went quiet for ten minutes at 09:03.
  const raw = every20s(
    '2026-10-31T08:35:03+05:30',
    [
      [1145, 28], [1129, 3], [1112, 6], [1096, 9], [1112, 3], [1096, 3], [1112, 24], [1096, 9],
      [1063, 1], [1047, 9], [1063, 45], [1047, 3], [1031, 3], [1014, 6], [998, 3], [965, 3],
      [949, 3], [932, 3], [916, 3], [900, 6], [916, 3], [965, 3], [867, 3], [1063, 3],
      [1096, 3], [1145, 18], [1063, 3], [1145, 3], [1112, 3], [1145, 27],
    ],
    { 84: 565_000 },
  );
  const noise = noiseFloorL(1145);
  const sum = (hours: { usedL: number; filledL: number }[]) =>
    hours.reduce((s, h) => ({ usedL: s.usedL + h.usedL, filledL: s.filledL + h.filledL }), { usedL: 0, filledL: 0 });

  const before = sum(rollupHours(removeExcursions(raw, noise, 10 * 60_000, { maxRateLPerMin: Infinity }), null, IST, noise));
  assert.ok(before.usedL > 200 && before.filledL > 200, 'without the speed check it books phantom water');

  const after = sum(rollupHours(removeExcursions(raw, noise), null, IST, noise));
  assert.equal(after.usedL, 0);
  assert.equal(after.filledL, 0);
});

test('a real draw and a refill at pump speed are kept, however long apart', () => {
  // 300 L drawn over an hour, a quarter of an hour's pause, then refilled at
  // 40 L/min, faster than the live tank's pump.
  const draw = Array.from({ length: 61 }, (_, i) => 1145 - i * 5);
  const fill = Array.from({ length: 7 }, (_, i) => 845 + (i + 1) * 40);
  const readings = series('06:00', [
    1145,
    ...draw,
    ...Array(15).fill(845),
    ...fill,
    ...Array(10).fill(1145),
  ]);
  const out = removeExcursions(readings, 17);
  assert.deepEqual(
    out.map((r) => r.litres),
    readings.map((r) => r.litres),
  );
});

test('a real fill that blips back to where it started is kept', () => {
  // Filling from 850 L; one minute at the top the sensor reads 867 L again.
  // That is a blip on a full tank, not the fill coming undone.
  const readings = series('18:39', [
    850, 883, 916, 965, 1014, 1047, 1080, 1129, 1145, 1145, 1145, 1145, 867, 867, 867, 867,
    1145, 1145, 1145, 1145, 1145,
  ]);
  const [hour] = rollupHours(removeExcursions(readings, 17), null, IST, 17);
  assert.ok(hour.filledL > 280, `filledL ${hour.filledL}`);
  assert.equal(hour.usedL, 0);
});
