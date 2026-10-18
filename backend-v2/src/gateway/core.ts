// ---------------------------------------------------------------------------
// DeviceGateway core — transport-independent device logic.
//
// This is the single place that maps protocol messages onto the EXISTING
// service layer. It intentionally does NOT duplicate any volume/version logic:
// telemetry is funneled straight into `recordMeasurement`, and config is
// resolved via `buildDeviceConfig`. Both HTTP and MQTT adapters delegate here,
// so the two transports behave identically.
// ---------------------------------------------------------------------------

import { Device } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  recordMeasurement,
  buildDeviceConfig,
  getSyncMode,
  DeviceConfigPayload,
  MeasurementInput,
} from '../services/device.service';
import {
  AnnounceMessage,
  TelemetryMessage,
  ConfigMessage,
  buildConfigMessage,
} from '../protocol';
import { TelemetryOutcome, AnnounceOutcome } from './types';

// Pure telemetry -> recordMeasurement input mapping. Field names on the wire
// mirror the HTTP measurement body, so this is a straight rename. volumeL is
// null: over MQTT the device sends no liters and the server computes canonical
// volume from levelCm + TankProfile. Exported for unit testing without a DB.
export function telemetryToMeasurementInput(telemetry: TelemetryMessage): MeasurementInput {
  return {
    levelCm: telemetry.data.level_cm,
    volumeL: null,
    temperatureC: telemetry.data.temperature_c ?? null,
    batteryV: telemetry.data.battery_v,
    rssi: telemetry.data.rssi,
    configVersion: telemetry.configVersion,
  };
}

// Pure server-initiated push decision. Push fresh config when the device is
// stale (has config to catch up on) OR whenever it is in live mode. Exported so
// the decision is unit-testable without a broker.
export function shouldPushConfig(outcome: Pick<TelemetryOutcome, 'stale' | 'config' | 'syncMode'>): boolean {
  return (outcome.stale && outcome.config != null) || outcome.syncMode === 'live';
}

export class GatewayCore {
  // Hardware ids of archived devices already logged by isArchived().
  private readonly reportedArchived = new Set<string>();

  // Devices are addressed by hardware deviceId on the wire (MQTT topic / HTTP
  // token subject) but by internal UUID in the DB.
  async resolveByHardwareId(hardwareDeviceId: string): Promise<Device | null> {
    return prisma.device.findUnique({ where: { deviceId: hardwareDeviceId } });
  }

  // A decommissioned device's frames are dropped before anything is stored: no
  // measurement, no alert, no config push. The broker checks credentials only
  // on CONNECT, so an MQTT session opened before the device was archived keeps
  // publishing until it reconnects. Archiving asks the broker to drop that
  // session (disconnectDeviceSession), but only best effort; this is the
  // backstop that keeps its traffic out of the data regardless. Logged once
  // per device per process. Seeing the device unarchived
  // clears its entry, so archiving it again after a restore is logged again.
  private isArchived(device: Device, kind: 'telemetry' | 'announce'): boolean {
    if (!device.archivedAt) {
      this.reportedArchived.delete(device.deviceId);
      return false;
    }
    if (!this.reportedArchived.has(device.deviceId)) {
      this.reportedArchived.add(device.deviceId);
      console.warn(
        `[gateway] ignoring ${kind} from archived device ${device.deviceId} ` +
          `(archived ${device.archivedAt.toISOString()}); further frames are dropped without logging`
      );
    }
    return true;
  }

  async resolveByInternalId(internalDeviceId: string): Promise<Device | null> {
    return prisma.device.findUnique({ where: { id: internalDeviceId } });
  }

  // Ingest one telemetry frame. Reuses recordMeasurement verbatim (server-side
  // volume + piggyback stale-check), then also reports the device's syncMode so
  // a live-mode adapter can push config on every check-in.
  async handleTelemetry(hardwareDeviceId: string, telemetry: TelemetryMessage): Promise<TelemetryOutcome> {
    const device = await this.resolveByHardwareId(hardwareDeviceId);
    if (!device) {
      return { recognized: false, stale: false, syncMode: 'piggyback', config: null, configVersion: 0 };
    }
    if (this.isArchived(device, 'telemetry')) {
      return { recognized: false, archived: true, stale: false, syncMode: 'piggyback', config: null, configVersion: 0 };
    }

    const result = await recordMeasurement(device, telemetryToMeasurementInput(telemetry));

    const syncMode = await getSyncMode(device.id);

    return {
      recognized: true,
      device,
      measurementId: result.measurementId,
      // recordMeasurement returns a non-null config exactly when the device is stale.
      stale: result.config != null,
      syncMode,
      config: result.config,
      configVersion: result.configVersion,
    };
  }

  // A device came online / (re)connected. Refresh liveness + firmware and
  // return config only when its announced version differs. Mosquitto retains
  // the current config for normal reconnects; avoiding an equal-version
  // republish prevents a needless second delivery immediately after a claim.
  async handleAnnounce(hardwareDeviceId: string, announce: AnnounceMessage): Promise<AnnounceOutcome> {
    const device = await this.resolveByHardwareId(hardwareDeviceId);
    if (!device) return { recognized: false, config: null };
    // No lastSeen/status write either: an archived device must not show as
    // online again.
    if (this.isArchived(device, 'announce')) return { recognized: false, archived: true, config: null };

    await prisma.device.update({
      where: { id: device.id },
      data: {
        lastSeen: new Date(),
        status: 'online',
        firmwareVersion: announce.fw ?? device.firmwareVersion,
      },
    });

    const config = await buildDeviceConfig(device);
    return {
      recognized: true,
      device,
      config: announce.configVersion == null || announce.configVersion !== config.config_version ? config : null,
    };
  }

  // The merged, versioned device config (operational + geometry + version).
  async resolveConfig(device: Device): Promise<DeviceConfigPayload> {
    return buildDeviceConfig(device);
  }

  // Build the server->device config envelope for a device addressed by its
  // internal id (what the config-change hooks hold). Returns null if the device
  // vanished. The message id is the hardware deviceId used in the MQTT topic.
  async buildConfigMessageForDevice(internalDeviceId: string): Promise<ConfigMessage | null> {
    const device = await this.resolveByInternalId(internalDeviceId);
    if (!device) return null;
    const payload = await buildDeviceConfig(device);
    return buildConfigMessage(device.deviceId, payload as unknown as Record<string, unknown>);
  }
}

// Shared singleton core reused by every adapter.
export const gatewayCore = new GatewayCore();
