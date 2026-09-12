import notifee, { AuthorizationStatus } from '@notifee/react-native';
import { getApp } from '@react-native-firebase/app';
import { deleteToken, getMessaging, getToken } from '@react-native-firebase/messaging';

import { api } from '@/api/endpoints';
import { appStore } from '@/storage';
import { ensureChannels } from '@/push/channels';

/**
 * Push registration.
 *
 * The token is registered with the backend as a row per install, not a column
 * per user — so a phone and a tablet both ring, and signing out silences only
 * the device that signed out.
 */

const TOKEN_KEY = 'push.token';

function messaging() {
  return getMessaging(getApp());
}

/** The token this install last registered, for revoking it on sign-out. */
export function lastRegisteredToken(): string | null {
  return appStore.getString(TOKEN_KEY) ?? null;
}

export async function requestPushPermission(): Promise<boolean> {
  // Android 13+ needs the runtime POST_NOTIFICATIONS grant; below that this
  // resolves as already-authorised.
  const settings = await notifee.requestPermission();
  return (
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
  );
}

/**
 * Registers this install for alerts. Safe to call on every sign-in and app
 * start: the backend upserts, so a repeat is a no-op.
 */
export async function registerForPush(): Promise<{ granted: boolean; token: string | null }> {
  await ensureChannels();

  const granted = await requestPushPermission();
  if (!granted) return { granted: false, token: null };

  const token = await getToken(messaging());
  await api.registerPushToken(token);
  appStore.set(TOKEN_KEY, token);
  return { granted: true, token };
}

/**
 * Revokes this install's token. Called before signing out — otherwise the
 * backend keeps pushing this tenant's alerts to a phone nobody is signed in on.
 *
 * Best-effort by design: a failure here must not block sign-out, and the
 * backend prunes tokens FCM reports as dead anyway.
 */
export async function unregisterForPush(): Promise<void> {
  const token = lastRegisteredToken();
  appStore.remove(TOKEN_KEY);

  if (token) {
    try {
      await api.removePushToken(token);
    } catch {
      // Offline sign-out, or an expired session. The token is dropped locally
      // either way, and deleting it below stops FCM delivering to this install.
    }
  }

  try {
    await deleteToken(messaging());
  } catch {
    // Play Services unavailable; nothing further to do.
  }
}

/**
 * FCM rotates tokens. Without this the backend keeps a stale token and the
 * phone silently stops receiving alerts.
 */
export function watchTokenRefresh(): () => void {
  return messaging().onTokenRefresh(async (token: string) => {
    try {
      await api.registerPushToken(token);
      appStore.set(TOKEN_KEY, token);
    } catch {
      // Retried on the next app start, which also re-registers.
    }
  });
}
