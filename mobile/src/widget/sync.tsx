import { requestWidgetUpdate } from 'react-native-android-widget';

import type { DeviceSummary } from '@/api/schemas';
import { TankWidget } from '@/widget/TankWidget';
import { pickTank, readWidgetState, writeWidgetState, type WidgetTank } from '@/widget/state';

/**
 * Pushes freshly-fetched device data into widget state and repaints placed
 * widgets. Called whenever the app learns something new, so an open app keeps
 * the home screen honest without waiting for the 30-minute system refresh.
 */

function toWidgetTank(device: DeviceSummary, capacityL: number | null): WidgetTank {
  return {
    deviceId: device.id,
    name: device.name,
    levelPercent: device.level_percent,
    volumeL: device.current_volume,
    capacityL,
    asOf: (device.level_percent_as_of ?? device.last_measurement)?.getTime() ?? null,
    stale: device.level_percent_stale,
    online: device.status === 'online',
    alert: device.active_alert,
  };
}

export async function syncWidgets(
  devices: DeviceSummary[],
  capacities: Record<string, number | null> = {}
): Promise<void> {
  writeWidgetState(devices.map((device) => toWidgetTank(device, capacities[device.id] ?? null)));

  const state = readWidgetState();
  try {
    await requestWidgetUpdate({
      widgetName: 'Tank',
      renderWidget: () => <TankWidget tank={pickTank(state)} />,
    });
  } catch {
    // No widget placed, or the launcher refused the update. Never surface this:
    // state is written either way, so the next render is still correct.
  }
}
