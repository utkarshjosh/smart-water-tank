import { addDays } from './local-time';

/**
 * Groups daily usage into days, weeks or months and works out the patterns a
 * person asks about: what's normal per day, which day was heaviest, which
 * weekdays and hours of the day the water goes. Pure; usage.service feeds it
 * rows from daily_summaries and hourly_usage.
 *
 * Averages only count nearly complete days: all but 15 minutes observed.
 * Local day lengths account for daylight-saving changes. A day the device was off for half of reads as half the use, and
 * letting it into an average would make "the sensor was unplugged" look like
 * "we used less water".
 */

export const FULL_DAY_HOURS = 23.75;

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
}

/** A gap longer than 15 minutes disqualifies a day from a daily comparison. */
export function isCompleteDay(day: Pick<DayInput, 'hoursWithData' | 'expectedHours'>): boolean {
  return (
    Number.isFinite(day.hoursWithData) &&
    day.hoursWithData >= (day.expectedHours ?? 24) - (24 - FULL_DAY_HOURS)
  );
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
  }
  return [...buckets.values()];
}

export interface Summary {
  usedL: number;
  filledL: number;
  refills: number;
  daysWithData: number;
  fullDays: number;
  /** Over full days only; null when there are none. */
  dailyAverageL: number | null;
  busiestDay: { date: string; usedL: number } | null;
  quietestDay: { date: string; usedL: number } | null;
}

export function summarize(days: DayInput[]): Summary {
  const withData = days.filter((d) => d.hoursWithData > 0);
  const full = withData.filter(isCompleteDay);
  const sum = (list: DayInput[], f: (d: DayInput) => number) => list.reduce((t, d) => t + f(d), 0);
  const sorted = [...full].sort((a, b) => b.usedL - a.usedL);
  return {
    usedL: sum(withData, (d) => d.usedL),
    filledL: sum(withData, (d) => d.filledL),
    refills: sum(withData, (d) => d.refills),
    daysWithData: withData.length,
    fullDays: full.length,
    dailyAverageL: full.length ? sum(full, (d) => d.usedL) / full.length : null,
    busiestDay: sorted.length ? { date: sorted[0].date, usedL: sorted[0].usedL } : null,
    quietestDay: sorted.length
      ? { date: sorted[sorted.length - 1].date, usedL: sorted[sorted.length - 1].usedL }
      : null,
  };
}

/** Average use per weekday, Monday first, over full days only. */
export function byWeekday(
  days: DayInput[],
): Array<{ weekday: number; averageL: number | null; days: number }> {
  const totals = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
  for (const d of days) {
    if (!isCompleteDay(d)) continue;
    const t = totals[weekdayOf(d.date)];
    t.sum += d.usedL;
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
