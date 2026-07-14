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
