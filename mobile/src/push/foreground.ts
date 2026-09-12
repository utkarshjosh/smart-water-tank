import notifee, { EventType } from '@notifee/react-native';
import { getApp } from '@react-native-firebase/app';
import { getMessaging, onMessage } from '@react-native-firebase/messaging';
import { useEffect } from 'react';

import { queryClient } from '@/api/queryClient';
import { queryKeys } from '@/api/queries';
import { haptics } from '@/feedback/haptics';
import { ACK_ACTION_ID, acknowledgeFromNotification, applyAlertToWidget } from '@/push/background';
import { CHANNELS } from '@/push/channels';
import { parseAlertPayload } from '@/push/payload';

/**
 * Foreground push handling.
 *
 * Android does not draw a notification while the app is in the foreground, so
 * we display it ourselves — with the Acknowledge action, so the same gesture
 * works whether or not the app happened to be open.
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
          actions: [{ title: 'Acknowledge', pressAction: { id: ACK_ACTION_ID } }],
        },
      });
    });

    const unsubscribeEvents = notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id === ACK_ACTION_ID) {
        haptics.selection();
        await acknowledgeFromNotification(detail.notification?.data);
        if (detail.notification?.id) await notifee.cancelNotification(detail.notification.id);
        await queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
      }
    });

    return () => {
      unsubscribeMessages();
      unsubscribeEvents();
    };
  }, [enabled]);
}
