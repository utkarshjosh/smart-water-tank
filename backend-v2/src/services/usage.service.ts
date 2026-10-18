import { Device } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { addDays, localDate, localHourStart, startOfLocalDay } from '../lib/local-time';
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

/** Sets the zone a tank's days and hours are cut in, then rebuilds its rollups. */
export async function setDeviceTimezone(device: Device, timezone: string | null) {
  await prisma.device.update({ where: { id: device.id }, data: { timezone } });
  return { timezone: timezone ?? timeZoneOf({ timezone: null }), is_default: timezone == null };
}
