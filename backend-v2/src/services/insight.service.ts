import { Device, Prisma } from '@prisma/client';
import { COMPLETE_HOUR_SECONDS } from '../lib/rollup';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { addDays, localDate, localHour, startOfLocalDay } from '../lib/local-time';
import {
  generateInsights,
  Insight,
  InsightDay,
  InsightHour,
  pickInsight,
  shouldSendNow,
} from '../lib/insights';
import { timeZoneOf } from './rollup.service';
import { rephraseInsight } from './insight-llm.service';
import { sendNotificationToUser } from './fcm.service';

/**
 * Experimental daily insight: at most one push a day per opted-in user, in
 * waking hours of the tank's timezone, on the quiet info channel.
 */

const LOOKBACK_DAYS = 15;

/** Loads a device's last 15 local days of rollups in the shape the generator takes. */
async function loadInput(device: Device, now: Date) {
  const timeZone = timeZoneOf(device);
  const today = localDate(now, timeZone);
  const from = addDays(today, -LOOKBACK_DAYS);
  const [summaries, hourRows] = await Promise.all([
    prisma.dailySummary.findMany({
      where: {
        deviceId: device.id,
        date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) },
      },
    }),
    prisma.hourlyUsage.findMany({
      where: {
        deviceId: device.id,
        hourStart: { gte: startOfLocalDay(from, timeZone), lt: now },
        observedSeconds: { gt: 0 },
      },
      select: { hourStart: true, usedL: true, readings: true, observedSeconds: true },
    }),
  ]);
  const hoursByDate = new Map<string, number>();
  const hours: InsightHour[] = [];
  const yesterday = addDays(today, -1);
  for (const h of hourRows) {
    const date = localDate(h.hourStart, timeZone);
    hoursByDate.set(date, (hoursByDate.get(date) ?? 0) + h.observedSeconds / 3600);
    if ((date === today || date === yesterday) && h.observedSeconds >= COMPLETE_HOUR_SECONDS) {
      hours.push({
        date,
        hour: localHour(h.hourStart, timeZone),
        usedL: h.usedL.toNumber(),
        readings: h.readings,
        observedSeconds: h.observedSeconds,
      });
    }
  }
  const days: InsightDay[] = summaries.map((s) => {
    const date = s.date.toISOString().slice(0, 10);
    return {
      date,
      usedL: s.totalUsageL.toNumber(),
      refills: s.refillEvents,
      hoursWithData: hoursByDate.get(date) ?? 0,
      expectedHours:
        (startOfLocalDay(addDays(date, 1), timeZone).getTime() -
          startOfLocalDay(date, timeZone).getTime()) /
        3600000,
    };
  });
  return { timeZone, today, input: { today, days, hours } };
}

async function recentSent(userId: string, today: string) {
  const rows = await prisma.dailyInsight.findMany({
    where: { userId, localDate: { gte: addDays(today, -7) } },
    select: { kind: true, localDate: true },
  });
  return rows.map((r) => ({ kind: r.kind, date: r.localDate }));
}

function devicesOf(user: { id: string; tenantId: string | null }) {
  return prisma.device.findMany({
    where: {
      archivedAt: null,
      OR: [
        ...(user.tenantId ? [{ tenantId: user.tenantId }] : []),
        { userMappings: { some: { userId: user.id } } },
      ],
    },
    orderBy: { deviceId: 'asc' },
  });
}

/**
 * Dry run: what would be sent for this device today, with every candidate.
 * Sends nothing, stores nothing.
 */
export async function previewInsight(
  device: Device,
  opts: { userId?: string; rephrase?: boolean } = {},
  now = new Date(),
) {
  const { today, timeZone, input } = await loadInput(device, now);
  const candidates = generateInsights(input);
  const recent = opts.userId ? await recentSent(opts.userId, today) : [];
  const picked = pickInsight(candidates, recent, today);
  const final =
    picked && opts.rephrase
      ? await rephraseInsight(picked)
      : picked && { text: picked.text, source: 'template' as const };
  return {
    device_id: device.deviceId,
    timezone: timeZone,
    local_date: today,
    picked: picked && {
      kind: picked.kind,
      score: round3(picked.score),
      facts: picked.facts,
      text: final!.text,
      template: picked.text,
      source: final!.source,
    },
    candidates: candidates.map((c) => ({
      kind: c.kind,
      score: round3(c.score),
      facts: c.facts,
      text: c.text,
    })),
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Cron entry point. For every opted-in user whose first tank is in waking
 * hours and who has had nothing today, picks the best insight across their
 * tanks and sends it. Days with no solid insight send nothing.
 */
export async function sendDueInsights(now = new Date()): Promise<number> {
  const users = await prisma.user.findMany({
    where: { dailyInsightEnabled: true, archivedAt: null },
    select: { id: true, tenantId: true },
  });
  let sent = 0;
  for (const user of users) {
    try {
      if (await sendInsightForUser(user, now)) sent++;
    } catch (error) {
      console.error(`[insights] user ${user.id} failed:`, error);
    }
  }
  return sent;
}

async function sendInsightForUser(
  user: { id: string; tenantId: string | null },
  now: Date,
): Promise<boolean> {
  const devices = await devicesOf(user);
  if (devices.length === 0) return false;
  // The first tank's zone decides the user's day and waking hours.
  const timeZone = timeZoneOf(devices[0]);
  const today = localDate(now, timeZone);
  const already = await prisma.dailyInsight.findUnique({
    where: { userId_localDate: { userId: user.id, localDate: today } },
  });
  if (!shouldSendNow(localHour(now, timeZone), already != null)) return false;

  const recent = await recentSent(user.id, today);
  let best: { device: Device; insight: Insight } | null = null;
  for (const device of devices) {
    const { input } = await loadInput(device, now);
    const picked = pickInsight(generateInsights(input), recent, today);
    if (picked && (!best || picked.score > best.insight.score)) best = { device, insight: picked };
  }
  if (!best) return false;

  const { insight, device } = best;
  const { text, source } = await rephraseInsight(insight);

  // Claim the day first: the unique (user, date) key keeps two overlapping
  // runs from both sending.
  let row;
  try {
    row = await prisma.dailyInsight.create({
      data: {
        userId: user.id,
        deviceId: device.id,
        localDate: today,
        kind: insight.kind,
        facts: insight.facts as Prisma.InputJsonValue,
        text,
        template: insight.text,
        source,
        score: insight.score,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return false;
    throw error;
  }

  const name = device.name || device.deviceId;
  const delivered = await sendNotificationToUser(user.id, `Daily insight · ${name}`, text, {
    type: 'daily_insight',
    insight_id: row.id,
    kind: insight.kind,
    device_id: device.deviceId,
    device_name: name,
    channel_id: 'aquamind_info_v1',
    as_of: now.toISOString(),
  });
  await prisma.dailyInsight.update({
    where: { id: row.id },
    data: { delivered: delivered ? 1 : 0 },
  });
  console.log(`[insights] ${insight.kind} for user ${user.id} (${source}), delivered=${delivered}`);
  return true;
}

// --- Settings, history, feedback (tenant routes) -------------------------------

export async function getInsightSettings(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { dailyInsightEnabled: true },
  });
  return { enabled: user.dailyInsightEnabled };
}

export async function setInsightSettings(userId: string, enabled: boolean) {
  await prisma.user.update({ where: { id: userId }, data: { dailyInsightEnabled: enabled } });
  return { enabled };
}

export async function listInsights(userId: string, limit = 30) {
  const rows = await prisma.dailyInsight.findMany({
    where: { userId },
    orderBy: { sentAt: 'desc' },
    take: limit,
    include: { device: { select: { deviceId: true, name: true } } },
  });
  return {
    insights: rows.map((r) => ({
      id: r.id,
      device_id: r.device.deviceId,
      device_name: r.device.name,
      local_date: r.localDate,
      kind: r.kind,
      text: r.text,
      facts: r.facts as Record<string, number | string>,
      source: r.source as 'template' | 'llm',
      sent_at: r.sentAt.toISOString(),
      useful: r.useful,
    })),
  };
}

export async function setInsightFeedback(userId: string, insightId: string, useful: boolean) {
  const { count } = await prisma.dailyInsight.updateMany({
    where: { id: insightId, userId },
    data: { useful, feedbackAt: new Date() },
  });
  if (count === 0) throw new HttpError(404, 'Insight not found');
  return { success: true as const };
}
