import * as Haptics from 'expo-haptics';

import { appStore } from '@/storage';

/**
 * The complete haptic vocabulary — see plans/android-app-v2.md §7. This module
 * is the only caller of expo-haptics, so the map below cannot quietly grow:
 *
 *   selection  tab/segment change, swipe-to-acknowledge commit
 *   threshold  pull-to-refresh crossing its trigger point
 *   success    pairing complete, tank-setup saved
 *   warning    a critical alert arriving while the app is open
 *
 * Haptics confirm a STATE CHANGE. They never acknowledge a touch, so there is
 * deliberately nothing here for scrolling, plain taps or navigation.
 */

const ENABLED_KEY = 'haptics.enabled';

export function hapticsEnabled(): boolean {
  return appStore.getBoolean(ENABLED_KEY) ?? true;
}

export function setHapticsEnabled(enabled: boolean): void {
  appStore.set(ENABLED_KEY, enabled);
}

// A failed haptic must never break an interaction: on a device without a
// vibrator these reject, and the caller is mid-gesture.
function run(fire: () => Promise<void>): void {
  if (!hapticsEnabled()) return;
  void fire().catch(() => {});
}

export const haptics = {
  selection: () => run(() => Haptics.selectionAsync()),
  threshold: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
