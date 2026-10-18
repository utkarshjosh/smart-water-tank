import type { Device } from '@prisma/client';
// From the contract, not device.service: the gateway must stay a leaf that
// services can import without creating a cycle (device.service imports
// ./registry for pushConfigToDevice).
import type { DeviceConfigPayload, SyncMode } from '@aquamind/contracts';

// Transport-agnostic result of ingesting one telemetry frame. `stale` mirrors
// the Phase 1 piggyback decision (config is non-null exactly when the device
// is behind the server). `syncMode` lets an adapter decide whether to push
// fresh config even when the device is up to date (live mode).
//
// An archived (decommissioned) device comes back with `archived: true` AND
// `recognized: false`, so a caller that checks only `recognized` still drops
// the frame. `archived` tells the adapter the drop is expected and the core has
// already logged it.
export interface TelemetryOutcome {
  recognized: boolean;
  archived?: boolean;
  device?: Device;
  measurementId?: string;
  stale: boolean;
  syncMode: SyncMode;
  config: DeviceConfigPayload | null;
  configVersion: number;
}

export interface AnnounceOutcome {
  recognized: boolean;
  archived?: boolean;
  device?: Device;
  config: DeviceConfigPayload | null;
}

// A transport adapter. The only method every transport must provide is
// pushConfig (server-initiated config delivery). HTTP makes it a no-op (the
// device pulls); MQTT publishes a retained message. start/stop are optional
// lifecycle hooks for stateful transports (MQTT connection). disconnectDevice
// is optional too: only a transport that holds a live session per device
// (MQTT) has one to end; every HTTP request is authenticated on its own.
export interface DeviceGateway {
  pushConfig(internalDeviceId: string): Promise<void>;
  disconnectDevice?(hardwareDeviceId: string): Promise<void>;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}
