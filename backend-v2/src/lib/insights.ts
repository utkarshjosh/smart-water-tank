/**
 * Daily insight generator (experimental). Pure: takes the tank's hourly
 * rollups cut into local days and hours, returns candidate insights for one
 * send slot (midday or early evening), each with a computed interest score.
 *
 * Every candidate carries the facts it was computed from and a sentence
 * template with {{placeholders}} for those facts. Optional LLM rewording may
 * only reword the template; the server fills the numbers (see
 * validateRephrase).
 *
 * Two properties of the data shape every comparison here:
 *  - The sensor drops out for a few hours most days, so complete days are
 *    rare. A day is compared with earlier days only over the clock hours both
 *    observed, and a claim must survive the worst case for the hours it could
 *    not see.
 *  - The level reads in steps of a couple of noise floors (~17 L on the live
 *    tank), so a difference smaller than a few noise floors is not news.
 */
import { COMPLETE_HOUR_SECONDS } from './rollup';
import { addDays } from './local-time';

export type Slot = 'midday' | 'evening';

export type InsightKind =
  | 'day_so_far'
  | 'yesterday_rank'
  | 'unusual_hour'
  | 'peak_shift'
  | 'refills_today'
  | 'week_vs_last'
  | 'low_streak'
  | 'quiet_night'
  | 'day_summary';

export type Facts = Record<string, number | string>;

export interface Insight {
  kind: InsightKind;
  /** 0..1: how surprising and how large, before the recency penalty. */
  score: number;
  facts: Facts;
  /** The sentence with {{fact}} placeholders. */
  template: string;
  /** The template with the facts filled in: what is sent without an LLM. */
  text: string;
}

export interface InsightHour {
  date: string; // local date
  hour: number; // local 0-23
  usedL: number;
  readings: number;
  observedSeconds: number;
}

export interface InsightDay {
  date: string; // YYYY-MM-DD, local
  refills: number;
}

export interface InsightInput {
  /** The local date the insight would be sent on. */
  today: string;
  /** Local hour now. Only hours that have ended (< nowHour) count for today. */
  nowHour: number;
  slot: Slot;
  /** Hourly rollups for the last 15 local days and today. */
  hours: InsightHour[];
  /** Refill counts per local day, today included. */
  days: InsightDay[];
  /** How far the level must move to count as use (rollup noiseFloorL). */
  noiseL: number;
}

/** Earlier days a day is compared with. */
export const LOOKBACK_DAYS = 14;
/** Fewer comparable days than this is no "usual" at all. */
export const MIN_PEERS = 4;
/** A comparable day observed at least this share of the same clock hours. */
const SHARED_HOURS = 0.9;
/** Today must have readings for this share of the hours so far. */
const MIN_COVERAGE = 0.75;
/** A comparison claim needs this share of comparable days on its side (Tableau's 15-85% band). */
const BAND = 0.85;
/** Differences below this many noise floors are not news. */
const MIN_DIFF_NOISE = 4;
/** A past day this well observed counts as a whole day (peaks, refills, streaks). */
const WHOLE_DAY_HOURS = 18;
/** Overnight window, local hours [start, end). */
const NIGHT_START = 0;
const NIGHT_END = 5;

/** Kinds that describe a week or a run of days are not repeated within this many days. */
const MIN_GAP_DAYS: Partial<Record<InsightKind, number>> = { week_vs_last: 6, low_streak: 3 };

// --- Small helpers -------------------------------------------------------------

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const mean = (xs: number[]) => sum(xs) / xs.length;

export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
const median = (xs: number[]) => quantile(xs, 0.5);

/** Litres as said aloud: the sensor is good to ~10-20 L, so round to 10. */
const aboutL = (l: number) => Math.max(10, Math.round(l / 10) * 10);

/** "7–8 AM", "11 AM–12 PM", "12–1 AM". */
export function hourRange(hour: number): string {
  const label = (h: number) => {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return { n: h12, ap: h < 12 || h === 24 ? 'AM' : 'PM' };
  };
  const a = label(hour);
  const b = label(hour + 1);
  return a.ap === b.ap ? `${a.n}–${b.n} ${b.ap}` : `${a.n} ${a.ap}–${b.n} ${b.ap}`;
}

/** "noon", "6 PM", "midnight". */
export function clockLabel(hour: number): string {
  if (hour % 24 === 0) return 'midnight';
  if (hour === 12) return 'noon';
  return `${hour % 12} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** The {{placeholders}} in a template, in order. */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
}

export function fill(template: string, facts: Facts): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    key in facts ? String(facts[key]) : whole,
  );
}

/** Deterministic 0..1 random stream from a string (FNV-1a seed into mulberry32). */
export function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const choose = <T>(xs: T[], rand: () => number): T => xs[Math.floor(rand() * xs.length) % xs.length];

// --- The observed-hours grid ---------------------------------------------------

/** date -> clock hour -> litres, for complete hours only. */
type Grid = Map<string, Map<number, number>>;

function buildGrid(input: InsightInput): Grid {
  const grid: Grid = new Map();
  for (const h of input.hours) {
    if (h.readings <= 0 || h.observedSeconds < COMPLETE_HOUR_SECONDS) continue;
    if (h.date > input.today || (h.date === input.today && h.hour >= input.nowHour)) continue;
    let day = grid.get(h.date);
    if (!day) grid.set(h.date, (day = new Map()));
    // A repeated clock hour (DST fall-back) is one hour of the day's clock.
    day.set(h.hour, (day.get(h.hour) ?? 0) + h.usedL);
  }
  return grid;
}

const hoursOf = (grid: Grid, date: string) => [...(grid.get(date)?.keys() ?? [])].sort((a, b) => a - b);

function pastDates(date: string, days = LOOKBACK_DAYS): string[] {
  const out = [];
  for (let i = 1; i <= days; i++) out.push(addDays(date, -i));
  return out;
}

/** Past values of one clock hour. */
function hourHistory(grid: Grid, date: string, hour: number): number[] {
  return pastDates(date)
    .map((d) => grid.get(d)?.get(hour))
    .filter((v): v is number => v !== undefined);
}

/**
 * The most the hours a day could not see might change a comparison by: what
 * that clock hour uses on a heavy (85th percentile) day. An hour with too
 * little history to say is unbounded.
 */
function missingSlack(grid: Grid, date: string, missing: number[]): number {
  let slack = 0;
  for (const h of missing) {
    const past = hourHistory(grid, date, h);
    if (past.length < 3) return Infinity;
    slack += quantile(past, BAND);
  }
  return slack;
}

interface Comparison {
  /** Comparable earlier days. */
  n: number;
  side: 'less' | 'more';
  /** Share of comparable days on that side. */
  frac: number;
  /** Typical difference from a comparable day, litres (median, signed). */
  diff: number;
  /** A comparable day's use over the shared hours (median). */
  usual: number;
  /** Lower (or higher) than every comparable day. */
  record: boolean;
}

/** Compares `date` over `hours` with earlier days that observed nearly the same hours. */
function compareDay(grid: Grid, date: string, hours: number[], noiseL: number): Comparison | null {
  const mine = grid.get(date);
  if (!mine || hours.length === 0) return null;
  const peers: { theirs: number; d: number }[] = [];
  for (const p of pastDates(date)) {
    const theirsByHour = grid.get(p);
    if (!theirsByHour) continue;
    const shared = hours.filter((h) => theirsByHour.has(h));
    if (shared.length < Math.ceil(hours.length * SHARED_HOURS)) continue;
    const a = sum(shared.map((h) => mine.get(h)!));
    const b = sum(shared.map((h) => theirsByHour.get(h)!));
    peers.push({ theirs: b, d: a - b });
  }
  if (peers.length < MIN_PEERS) return null;
  const lower = peers.filter((p) => p.d < -noiseL).length;
  const higher = peers.filter((p) => p.d > noiseL).length;
  const side = lower >= higher ? 'less' : 'more';
  const count = side === 'less' ? lower : higher;
  return {
    n: peers.length,
    side,
    frac: count / peers.length,
    diff: median(peers.map((p) => p.d)),
    usual: median(peers.map((p) => p.theirs)),
    record: count === peers.length,
  };
}

/**
 * Whether a comparison is news: on one side of nearly every comparable day,
 * by more than a few noise floors even if the unseen hours went against it.
 */
function isNews(c: Comparison | null, slack: number, noiseL: number): c is Comparison {
  if (!c || c.frac < BAND) return false;
  if ((c.side === 'less') !== c.diff < 0) return false;
  return Math.abs(c.diff) - slack >= MIN_DIFF_NOISE * noiseL;
}

/** Confidence from how many days the claim rests on: 4 days 0.67, 10 days 0.83. */
const confidence = (n: number) => n / (n + 2);

function comparisonScore(c: Comparison, noiseL: number): number {
  const surprise = (2 * c.frac - 1) * confidence(c.n);
  const impact = Math.min(1, Math.sqrt(Math.abs(c.diff) / Math.max(c.usual, 8 * noiseL)));
  return surprise * impact;
}

function insight(kind: InsightKind, score: number, facts: Facts, template: string): Insight {
  const s = Math.max(0, Math.min(1, score));
  return { kind, score: Math.round(s * 1000) / 1000, facts, template, text: fill(template, facts) };
}

// --- Insight kinds --------------------------------------------------------------

/** Today so far against earlier days over the same clock hours. */
function daySoFar(grid: Grid, input: InsightInput, rand: () => number): Insight | null {
  const { today, nowHour, noiseL } = input;
  const elapsed = Array.from({ length: nowHour }, (_, h) => h);
  const seen = hoursOf(grid, today);
  if (nowHour < 9 || seen.length < elapsed.length * MIN_COVERAGE) return null;
  const missing = elapsed.filter((h) => !seen.includes(h));
  const c = compareDay(grid, today, seen, noiseL);
  if (!isNews(c, missingSlack(grid, today, missing), noiseL)) return null;

  const less = c.side === 'less';
  const facts: Facts = {
    until: clockLabel(nowHour),
    diff_l: aboutL(Math.abs(c.diff)),
    usual_l: aboutL(c.usual),
    direction: c.side,
    days: c.n + 1,
    record: c.record ? (less ? 'lowest' : 'highest') : 'none',
  };
  // The total is only stated when every hour so far was seen.
  const whole = missing.length === 0;
  if (whole) facts.used_l = aboutL(sum(seen.map((h) => grid.get(today)!.get(h)!)));

  const templates = less
    ? c.record && whole
      ? [
          'Light day so far: about {{used_l}} L by {{until}}, the lowest of your last {{days}} days with readings. Nice.',
          'Nice, only about {{used_l}} L by {{until}}: your lightest start in {{days}} days with readings.',
        ]
      : c.record
        ? ['Lightest start of your last {{days}} days with readings: about {{diff_l}} L under usual by {{until}}. Nice.']
        : [
            'Nice, a lighter day: about {{diff_l}} L less water than usual by {{until}}.',
            'Going easy on water today: about {{diff_l}} L under your usual by {{until}}.',
          ]
    : c.record && whole
      ? ['Busy water day: about {{used_l}} L by {{until}}, the most in your last {{days}} days with readings.']
      : [
          'Heavier than usual today: about {{diff_l}} L more water than a typical day by {{until}}.',
          'About {{diff_l}} L more water than usual so far today, as of {{until}}.',
        ];
  return insight('day_so_far', (c.record ? 1 : 0.9) * comparisonScore(c, noiseL), facts, choose(templates, rand));
}

/** Yesterday against earlier days, for the midday slot. */
function yesterdayRank(grid: Grid, input: InsightInput, rand: () => number): Insight | null {
  const { noiseL } = input;
  const date = addDays(input.today, -1);
  const seen = hoursOf(grid, date);
  if (seen.length < WHOLE_DAY_HOURS) return null;
  const missing = Array.from({ length: 24 }, (_, h) => h).filter((h) => !seen.includes(h));
  const c = compareDay(grid, date, seen, noiseL);
  if (!isNews(c, missingSlack(grid, date, missing), noiseL)) return null;

  const less = c.side === 'less';
  const facts: Facts = {
    diff_l: aboutL(Math.abs(c.diff)),
    direction: c.side,
    days: c.n + 1,
    record: c.record ? (less ? 'lowest' : 'highest') : 'none',
  };
  const templates = less
    ? c.record
      ? ['Yesterday was your lightest of the last {{days}} days with readings, about {{diff_l}} L under a usual day. Nice.']
      : ['Nice: yesterday used about {{diff_l}} L less water than a usual day.']
    : c.record
      ? ['Yesterday was your heaviest of the last {{days}} days with readings, about {{diff_l}} L over a usual day.']
      : ['Yesterday used about {{diff_l}} L more water than a usual day.'];
  return insight('yesterday_rank', 0.9 * comparisonScore(c, noiseL), facts, choose(templates, rand));
}

/** One hour today far above what that clock hour usually uses. */
function unusualHour(grid: Grid, input: InsightInput, rand: () => number): Insight | null {
  const { today, noiseL } = input;
  let best: Insight | null = null;
  for (const hour of hoursOf(grid, today)) {
    const past = hourHistory(grid, today, hour);
    if (past.length < 5) continue;
    const used = grid.get(today)!.get(hour)!;
    const usual = median(past);
    if (used < quantile(past, BAND) + 2 * noiseL || used - usual < MIN_DIFF_NOISE * noiseL) continue;
    const surprise = confidence(past.length) * (used > Math.max(...past) ? 1 : 0.8);
    const impact = Math.min(1, (used - usual) / (8 * noiseL));
    const quiet = usual < noiseL;
    const facts: Facts = {
      range: hourRange(hour),
      used_l: aboutL(used),
      usual_l: quiet ? 0 : aboutL(usual),
      direction: 'more',
    };
    const templates = quiet
      ? [
          '{{range}} used about {{used_l}} L today, an hour that is usually quiet.',
          'Unusual hour: about {{used_l}} L went between {{range}} today, a time you rarely use water.',
        ]
      : [
          '{{range}} used about {{used_l}} L today, against about {{usual_l}} L on a usual day.',
          'Heavy hour: {{range}} took about {{used_l}} L today; that hour usually sees about {{usual_l}} L.',
        ];
    const candidate = insight('unusual_hour', 0.9 * surprise * impact, facts, choose(templates, rand));
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

/** Today's heaviest hour is not the hour that usually is. */
function peakShift(grid: Grid, input: InsightInput, rand: () => number): Insight | null {
  const { today, noiseL } = input;
  const peakOf = (date: string) => {
    let top: { hour: number; used: number } | null = null;
    for (const [hour, used] of grid.get(date) ?? []) {
      if (!top || used > top.used || (used === top.used && hour < top.hour)) top = { hour, used };
    }
    return top;
  };
  const peaks = pastDates(today)
    .filter((d) => hoursOf(grid, d).length >= WHOLE_DAY_HOURS)
    .map(peakOf)
    .filter((p): p is { hour: number; used: number } => !!p && p.used >= MIN_DIFF_NOISE * noiseL);
  if (peaks.length < 5) return null;
  const counts = new Map<number, number>();
  for (const p of peaks) counts.set(p.hour, (counts.get(p.hour) ?? 0) + 1);
  const [usualHour, usualCount] = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const habit = usualCount / peaks.length;
  if (habit < 0.4) return null;

  const mine = grid.get(today);
  // The usual peak hour must have been seen today, or it may just have been missed.
  if (!mine?.has(usualHour)) return null;
  const top = peakOf(today)!;
  if (Math.abs(top.hour - usualHour) < 2) return null;
  if (top.used < MIN_DIFF_NOISE * noiseL || top.used < mine.get(usualHour)! + 2 * noiseL) return null;

  const facts: Facts = { range: hourRange(top.hour), used_l: aboutL(top.used), usual_range: hourRange(usualHour) };
  const templates = [
    'Your busiest water hour today was {{range}} (about {{used_l}} L), not your usual {{usual_range}}.',
    'A different rhythm today: the heaviest hour was {{range}}, about {{used_l}} L. Usually it is {{usual_range}}.',
  ];
  const score = 0.7 * habit * confidence(peaks.length) * Math.min(1, top.used / (8 * noiseL));
  return insight('peak_shift', score, facts, choose(templates, rand));
}

/** The tank refilled more often than usual today. */
function refillsToday(grid: Grid, input: InsightInput, rand: () => number): Insight | null {
  const { today, nowHour } = input;
  if (hoursOf(grid, today).length < nowHour * MIN_COVERAGE) return null;
  const refills = new Map(input.days.map((d) => [d.date, d.refills]));
  const mine = refills.get(today);
  const past = pastDates(today)
    .filter((d) => hoursOf(grid, d).length >= WHOLE_DAY_HOURS && refills.has(d))
    .map((d) => refills.get(d)!);
  if (mine === undefined || past.length < 5 || mine < 3) return null;
  const usual = median(past);
  // One refill more is a pump cycle, not news, even when it is a record.
  if (mine < usual + 2) return null;
  const record = mine > Math.max(...past);
  const facts: Facts = { refills: mine, usual_refills: Math.round(usual), direction: 'more' };
  const templates = [
    'The tank refilled {{refills}} times today; {{usual_refills}} is more typical.',
    'Busy pump day: {{refills}} refills so far today, against a usual {{usual_refills}}.',
  ];
  const score = 0.7 * confidence(past.length) * (record ? 1 : 0.8) * Math.min(1, (mine - usual) / 3);
  return insight('refills_today', score, facts, choose(templates, rand));
}

/**
 * A week's usual day: the sum over clock hours of each hour's mean use. Means,
 * not medians - use comes in bursts, and summed medians undercount it.
 */
function weekDay(grid: Grid, dates: string[]): number | null {
  let total = 0;
  for (let h = 0; h < 24; h++) {
    const vals = dates.map((d) => grid.get(d)?.get(h)).filter((v): v is number => v !== undefined);
    if (vals.length < 3) return null;
    total += mean(vals);
  }
  return total;
}

/** This week's usual day against last week's. */
function weekVsLast(grid: Grid, input: InsightInput, rand: () => number): Insight | null {
  const { today, noiseL } = input;
  const range = (from: number) => Array.from({ length: 7 }, (_, i) => addDays(today, -(from + i)));
  const thisWeek = weekDay(grid, range(1));
  const lastWeek = weekDay(grid, range(8));
  if (thisWeek == null || lastWeek == null || lastWeek <= 0) return null;
  const change = (thisWeek - lastWeek) / lastWeek;
  if (Math.abs(change) < 0.1 || Math.abs(thisWeek - lastWeek) < MIN_DIFF_NOISE * noiseL) return null;
  const less = change < 0;
  const facts: Facts = {
    change_pct: Math.round(Math.abs(change) * 100),
    direction: less ? 'less' : 'more',
    this_week_l: aboutL(thisWeek),
    last_week_l: aboutL(lastWeek),
  };
  const templates = less
    ? [
        'Good week: you used about {{change_pct}}% less water a day than the week before.',
        'This week averaged about {{this_week_l}} L a day, {{change_pct}}% less than last week. Nice.',
      ]
    : [
        'This week averaged about {{change_pct}}% more water a day than the week before.',
        'About {{this_week_l}} L a day this week, up {{change_pct}}% on last week.',
      ];
  return insight('week_vs_last', 0.9 * Math.min(1, Math.abs(change) / 0.3), facts, choose(templates, rand));
}

/** Several lighter-than-usual days in a row, today included. */
function lowStreak(grid: Grid, input: InsightInput, rand: () => number): Insight | null {
  const { today, noiseL } = input;
  const below = (date: string, hours: number[]) => {
    const c = compareDay(grid, date, hours, noiseL);
    return !!c && c.side === 'less' && c.frac >= 0.6 && c.diff < -2 * noiseL;
  };
  const seen = hoursOf(grid, today);
  if (seen.length < input.nowHour * MIN_COVERAGE || !below(today, seen)) return null;
  let streak = 1;
  for (let i = 1; i <= 7; i++) {
    const date = addDays(today, -i);
    const hours = hoursOf(grid, date);
    if (hours.length < WHOLE_DAY_HOURS || !below(date, hours)) break;
    streak++;
  }
  if (streak < 3) return null;
  const facts: Facts = { days: streak, direction: 'less' };
  const templates = [
    'That is {{days}} lighter-than-usual days in a row. Nice streak.',
    '{{days}} days running below your usual water use. Keep it up.',
  ];
  return insight('low_streak', Math.min(0.9, 0.5 + 0.1 * (streak - 3)), facts, choose(templates, rand));
}

/**
 * Last night: every hour midnight-5 AM today seen, and no drop beyond the
 * noise floor. Only news right after a night that did see use; otherwise it
 * is the usual state and scores too low for midday, only an evening filler.
 */
function quietNight(grid: Grid, input: InsightInput): Insight | null {
  const { today, noiseL } = input;
  const night = (date: string) => {
    const hours = grid.get(date);
    const vals = [];
    for (let h = NIGHT_START; h < NIGHT_END; h++) {
      const v = hours?.get(h);
      if (v === undefined) return null;
      vals.push(v);
    }
    return sum(vals);
  };
  const used = night(today);
  if (used == null || used > noiseL) return null;
  const nightBefore = night(addDays(today, -1)) ?? 0;
  const news = nightBefore >= 2 * noiseL;
  const facts: Facts = { night_used_l: Math.round(used), from_hour: NIGHT_START, to_hour: NIGHT_END };
  if (news) facts.night_before_l = aboutL(nightBefore);
  // Fixed wording: the LLM never rewords it, so it can't become a "no leak" claim.
  const template = news
    ? 'No measurable water-level drop was recorded between midnight and 5 AM, after about {{night_before_l}} L the night before.'
    : 'No measurable water-level drop was recorded between midnight and 5 AM.';
  return insight('quiet_night', news ? 0.4 : 0.15, facts, template);
}

/**
 * The evening's fallback when nothing else is news: what was recorded today so
 * far, stated for the hours actually read. Scores low, so any real comparison
 * wins the pick.
 */
function daySummary(_grid: Grid, input: InsightInput): Insight {
  const { today, nowHour, noiseL } = input;
  const hours = input.hours.filter((h) => h.date === today && h.hour < nowHour && h.observedSeconds > 0);
  const refills = input.days.find((d) => d.date === today)?.refills ?? 0;
  if (hours.length === 0) {
    const template = 'No readings have arrived from your tank yet today, so there is nothing to compare.';
    return insight('day_summary', 0.1, {}, template);
  }
  const used = sum(hours.map((h) => h.usedL));
  const observed = sum(hours.map((h) => h.observedSeconds)) / 3600;
  const facts: Facts = { until: clockLabel(nowHour), used_l: aboutL(used), refills };
  // Power cuts: say how many hours the amount covers rather than imply a whole day.
  const gaps = observed < nowHour - 0.25;
  if (gaps) facts.hours = Math.max(1, Math.floor(observed));
  const amount = used < noiseL ? 'no measurable water use' : 'about {{used_l}} L used';
  const span = !gaps ? '' : facts.hours === 1 ? ' in the one hour with readings' : ' in the {{hours}} hours with readings';
  const refilled = refills === 0 ? 'no refill yet' : refills === 1 ? 'one refill' : '{{refills}} refills';
  return insight('day_summary', 0.1, facts, `Today so far: ${amount}${span} by {{until}}, with ${refilled}.`);
}

const KINDS_BY_SLOT: Record<Slot, Array<(g: Grid, i: InsightInput, r: () => number) => Insight | null>> = {
  midday: [daySoFar, yesterdayRank, unusualHour, quietNight],
  evening: [daySoFar, unusualHour, peakShift, refillsToday, weekVsLast, lowStreak, quietNight, daySummary],
};

/** Every insight the data supports for this slot, best first. */
export function generateInsights(
  input: InsightInput,
  rand: () => number = seededRandom(`${input.today}:${input.slot}`),
): Insight[] {
  const grid = buildGrid(input);
  const out: Insight[] = [];
  for (const make of KINDS_BY_SLOT[input.slot]) {
    const i = make(grid, input, rand);
    if (i) out.push({ ...i, facts: { ...i.facts, slot: input.slot } });
  }
  return out.sort((a, b) => b.score - a.score);
}

// --- Choosing what to send, and when ---------------------------------------------

export interface SentInsight {
  kind: string;
  date: string;
}

/** Send slots in the tank's local time, and the score a fact needs to be sent in each. */
export const SLOTS: Record<Slot, { start: number; end: number; bar: number }> = {
  // Midday takes a fact with some substance; otherwise the evening, which
  // sees the most of the day, sends its best one, at worst the day summary.
  // One insight every day the tank reports.
  midday: { start: 12, end: 14, bar: 0.3 },
  evening: { start: 18, end: 20, bar: 0 },
};

/** The insight cron's period, minutes (src/jobs/cron.ts). */
export const CRON_PERIOD_MIN = 15;

/**
 * The minute of the day this user's slot is decided at, different each day so
 * it doesn't arrive like clockwork. One cron run falls in each 15-minute
 * window, so each slot is decided exactly once.
 */
export function slotTarget(seed: string, slot: Slot): number {
  const { start, end } = SLOTS[slot];
  const span = (end - start) * 60 - CRON_PERIOD_MIN;
  return start * 60 + Math.floor(seededRandom(`${seed}:${slot}:at`)() * span);
}

/** The slot to decide at this local minute of the day, if any. */
export function dueSlot(localMinutes: number, seed: string): Slot | null {
  for (const slot of Object.keys(SLOTS) as Slot[]) {
    const at = slotTarget(seed, slot);
    if (localMinutes >= at && localMinutes < at + CRON_PERIOD_MIN) return slot;
  }
  return null;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * Score after the recency penalty (Duolingo's "recovering" arms): a kind sent
 * recently is worth less, recovering with a 3-day half-life. Never the same
 * kind two days running, and week-scale kinds not within their gap.
 */
export function adjustedScore(c: Insight, recent: SentInsight[], today: string): number {
  // The day summary is the floor that keeps one insight a day; it may repeat.
  if (c.kind === 'day_summary') return c.score;
  const last = recent
    .filter((s) => s.kind === c.kind && s.date < today)
    .map((s) => daysBetween(s.date, today))
    .sort((a, b) => a - b)[0];
  if (last === undefined) return c.score;
  if (last <= Math.max(1, MIN_GAP_DAYS[c.kind] ?? 1)) return 0;
  return c.score * (1 - 0.6 * 0.5 ** (last / 3));
}

/**
 * Picks one candidate at random, weighted towards the more interesting ones,
 * among those that clear the bar after the recency penalty.
 */
export function pickInsight(
  candidates: Insight[],
  recent: SentInsight[],
  today: string,
  opts: { minScore: number; rand: () => number },
): { insight: Insight; adjusted: number } | null {
  const eligible = candidates
    .map((insight) => ({ insight, adjusted: adjustedScore(insight, recent, today) }))
    .filter((c) => c.adjusted >= opts.minScore && c.adjusted > 0);
  if (eligible.length === 0) return null;
  const weights = eligible.map((c) => c.adjusted ** 3);
  let r = opts.rand() * sum(weights);
  for (let i = 0; i < eligible.length; i++) {
    r -= weights[i];
    if (r < 0) return eligible[i];
  }
  return eligible[eligible.length - 1];
}

// --- LLM rewording guard -------------------------------------------------------

const HEDGE = /\b(about|around|roughly|approximately|estimated)\b/i;
const MORE_WORDS = /\b(more|most|higher|heavier|heaviest|above|over|up|increased?)\b/i;
const LESS_WORDS = /\b(less|least|lower|lowest|lighter|lightest|below|under|down|fewer|decreased?)\b/i;

/**
 * The LLM may only reword the template. Its sentence must keep exactly the
 * same placeholders and write no digits (the server fills every number), keep
 * an "about" where the template hedges an estimate, never flip the direction
 * of a comparison, and fit a notification once filled.
 */
export function validateRephrase(rephrased: string, insight: Insight): boolean {
  const text = rephrased.trim();
  if (!text || /\d/.test(text)) return false;
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  if (!same(placeholders(text), placeholders(insight.template))) return false;
  if (HEDGE.test(insight.template) && !HEDGE.test(text)) return false;
  if (insight.facts.direction === 'less' && MORE_WORDS.test(text)) return false;
  if (insight.facts.direction === 'more' && LESS_WORDS.test(text)) return false;
  return fill(text, insight.facts).length <= 160;
}
