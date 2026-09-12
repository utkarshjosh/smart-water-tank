import notifee, { EventType } from '@notifee/react-native';
import { getApp } from '@react-native-firebase/app';
import { getInitialNotification, getMessaging } from '@react-native-firebase/messaging';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { parseAlertPayload } from '@/push/payload';

/**
 * Opening the app from a notification lands on the tank it is about, not the
 * home screen.
 *
 * Three routes in, because Android delivers a tap differently depending on
 * what drew the notification and what state the app was in:
 *   - notifee foreground event (we drew it, app open)
 *   - notifee initial notification (we drew it, app was killed)
 *   - messaging initial notification (the system drew it, app was killed)
 */
export function useNotificationRouting(enabled: boolean): void {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const open = (data: unknown) => {
      const payload = parseAlertPayload(data);
      if (!payload || cancelled) return;
      router.push(`/device/${payload.device_id}`);
    };

    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) open(detail.notification?.data);
    });

    // Cold start. Both are checked because either can be the one that woke us.
    void notifee.getInitialNotification().then((initial) => {
      if (initial) open(initial.notification.data);
    });
    void getInitialNotification(getMessaging(getApp())).then((message) => {
      if (message) open(message.data);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, router]);
}
