import { addDays } from './local-time';

/**
 * Groups daily usage into days, weeks or months and works out the patterns a
 * person asks about: what's normal per day, which day was heaviest, which
 * weekdays and hours of the day the water goes. Pure; usage.service feeds it
 * rows from daily_summaries and hourly_usage.
 *
 * Averages and day-to-day comparisons only count well-covered days: at least
 * 20 hours observed, with the rest filled in from the usual use at those clock
 * hours (see fillGaps). A day the device was off for half of reads as half the
 * use, and letting it in as recorded would make "the power was cut" look like
 * "we used less water". Totals and per-day bars stay as recorded.
 * Local day lengths account for daylight-saving changes.
 */

export const FULL_DAY_HOURS = 20;
/** Unobserved time that may go unfilled: no usual figure, or not over yet. */
const MAX_UNKNOWN_HOURS = 0.25;
/** A clock hour needs this many fully observed samples to stand in for a gap. */
const MIN_USUAL_SAMPLES = 3;

export type Group = 'day' | 'week' | 'month';

export interface DayInput {
  date: string; // YYYY-MM-DD, local
  usedL: number;
  filledL: number;
  refills: number;
  leak: boolean;
  /** Observed hours bounded by consecutive usable samples; may be fractional. */
  hoursWithData: number;
  /** Actual local day duration, including daylight-saving changes. */
  expectedHours?: number;
  /** Litres estimated for unobserved time from the usual use at those hours. */
  gapFillL?: number;
  /** Unobserved hours nothing could fill. Defaults to all unobserved time. */
  unknownHours?: number;
}

type Coverage = Pick<DayInput, 'hoursWithData' | 'expectedHours' | 'unknownHours'>;
const missingHours = (day: Coverage) => (day.expectedHours ?? 24) - day.hoursWithData;

/**
 * At least 20 hours observed, and no more than 15 minutes of the rest left
 * unaccounted for. Without usual-hour figures that is the old rule: all but 15
 * minutes observed.
 */
export function isCompleteDay(day: Coverage): boolean {
  return (
    Number.isFinite(day.hoursWithData) &&
    missingHours(day) <= 24 - FULL_DAY_HOURS &&
    (day.unknownHours ?? missingHours(day)) <= MAX_UNKNOWN_HOURS
  );
}

/** A counted day whose missing time was filled in rather than observed. */
export function isEstimatedDay(day: Coverage): boolean {
  return isCompleteDay(day) && missingHours(day) > MAX_UNKNOWN_HOURS;
}

/** What averages and comparisons use: recorded use plus the filled gaps. */
export function estimatedUseL(day: Pick<DayInput, 'usedL' | 'gapFillL'>): number {
  return day.usedL + (day.gapFillL ?? 0);
}

/**
 * Usual litres per clock hour (0-23) from fully observed hours, or null when
 * an hour has too few samples to stand in for a gap.
 */
export function usualHours(hours: Array<{ hour: number; usedL: number }>): Array<number | null> {
  return byHourOfDay(hours).map((h) => (h.samples >= MIN_USUAL_SAMPLES ? h.averageL : null));
}

/**
 * Fills each local hour's unobserved share with the usual use at that hour.
 * Hours not over yet, or with no usual figure, stay unknown: today is never
 * finished off with a guess about the rest of it.
 */
export function fillGaps(
  slots: Array<{ hour: number; observedSeconds: number; over: boolean }>,
  usual: Array<number | null>,
): { gapFillL: number; unknownHours: number } {
  let gapFillL = 0;
  let unknownHours = 0;
  for (const s of slots) {
    const missing = Math.max(0, 3600 - s.observedSeconds) / 3600;
    if (!missing) continue;
    const litres = s.over ? usual[s.hour] : null;
    if (litres == null) unknownHours += missing;
    else gapFillL += litres * missing;
  }
  return { gapFillL, unknownHours };
}

export interface Bucket {
  key: string;
  /** First and last local date in the bucket, clipped to the range. */
  start: string;
  end: string;
  usedL: number | null;
  filledL: number | null;
  refills: number;
  leakDays: number;
  daysWithData: number;
  fullDays: number;
  /** Of fullDays, those with gaps filled in. */
  estimatedDays: number;
}

/** Days for short ranges, weeks up to ~6 months, months beyond. */
export function autoGroup(days: number): Group {
  if (days <= 45) return 'day';
  if (days <= 200) return 'week';
  return 'month';
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayOf(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function bucketKey(date: string, group: Group): string {
  if (group === 'day') return date;
  if (group === 'month') return date.slice(0, 7);
  return addDays(date, -weekdayOf(date)); // the Monday
}

export function daysBetween(from: string, to: string): number {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  );
}

/** Every bucket from `from` to `to`, including empty ones, so gaps show as gaps. */
export function groupDays(days: DayInput[], from: string, to: string, group: Group): Bucket[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const buckets = new Map<string, Bucket>();
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const key = bucketKey(date, group);
    let b = buckets.get(key);
    if (!b) {
      b = {
        key,
        start: date,
        end: date,
        usedL: null,
        filledL: null,
        refills: 0,
        leakDays: 0,
        daysWithData: 0,
        fullDays: 0,
        estimatedDays: 0,
      };
      buckets.set(key, b);
    }
    b.end = date;
    const d = byDate.get(date);
    if (!d || d.hoursWithData === 0) continue;
    b.usedL = (b.usedL ?? 0) + d.usedL;
    b.filledL = (b.filledL ?? 0) + d.filledL;
    b.refills += d.refills;
    b.leakDays += d.leak ? 1 : 0;
    b.daysWithData += 1;
    b.fullDays += isCompleteDay(d) ? 1 : 0;
    b.estimatedDays += isEstimatedDay(d) ? 1 : 0;
  }
  return [...buckets.values()];
}

export interface Summary {
  usedL: number;
  filledL: number;
  refills: number;
  daysWithData: number;
  fullDays: number;
  estimatedDays: number;
  /** Over full days only, gaps filled; null when there are none. */
  dailyAverageL: number | null;
  /** Full days only, gaps filled. */
  busiestDay: { date: string; usedL: number } | null;
  quietestDay: { date: string; usedL: number } | null;
}

export function summarize(days: DayInput[]): Summary {
  const withData = days.filter((d) => d.hoursWithData > 0);
  const full = withData
    .filter(isCompleteDay)
    .map((d) => ({ date: d.date, usedL: estimatedUseL(d) }));
  const sum = <T>(list: T[], f: (d: T) => number) => list.reduce((t, d) => t + f(d), 0);
  const sorted = [...full].sort((a, b) => b.usedL - a.usedL);
  return {
    usedL: sum(withData, (d) => d.usedL),
    filledL: sum(withData, (d) => d.filledL),
    refills: sum(withData, (d) => d.refills),
    daysWithData: withData.length,
    fullDays: full.length,
    estimatedDays: withData.filter(isEstimatedDay).length,
    dailyAverageL: full.length ? sum(full, (d) => d.usedL) / full.length : null,
    busiestDay: sorted[0] ?? null,
    quietestDay: sorted[sorted.length - 1] ?? null,
  };
}

/** Average use per weekday, Monday first, over full days only, gaps filled. */
export function byWeekday(
  days: DayInput[],
): Array<{ weekday: number; averageL: number | null; days: number }> {
  const totals = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
  for (const d of days) {
    if (!isCompleteDay(d)) continue;
    const t = totals[weekdayOf(d.date)];
    t.sum += estimatedUseL(d);
    t.n += 1;
  }
  return totals.map((t, weekday) => ({ weekday, averageL: t.n ? t.sum / t.n : null, days: t.n }));
}

/**
 * Average use per hour of the day (0-23), over hours that had readings. This
 * is the "typical day" shape: when the morning rush starts, whether the night
 * is really quiet (a night draw is how a leak shows up).
 */
export function byHourOfDay(
  hours: Array<{ hour: number; usedL: number }>,
): Array<{ hour: number; averageL: number | null; samples: number }> {
  const totals = Array.from({ length: 24 }, () => ({ sum: 0, n: 0 }));
  for (const h of hours) {
    totals[h.hour].sum += h.usedL;
    totals[h.hour].n += 1;
  }
  return totals.map((t, hour) => ({ hour, averageL: t.n ? t.sum / t.n : null, samples: t.n }));
}
