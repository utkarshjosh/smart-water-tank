import type { Device } from '@prisma/client';
import type { DeviceConfigPayload, SyncMode } from '../services/device.service';

// Transport-agnostic result of ingesting one telemetry frame. `stale` mirrors
// the Phase 1 piggyback decision (config is non-null exactly when the device
// is behind the server). `syncMode` lets an adapter decide whether to push
// fresh config even when the device is up to date (live mode).
export interface TelemetryOutcome {
  recognized: boolean;
  device?: Device;
  measurementId?: string;
  stale: boolean;
  syncMode: SyncMode;
  config: DeviceConfigPayload | null;
  configVersion: number;
}

export interface AnnounceOutcome {
  recognized: boolean;
  device?: Device;
  config: DeviceConfigPayload | null;
}

// A transport adapter. The only method every transport must provide is
// pushConfig (server-initiated config delivery). HTTP makes it a no-op (the
// device pulls); MQTT publishes a retained message. start/stop are optional
// lifecycle hooks for stateful transports (MQTT connection).
export interface DeviceGateway {
  pushConfig(internalDeviceId: string): Promise<void>;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}
