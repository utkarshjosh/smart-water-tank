import { Device, Prisma, TankProfile } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { computeLevelPercent, computeTotalCapacityL, getTankProfileRaw } from './tank-profile.service';

// Daily usage history. `daily_summaries` has been written nightly by
// aggregation.service since the beginning and read by nothing.
//
// It is read here for the two things only that job can produce - refill events
// and the leak flag both need the full ordered sequence of a day's readings -
// while litres used, min, max and avg are DERIVED AT READ TIME from
// measurements plus the *current* tank profile.
//
// The split is deliberate. The stored volumes were frozen at aggregation time,
// so serving them directly would make this page disagree with every other
// number in the app the moment a tank profile is corrected. Everything
// volume-shaped in this codebase is derived at read time; usage follows suit.

const MAX_DAYS = 365;

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

interface DayRow {
  day: unknown;
  level_min: unknown;
  level_avg: unknown;
  level_max: unknown;
  volume_min: unknown;
  volume_avg: unknown;
  volume_max: unknown;
  sample_count: unknown;
}

function toNum(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

const round = (v: number | null, digits = 1) =>
  v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits;

function litresFor(profile: TankProfile | null, capacityL: number | null, levelCm: number | null) {
  if (!profile || capacityL == null || levelCm == null) return null;
  const percent = computeLevelPercent(levelCm, {
    heightCm: profile.heightCm.toNumber(),
    sensorOffsetCm: profile.sensorOffsetCm.toNumber(),
    deadZoneCm: profile.deadZoneCm.toNumber(),
  });
  return percent == null ? null : (percent / 100) * capacityL;
}

export async function getDeviceUsage(device: Device, days: number) {
  if (days < 1 || days > MAX_DAYS) {
    throw new HttpError(400, `days must be between 1 and ${MAX_DAYS}`);
  }

  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);

  const profile = await getTankProfileRaw(device.id);
  const capacityL = profile
    ? computeTotalCapacityL({
        shape: profile.shape,
        parallelUnitCount: profile.parallelUnitCount,
        heightCm: profile.heightCm.toNumber(),
        diameterCm: profile.diameterCm?.toNumber() ?? null,
        lengthCm: profile.lengthCm?.toNumber() ?? null,
        widthCm: profile.widthCm?.toNumber() ?? null,
        nominalUnitVolumeL: profile.nominalUnitVolumeL?.toNumber() ?? null,
      })
    : null;

  // Clamp inside SQL so AVG matches per-reading computeLevelPercent, exactly as
  // the bucketed history endpoint does.
  const levelExpr = profile
    ? Prisma.sql`LEAST(GREATEST(\`level_cm\`, ${Math.max(
        profile.sensorOffsetCm.toNumber(),
        profile.deadZoneCm.toNumber()
      )}), ${profile.sensorOffsetCm.toNumber() + profile.heightCm.toNumber()})`
    : Prisma.sql`\`level_cm\``;

  const [rows, summaries] = await Promise.all([
    // DATE() groups by calendar day in the stored (UTC) values, matching how
    // the aggregation job keys its rows.
    prisma.$queryRaw<DayRow[]>`
      SELECT
        DATE(\`timestamp\`) AS day,
        MIN(${levelExpr}) AS level_min,
        AVG(${levelExpr}) AS level_avg,
        MAX(${levelExpr}) AS level_max,
        MIN(\`volume_l\`) AS volume_min,
        AVG(\`volume_l\`) AS volume_avg,
        MAX(\`volume_l\`) AS volume_max,
        COUNT(*) AS sample_count
      FROM \`measurements\`
      WHERE \`device_id\` = ${device.id}
        AND \`timestamp\` >= ${from}
        AND \`timestamp\` < ${to}
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.dailySummary.findMany({
      where: { deviceId: device.id, date: { gte: from, lt: to } },
      orderBy: { date: 'asc' },
    }),
  ]);

  // Refills and the leak flag come from the nightly job, keyed by day.
  const byDay = new Map(
    summaries.map((s) => [s.date.toISOString().slice(0, 10), s])
  );

  const usageDays: UsageDay[] = rows.map((row) => {
    const day =
      row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10);
    const summary = byDay.get(day);

    // level_cm is a distance, so it inverts: the smallest distance is the
    // fullest moment of the day.
    const maxL = profile
      ? litresFor(profile, capacityL, toNum(row.level_min))
      : round(toNum(row.volume_max));
    const minL = profile
      ? litresFor(profile, capacityL, toNum(row.level_max))
      : round(toNum(row.volume_min));
    const avgL = profile
      ? litresFor(profile, capacityL, toNum(row.level_avg))
      : round(toNum(row.volume_avg));

    return {
      date: day,
      // Usage is the day's drawdown. Only the job sees every reading in order,
      // so its total (which nets out refills) is the honest figure when it
      // exists; the max-minus-min fallback is a floor, not a total.
      used_l: summary ? round(summary.totalUsageL.toNumber()) : null,
      min_l: round(minL),
      avg_l: round(avgL),
      max_l: round(maxL),
      refill_events: summary?.refillEvents ?? 0,
      leak_suspected: summary?.leakSuspected ?? false,
      readings: toNum(row.sample_count) ?? 0,
    };
  });

  const withUsage = usageDays.filter((d) => d.used_l != null);
  const totalUsed = withUsage.reduce((sum, d) => sum + (d.used_l ?? 0), 0);

  return {
    device_id: device.deviceId,
    from: from.toISOString(),
    to: to.toISOString(),
    has_tank_profile: profile != null,
    capacity_l: capacityL == null ? null : round(capacityL),
    days: usageDays,
    totals: {
      used_l: round(totalUsed),
      // Averaged over days that actually have a summary, so a partial first
      // day or a not-yet-aggregated today does not drag the mean down.
      daily_average_l: withUsage.length ? round(totalUsed / withUsage.length) : null,
      refill_events: usageDays.reduce((sum, d) => sum + d.refill_events, 0),
      leak_days: usageDays.filter((d) => d.leak_suspected).length,
      days_with_data: usageDays.length,
      days_aggregated: withUsage.length,
    },
  };
}
