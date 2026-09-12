import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';

/**
 * Android notification channels, created once at first launch.
 *
 * A channel's sound and importance are IMMUTABLE after creation — Android
 * ignores later changes so a user's own tweaks are never overwritten. That is
 * why every id carries a version: changing the sound in a later release means
 * creating `..._v2` and migrating, not editing these.
 *
 * The server picks the channel per alert severity and sends its id in the push
 * payload (see backend-v2 alert.service `CHANNEL_BY_SEVERITY`). These ids must
 * stay in sync with that map.
 */

export const CHANNELS = {
  critical: 'aquamind_critical_v1',
  high: 'aquamind_high_v1',
  info: 'aquamind_info_v1',
} as const;

export async function ensureChannels(): Promise<void> {
  await notifee.createChannels([
    {
      id: CHANNELS.critical,
      name: 'Critical alerts',
      description: 'Tank empty or a suspected leak — the ones worth waking up for.',
      importance: AndroidImportance.HIGH,
      // TODO(phase 6): the water-knock cue ships here. Because channel sound is
      // immutable, that release creates `aquamind_critical_v2` and migrates.
      vibration: true,
      vibrationPattern: [300, 400, 300, 400],
      visibility: AndroidVisibility.PUBLIC,
      lights: true,
    },
    {
      id: CHANNELS.high,
      name: 'Tank alerts',
      description: 'Tank full, tank low, device offline.',
      importance: AndroidImportance.DEFAULT,
      vibration: true,
      visibility: AndroidVisibility.PRIVATE,
    },
    {
      id: CHANNELS.info,
      name: 'Status',
      description: 'Battery and other low-priority notices.',
      importance: AndroidImportance.LOW,
      vibration: false,
      visibility: AndroidVisibility.PRIVATE,
    },
  ]);
}
