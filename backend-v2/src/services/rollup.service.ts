import { Device, TankProfile } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { addDays, localDate, startOfLocalDay } from '../lib/local-time';
import { HourRollup, Reading, noiseFloorL, rollupDay, rollupHours } from '../lib/rollup';
import { computeTotalCapacityL, volumeLForProfile } from './tank-profile.service';
import { createLeakAlert } from './alert.service';

/**
 * Builds hourly_usage and daily_summaries from measurements.
 *
 * Both tables are a cache of what the readings plus the *current* tank profile
 * say, the same rule every other volume in the app follows. They are rebuilt,
 * never patched: a day is recomputed whole from its readings, so running it
 * twice gives the same rows, and a corrected profile or timezone is fixed by
 * rebuilding the days it touched.
 */

/** Days rebuilt when a tank profile or timezone changes. */
export const REBUILD_DAYS = 90;
/** Devices seen this recently get their rollups refreshed by the job. */
const ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

export function timeZoneOf(device: Pick<Device, 'timezone'>): string {
  return device.timezone ?? env.defaultTimezone;
}

export function capacityOf(profile: TankProfile | null): number | null {
  if (!profile) return null;
  return computeTotalCapacityL({
    shape: profile.shape,
    parallelUnitCount: profile.parallelUnitCount,
    heightCm: profile.heightCm.toNumber(),
    diameterCm: profile.diameterCm?.toNumber() ?? null,
    lengthCm: profile.lengthCm?.toNumber() ?? null,
    widthCm: profile.widthCm?.toNumber() ?? null,
    nominalUnitVolumeL: profile.nominalUnitVolumeL?.toNumber() ?? null,
  });
}

type Row = { timestamp: Date; levelCm: { toNumber(): number } | null; volumeL: { toNumber(): number } | null };

/** Litres from the current profile; the stored snapshot only when there is no profile. */
function toReading(profile: TankProfile | null, row: Row): Reading | null {
  const levelCm = row.levelCm?.toNumber() ?? null;
  const litres = profile ? volumeLForProfile(profile, levelCm) : (row.volumeL?.toNumber() ?? null);
  return litres == null ? null : { at: row.timestamp, litres };
}

const round2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);

/** Recomputes the given local dates for one device. */
export async function rebuildDeviceDays(deviceId: string, dates: string[], now = new Date()): Promise<void> {
  const device = await prisma.device.findUnique({ where: { id: deviceId }, include: { tankProfile: true } });
  if (!device) return;

  const timeZone = timeZoneOf(device);
  const profile = device.tankProfile;
  const capacityL = capacityOf(profile);
  const noiseL = noiseFloorL(capacityL);
  const select = { timestamp: true, levelCm: true, volumeL: true } as const;
  // Only yesterday and today may raise a leak alert. A 90-day rebuild after a
  // profile change would otherwise alert for every old day it re-judges.
  const alertFrom = addDays(localDate(now, timeZone), -1);

  for (const date of dates) {
    const start = startOfLocalDay(date, timeZone);
    const end = startOfLocalDay(addDays(date, 1), timeZone);

    const [rows, beforeRow] = await Promise.all([
      prisma.measurement.findMany({
        where: { deviceId, timestamp: { gte: start, lt: end } },
        orderBy: { timestamp: 'asc' },
        select,
      }),
      prisma.measurement.findFirst({
        where: { deviceId, timestamp: { lt: start }, levelCm: { not: null } },
        orderBy: { timestamp: 'desc' },
        select,
      }),
    ]);

    // Unreadable cycles (no echo) aren't data points; drop them before they
    // can read as a drained tank.
    const readings = rows.map((r) => toReading(profile, r)).filter((r): r is Reading => r != null);
    const before = beforeRow ? toReading(profile, beforeRow) : null;
    const hours = rollupHours(readings, before, timeZone, noiseL);

    await prisma.$transaction([
      prisma.hourlyUsage.deleteMany({ where: { deviceId, hourStart: { gte: start, lt: end } } }),
      prisma.hourlyUsage.createMany({ data: hours.map((h) => toHourRow(deviceId, h)) }),
    ]);

    await saveDay(device, date, hours, { complete: end <= now, alertable: date >= alertFrom, capacityL });
  }
}

function toHourRow(deviceId: string, h: HourRollup) {
  return {
    deviceId,
    hourStart: h.hourStart,
    usedL: round2(h.usedL)!,
    filledL: round2(h.filledL)!,
    minL: round2(h.minL),
    maxL: round2(h.maxL),
    avgL: round2(h.avgL),
    readings: h.readings,
  };
}

async function saveDay(
  device: Device,
  date: string,
  hours: HourRollup[],
  opts: { complete: boolean; alertable: boolean; capacityL: number | null }
): Promise<void> {
  // DailySummary.date is a DATE column; Prisma writes it from a UTC-midnight
  // Date, so the local date string goes in as-is.
  const dateKey = new Date(`${date}T00:00:00.000Z`);
  const where = { deviceId_date: { deviceId: device.id, date: dateKey } };

  if (hours.length === 0) {
    await prisma.dailySummary.deleteMany({ where: { deviceId: device.id, date: dateKey } });
    return;
  }

  const day = rollupDay(hours, {
    // A tenth of the tank in an hour is a refill, not a drip; 50 L without a
    // profile to scale by.
    refillMinL: opts.capacityL == null ? 50 : opts.capacityL * 0.1,
    leakLPerHour: env.leakThresholdLPerHour,
  });
  // A day still in progress can't be judged for leaks yet.
  const leakSuspected = opts.complete && day.leakSuspected;

  const previous = await prisma.dailySummary.findUnique({ where, select: { leakSuspected: true } });
  const data = {
    totalUsageL: round2(day.usedL)!,
    totalFilledL: round2(day.filledL)!,
    minVolumeL: round2(day.minL),
    maxVolumeL: round2(day.maxL),
    avgVolumeL: round2(day.avgL),
    refillEvents: day.refillEvents,
    leakSuspected,
    readings: day.readings,
  };
  await prisma.dailySummary.upsert({ where, create: { deviceId: device.id, date: dateKey, ...data }, update: data });

  // Alert once, when a day first turns out to look like a leak. The job
  // rebuilds yesterday after midnight; without this it would alert each time.
  if (leakSuspected && !previous?.leakSuspected && opts.alertable && device.tenantId) {
    const hoursWithReadings = hours.filter((h) => h.readings > 0).length;
    await createLeakAlert(device.id, device.tenantId, {
      hourly_consumption_l: day.usedL / hoursWithReadings,
      threshold_l_per_hour: env.leakThresholdLPerHour,
      date,
    });
  }
}

/**
 * The job: refresh today for every device that has reported recently, and
 * yesterday too for the first two hours after local midnight, so late
 * readings and the final hour land in the right day.
 */
export async function refreshActiveRollups(now = new Date()): Promise<void> {
  const devices = await prisma.device.findMany({
    where: { lastSeen: { gte: new Date(now.getTime() - ACTIVE_WINDOW_MS) }, archivedAt: null },
    select: { id: true, timezone: true },
  });

  for (const device of devices) {
    const timeZone = timeZoneOf(device);
    const today = localDate(now, timeZone);
    const sinceMidnight = now.getTime() - startOfLocalDay(today, timeZone).getTime();
    const dates = sinceMidnight < ACTIVE_WINDOW_MS ? [addDays(today, -1), today] : [today];
    try {
      await rebuildDeviceDays(device.id, dates, now);
    } catch (error) {
      // One bad device must not stop the rest.
      console.error(`Rollup failed for device ${device.id}:`, error);
    }
  }
}

/** Rebuild the recent past after the inputs changed (tank profile, timezone). */
export async function rebuildRecentRollups(deviceId: string, days = REBUILD_DAYS, now = new Date()): Promise<void> {
  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { timezone: true } });
  if (!device) return;
  const timeZone = timeZoneOf(device);
  const today = localDate(now, timeZone);

  // A timezone change moves where every hour starts, so old rows would sit at
  // the wrong offsets beside the rebuilt ones. Clear the whole window first.
  const from = startOfLocalDay(addDays(today, -(days - 1)), timeZone);
  await prisma.hourlyUsage.deleteMany({ where: { deviceId, hourStart: { gte: new Date(from.getTime() - 86_400_000) } } });

  const dates = Array.from({ length: days }, (_, i) => addDays(today, -(days - 1) + i));
  await rebuildDeviceDays(deviceId, dates, now);
}

/** Fire-and-forget wrapper for request handlers: the caller shouldn't wait. */
export function scheduleRebuild(deviceId: string): void {
  rebuildRecentRollups(deviceId).catch((error) => console.error(`Rollup rebuild failed for ${deviceId}:`, error));
}
