import { getMessaging } from '../config/firebase';
import { prisma } from '../lib/prisma';

/**
 * Push delivery.
 *
 * One row per signed-in install (PushToken), not one column per user: a user
 * with a phone and a tablet needs both to ring, and signing out has to stop
 * one without silencing the other.
 *
 * Data payload values must be strings — FCM rejects a data map with any other
 * value type — so every caller's extras are stringified here rather than at
 * each call site.
 */

export type PushData = Record<string, string | number | boolean | null | undefined>;

export function toStringMap(data: PushData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}

/** Tokens FCM has told us are dead. Sending to them again is wasted quota. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export async function registerPushToken(userId: string, token: string, platform = 'android'): Promise<void> {
  // A token can migrate between accounts on a shared phone: whoever signed in
  // last owns it, so re-point rather than reject.
  await prisma.pushToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform },
  });

  // Mirrored for one release so a v1 app build (which reads users.fcm_token)
  // keeps working. Remove with the column.
  await prisma.user.update({ where: { id: userId }, data: { fcmToken: token } });
}

export async function removePushToken(userId: string, token: string): Promise<void> {
  await prisma.pushToken.deleteMany({ where: { userId, token } });
  await prisma.user.updateMany({ where: { id: userId, fcmToken: token }, data: { fcmToken: null } });
}

async function pruneTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await prisma.pushToken.deleteMany({ where: { token: { in: tokens } } });
  await prisma.user.updateMany({ where: { fcmToken: { in: tokens } }, data: { fcmToken: null } });
  console.log(`[fcm] pruned ${tokens.length} dead token(s)`);
}

async function sendToTokens(
  tokens: string[],
  notification: { title: string; body: string },
  data: PushData
): Promise<number> {
  if (tokens.length === 0) return 0;

  try {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification,
      data: toStringMap(data),
      android: {
        priority: 'high' as const,
        // Must match a channel the app creates at first launch, or Android
        // drops the notification into a default channel with no sound.
        notification: { channelId: typeof data.channel_id === 'string' ? data.channel_id : 'aquamind_info_v1' },
      },
      apns: { headers: { 'apns-priority': '10' } },
    });

    const dead: string[] = [];
    response.responses.forEach((result, index) => {
      if (!result.success && DEAD_TOKEN_CODES.has(result.error?.code ?? '')) {
        dead.push(tokens[index]);
      }
    });

    await pruneTokens(dead);
    return response.successCount;
  } catch (error) {
    // A push failure must never break the request or job that triggered it.
    console.error('[fcm] multicast send failed:', error);
    return 0;
  }
}

async function tokensForUser(userId: string): Promise<string[]> {
  // Archived users are soft-deleted; their phones must stop ringing, same as
  // in the tenant fan-out below.
  const rows = await prisma.pushToken.findMany({
    where: { userId, user: { archivedAt: null } },
    select: { token: true },
  });
  return rows.map((row) => row.token);
}

async function tokensForTenant(tenantId: string): Promise<string[]> {
  const rows = await prisma.pushToken.findMany({
    // An archived user is soft-deleted: their rows survive so historic
    // acknowledgements still resolve, but their phone must stop ringing.
    where: { user: { tenantId, archivedAt: null } },
    select: { token: true },
  });
  return rows.map((row) => row.token);
}

export async function sendNotificationToUser(
  userId: string,
  title: string,
  body: string,
  data: PushData = {}
): Promise<boolean> {
  const sent = await sendToTokens(await tokensForUser(userId), { title, body }, data);
  return sent > 0;
}

export async function sendNotificationToTenant(
  tenantId: string,
  title: string,
  body: string,
  data: PushData = {}
): Promise<number> {
  const tokens = await tokensForTenant(tenantId);
  if (tokens.length === 0) {
    console.log(`[fcm] no push tokens for tenant ${tenantId}`);
    return 0;
  }
  return sendToTokens(tokens, { title, body }, data);
}

/** @deprecated Use registerPushToken; kept while the v1 route still exists. */
export async function updateUserFCMToken(userId: string, fcmToken: string): Promise<void> {
  await registerPushToken(userId, fcmToken);
}
