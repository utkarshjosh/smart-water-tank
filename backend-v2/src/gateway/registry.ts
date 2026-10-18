import { DeviceGateway } from './types';

// The process-wide active transport used for SERVER-INITIATED config pushes.
// Set to the MqttAdapter when MQTT_URL is configured, otherwise the HttpAdapter
// (whose pushConfig is a no-op — HTTP devices pull config on their next poll).
let active: DeviceGateway | null = null;

export function setActiveGateway(gateway: DeviceGateway | null): void {
  active = gateway;
}

export function getActiveGateway(): DeviceGateway | null {
  return active;
}

// Fire-and-forget config push used by the config-change hooks. NEVER rejects
// and NEVER throws: a down broker (or no gateway at all) must not break the
// HTTP response that triggered the config change.
export async function pushConfigToDevice(internalDeviceId: string): Promise<void> {
  if (!active) return;
  try {
    await active.pushConfig(internalDeviceId);
  } catch (err) {
    console.error('[gateway] pushConfig failed for device', internalDeviceId, err);
  }
}

// Fire-and-forget session kick, used once a device is archived or its tokens
// are revoked. The broker checks credentials only on CONNECT, so without this
// a session opened earlier keeps publishing until the device happens to
// reconnect, which an always-on device may not do for days. Same contract as
// pushConfigToDevice: never rejects, never throws.
export async function disconnectDeviceSession(hardwareDeviceId: string): Promise<void> {
  if (!active?.disconnectDevice) return;
  try {
    await active.disconnectDevice(hardwareDeviceId);
  } catch (err) {
    console.error('[gateway] disconnectDevice failed for device', hardwareDeviceId, err);
  }
}

// One device at a time, so archiving a large tenant does not open a burst of
// broker connections at once.
export async function disconnectDeviceSessions(hardwareDeviceIds: string[]): Promise<void> {
  for (const id of hardwareDeviceIds) await disconnectDeviceSession(id);
}
