import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateInsights,
  hourRange,
  numbersIn,
  pickInsight,
  shouldSendNow,
  validateRephrase,
  type Insight,
  type InsightDay,
  type InsightHour,
} from '../lib/insights';
import { addDays } from '../lib/local-time';
import { rephraseInsight } from '../services/insight-llm.service';
import { env } from '../config/env';

const TODAY = '2026-10-20';
const day = (offset: number, usedL: number, extra: Partial<InsightDay> = {}): InsightDay => ({
  date: addDays(TODAY, -offset),
  usedL,
  refills: 1,
  hoursWithData: 24,
  ...extra,
});
const kinds = (xs: Insight[]) => xs.map((x) => x.kind).sort();

test('yesterday is compared with the normal full day', () => {
  const days = [day(1, 720), day(2, 600), day(3, 600), day(4, 600)];
  const out = generateInsights({ today: TODAY, days, hours: [] });
  const vs = out.find((i) => i.kind === 'yesterday_vs_normal')!;
  assert.equal(vs.text, 'Yesterday you used 720 L, 20% more than your normal day (600 L).');
  assert.deepEqual(vs.facts, { used_l: 720, normal_l: 600, change_pct: 20, direction: 'more', baseline_days: 3 });
});

test('a half-day of readings is never reported as low use', () => {
  // Yesterday the sensor saw only 10 hours: 200 L looks low but isn't.
  const days = [day(1, 200, { hoursWithData: 10 }), day(2, 600), day(3, 600), day(4, 600)];
  assert.deepEqual(kinds(generateInsights({ today: TODAY, days, hours: [] })), []);
});

test('partial days do not count toward "normal", and too few full days means no comparison', () => {
  const days = [day(1, 720), day(2, 600), day(3, 100, { hoursWithData: 8 }), day(4, 600)];
  assert.equal(generateInsights({ today: TODAY, days, hours: [] }).find((i) => i.kind === 'yesterday_vs_normal'), undefined);
});

test('a small swing is not news', () => {
  const days = [day(1, 630), day(2, 600), day(3, 600), day(4, 600)];
  assert.equal(generateInsights({ today: TODAY, days, hours: [] }).find((i) => i.kind === 'yesterday_vs_normal'), undefined);
});

test('busiest hour of yesterday, with its share of the day', () => {
  const yesterday = addDays(TODAY, -1);
  const hours: InsightHour[] = [
    { date: yesterday, hour: 7, usedL: 98, readings: 60 },
    { date: yesterday, hour: 19, usedL: 60, readings: 60 },
  ];
  const out = generateInsights({ today: TODAY, days: [day(1, 400)], hours });
  const bh = out.find((i) => i.kind === 'busiest_hour')!;
  assert.equal(bh.text, 'Yesterday your busiest hour was 7–8 AM (98 L, 25% of the day).');
});

test('hour ranges read naturally across noon and midnight', () => {
  assert.equal(hourRange(7), '7–8 AM');
  assert.equal(hourRange(11), '11 AM–12 PM');
  assert.equal(hourRange(0), '12–1 AM');
  assert.equal(hourRange(23), '11 PM–12 AM');
});

test('fills this week vs last week need 5 full days in each', () => {
  const days = [];
  for (let i = 1; i <= 14; i++) days.push(day(i, 500, { refills: i <= 7 ? (i === 1 ? 1 : 0) : i <= 10 ? 1 : 0 }));
  const out = generateInsights({ today: TODAY, days, hours: [] });
  assert.equal(out.find((i) => i.kind === 'fills_week')!.text, 'The tank filled once in the last 7 days, down from 3 the week before.');

  const thin = days.filter((_, i) => i < 7 || i > 10); // only 3 days in the earlier week
  assert.equal(generateInsights({ today: TODAY, days: thin, hours: [] }).find((i) => i.kind === 'fills_week'), undefined);
});

test('a quiet night needs readings for every overnight hour', () => {
  const night = [0, 1, 2, 3, 4].map((hour) => ({ date: TODAY, hour, usedL: 0, readings: 60 }));
  assert.deepEqual(kinds(generateInsights({ today: TODAY, days: [], hours: night })), ['quiet_night']);
  assert.deepEqual(kinds(generateInsights({ today: TODAY, days: [], hours: night.slice(1) })), []);
  const drawn = night.map((h) => ({ ...h, usedL: h.hour === 2 ? 30 : 0 }));
  assert.deepEqual(kinds(generateInsights({ today: TODAY, days: [], hours: drawn })), []);
});

const cand = (kind: Insight['kind'], score: number): Insight => ({ kind, score, facts: {}, text: kind });

test('pick: the same kind is never sent two days running', () => {
  const picked = pickInsight([cand('busiest_hour', 0.9), cand('quiet_night', 0.3)], [{ kind: 'busiest_hour', date: '2026-10-19' }], TODAY);
  assert.equal(picked!.kind, 'quiet_night');
});

test('pick: kinds sent often this week lose to fresher ones', () => {
  const recent = [
    { kind: 'busiest_hour', date: '2026-10-16' },
    { kind: 'busiest_hour', date: '2026-10-14' },
  ];
  assert.equal(pickInsight([cand('busiest_hour', 0.6), cand('quiet_night', 0.35)], recent, TODAY)!.kind, 'quiet_night');
  assert.equal(pickInsight([], [], TODAY), null);
});

test('send only in waking hours, and only once a day', () => {
  assert.equal(shouldSendNow(8, false), false);
  assert.equal(shouldSendNow(9, false), true);
  assert.equal(shouldSendNow(19, false), true);
  assert.equal(shouldSendNow(20, false), false);
  assert.equal(shouldSendNow(12, true), false);
});

const vs: Insight = {
  kind: 'yesterday_vs_normal',
  score: 0.2,
  facts: { used_l: 720, normal_l: 600, change_pct: 20, direction: 'more', baseline_days: 3 },
  text: 'Yesterday you used 720 L, 20% more than your normal day (600 L).',
};

test('numbers are read out of text, with thousands separators', () => {
  assert.deepEqual(numbersIn('1,200 L at 7–8 AM, 3.5%'), [1200, 7, 8, 3.5]);
});

test('LLM text is accepted only if every number came from the facts', () => {
  assert.equal(validateRephrase('You used 720 L yesterday – about 20% above your usual 600 L.', vs), true);
  assert.equal(validateRephrase('You used 720 L yesterday, 25% above normal.', vs), false); // invented 25
  assert.equal(validateRephrase('You used 750 L yesterday.', vs), false);
  assert.equal(validateRephrase('', vs), false);
  assert.equal(validateRephrase('x'.repeat(200), vs), false);
});

function withLlm(t: { after: (fn: () => void) => void }) {
  const saved = { ...env };
  Object.assign(env, { insightLlmUrl: 'http://llm.test/v1/chat/completions', insightLlmModel: 'm', insightLlmKey: 'k' });
  t.after(() => Object.assign(env, saved));
}
const reply = (content: string) =>
  (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })) as unknown as typeof fetch;

test('rephrase: no LLM configured sends the template', async () => {
  const saved = env.insightLlmUrl;
  env.insightLlmUrl = undefined;
  try {
    assert.deepEqual(await rephraseInsight(vs, { fetchImpl: reply('nope 999') }), { text: vs.text, source: 'template' });
  } finally {
    env.insightLlmUrl = saved;
  }
});

test('rephrase: a valid rewording is used, an invented number falls back', async (t) => {
  withLlm(t);
  assert.deepEqual(await rephraseInsight(vs, { fetchImpl: reply('Yesterday: 720 L, 20% over your usual 600 L.') }), {
    text: 'Yesterday: 720 L, 20% over your usual 600 L.',
    source: 'llm',
  });
  assert.equal((await rephraseInsight(vs, { fetchImpl: reply('Yesterday: 720 L, roughly 5 showers more.') })).source, 'template');
});

test('rephrase: an LLM error falls back to the template', async (t) => {
  withLlm(t);
  const boom = (async () => {
    throw new Error('down');
  }) as unknown as typeof fetch;
  assert.deepEqual(await rephraseInsight(vs, { fetchImpl: boom }), { text: vs.text, source: 'template' });
});
