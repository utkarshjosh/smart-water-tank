import type { TankEvent } from '@/api/schemas';

/**
 * Formatting for usage stats. Hours and times are shown in the TANK's zone -
 * the one the server cut its hours and "today" in - so an hour label and the
 * hour it describes can never disagree, whatever zone the phone is in.
 */

const HOUR_MS = 3_600_000;

/** Start of every hour from `fromMs` (an hour start) up to `toMs`. */
export function hourSlots(fromMs: number, toMs: number): number[] {
  const slots: number[] = [];
  for (let t = fromMs; t < toMs; t += HOUR_MS) slots.push(t);
  return slots;
}

/** "7 AM" (hourOnly) or "7:10 AM", in `timeZone`. */
export function formatClock(
  ms: number,
  timeZone: string,
  opts: { hourOnly?: boolean } = {},
): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    timeZone,
    hour: 'numeric',
    ...(opts.hourOnly ? {} : { minute: '2-digit' }),
  });
}

/** "6:10 AM – 6:42 AM", or one time for an episode under a minute. */
export function formatTimeRange(startIso: string, endIso: string, timeZone: string): string {
  const start = formatClock(Date.parse(startIso), timeZone);
  const end = formatClock(Date.parse(endIso), timeZone);
  return start === end ? start : `${start} – ${end}`;
}

/** "Filled 480 L" / "Using 60 L" - one line a person can read. */
export function describeEvent(event: Pick<TankEvent, 'kind' | 'volume_l' | 'ongoing'>): string {
  const label = event.kind === 'fill' ? 'Refill' : 'Water drawn';
  return event.volume_l == null
    ? `${label} recorded`
    : `${label} · about ${Math.round(event.volume_l).toLocaleString()} L`;
}

/** Local calendar date `offset` days from today, as YYYY-MM-DD. */
export function isoDay(offset = 0, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A YYYY-MM-DD as a calendar date (noon, so no zone can shift it a day). */
export function calendarDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return calendarDate(iso).toLocaleDateString(undefined, opts);
}

/** Days covered by a bucket, both ends included. */
export function spanDays(start: string, end: string): number {
  return Math.round((calendarDate(end).getTime() - calendarDate(start).getTime()) / 86_400_000) + 1;
}
