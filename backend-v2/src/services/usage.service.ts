import { Device } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { addDays, localDate, localHour, localHourStart, startOfLocalDay } from '../lib/local-time';
import {
  DayInput,
  FULL_DAY_HOURS,
  Group,
  autoGroup,
  byHourOfDay,
  byWeekday,
  daysBetween,
  groupDays,
  summarize,
} from '../lib/usage-history';
import { capacityOf, timeZoneOf } from './rollup.service';

// Usage history, read from the rollups rollup.service maintains:
// daily_summaries per local day, hourly_usage per local hour.
//
// Those tables used to be avoided here because they froze litres at the time
// they were written. They are now rebuilt whenever the tank profile or
// timezone changes, so they agree with every read-time volume in the app.

const MAX_DAYS = 365;

const num = (v: { toNumber(): number } | null | undefined) => (v == null ? null : v.toNumber());
const round = (v: number | null, digits = 1) => (v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits);

export interface UsageDay {
  date: string;
  used_l: number | null;
  min_l: number | null;
  avg_l: number | null;
  max_l: number | null;
  refill_events: number;
  leak_suspected: boolean;
  readings: number;
}

export async function getDeviceUsage(device: Device, days: number, now = new Date()) {
  if (days < 1 || days > MAX_DAYS) {
    throw new HttpError(400, `days must be between 1 and ${MAX_DAYS}`);
  }

  const timeZone = timeZoneOf(device);
  const today = localDate(now, timeZone);
  const firstDay = addDays(today, -(days - 1));
  const from = startOfLocalDay(firstDay, timeZone);

  const [profile, summaries] = await Promise.all([
    prisma.tankProfile.findUnique({ where: { deviceId: device.id } }),
    prisma.dailySummary.findMany({
      where: {
        deviceId: device.id,
        date: { gte: new Date(`${firstDay}T00:00:00.000Z`), lte: new Date(`${today}T00:00:00.000Z`) },
      },
      orderBy: { date: 'asc' },
    }),
  ]);
  const capacityL = capacityOf(profile);

  const usageDays: UsageDay[] = summaries.map((s) => ({
    date: s.date.toISOString().slice(0, 10),
    used_l: round(s.totalUsageL.toNumber()),
    min_l: round(num(s.minVolumeL)),
    avg_l: round(num(s.avgVolumeL)),
    max_l: round(num(s.maxVolumeL)),
    refill_events: s.refillEvents,
    leak_suspected: s.leakSuspected,
    readings: s.readings,
  }));

  // Today is still running, so it is left out of the daily average.
  const complete = usageDays.filter((d) => d.date !== today);
  const totalUsed = usageDays.reduce((sum, d) => sum + (d.used_l ?? 0), 0);
  const completeUsed = complete.reduce((sum, d) => sum + (d.used_l ?? 0), 0);

  return {
    device_id: device.deviceId,
    from: from.toISOString(),
    to: now.toISOString(),
    has_tank_profile: profile != null,
    capacity_l: round(capacityL),
    days: usageDays,
    totals: {
      used_l: round(totalUsed),
      daily_average_l: complete.length ? round(completeUsed / complete.length) : null,
      refill_events: usageDays.reduce((sum, d) => sum + d.refill_events, 0),
      leak_days: usageDays.filter((d) => d.leak_suspected).length,
      days_with_data: usageDays.length,
      days_aggregated: usageDays.length,
    },
  };
}

export type HourlyRange = 'today' | '24h';

/**
 * Litres used and filled per local hour, for the Today and Last 24 hours
 * views. Only hours with readings come back; an hour missing from the list
 * had no data, which is not the same as zero use.
 */
export async function getHourlyUsage(device: Device, range: HourlyRange, now = new Date()) {
  const timeZone = timeZoneOf(device);
  const today = localDate(now, timeZone);
  const HOUR = 60 * 60 * 1000;

  const from =
    range === 'today'
      ? startOfLocalDay(today, timeZone)
      : // The 24 local hours ending with the current one.
        localHourStart(new Date(now.getTime() - 23 * HOUR), timeZone);

  const rows = await prisma.hourlyUsage.findMany({
    where: { deviceId: device.id, hourStart: { gte: from, lte: now } },
    orderBy: { hourStart: 'asc' },
  });

  const hours = rows.map((r) => ({
    hour_start: r.hourStart.toISOString(),
    used_l: round(r.usedL.toNumber()),
    filled_l: round(r.filledL.toNumber()),
    min_l: round(num(r.minL)),
    max_l: round(num(r.maxL)),
    avg_l: round(num(r.avgL)),
    readings: r.readings,
  }));

  const todaySummary = await prisma.dailySummary.findUnique({
    where: { deviceId_date: { deviceId: device.id, date: new Date(`${today}T00:00:00.000Z`) } },
    select: { totalUsageL: true, totalFilledL: true },
  });

  return {
    device_id: device.deviceId,
    timezone: timeZone,
    range,
    from: from.toISOString(),
    to: now.toISOString(),
    hours,
    totals: {
      used_l: round(hours.reduce((sum, h) => sum + (h.used_l ?? 0), 0)),
      filled_l: round(hours.reduce((sum, h) => sum + (h.filled_l ?? 0), 0)),
    },
    today: {
      date: today,
      used_l: todaySummary ? round(todaySummary.totalUsageL.toNumber()) : 0,
      filled_l: todaySummary ? round(todaySummary.totalFilledL.toNumber()) : 0,
    },
  };
}

export type EventRange = 'today' | '24h' | '7d';

/** Fill and draw episodes, newest first, for the activity timeline. */
export async function getTankEvents(device: Device, range: EventRange, now = new Date()) {
  const timeZone = timeZoneOf(device);
  const today = localDate(now, timeZone);
  const from =
    range === 'today'
      ? startOfLocalDay(today, timeZone)
      : range === '7d'
        ? startOfLocalDay(addDays(today, -6), timeZone)
        : new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // An episode that started before the window but was still running into it
  // belongs in the timeline too.
  const rows = await prisma.tankEvent.findMany({
    where: { deviceId: device.id, endedAt: { gte: from }, startedAt: { lte: now } },
    orderBy: { startedAt: 'desc' },
  });

  const events = rows.map((e) => ({
    id: e.id,
    kind: e.kind,
    started_at: e.startedAt.toISOString(),
    ended_at: e.endedAt.toISOString(),
    start_l: round(e.startL.toNumber()),
    end_l: round(e.endL.toNumber()),
    volume_l: round(e.volumeL.toNumber()),
    rate_l_per_min: round(e.rateLPerMin.toNumber(), 2),
    readings: e.readings,
    ongoing: e.ongoing,
  }));
  const sum = (kind: 'fill' | 'draw') =>
    round(events.filter((e) => e.kind === kind).reduce((total, e) => total + (e.volume_l ?? 0), 0));

  return {
    device_id: device.deviceId,
    timezone: timeZone,
    range,
    from: from.toISOString(),
    to: now.toISOString(),
    events,
    totals: {
      fills: events.filter((e) => e.kind === 'fill').length,
      draws: events.filter((e) => e.kind === 'draw').length,
      filled_l: sum('fill'),
      drawn_l: sum('draw'),
    },
  };
}

/** Sets the zone a tank's days and hours are cut in, then rebuilds its rollups. */
export async function setDeviceTimezone(device: Device, timezone: string | null) {
  await prisma.device.update({ where: { id: device.id }, data: { timezone } });
  return { timezone: timezone ?? timeZoneOf({ timezone: null }), is_default: timezone == null };
}

const MAX_HISTORY_DAYS = 400;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Usage over any range, grouped by day, week or month, with the patterns
 * that make it readable: daily average, busiest and quietest day, average by
 * weekday and by hour of the day. Built from the rollups, so it costs two
 * indexed queries whatever the range.
 */
export async function getUsageHistory(
  device: Device,
  opts: { from?: string; to?: string; group?: Group },
  now = new Date()
) {
  const timeZone = timeZoneOf(device);
  const today = localDate(now, timeZone);
  const to = opts.to ?? today;
  const from = opts.from ?? addDays(to, -29);
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) throw new HttpError(400, 'from and to must be YYYY-MM-DD');
  const span = daysBetween(from, to);
  if (span < 1) throw new HttpError(400, 'to must be on or after from');
  if (span > MAX_HISTORY_DAYS) throw new HttpError(400, `Choose at most ${MAX_HISTORY_DAYS} days`);
  const group = opts.group ?? autoGroup(span);

  const start = startOfLocalDay(from, timeZone);
  const end = startOfLocalDay(addDays(to, 1), timeZone);
  const [profile, summaries, hourRows] = await Promise.all([
    prisma.tankProfile.findUnique({ where: { deviceId: device.id } }),
    prisma.dailySummary.findMany({
      where: { deviceId: device.id, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      orderBy: { date: 'asc' },
    }),
    prisma.hourlyUsage.findMany({
      where: { deviceId: device.id, hourStart: { gte: start, lt: end }, readings: { gt: 0 } },
      select: { hourStart: true, usedL: true },
    }),
  ]);

  // Hours with readings per local day: how much of each day the device saw.
  const hoursByDate = new Map<string, number>();
  for (const h of hourRows) {
    const date = localDate(h.hourStart, timeZone);
    hoursByDate.set(date, (hoursByDate.get(date) ?? 0) + 1);
  }
  const days: DayInput[] = summaries.map((s) => {
    const date = s.date.toISOString().slice(0, 10);
    return {
      date,
      usedL: s.totalUsageL.toNumber(),
      filledL: s.totalFilledL.toNumber(),
      refills: s.refillEvents,
      leak: s.leakSuspected,
      hoursWithData: hoursByDate.get(date) ?? 0,
    };
  });

  const summary = summarize(days);
  return {
    device_id: device.deviceId,
    timezone: timeZone,
    from,
    to,
    group,
    today,
    capacity_l: round(capacityOf(profile)),
    full_day_hours: FULL_DAY_HOURS,
    buckets: groupDays(days, from, to, group).map((b) => ({
      key: b.key,
      start: b.start,
      end: b.end,
      used_l: round(b.usedL),
      filled_l: round(b.filledL),
      refills: b.refills,
      leak_days: b.leakDays,
      days_with_data: b.daysWithData,
      full_days: b.fullDays,
    })),
    totals: {
      used_l: round(summary.usedL),
      filled_l: round(summary.filledL),
      refills: summary.refills,
      days: span,
      days_with_data: summary.daysWithData,
      full_days: summary.fullDays,
      daily_average_l: round(summary.dailyAverageL),
      busiest_day: summary.busiestDay && { date: summary.busiestDay.date, used_l: round(summary.busiestDay.usedL)! },
      quietest_day: summary.quietestDay && { date: summary.quietestDay.date, used_l: round(summary.quietestDay.usedL)! },
    },
    by_weekday: byWeekday(days).map((w) => ({ weekday: w.weekday, average_l: round(w.averageL), days: w.days })),
    by_hour: byHourOfDay(hourRows.map((h) => ({ hour: localHour(h.hourStart, timeZone), usedL: h.usedL.toNumber() }))).map(
      (h) => ({ hour: h.hour, average_l: round(h.averageL), samples: h.samples })
    ),
  };
}
