import type { TankEvent, UsageHistory } from '@/api/schemas';
import type { UsageSlot } from '@/lib/usage-chart';

/**
 * What the usage panel shows when the sensor has gone quiet: the last day it
 * reported, instead of 24 empty hours. Pure, so the day and hour maths -
 * which must happen in the TANK's timezone - are tested.
 */

const parts = (date: Date, timeZone: string) => {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  }).formatToParts(date)) {
    out[p.type] = p.value;
  }
  return out;
};

/** The tank-local calendar date of an instant, as YYYY-MM-DD. */
export function localDateIn(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The tank-local hour (0-23) of an instant. */
export function localHourIn(date: Date, timeZone: string): number {
  return Number(parts(date, timeZone).hour) % 24;
}

/** Fill and draw episodes that started on `day` (tank-local), oldest first. */
export function eventsOnDay(events: TankEvent[], day: string, timeZone: string): TankEvent[] {
  return events
    .filter((e) => localDateIn(new Date(e.started_at), timeZone) === day)
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
}

function hourLabel(hour: number): string {
  return new Date(2026, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });
}

/**
 * One day's hours as chart slots. A single-day /usage/history response's
 * by_hour IS that day's use per hour (one sample each; hours without
 * readings come back null and are drawn dashed). It carries no fills, so
 * each fill episode's litres are booked to the hour it started.
 */
export function dayHourSlots(day: UsageHistory, fills: TankEvent[], timeZone: string): UsageSlot[] {
  const filledByHour = new Map<number, number>();
  for (const e of fills) {
    if (e.kind !== 'fill' || e.volume_l == null) continue;
    const h = localHourIn(new Date(e.started_at), timeZone);
    filledByHour.set(h, (filledByHour.get(h) ?? 0) + e.volume_l);
  }
  return day.by_hour.map((h) => ({
    key: String(h.hour),
    tick: hourLabel(h.hour),
    title: `${hourLabel(h.hour)} – ${hourLabel((h.hour + 1) % 24)}`,
    usedL: h.samples > 0 ? h.average_l : null,
    filledL: filledByHour.get(h.hour) ?? 0,
  }));
}
