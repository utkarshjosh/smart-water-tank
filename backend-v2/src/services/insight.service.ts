import { Device, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { noiseFloorL } from '../lib/rollup';
import { addDays, localDate, localHour, offsetMs, startOfLocalDay } from '../lib/local-time';
import {
  adjustedScore,
  dueSlot,
  generateInsights,
  Insight,
  InsightDay,
  InsightHour,
  pickInsight,
  seededRandom,
  SentInsight,
  Slot,
  SLOTS,
  slotTarget,
} from '../lib/insights';
import { timeZoneOf } from './rollup.service';
import { capacityOf } from './tank-profile.service';
import { rephraseInsight } from './insight-llm.service';
import { sendNotificationToUser } from './fcm.service';

/**
 * Experimental daily insight: one push a day per opted-in user, decided at a
 * midday and an early-evening slot in the tank's timezone. Midday sends only a
 * fact that clears its bar; otherwise the evening sends its best fact, at
 * worst a summary of the day so far. On the quiet info channel.
 */

/** Two weeks to compare against, plus one more for week-on-week. */
const HISTORY_DAYS = 15;
/** How far back sent insights count for the recency penalty. */
const RECENT_DAYS = 14;

/** Minutes past local midnight. */
function localMinutes(now: Date, timeZone: string): number {
  const wall = new Date(now.getTime() + offsetMs(now, timeZone));
  return wall.getUTCHours() * 60 + wall.getUTCMinutes();
}

/** A tank's last 15 local days and today so far, in the shape the generator takes. */
async function loadHistory(device: Device, now: Date) {
  const timeZone = timeZoneOf(device);
  const today = localDate(now, timeZone);
  const from = addDays(today, -HISTORY_DAYS);
  const [summaries, hourRows, profile] = await Promise.all([
    prisma.dailySummary.findMany({
      where: {
        deviceId: device.id,
        date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) },
      },
      select: { date: true, refillEvents: true },
    }),
    prisma.hourlyUsage.findMany({
      where: {
        deviceId: device.id,
        hourStart: { gte: startOfLocalDay(from, timeZone), lt: now },
        observedSeconds: { gt: 0 },
      },
      select: { hourStart: true, usedL: true, readings: true, observedSeconds: true },
    }),
    prisma.tankProfile.findUnique({ where: { deviceId: device.id } }),
  ]);
  const hours: InsightHour[] = hourRows.map((h) => ({
    date: localDate(h.hourStart, timeZone),
    hour: localHour(h.hourStart, timeZone),
    usedL: h.usedL.toNumber(),
    readings: h.readings,
    observedSeconds: h.observedSeconds,
  }));
  const days: InsightDay[] = summaries.map((s) => ({
    date: s.date.toISOString().slice(0, 10),
    refills: s.refillEvents,
  }));
  return {
    timeZone,
    today,
    nowHour: localHour(now, timeZone),
    hours,
    days,
    noiseL: noiseFloorL(capacityOf(profile)),
  };
}

async function recentSent(userId: string, today: string): Promise<SentInsight[]> {
  const rows = await prisma.dailyInsight.findMany({
    where: { userId, localDate: { gte: addDays(today, -RECENT_DAYS) } },
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

/** Every candidate for this slot across a user's tanks. */
async function candidatesFor(devices: Device[], slot: Slot, now: Date) {
  const all: { device: Device; insight: Insight }[] = [];
  for (const device of devices) {
    const history = await loadHistory(device, now);
    for (const insight of generateInsights({ ...history, slot })) all.push({ device, insight });
  }
  return all;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The slot a dry run speaks for: midday until it closes, then the evening. */
const previewSlot = (hour: number): Slot => (hour < SLOTS.midday.end ? 'midday' : 'evening');

/**
 * Dry run: what this device's next slot today would send, with every
 * candidate. Sends nothing, stores nothing.
 */
export async function previewInsight(
  device: Device,
  opts: { userId?: string; rephrase?: boolean } = {},
  now = new Date(),
) {
  const history = await loadHistory(device, now);
  const { today, timeZone } = history;
  const slot = previewSlot(history.nowHour);
  const candidates = generateInsights({ ...history, slot });
  const recent = opts.userId ? await recentSent(opts.userId, today) : [];
  const picked = pickInsight(candidates, recent, today, {
    minScore: SLOTS[slot].bar,
    rand: seededRandom(`${opts.userId ?? device.id}:${today}:${slot}:pick`),
  });
  const final =
    picked && opts.rephrase
      ? await rephraseInsight(picked.insight)
      : picked && { text: picked.insight.text, source: 'template' as const };
  return {
    device_id: device.deviceId,
    timezone: timeZone,
    local_date: today,
    picked: picked && {
      kind: picked.insight.kind,
      score: round3(picked.adjusted),
      facts: picked.insight.facts,
      text: final!.text,
      template: picked.insight.text,
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

/**
 * Dry run over the last `days` days: what each slot would have sent, with the
 * recency penalty applied to the simulated sends. Read-only.
 * Refill counts are the whole day's, so a replayed evening sees a few refills
 * from after its send time.
 */
export async function replayInsights(device: Device, days: number, now = new Date()) {
  const timeZone = timeZoneOf(device);
  const today = localDate(now, timeZone);
  const sent: SentInsight[] = [];
  const out = [];
  for (let i = days; i >= 1; i--) {
    const date = addDays(today, -i);
    for (const slot of ['midday', 'evening'] as Slot[]) {
      if (sent.some((s) => s.date === date)) break;
      const at = new Date(startOfLocalDay(date, timeZone).getTime() + slotTarget(`replay:${date}`, slot) * 60_000);
      const history = await loadHistory(device, at);
      const candidates = generateInsights({ ...history, slot });
      const bar = SLOTS[slot].bar;
      const picked = pickInsight(candidates, sent, date, {
        minScore: bar,
        rand: seededRandom(`replay:${date}:${slot}:pick`),
      });
      if (picked) sent.push({ kind: picked.insight.kind, date });
      out.push({
        date,
        slot,
        at: at.toISOString(),
        bar,
        sent: picked && { kind: picked.insight.kind, score: round3(picked.adjusted), text: picked.insight.text },
        candidates: candidates.map((c) => ({
          kind: c.kind,
          score: round3(c.score),
          adjusted: round3(adjustedScore(c, sent, date)),
          text: c.text,
        })),
      });
    }
  }
  return out;
}

/**
 * Cron entry point, every 15 minutes. Each opted-in user's midday and evening
 * slots are decided once a day each, at a minute that varies by day; the
 * first slot with a fact above its bar sends (the evening's bar is 0), and the
 * day is done.
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
  // The first tank's zone decides the user's day and slots.
  const timeZone = timeZoneOf(devices[0]);
  const today = localDate(now, timeZone);
  const slot = dueSlot(localMinutes(now, timeZone), `${user.id}:${today}`);
  if (!slot) return false;

  const already = await prisma.dailyInsight.findUnique({
    where: { userId_localDate: { userId: user.id, localDate: today } },
  });
  if (already) {
    console.log(`[insights] ${slot} for user ${user.id}: already sent today (${already.kind})`);
    return false;
  }

  const recent = await recentSent(user.id, today);
  const minScore = SLOTS[slot].bar;
  const all = await candidatesFor(devices, slot, now);
  const picked = pickInsight(
    all.map((a) => a.insight),
    recent,
    today,
    { minScore, rand: seededRandom(`${user.id}:${today}:${slot}:pick`) },
  );
  if (!picked) {
    const seen = all
      .map((a) => `${a.insight.kind} ${round3(adjustedScore(a.insight, recent, today))}`)
      .join(', ');
    console.log(`[insights] ${slot} for user ${user.id}: nothing above ${minScore} (${seen || 'no candidates'})`);
    return false;
  }

  const { insight } = picked;
  const device = all.find((a) => a.insight === insight)!.device;
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
        score: picked.adjusted,
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
  console.log(
    `[insights] ${slot} for user ${user.id}: sent ${insight.kind} ${round3(picked.adjusted)} (${source}), delivered=${delivered}`,
  );
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
