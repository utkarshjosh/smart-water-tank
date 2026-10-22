import type { TankEvent } from '@aquamind/contracts';

/**
 * Formatting for usage stats. Times are shown in the TANK's zone (the one the
 * server cut its hours and "today" in), so an hour label and the hour it
 * describes can never disagree, whatever zone the browser is in.
 */

const HOUR_MS = 3_600_000;

/** Start of every hour from `fromMs` (an hour start) up to `toMs`. */
export function hourSlots(fromMs: number, toMs: number): number[] {
  const slots: number[] = [];
  for (let t = fromMs; t < toMs; t += HOUR_MS) slots.push(t);
  return slots;
}

/** "14:00" / "2 PM" depending on locale; `hourOnly` drops the minutes. */
export function formatClock(
  ms: number,
  timeZone: string,
  opts: { hourOnly?: boolean } = {}
): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    timeZone,
    hour: 'numeric',
    ...(opts.hourOnly ? {} : { minute: '2-digit' }),
  });
}

export function formatLitres(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${Math.round(value).toLocaleString()} L`;
}

/** "06:10–06:42", or a single time for an episode under a minute. */
export function formatTimeRange(startIso: string, endIso: string, timeZone: string): string {
  const start = formatClock(Date.parse(startIso), timeZone);
  const end = formatClock(Date.parse(endIso), timeZone);
  return start === end ? start : `${start}–${end}`;
}

/** One line a person can read: "Filled 480 L" / "Used 60 L". */
export function describeEvent(event: Pick<TankEvent, 'kind' | 'volume_l' | 'ongoing'>): string {
  const label = event.kind === 'fill' ? 'Refill' : 'Water drawn';
  return event.volume_l == null
    ? `${label} recorded`
    : `${label} · about ${Math.round(event.volume_l).toLocaleString()} L`;
}

/** The browser's zone differs from the tank's: times need a zone label. */
export function zoneDiffers(tankZone: string, viewerZone: string): boolean {
  const offset = (zone: string) =>
    new Date()
      .toLocaleString('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
      .split(' ')
      .pop();
  return tankZone !== viewerZone && offset(tankZone) !== offset(viewerZone);
}
