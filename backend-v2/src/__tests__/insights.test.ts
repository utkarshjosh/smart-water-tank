import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustedScore,
  clockLabel,
  dueSlot,
  generateInsights,
  hourRange,
  pickInsight,
  seededRandom,
  SLOTS,
  slotTarget,
  validateRephrase,
  type Insight,
  type InsightDay,
  type InsightHour,
  type InsightInput,
} from '../lib/insights';
import { addDays } from '../lib/local-time';
import { rephraseInsight } from '../services/insight-llm.service';
import { env } from '../config/env';

const TODAY = '2026-10-20';
const NOISE = 17;
/** A usual day: a heavy morning and a lighter evening, 400 L. */
const USUAL: Record<number, number> = { 6: 100, 7: 100, 8: 50, 9: 50, 19: 50, 20: 50 };

/** One day's hourly rows: `use` by clock hour (0 elsewhere), `missing` hours unread, hours from `until` on not yet happened. */
function dayHours(
  date: string,
  use: Record<number, number>,
  opts: { missing?: number[]; until?: number } = {},
): InsightHour[] {
  const out: InsightHour[] = [];
  for (let hour = 0; hour < (opts.until ?? 24); hour++) {
    if (opts.missing?.includes(hour)) continue;
    out.push({ date, hour, usedL: use[hour] ?? 0, readings: 180, observedSeconds: 3600 });
  }
  return out;
}

const scaled = (factor: number) =>
  Object.fromEntries(Object.entries(USUAL).map(([h, l]) => [h, l * factor])) as Record<number, number>;

/** `n` past days of the usual pattern, yesterday first. */
function history(n: number, use = USUAL): InsightHour[] {
  return Array.from({ length: n }, (_, i) => dayHours(addDays(TODAY, -(i + 1)), use)).flat();
}

const input = (over: Partial<InsightInput>): InsightInput => ({
  today: TODAY,
  nowHour: 19,
  slot: 'evening',
  hours: [],
  days: [],
  noiseL: NOISE,
  ...over,
});
const find = (xs: Insight[], kind: Insight['kind']) => xs.find((x) => x.kind === kind);

// --- Today so far -----------------------------------------------------------------

test('a light morning is compared with the same hours of earlier days, and praised', () => {
  const hours = [...history(7), ...dayHours(TODAY, { 6: 30 }, { until: 12 })];
  const out = generateInsights(input({ slot: 'midday', nowHour: 12, hours }));
  const day = find(out, 'day_so_far')!;
  assert.deepEqual(
    { ...day.facts },
    {
      until: 'noon',
      diff_l: 270,
      usual_l: 300,
      direction: 'less',
      days: 8,
      record: 'lowest',
      used_l: 30,
      slot: 'midday',
    },
  );
  assert.match(day.text, /about 30 L by noon/);
  assert.match(day.text, /Nice/);
  assert.ok(day.score >= SLOTS.midday.bar, `score ${day.score}`);
});

test('a heavy day so far is stated plainly, without praise', () => {
  const hours = [...history(7), ...dayHours(TODAY, scaled(2), { until: 19 })];
  const day = find(generateInsights(input({ hours })), 'day_so_far')!;
  assert.equal(day.facts.direction, 'more');
  assert.equal(day.facts.record, 'highest');
  assert.doesNotMatch(day.text, /Nice/);
});

test('hours the sensor missed never make a day read as light', () => {
  // The heavy 6-8 AM hours went unread. What was seen is lighter, but the
  // missed hours could easily hold the difference.
  const hours = [...history(7), ...dayHours(TODAY, { 8: 0, 9: 0 }, { missing: [6, 7], until: 12 })];
  assert.equal(find(generateInsights(input({ slot: 'midday', nowHour: 12, hours })), 'day_so_far'), undefined);
});

test('a light day with an unread quiet hour still counts, without stating a total', () => {
  // 3 AM is always 0 L, so missing it can't hide the difference.
  const hours = [...history(7), ...dayHours(TODAY, {}, { missing: [3], until: 12 })];
  const day = find(generateInsights(input({ slot: 'midday', nowHour: 12, hours })), 'day_so_far')!;
  assert.equal(day.facts.direction, 'less');
  assert.equal(day.facts.used_l, undefined);
  assert.doesNotMatch(day.text, /\{\{/);
});

test('a morning with readings for under 75% of its hours is not compared', () => {
  const hours = [...history(7), ...dayHours(TODAY, {}, { missing: [0, 1, 2, 3, 4], until: 12 })];
  assert.equal(find(generateInsights(input({ slot: 'midday', nowHour: 12, hours })), 'day_so_far'), undefined);
});

test('a difference under four noise floors is not news', () => {
  const hours = [...history(7), ...dayHours(TODAY, { ...USUAL, 6: 50 }, { until: 19 })];
  assert.equal(find(generateInsights(input({ hours })), 'day_so_far'), undefined);
});

test('fewer than four comparable days means no comparison', () => {
  const hours = [...history(3), ...dayHours(TODAY, {}, { until: 19 })];
  assert.equal(find(generateInsights(input({ hours })), 'day_so_far'), undefined);
});

test('days that missed most of the same hours are not comparable', () => {
  // Five earlier days saw only the night; three saw everything.
  const nightOnly = Array.from({ length: 5 }, (_, i) =>
    dayHours(addDays(TODAY, -(i + 4)), USUAL, { missing: Array.from({ length: 19 }, (_, h) => h + 5) }),
  ).flat();
  const hours = [...history(3), ...nightOnly, ...dayHours(TODAY, {}, { until: 19 })];
  assert.equal(find(generateInsights(input({ hours })), 'day_so_far'), undefined);
});

test('hours still in progress are not counted', () => {
  // Rows exist for 7 PM onward (the hour in progress), at huge values.
  const hours = [...history(7), ...dayHours(TODAY, { 6: 30, 19: 500, 20: 500 })];
  const day = find(generateInsights(input({ hours, nowHour: 19 })), 'day_so_far')!;
  assert.equal(day.facts.direction, 'less');
});

// --- Yesterday, hours, peaks, refills, weeks, streaks -------------------------------

test('yesterday is ranked over the hours it was seen', () => {
  const hours = [
    ...dayHours(addDays(TODAY, -1), scaled(0.25)),
    ...Array.from({ length: 6 }, (_, i) => dayHours(addDays(TODAY, -(i + 2)), USUAL)).flat(),
  ];
  const y = find(generateInsights(input({ slot: 'midday', nowHour: 12, hours })), 'yesterday_rank')!;
  assert.equal(y.facts.direction, 'less');
  assert.equal(y.facts.record, 'lowest');
  assert.equal(y.facts.diff_l, 300);
});

test('an hour far above its usual is news; a usual heavy hour is not', () => {
  const quietHour = [...history(7), ...dayHours(TODAY, { ...USUAL, 14: 160 }, { until: 19 })];
  const odd = find(generateInsights(input({ hours: quietHour })), 'unusual_hour')!;
  assert.equal(odd.facts.range, '2–3 PM');
  assert.equal(odd.facts.usual_l, 0);
  assert.match(odd.text, /usually quiet|rarely use water/);

  const usual = [...history(7), ...dayHours(TODAY, USUAL, { until: 19 })];
  assert.equal(find(generateInsights(input({ hours: usual })), 'unusual_hour'), undefined);
});

test("a shifted peak is news only if today's usual peak hour was seen", () => {
  const today = { 6: 30, 7: 30, 16: 150 };
  const seen = [...history(7), ...dayHours(TODAY, today, { until: 19 })];
  const shift = find(generateInsights(input({ hours: seen })), 'peak_shift')!;
  assert.deepEqual([shift.facts.range, shift.facts.usual_range], ['4–5 PM', '6–7 AM']);

  const missed = [...history(7), ...dayHours(TODAY, today, { missing: [6], until: 19 })];
  assert.equal(find(generateInsights(input({ hours: missed })), 'peak_shift'), undefined);
});

test('more refills than usual is news', () => {
  const days: InsightDay[] = [
    ...Array.from({ length: 7 }, (_, i) => ({ date: addDays(TODAY, -(i + 1)), refills: 2 })),
    { date: TODAY, refills: 6 },
  ];
  const hours = [...history(7), ...dayHours(TODAY, USUAL, { until: 19 })];
  const r = find(generateInsights(input({ hours, days })), 'refills_today')!;
  assert.deepEqual([r.facts.refills, r.facts.usual_refills], [6, 2]);
  assert.match(r.text, /6/);

  const usual = days.map((d) => (d.date === TODAY ? { ...d, refills: 3 } : d));
  assert.equal(find(generateInsights(input({ hours, days: usual })), 'refills_today'), undefined);
});

test('this week against last week uses each clock hour across the week, gaps included', () => {
  const thisWeek = Array.from({ length: 7 }, (_, i) =>
    // One morning hour unread each day: the week is still comparable.
    dayHours(addDays(TODAY, -(i + 1)), scaled(0.7), { missing: [i % 2 ? 6 : 7] }),
  ).flat();
  const lastWeek = Array.from({ length: 7 }, (_, i) => dayHours(addDays(TODAY, -(i + 8)), USUAL)).flat();
  const w = find(generateInsights(input({ hours: [...thisWeek, ...lastWeek] })), 'week_vs_last')!;
  assert.equal(w.facts.direction, 'less');
  assert.equal(w.facts.change_pct, 30);
});

test('three light days in a row, today included, is a streak', () => {
  const hours = [
    ...dayHours(TODAY, scaled(0.5), { until: 21 }),
    ...dayHours(addDays(TODAY, -1), scaled(0.5)),
    ...dayHours(addDays(TODAY, -2), scaled(0.5)),
    ...Array.from({ length: 12 }, (_, i) => dayHours(addDays(TODAY, -(i + 3)), USUAL)).flat(),
  ];
  const s = find(generateInsights(input({ hours, nowHour: 21 })), 'low_streak')!;
  assert.equal(s.facts.days, 3);
  // Two days is not yet a streak.
  const two = hours.filter((h) => h.date !== addDays(TODAY, -2));
  assert.equal(find(generateInsights(input({ hours: two, nowHour: 21 })), 'low_streak'), undefined);
});

test('a quiet night is news only right after a night with use, and says so', () => {
  const night = dayHours(TODAY, {}, { until: 12 });
  const usedNightBefore = dayHours(addDays(TODAY, -1), { 2: 50 });
  const news = find(generateInsights(input({ slot: 'midday', nowHour: 12, hours: [...night, ...usedNightBefore] })), 'quiet_night')!;
  assert.equal(news.text, 'No measurable water-level drop was recorded between midnight and 5 AM, after about 50 L the night before.');
  assert.ok(news.score >= SLOTS.midday.bar);

  const usual = find(generateInsights(input({ slot: 'midday', nowHour: 12, hours: [...night, ...dayHours(addDays(TODAY, -1), {})] })), 'quiet_night')!;
  assert.ok(usual.score < SLOTS.midday.bar, 'an ordinary quiet night is not sent at midday');
});

test('a quiet night needs every overnight hour, and a repeated clock hour adds up', () => {
  const missing = dayHours(TODAY, {}, { missing: [4], until: 12 });
  assert.equal(find(generateInsights(input({ slot: 'midday', nowHour: 12, hours: missing })), 'quiet_night'), undefined);
  // DST fall-back: 1 AM happens twice; the two together are over the noise floor.
  const repeated = [...dayHours(TODAY, { 1: 10 }, { until: 12 }), { date: TODAY, hour: 1, usedL: 10, readings: 180, observedSeconds: 3600 }];
  assert.equal(find(generateInsights(input({ slot: 'midday', nowHour: 12, hours: repeated })), 'quiet_night'), undefined);
});

test('a partial hour is not an observed hour', () => {
  const hours = [...history(7), ...dayHours(TODAY, { 6: 30 }, { until: 12 }).map((h) => ({ ...h, observedSeconds: 1800 }))];
  assert.deepEqual(generateInsights(input({ slot: 'midday', nowHour: 12, hours })), []);
});

test('every candidate has its placeholders filled and names its slot', () => {
  const hours = [...history(14, scaled(1)), ...dayHours(TODAY, { 6: 30, 14: 160 }, { until: 19 })];
  const out = generateInsights(input({ hours }));
  assert.ok(out.length >= 2);
  for (const c of out) {
    assert.doesNotMatch(c.text, /\{\{/, c.kind);
    assert.equal(c.facts.slot, 'evening');
  }
});

test('wording varies from day to day', () => {
  const texts = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const today = addDays(TODAY, i);
    const hours = [
      ...Array.from({ length: 7 }, (_, d) => dayHours(addDays(today, -(d + 1)), USUAL)).flat(),
      ...dayHours(today, scaled(0.5), { until: 19 }),
    ];
    texts.add(find(generateInsights(input({ today, hours })), 'day_so_far')!.template);
  }
  assert.ok(texts.size >= 2, [...texts].join(' | '));
});

// --- Choosing and timing ------------------------------------------------------------

const cand = (kind: Insight['kind'], score: number): Insight => ({ kind, score, facts: {}, template: kind, text: kind });

test('a kind is never sent two days running, and recovers over the following days', () => {
  const c = cand('unusual_hour', 0.8);
  assert.equal(adjustedScore(c, [{ kind: 'unusual_hour', date: addDays(TODAY, -1) }], TODAY), 0);
  const after = [2, 3, 6, 12].map((d) => adjustedScore(c, [{ kind: 'unusual_hour', date: addDays(TODAY, -d) }], TODAY));
  assert.deepEqual([...after].sort((a, b) => a - b), after);
  assert.ok(after[0] < 0.5 && after[3] > 0.75, after.join());
  assert.equal(adjustedScore(c, [{ kind: 'quiet_night', date: addDays(TODAY, -1) }], TODAY), 0.8);
});

test('week-on-week is not repeated within six days', () => {
  const w = cand('week_vs_last', 0.9);
  assert.equal(adjustedScore(w, [{ kind: 'week_vs_last', date: addDays(TODAY, -6) }], TODAY), 0);
  assert.ok(adjustedScore(w, [{ kind: 'week_vs_last', date: addDays(TODAY, -7) }], TODAY) > 0);
});

test('the pick is weighted-random among candidates above the bar', () => {
  const cs = [cand('unusual_hour', 0.7), cand('day_so_far', 0.65), cand('quiet_night', 0.3)];
  const picks = new Set<string>();
  for (let i = 0; i < 40; i++) {
    picks.add(pickInsight(cs, [], TODAY, { minScore: 0.35, rand: seededRandom(`t${i}`) })!.insight.kind);
  }
  assert.deepEqual([...picks].sort(), ['day_so_far', 'unusual_hour']);
  assert.equal(pickInsight([cand('quiet_night', 0.3)], [], TODAY, { minScore: 0.35, rand: Math.random }), null);
  assert.equal(pickInsight([], [], TODAY, { minScore: 0.35, rand: Math.random }), null);
});

test('a dull evening still sends something: the day so far', () => {
  const hours = [...history(7), ...dayHours(TODAY, USUAL, { until: 19 })];
  const days = [{ date: TODAY, refills: 2 }];
  const out = generateInsights(input({ hours, days }));
  const summary = find(out, 'day_summary')!;
  assert.equal(summary.text, 'Today so far: about 300 L used by 7 PM, with 2 refills.');
  // Every other kind sent yesterday, the summary included: it may repeat.
  const recent = out.map((c) => ({ kind: c.kind, date: addDays(TODAY, -1) }));
  const picked = pickInsight(out, recent, TODAY, { minScore: SLOTS.evening.bar, rand: seededRandom('dull') });
  assert.equal(picked?.insight.kind, 'day_summary');
});

test('the day summary only claims the hours it saw, and says when nothing arrived', () => {
  const cut = dayHours(TODAY, USUAL, { until: 19, missing: [9, 10, 11] });
  const [summary] = generateInsights(input({ hours: cut, days: [{ date: TODAY, refills: 1 }] })).filter(
    (c) => c.kind === 'day_summary',
  );
  assert.equal(summary.text, 'Today so far: about 250 L used in the 16 hours with readings by 7 PM, with one refill.');
  const quiet = find(generateInsights(input({ hours: dayHours(TODAY, {}, { until: 19 }) })), 'day_summary')!;
  assert.equal(quiet.text, 'Today so far: no measurable water use by 7 PM, with no refill yet.');
  const none = find(generateInsights(input({ hours: [] })), 'day_summary')!;
  assert.match(none.text, /No readings have arrived/);
  // Midday never sends the summary on its own.
  assert.equal(find(generateInsights(input({ slot: 'midday', nowHour: 12, hours: cut })), 'day_summary'), undefined);
  assert.ok(SLOTS.midday.bar > summary.score);
});

test('each slot is decided once, inside its window, at a time that varies by day', () => {
  const targets = new Set<number>();
  for (let d = 0; d < 20; d++) {
    const seed = `user:${addDays(TODAY, d)}`;
    for (const slot of ['midday', 'evening'] as const) {
      const at = slotTarget(seed, slot);
      assert.ok(at >= SLOTS[slot].start * 60 && at + 15 <= SLOTS[slot].end * 60, `${slot} ${at}`);
      if (slot === 'evening') targets.add(at);
      // Cron runs every 15 minutes from :07; exactly one lands in the window.
      const runs = Array.from({ length: 96 }, (_, i) => 7 + i * 15).filter((m) => dueSlot(m, seed) === slot);
      assert.equal(runs.length, 1, `${slot} decided ${runs.length} times`);
    }
  }
  assert.ok(targets.size > 10);
  assert.equal(dueSlot(9 * 60, 'user:x'), null);
});

test('hour ranges and clock labels read naturally', () => {
  assert.equal(hourRange(7), '7–8 AM');
  assert.equal(hourRange(11), '11 AM–12 PM');
  assert.equal(hourRange(0), '12–1 AM');
  assert.equal(hourRange(23), '11 PM–12 AM');
  assert.deepEqual([0, 9, 12, 13, 18].map(clockLabel), ['midnight', '9 AM', 'noon', '1 PM', '6 PM']);
});

// --- LLM rewording ------------------------------------------------------------------

const light: Insight = {
  kind: 'day_so_far',
  score: 0.7,
  facts: { used_l: 30, until: 'noon', days: 8, direction: 'less', slot: 'midday' },
  template: 'Light day so far: about {{used_l}} L by {{until}}, the lowest of your last {{days}} days with readings. Nice.',
  text: 'Light day so far: about 30 L by noon, the lowest of your last 8 days with readings. Nice.',
};

test('a rewording must keep every placeholder, write no digits, keep the hedge and the direction', () => {
  const ok = 'Only about {{used_l}} L by {{until}}, your lightest in {{days}} days of readings. Well done.';
  assert.equal(validateRephrase(ok, light), true);
  assert.equal(validateRephrase('Only about {{used_l}} L by {{until}}.', light), false); // dropped {{days}}
  assert.equal(validateRephrase(`${ok} {{diff_l}}`, light), false); // invented placeholder
  assert.equal(validateRephrase('Only about 30 L by {{until}} in {{days}} days, {{used_l}}.', light), false); // a digit
  assert.equal(validateRephrase('Only {{used_l}} L by {{until}}, lightest in {{days}} days.', light), false); // lost "about"
  assert.equal(validateRephrase('About {{used_l}} L by {{until}}, more than in {{days}} days.', light), false); // flipped
  assert.equal(validateRephrase('', light), false);
  assert.equal(validateRephrase(`${ok} ${'x'.repeat(120)}`, light), false);
});

function withLlm(t: { after: (fn: () => void) => void }) {
  const saved = { ...env };
  Object.assign(env, {
    insightLlmUrl: 'http://llm.test/v1/chat/completions',
    insightLlmModel: 'auto',
    insightLlmKey: 'k',
  });
  t.after(() => Object.assign(env, saved));
}
const reply = (content: string) =>
  (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
    })) as unknown as typeof fetch;

test('rephrase: no LLM configured sends the template', async () => {
  const saved = env.insightLlmUrl;
  env.insightLlmUrl = undefined;
  try {
    assert.deepEqual(await rephraseInsight(light, { fetchImpl: reply('nope') }), {
      text: light.text,
      source: 'template',
    });
  } finally {
    env.insightLlmUrl = saved;
  }
});

/**
 * A fake router: rewording requests get `rewords` in turn, meaning checks get
 * `verdicts` in turn. Records every request body.
 */
function fakeLlm(rewords: string[], verdicts: string[] = []) {
  const bodies: Array<{ temperature: number; messages: Array<{ role: string; content: string }> }> = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    const judging = body.messages[0].content.includes('Answer YES only');
    const content = (judging ? verdicts : rewords).shift() ?? '';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, bodies };
}
const goodReword = '"Only about {{used_l}} L by {{until}}, your lightest in {{days}} days of readings."';

test('rephrase: the server fills the numbers into a rewording judged to say the same thing', async (t) => {
  withLlm(t);
  const llm = fakeLlm([goodReword], ['YES']);
  assert.deepEqual(await rephraseInsight(light, { fetchImpl: llm.fetchImpl }), {
    text: 'Only about 30 L by noon, your lightest in 8 days of readings.',
    source: 'llm',
  });
  // The model is told exactly which placeholders to keep and which way use went.
  const ask = llm.bodies[0].messages[1].content;
  assert.match(ask, /Placeholders to keep: \{\{used_l\}\}, \{\{until\}\}, \{\{days\}\}/);
  assert.match(ask, /Use went: down/);
  // The judge sees both filled sentences.
  assert.match(llm.bodies[1].messages[1].content, /^A: Light day so far: about 30 L.*\nB: Only about 30 L/s);
});

test('rephrase: a rewording judged to change the meaning is retried, warmer, then falls back', async (t) => {
  withLlm(t);
  const llm = fakeLlm([goodReword, goodReword, goodReword], ['NO', 'No.', 'NO']);
  assert.deepEqual(await rephraseInsight(light, { fetchImpl: llm.fetchImpl }), { text: light.text, source: 'template' });
  const temps = llm.bodies.filter((b) => !b.messages[0].content.includes('Answer YES only')).map((b) => b.temperature);
  assert.deepEqual(temps, [0.7, 0.9, 1.0]);

  const second = fakeLlm([goodReword, goodReword], ['NO', 'YES']);
  assert.equal((await rephraseInsight(light, { fetchImpl: second.fetchImpl })).source, 'llm');
});

test('rephrase: an echo or an invented number is retried, never judged', async (t) => {
  withLlm(t);
  const llm = fakeLlm([light.template, 'Only about 30 L by noon, nice.', goodReword], ['YES']);
  assert.equal((await rephraseInsight(light, { fetchImpl: llm.fetchImpl })).source, 'llm');
  assert.equal(llm.bodies.length, 4, 'three rewordings, one meaning check');
});

test('rephrase: an LLM error falls back to the template', async (t) => {
  withLlm(t);
  const boom = (async () => {
    throw new Error('down');
  }) as unknown as typeof fetch;
  assert.deepEqual(await rephraseInsight(light, { fetchImpl: boom }), { text: light.text, source: 'template' });
});

test('quiet-night wording cannot be rephrased into a no-leak claim', async (t) => {
  withLlm(t);
  const quiet: Insight = {
    kind: 'quiet_night',
    score: 0.4,
    facts: { night_used_l: 0 },
    template: 'No measurable water-level drop was recorded between midnight and 5 AM.',
    text: 'No measurable water-level drop was recorded between midnight and 5 AM.',
  };
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return new Response();
  }) as typeof fetch;
  assert.deepEqual(await rephraseInsight(quiet, { fetchImpl }), { text: quiet.text, source: 'template' });
  assert.equal(called, false);
});
