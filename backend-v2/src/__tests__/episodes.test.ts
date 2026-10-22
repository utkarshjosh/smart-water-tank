import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectEpisodes, episodeOptions } from '../lib/episodes';

const opts = { noiseL: 2, maxGapMs: 30 * 60 * 1000, minDrawL: 5, minFillL: 20 };
const t = (hhmm: string) => new Date(`2026-10-18T${hhmm}:00+05:30`);
const r = (hhmm: string, litres: number) => ({ at: t(hhmm), litres });
const later = t('23:59');

const summary = (readings: ReturnType<typeof r>[], now = later) =>
  detectEpisodes(readings, null, opts, now).map(
    (e) => `${e.kind} ${e.volumeL} ${e.startedAt.toISOString().slice(11, 16)}`,
  );

test('a fill is one episode from the last reading at the old level to the top', () => {
  const [fill] = detectEpisodes(
    [
      r('06:00', 200),
      r('06:05', 200),
      r('06:10', 400),
      r('06:20', 700),
      r('06:30', 950),
      r('06:40', 950),
    ],
    null,
    opts,
    later,
  );
  assert.equal(fill.kind, 'fill');
  assert.equal(fill.startedAt.getTime(), t('06:05').getTime());
  assert.equal(fill.endedAt.getTime(), t('06:30').getTime());
  assert.equal(fill.volumeL, 750);
  assert.equal(fill.rateLPerMin, 30);
  assert.equal(fill.readings, 4);
  assert.equal(fill.ongoing, false);
});

test('a draw then a fill are two episodes, split where the level turns', () => {
  const episodes = detectEpisodes(
    [r('07:00', 900), r('07:10', 860), r('07:20', 840), r('07:30', 990)],
    null,
    opts,
    later,
  );
  assert.deepEqual(
    episodes.map((e) => [e.kind, e.volumeL]),
    [
      ['draw', 60],
      ['fill', 150],
    ],
  );
});

test('a long pause ends an episode even if the level keeps going the same way', () => {
  const episodes = detectEpisodes(
    [r('07:00', 900), r('07:10', 850), r('09:00', 850), r('09:10', 800)],
    null,
    opts,
    later,
  );
  assert.equal(episodes.length, 2);
  assert.ok(episodes.every((e) => e.kind === 'draw' && e.volumeL === 50));
});

test('jitter neither starts nor breaks an episode', () => {
  assert.deepEqual(
    detectEpisodes(
      [r('08:00', 500), r('08:05', 501), r('08:10', 499), r('08:15', 500)],
      null,
      opts,
      later,
    ),
    [],
  );
  // A wobble mid-draw (840 -> 841) is inside the noise floor: still one draw.
  const episodes = detectEpisodes(
    [r('08:00', 900), r('08:05', 840), r('08:10', 841), r('08:15', 800)],
    null,
    opts,
    later,
  );
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].volumeL, 100);
});

test('small movements are dropped: a glass of water is not an event', () => {
  assert.deepEqual(detectEpisodes([r('08:00', 500), r('08:05', 496)], null, opts, later), []);
  // 15 L in is under the 20 L fill minimum.
  assert.deepEqual(detectEpisodes([r('08:00', 500), r('08:05', 515)], null, opts, later), []);
});

test('an episode still moving at the newest reading is ongoing', () => {
  const now = t('06:25');
  const [fill] = detectEpisodes(
    [r('06:00', 200), r('06:10', 400), r('06:20', 600)],
    null,
    opts,
    now,
  );
  assert.equal(fill.ongoing, true);
  // An hour later with no new reading, it's over.
  assert.equal(
    detectEpisodes([r('06:00', 200), r('06:10', 400), r('06:20', 600)], null, opts, t('07:30'))[0]
      .ongoing,
    false,
  );
});

test('a slow draw adds up across readings that each move less than the noise floor', () => {
  const readings = Array.from({ length: 13 }, (_, i) =>
    r(`10:${String(i * 2).padStart(2, '0')}`, 500 - i * 1.5),
  );
  // Dated from 10:02 IST (04:32 UTC): that reading (498.5 L) is still inside
  // the noise floor of the starting level, so it's the last one that looked
  // unchanged. Compared in UTC so the test passes in any machine timezone.
  assert.deepEqual(summary(readings), ['draw 18 04:32']);
});

test('thresholds scale with the tank', () => {
  assert.deepEqual(episodeOptions(null, 2), {
    noiseL: 2,
    maxReadingGapMs: 900_000,
    maxGapMs: 1_800_000,
    minDrawL: 10,
    minFillL: 20,
  });
  assert.equal(episodeOptions(2000, 10).minDrawL, 40);
  assert.equal(episodeOptions(2000, 10).minFillL, 60);
});
