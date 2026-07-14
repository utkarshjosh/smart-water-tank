import { GatewayCore } from './core';
import { DeviceGateway } from './types';

// HTTP transport adapter. The existing REST routes ARE the HTTP transport:
//   POST /measurements          -> core.handleTelemetry (via recordMeasurement)
//   GET  /devices/:id/config    -> core.resolveConfig
// so this adapter only needs to satisfy the server-initiated push contract,
// which over HTTP is a no-op — the device pulls the new config on its next
// measurement (piggyback) or GET /config. Kept for symmetry with MqttAdapter
// and so the registry always has a gateway even when MQTT is disabled.
export class HttpAdapter implements DeviceGateway {
  constructor(private readonly core: GatewayCore) {}

  async pushConfig(_internalDeviceId: string): Promise<void> {
    // No-op: HTTP devices pull config; there is no open channel to push on.
  }
}
