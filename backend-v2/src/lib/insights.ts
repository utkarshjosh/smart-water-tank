/**
 * Daily insight generator (experimental). Pure: takes rollup rows already
 * cut into the tank's local days and hours, returns candidate insights.
 *
 * Every candidate carries the exact facts it was computed from and a
 * pre-written sentence. Optional LLM rephrasing may only reword that sentence;
 * see validateRephrase.
 *
 * Only FULL days (FULL_DAY_HOURS of readings) are compared, so a day the
 * sensor was off for half of never reads as "low use".
 */
import { addDays } from './local-time';
import { FULL_DAY_HOURS } from './usage-history';

export type InsightKind =
  | 'yesterday_vs_normal'
  | 'busiest_day'
  | 'busiest_hour'
  | 'fills_week'
  | 'quiet_night';

export type Facts = Record<string, number | string>;

export interface Insight {
  kind: InsightKind;
  /** 0..1: how surprising or useful. */
  score: number;
  facts: Facts;
  text: string;
}

export interface InsightDay {
  date: string; // YYYY-MM-DD, local
  usedL: number;
  refills: number;
  hoursWithData: number;
}

export interface InsightHour {
  date: string; // local date
  hour: number; // local 0-23
  usedL: number;
  readings: number;
}

export interface InsightInput {
  /** The local date the insight is sent on; "yesterday" is the day before. */
  today: string;
  /** Up to the last 15 days, today included or not. */
  days: InsightDay[];
  /** Hours of yesterday and today (local). */
  hours: InsightHour[];
}

/** Below this many other full days there is no "normal" to compare against. */
export const MIN_BASELINE_DAYS = 3;
/** Smaller swings than this are not news. */
const MIN_CHANGE = 0.1;
/** Overnight window, local hours [start, end). */
const NIGHT_START = 0;
const NIGHT_END = 5;
/** Overnight draw at or below this is noise, not use. */
const QUIET_NIGHT_L = 2;

const r = Math.round;

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

function isFull(d: InsightDay | undefined): d is InsightDay {
  return !!d && d.hoursWithData >= FULL_DAY_HOURS;
}

export function generateInsights(input: InsightInput): Insight[] {
  const byDate = new Map(input.days.map((d) => [d.date, d]));
  const yesterday = addDays(input.today, -1);
  const y = byDate.get(yesterday);
  const out: Insight[] = [];

  // Baseline: full days in the 14 before yesterday.
  const baseline: InsightDay[] = [];
  for (let i = 2; i <= 15; i++) {
    const d = byDate.get(addDays(input.today, -i));
    if (isFull(d)) baseline.push(d);
  }

  if (isFull(y) && baseline.length >= MIN_BASELINE_DAYS) {
    const normal = baseline.reduce((s, d) => s + d.usedL, 0) / baseline.length;
    if (normal > 0) {
      const change = (y.usedL - normal) / normal;
      const pct = r(Math.abs(change) * 100);
      if (Math.abs(change) >= MIN_CHANGE && pct > 0) {
        const more = change > 0;
        out.push({
          kind: 'yesterday_vs_normal',
          score: Math.min(1, Math.abs(change)),
          facts: { used_l: r(y.usedL), normal_l: r(normal), change_pct: pct, direction: more ? 'more' : 'less', baseline_days: baseline.length },
          text: `Yesterday you used ${r(y.usedL)} L, ${pct}% ${more ? 'more' : 'less'} than your normal day (${r(normal)} L).`,
        });
      }
      if (y.usedL > Math.max(...baseline.map((d) => d.usedL)) && baseline.length >= 5) {
        const n = baseline.length + 1;
        out.push({
          kind: 'busiest_day',
          score: 0.8,
          facts: { used_l: r(y.usedL), days_compared: n },
          text: `Yesterday was your busiest day of the last ${n} full days: ${r(y.usedL)} L.`,
        });
      }
    }
  }

  if (isFull(y)) {
    const hours = input.hours.filter((h) => h.date === yesterday && h.readings > 0);
    const top = hours.reduce<InsightHour | null>((a, h) => (a && a.usedL >= h.usedL ? a : h), null);
    if (top && top.usedL >= 10 && y.usedL > 0) {
      const share = top.usedL / y.usedL;
      out.push({
        kind: 'busiest_hour',
        score: Math.min(1, 0.2 + share),
        facts: { hour: top.hour, range: hourRange(top.hour), used_l: r(top.usedL), share_pct: r(share * 100) },
        text: `Yesterday your busiest hour was ${hourRange(top.hour)} (${r(top.usedL)} L, ${r(share * 100)}% of the day).`,
      });
    }
  }

  // Fills: last 7 days ending yesterday vs the 7 before; each week needs 5 full days.
  const week = (endOffset: number) => {
    const ds = [];
    for (let i = endOffset; i < endOffset + 7; i++) ds.push(byDate.get(addDays(input.today, -i)));
    const full = ds.filter(isFull);
    return { full: full.length, fills: full.reduce((s, d) => s + d.refills, 0) };
  };
  const thisWeek = week(1);
  const lastWeek = week(8);
  if (thisWeek.full >= 5 && lastWeek.full >= 5 && thisWeek.fills !== lastWeek.fills) {
    const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
    out.push({
      kind: 'fills_week',
      score: Math.min(1, Math.abs(thisWeek.fills - lastWeek.fills) / Math.max(thisWeek.fills, lastWeek.fills)),
      facts: { fills: thisWeek.fills, fills_previous: lastWeek.fills },
      text: `The tank filled ${times(thisWeek.fills)} in the last 7 days, ${thisWeek.fills > lastWeek.fills ? 'up' : 'down'} from ${lastWeek.fills} the week before.`,
    });
  }

  // Last night: every hour midnight-5 AM today must have readings.
  const night = input.hours.filter((h) => h.date === input.today && h.hour >= NIGHT_START && h.hour < NIGHT_END && h.readings > 0);
  if (night.length === NIGHT_END - NIGHT_START) {
    const used = night.reduce((s, h) => s + h.usedL, 0);
    if (used <= QUIET_NIGHT_L) {
      out.push({
        kind: 'quiet_night',
        score: 0.35,
        facts: { night_used_l: r(used), from_hour: NIGHT_START, to_hour: NIGHT_END },
        text: `Nothing was drawn overnight (midnight to 5 AM), so no sign of a leak.`,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

export interface SentInsight {
  kind: string;
  date: string;
}

/**
 * At most one a day. Never the same kind as yesterday's, and a kind sent
 * often in the last week scores lower, so the user sees variety.
 */
export function pickInsight(candidates: Insight[], recent: SentInsight[], today: string): Insight | null {
  const yesterday = addDays(today, -1);
  const weekAgo = addDays(today, -7);
  let best: { i: Insight; s: number } | null = null;
  for (const c of candidates) {
    if (recent.some((s) => s.date === yesterday && s.kind === c.kind)) continue;
    const times = recent.filter((s) => s.kind === c.kind && s.date >= weekAgo && s.date < today).length;
    const s = c.score * Math.max(0.2, 1 - 0.25 * times);
    if (!best || s > best.s) best = { i: c, s };
  }
  return best?.i ?? null;
}

/** Local hour window insights may be sent in: [start, end). */
export const SEND_WINDOW = { start: 9, end: 20 };

/** Send now? Only inside waking hours, and only if nothing went out today. */
export function shouldSendNow(localHour: number, alreadySentToday: boolean, window = SEND_WINDOW): boolean {
  return !alreadySentToday && localHour >= window.start && localHour < window.end;
}

/** Every number written in `text` ("1,200", "7–8", "20%", "3.5"). */
export function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
}

/**
 * The LLM may only reword. Accept its text only if every number in it was in
 * the facts or the template sentence, and it is short enough for a push.
 */
export function validateRephrase(rephrased: string, insight: Insight): boolean {
  const text = rephrased.trim();
  if (!text || text.length > 180) return false;
  const allowed = new Set<number>(numbersIn(insight.text));
  for (const v of Object.values(insight.facts)) {
    if (typeof v === 'number') allowed.add(v);
    else numbersIn(v).forEach((n) => allowed.add(n));
  }
  return numbersIn(text).every((n) => allowed.has(n));
}
