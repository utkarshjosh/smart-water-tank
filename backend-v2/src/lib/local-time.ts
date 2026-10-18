/**
 * Local-time arithmetic for a named IANA zone, with no dependency beyond Intl.
 *
 * Usage stats are cut by the tank's local hour and day. Hours can't be cut in
 * UTC and shifted afterwards: India is UTC+5:30, so a local hour spans two UTC
 * hours. Everything here works from the zone's actual offset at the instant in
 * question, which also keeps DST zones right.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Milliseconds the zone is ahead of UTC at this instant (+5:30 -> 19_800_000). */
export function offsetMs(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant the local hour containing `instant` began. */
export function localHourStart(instant: Date, timeZone: string): Date {
  const w = wallClock(instant, timeZone);
  const intoHourMs = (w.minute * 60 + w.second) * 1000 + (instant.getTime() % 1000);
  return new Date(instant.getTime() - intoHourMs);
}

/** The local calendar date of `instant`, as YYYY-MM-DD. */
export function localDate(instant: Date, timeZone: string): string {
  const w = wallClock(instant, timeZone);
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

/** The instant local midnight begins on `date` (YYYY-MM-DD). */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const midnightAsUtc = Date.UTC(y, m - 1, d);
  // Guess with the offset at UTC midnight, then correct once with the offset
  // at the guess - enough for any zone whose offset changes at most once a day.
  const guess = midnightAsUtc - offsetMs(new Date(midnightAsUtc), timeZone);
  return new Date(midnightAsUtc - offsetMs(new Date(guess), timeZone));
}

/** The local date `days` after `date`. Calendar arithmetic, so DST can't skew it. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
