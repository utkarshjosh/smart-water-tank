import { env } from '../config/env';
import { COMPLETE_HOUR_SECONDS, continuityGapMs } from '../lib/rollup';
import { episodeIsCurrent } from '../lib/episodes';
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
  fillGaps,
  groupDays,
  isCompleteDay,
  summarize,
  usualHours,
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
const round = (v: number | null, digits = 1) =>
  v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits;

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

  const [profile, summaries, coverage] = await Promise.all([
    prisma.tankProfile.findUnique({ where: { deviceId: device.id } }),
    prisma.dailySummary.findMany({
      where: {
        deviceId: device.id,
        date: {
          gte: new Date(`${firstDay}T00:00:00.000Z`),
          lte: new Date(`${today}T00:00:00.000Z`),
        },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.hourlyUsage.findMany({
      where: {
        deviceId: device.id,
        hourStart: { gte: from, lte: now },
        observedSeconds: { gt: 0 },
      },
      select: { hourStart: true, observedSeconds: true },
    }),
  ]);
  const capacityL = capacityOf(profile);

  const dayCoverage = new Map<string, number>();
  for (const h of coverage) {
    const day = localDate(h.hourStart, timeZone);
    dayCoverage.set(day, (dayCoverage.get(day) ?? 0) + h.observedSeconds);
  }
  const usageDays: UsageDay[] = summaries
    .filter((s) => (dayCoverage.get(s.date.toISOString().slice(0, 10)) ?? 0) > 0)
    .map((s) => ({
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
  const complete = usageDays.filter(
    (d) =>
      d.date !== today &&
      isCompleteDay({
        hoursWithData: (dayCoverage.get(d.date) ?? 0) / 3600,
        expectedHours: expectedDayHours(d.date, timeZone),
      }),
  );
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
      used_l: usageDays.length ? round(totalUsed) : null,
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

  const todayStart = startOfLocalDay(today, timeZone);
  const rows = await prisma.hourlyUsage.findMany({
    where: {
      deviceId: device.id,
      hourStart: { gte: from < todayStart ? from : todayStart, lte: now },
    },
    orderBy: { hourStart: 'asc' },
  });
  const mapped = rows.map((r) => ({
    hour_start: r.hourStart.toISOString(),
    used_l: r.observedSeconds > 0 ? round(r.usedL.toNumber()) : null,
    filled_l: r.observedSeconds > 0 ? round(r.filledL.toNumber()) : null,
    min_l: round(num(r.minL)),
    max_l: round(num(r.maxL)),
    avg_l: round(num(r.avgL)),
    readings: r.readings,
    observed_seconds: r.observedSeconds,
  }));
  const hours = mapped.filter((h) => Date.parse(h.hour_start) >= from.getTime());
  const sum = (list: typeof mapped) => {
    const usable = list.filter((h) => h.observed_seconds > 0);
    return {
      used_l: usable.length ? round(usable.reduce((s, h) => s + (h.used_l ?? 0), 0)) : null,
      filled_l: usable.length ? round(usable.reduce((s, h) => s + (h.filled_l ?? 0), 0)) : null,
      observed_seconds: usable.reduce((s, h) => s + h.observed_seconds, 0),
    };
  };
  return {
    device_id: device.deviceId,
    timezone: timeZone,
    range,
    from: from.toISOString(),
    to: now.toISOString(),
    hours,
    totals: sum(hours),
    today: {
      date: today,
      ...sum(mapped.filter((h) => Date.parse(h.hour_start) >= todayStart.getTime())),
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

  const config = await prisma.deviceConfig.findUnique({
    where: { deviceId: device.id },
    select: { reportIntervalMs: true, offlineThresholdMin: true },
  });
  const maxGapMs = continuityGapMs(
    config?.reportIntervalMs,
    config?.offlineThresholdMin ?? env.alertOfflineThresholdMinutes,
  );
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
    ongoing: episodeIsCurrent(e.ongoing, e.endedAt, device.status === 'online', now, maxGapMs),
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
  now = new Date(),
) {
  const timeZone = timeZoneOf(device);
  const today = localDate(now, timeZone);
  const to = opts.to ?? today;
  const from = opts.from ?? addDays(to, -29);
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to))
    throw new HttpError(400, 'from and to must be YYYY-MM-DD');
  const span = daysBetween(from, to);
  if (span < 1) throw new HttpError(400, 'to must be on or after from');
  if (span > MAX_HISTORY_DAYS) throw new HttpError(400, `Choose at most ${MAX_HISTORY_DAYS} days`);
  const group = opts.group ?? autoGroup(span);

  const start = startOfLocalDay(from, timeZone);
  const end = startOfLocalDay(addDays(to, 1), timeZone);
  const [profile, summaries, hourRows] = await Promise.all([
    prisma.tankProfile.findUnique({ where: { deviceId: device.id } }),
    prisma.dailySummary.findMany({
      where: {
        deviceId: device.id,
        date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.hourlyUsage.findMany({
      where: {
        deviceId: device.id,
        hourStart: { gte: start, lt: end },
        observedSeconds: { gt: 0 },
      },
      select: { hourStart: true, usedL: true, observedSeconds: true },
    }),
  ]);

  // Hours with readings per local day: how much of each day the device saw.
  const hoursByDate = new Map<string, number>();
  const observedAt = new Map<number, number>();
  for (const h of hourRows) {
    const date = localDate(h.hourStart, timeZone);
    hoursByDate.set(date, (hoursByDate.get(date) ?? 0) + h.observedSeconds / 3600);
    observedAt.set(h.hourStart.getTime(), h.observedSeconds);
  }
  const fullHours = hourRows
    .filter((h) => h.observedSeconds >= COMPLETE_HOUR_SECONDS)
    .map((h) => ({ hour: localHour(h.hourStart, timeZone), usedL: h.usedL.toNumber() }));
  // A power cut's missing hours are filled with the usual use at those hours.
  const usual = usualHours(fullHours);
  const days: DayInput[] = summaries.map((s) => {
    const date = s.date.toISOString().slice(0, 10);
    const slots: Parameters<typeof fillGaps>[0] = [];
    const dayEnd = startOfLocalDay(addDays(date, 1), timeZone).getTime();
    for (let t = startOfLocalDay(date, timeZone).getTime(); t < dayEnd; t += 3_600_000) {
      slots.push({
        hour: localHour(new Date(t), timeZone),
        observedSeconds: observedAt.get(t) ?? 0,
        over: t + 3_600_000 <= now.getTime(),
      });
    }
    return {
      date,
      usedL: s.totalUsageL.toNumber(),
      filledL: s.totalFilledL.toNumber(),
      refills: s.refillEvents,
      leak: s.leakSuspected,
      hoursWithData: hoursByDate.get(date) ?? 0,
      expectedHours: expectedDayHours(date, timeZone),
      ...fillGaps(slots, usual),
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
      estimated_days: b.estimatedDays,
    })),
    totals: {
      used_l: summary.daysWithData ? round(summary.usedL) : null,
      filled_l: summary.daysWithData ? round(summary.filledL) : null,
      refills: summary.refills,
      days: span,
      days_with_data: summary.daysWithData,
      full_days: summary.fullDays,
      estimated_days: summary.estimatedDays,
      daily_average_l: round(summary.dailyAverageL),
      busiest_day: summary.busiestDay && {
        date: summary.busiestDay.date,
        used_l: round(summary.busiestDay.usedL)!,
      },
      quietest_day: summary.quietestDay && {
        date: summary.quietestDay.date,
        used_l: round(summary.quietestDay.usedL)!,
      },
    },
    by_weekday: byWeekday(days).map((w) => ({
      weekday: w.weekday,
      average_l: round(w.averageL),
      days: w.days,
    })),
    by_hour: byHourOfDay(
      hourRows
        .filter(
          (h) =>
            h.observedSeconds > 0 && (from === to || h.observedSeconds >= COMPLETE_HOUR_SECONDS),
        )
        .map((h) => ({ hour: localHour(h.hourStart, timeZone), usedL: h.usedL.toNumber() })),
    ).map((h) => ({ hour: h.hour, average_l: round(h.averageL), samples: h.samples })),
  };
}

function expectedDayHours(date: string, timeZone: string): number {
  return (
    (startOfLocalDay(addDays(date, 1), timeZone).getTime() -
      startOfLocalDay(date, timeZone).getTime()) /
    3_600_000
  );
}
