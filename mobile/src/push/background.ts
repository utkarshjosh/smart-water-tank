import notifee, { EventType } from '@notifee/react-native';
import { getApp } from '@react-native-firebase/app';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

import { api } from '@/api/endpoints';
import { parseAlertPayload, tankPatchFromAlert } from '@/push/payload';
import { mergeTank } from '@/widget/state';
import { repaintWidgets } from '@/widget/sync';

/**
 * Background push handling, registered from index.js at module scope because
 * these fire when the app is backgrounded or not running at all.
 *
 * This is the primary freshness tier for the home-screen widget: every alert
 * push already carries the tank's level, so a widget update costs no request.
 * Android gives a background handler only a few seconds, so everything here is
 * cheap and nothing throws.
 */

export const ACK_ACTION_ID = 'acknowledge';

async function applyAlertToWidget(data: unknown): Promise<void> {
  const payload = parseAlertPayload(data);
  if (!payload) return;

  mergeTank(tankPatchFromAlert(payload));
  await repaintWidgets();
}

/** Acknowledge straight from the notification, without unlocking the phone. */
async function acknowledgeFromNotification(data: unknown): Promise<void> {
  const payload = parseAlertPayload(data);
  if (!payload) return;

  try {
    await api.acknowledgeAlertById(payload.alert_id);
  } catch {
    // Offline, or the alert was already acknowledged elsewhere. The feed is
    // the source of truth; nothing here is worth a retry queue yet.
  }
}

export function registerBackgroundHandlers(): void {
  // Data-carrying alerts while backgrounded or killed. Notifee/the system draws
  // the notification itself from the `notification` block; our job is state.
  setBackgroundMessageHandler(getMessaging(getApp()), async (message) => {
    await applyAlertToWidget(message.data);
  });

  // Taps and action presses on a notification while the app is backgrounded.
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === ACK_ACTION_ID) {
      await acknowledgeFromNotification(detail.notification?.data);
      if (detail.notification?.id) {
        await notifee.cancelNotification(detail.notification.id);
      }
    }
  });
}

export { acknowledgeFromNotification, applyAlertToWidget };
