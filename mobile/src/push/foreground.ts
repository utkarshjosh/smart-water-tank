import notifee from '@notifee/react-native';
import { getApp } from '@react-native-firebase/app';
import { getMessaging, onMessage } from '@react-native-firebase/messaging';
import { useEffect } from 'react';

import { queryClient } from '@/api/queryClient';
import { queryKeys } from '@/api/queries';
import { haptics } from '@/feedback/haptics';
import { applyAlertToWidget } from '@/push/background';
import { CHANNELS } from '@/push/channels';
import { parseAlertPayload } from '@/push/payload';

/**
 * Foreground push handling.
 *
 * Android does not draw a notification while the app is in the foreground, so
 * we display it ourselves. There is no action button: an alert fires once per
 * crossing now, so there is nothing to silence, and a tap opens the app.
 */
export function usePushMessages(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const unsubscribeMessages = onMessage(getMessaging(getApp()), async (message) => {
      const payload = parseAlertPayload(message.data);
      if (!payload) return;

      await applyAlertToWidget(message.data);

      // A critical alert arriving while the user is looking at the app is a
      // state change worth one haptic. Nothing quieter gets one.
      if (payload.severity === 'critical') haptics.warning();

      await queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
      await queryClient.invalidateQueries({ queryKey: queryKeys.devices });

      await notifee.displayNotification({
        title: message.notification?.title ?? payload.device_name,
        body: message.notification?.body ?? '',
        data: message.data as Record<string, string>,
        android: {
          channelId: payload.channel_id || CHANNELS.info,
          pressAction: { id: 'default' },
        },
      });
    });


    return unsubscribeMessages;
  }, [enabled]);
}
