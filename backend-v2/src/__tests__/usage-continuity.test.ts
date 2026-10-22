import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareReadings, continuityGapMs, rollupHours, removeExcursions } from '../lib/rollup';
import { detectEpisodes, episodeOptions, episodeIsCurrent } from '../lib/episodes';

const at = (time: string) => new Date(`2026-10-22T${time}:00+05:30`);
const reading = (time: string, litres: number | null) => ({ at: at(time), litres });
const now = at('20:00');
const opts = episodeOptions(1145, 17);

test('production regression: a four-day reference never books 278 L on reconnect', () => {
  const before = { at: new Date('2026-10-18T13:13:10.925Z'), litres: 1030.6 };
  const hours = rollupHours(
    [
      reading('16:49', 752.5) as { at: Date; litres: number },
      reading('16:54', 752.5) as { at: Date; litres: number },
    ],
    before,
    'Asia/Kolkata',
    17,
  );
  assert.equal(
    hours.reduce((s, h) => s + h.usedL, 0),
    0,
  );
  assert.equal(hours[0].observedSeconds, 300);
});

test('reconnect starts a new reference for both refills and draws', () => {
  for (const litres of [100, 1100]) {
    const raw = [
      reading('10:00', 800),
      reading('10:05', 800),
      reading('12:00', litres),
      reading('12:05', litres),
    ];
    const points = prepareReadings(raw);
    const hours = rollupHours(points, null, 'Asia/Kolkata', 2);
    assert.equal(
      hours.reduce((s, h) => s + h.usedL + h.filledL, 0),
      0,
    );
    assert.equal(
      hours.reduce((s, h) => s + h.observedSeconds, 0),
      600,
    );
    assert.deepEqual(detectEpisodes(points, null, opts, now), []);
  }
});

test('an unreadable cycle breaks inference, even when the device keeps reporting online', () => {
  const points = prepareReadings([
    reading('10:00', 900),
    reading('10:01', null),
    reading('10:02', 500),
    reading('10:03', 500),
  ]);
  assert.equal(points[1].breakBefore, true);
  assert.equal(rollupHours(points, null, 'Asia/Kolkata', 2)[0].usedL, 0);
  assert.deepEqual(detectEpisodes(points, null, opts, now), []);
});

test('a real draw resumes normally after reconnect; the outage itself is not an event', () => {
  const points = prepareReadings([
    reading('10:00', 900),
    reading('12:00', 500),
    reading('12:05', 450),
    reading('12:10', 400),
  ]);
  const hours = rollupHours(points, null, 'Asia/Kolkata', 2);
  assert.equal(
    hours.reduce((s, h) => s + h.usedL, 0),
    100,
  );
  const [event] = detectEpisodes(points, null, opts, now);
  assert.equal(event.volumeL, 100);
  assert.equal(event.startedAt.getTime(), at('12:00').getTime());
  assert.equal(event.endedAt.getTime(), at('12:10').getTime());
});

test('one reading is not evidence of zero use and supplies no observed duration', () => {
  const [hour] = rollupHours(prepareReadings([reading('10:00', 500)]), null, 'Asia/Kolkata', 2);
  assert.equal(hour.observedSeconds, 0);
  assert.equal(hour.readings, 1);
});

test('observed coverage is split at local hour and midnight boundaries', () => {
  const before = { at: new Date('2026-10-21T23:55:00+05:30'), litres: 500 };
  const hours = rollupHours(prepareReadings([reading('00:05', 480)]), before, 'Asia/Kolkata', 2);
  assert.equal(hours.length, 2);
  assert.deepEqual(
    hours.map((h) => h.observedSeconds),
    [300, 300],
  );
  assert.equal(hours[1].usedL, 20);
});

test('noise filtering cannot stitch an excursion across an outage', () => {
  const points = prepareReadings([
    reading('10:00', 900),
    reading('10:01', 500),
    reading('11:00', 900),
  ]);
  const filtered = removeExcursions(points, 2, 2 * 3600_000);
  assert.equal(filtered[1].litres, 500);
  assert.equal(filtered[2].breakBefore, true);
});

test('invalid values and duplicate timestamps never create movement or coverage', () => {
  const points = prepareReadings([
    reading('10:00', 800),
    reading('10:00', 200),
    reading('10:01', NaN),
    reading('10:02', -10),
    reading('10:03', 500),
  ]);
  assert.equal(points.length, 2);
  assert.equal(rollupHours(points, null, 'Asia/Kolkata', 2)[0].observedSeconds, 0);
  assert.deepEqual(detectEpisodes(points, null, opts, now), []);
});

test('ongoing stops on a stable reading, a sensor fault, an outage or stale cache', () => {
  const moving = prepareReadings([reading('10:00', 900), reading('10:05', 800)]);
  assert.equal(detectEpisodes(moving, null, opts, at('10:06'))[0].ongoing, true);
  assert.equal(
    detectEpisodes([...moving, { at: at('10:06'), litres: 800 }], null, opts, at('10:07'))[0]
      .ongoing,
    false,
  );
  const failed = prepareReadings([
    reading('10:00', 900),
    reading('10:05', 800),
    reading('10:06', null),
  ]);
  assert.equal(detectEpisodes(failed, null, opts, at('10:07'))[0].ongoing, false);
  assert.equal(episodeIsCurrent(true, at('10:05'), false, at('10:06')), false);
  assert.equal(episodeIsCurrent(true, at('10:05'), true, at('11:00')), false);
  assert.equal(episodeIsCurrent(true, at('10:05'), true, at('10:06')), true);
});

test('continuity follows the report cadence with conservative bounds', () => {
  assert.equal(continuityGapMs(60_000), 300_000);
  assert.equal(continuityGapMs(300_000), 900_000);
  assert.equal(continuityGapMs(3_600_000), 1_800_000);
  assert.equal(continuityGapMs(300_000, 5), 300_000);
  assert.equal(continuityGapMs(300_000, 1), 60_000);
});
