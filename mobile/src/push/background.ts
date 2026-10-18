import notifee from '@notifee/react-native';
import { getApp } from '@react-native-firebase/app';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

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

async function applyAlertToWidget(data: unknown): Promise<void> {
  const payload = parseAlertPayload(data);
  if (!payload) return;

  mergeTank(tankPatchFromAlert(payload));
  await repaintWidgets();
}

export function registerBackgroundHandlers(): void {
  // Data-carrying alerts while backgrounded or killed. Notifee/the system draws
  // the notification itself from the `notification` block; our job is state.
  setBackgroundMessageHandler(getMessaging(getApp()), async (message) => {
    await applyAlertToWidget(message.data);
  });

  // Notifee warns at startup without a background handler. A tap just opens
  // the app, which needs no handling here.
  notifee.onBackgroundEvent(async () => {});
}

export { applyAlertToWidget };
