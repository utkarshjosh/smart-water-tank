import { Device, DeviceConfig, Prisma, TankProfile } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { hashClaimCode } from '../lib/claim-code';
import { createDeviceToken } from '../lib/device-token';
import { computeTotalCapacityL, computeVolumeL, getTankProfileRaw } from './tank-profile.service';
import { bumpConfigVersion } from '../lib/config-version';
import { pushConfigToDevice } from '../gateway/registry';

export { bumpConfigVersion };

export function toMeasurementDto(m: {
  timestamp: Date;
  levelCm: Prisma.Decimal | null;
  volumeL: Prisma.Decimal | null;
  temperatureC: Prisma.Decimal | null;
  batteryV: Prisma.Decimal | null;
  rssi: number | null;
}) {
  return {
    timestamp: m.timestamp,
    level_cm: m.levelCm?.toNumber() ?? null,
    volume_l: m.volumeL?.toNumber() ?? null,
    temperature_c: m.temperatureC?.toNumber() ?? null,
    battery_v: m.batteryV?.toNumber() ?? null,
    rssi: m.rssi,
  };
}
import { processAlertsForMeasurement } from './alert.service';

export interface ConfigDto {
  measurement_interval_ms: number;
  report_interval_ms: number;
  tank_full_threshold_l: number | null;
  tank_low_threshold_l: number | null;
  tank_full_threshold_pct: number | null;
  tank_low_threshold_pct: number | null;
  battery_low_threshold_v: number | null;
  level_empty_cm: number | null;
  level_full_cm: number | null;
  [key: string]: unknown;
}

export function toConfigDto(config: DeviceConfig): ConfigDto {
  return {
    measurement_interval_ms: config.measurementIntervalMs,
    report_interval_ms: config.reportIntervalMs,
    tank_full_threshold_l: config.tankFullThresholdL?.toNumber() ?? null,
    tank_low_threshold_l: config.tankLowThresholdL?.toNumber() ?? null,
    tank_full_threshold_pct: config.tankFullThresholdPct?.toNumber() ?? null,
    tank_low_threshold_pct: config.tankLowThresholdPct?.toNumber() ?? null,
    battery_low_threshold_v: config.batteryLowThresholdV?.toNumber() ?? null,
    level_empty_cm: config.levelEmptyCm?.toNumber() ?? null,
    level_full_cm: config.levelFullCm?.toNumber() ?? null,
    ...((config.configJson as object) || {}),
  };
}

// ---------------------------------------------------------------------------
// Unified, versioned device config (Phase 1)
//
// The device-facing payload is a single merged object:
//   operational   -> from DeviceConfig (intervals, thresholds, battery)
//   calibration   -> DERIVED FROM TankProfile (geometry + dead-zone model),
//                    NOT the legacy DeviceConfig.levelEmptyCm/levelFullCm
//                    columns, which are stale/unused.
//   config_version -> monotonic counter living on Device, bumped on any
//                    DeviceConfig/TankProfile write.
// ---------------------------------------------------------------------------

// Operational-only slice (no geometry). Distinct from ConfigDto, which still
// carries the legacy level_empty_cm/level_full_cm columns for admin display.
export type SyncMode = 'live' | 'piggyback';

export interface OperationalConfig {
  measurement_interval_ms: number;
  report_interval_ms: number;
  tank_full_threshold_l: number | null;
  tank_low_threshold_l: number | null;
  tank_full_threshold_pct: number | null;
  tank_low_threshold_pct: number | null;
  battery_low_threshold_v: number | null;
  // MQTT config-sync mode. Included in the merged payload so a device (and the
  // gateway) always knows whether it should stay subscribed for live pushes.
  sync_mode: SyncMode;
  [key: string]: unknown;
}

const DEFAULT_OPERATIONAL: OperationalConfig = {
  measurement_interval_ms: 60000,
  report_interval_ms: 300000,
  tank_full_threshold_l: 900.0,
  tank_low_threshold_l: 100.0,
  tank_full_threshold_pct: null,
  tank_low_threshold_pct: null,
  battery_low_threshold_v: 3.3,
  sync_mode: 'piggyback',
};

export function toOperationalConfig(config: DeviceConfig): OperationalConfig {
  return {
    measurement_interval_ms: config.measurementIntervalMs,
    report_interval_ms: config.reportIntervalMs,
    tank_full_threshold_l: config.tankFullThresholdL?.toNumber() ?? null,
    tank_low_threshold_l: config.tankLowThresholdL?.toNumber() ?? null,
    tank_full_threshold_pct: config.tankFullThresholdPct?.toNumber() ?? null,
    tank_low_threshold_pct: config.tankLowThresholdPct?.toNumber() ?? null,
    battery_low_threshold_v: config.batteryLowThresholdV?.toNumber() ?? null,
    sync_mode: config.syncMode as SyncMode,
    ...((config.configJson as object) || {}),
  };
}

// Plain-number geometry, decoupled from Prisma Decimals so the merge logic is
// unit-testable without a live DB.
export interface GeometrySource {
  shape: string;
  parallelUnitCount: number;
  heightCm: number;
  diameterCm: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  nominalUnitVolumeL: number | null;
  sensorOffsetCm: number;
  deadZoneCm: number;
}

export function profileToGeometry(profile: TankProfile): GeometrySource {
  return {
    shape: profile.shape,
    parallelUnitCount: profile.parallelUnitCount,
    heightCm: profile.heightCm.toNumber(),
    diameterCm: profile.diameterCm?.toNumber() ?? null,
    lengthCm: profile.lengthCm?.toNumber() ?? null,
    widthCm: profile.widthCm?.toNumber() ?? null,
    nominalUnitVolumeL: profile.nominalUnitVolumeL?.toNumber() ?? null,
    sensorOffsetCm: profile.sensorOffsetCm.toNumber(),
    deadZoneCm: profile.deadZoneCm.toNumber(),
  };
}

export interface GeometryBlock {
  shape: string;
  diameter_cm: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number;
  sensor_offset_cm: number;
  dead_zone_cm: number;
  parallel_unit_count: number;
  level_empty_cm: number;
  level_full_cm: number;
  total_capacity_l: number;
}

// Calibration derived from tank geometry. level_empty_cm is the raw distance
// when the tank is empty (sensorOffset + height); level_full_cm is the closest
// measurable distance (max of sensorOffset and the ultrasonic dead zone).
export function buildGeometryBlock(g: GeometrySource): GeometryBlock {
  return {
    shape: g.shape,
    diameter_cm: g.diameterCm,
    length_cm: g.lengthCm,
    width_cm: g.widthCm,
    height_cm: g.heightCm,
    sensor_offset_cm: g.sensorOffsetCm,
    dead_zone_cm: g.deadZoneCm,
    parallel_unit_count: g.parallelUnitCount,
    level_empty_cm: g.sensorOffsetCm + g.heightCm,
    level_full_cm: Math.max(g.sensorOffsetCm, g.deadZoneCm),
    total_capacity_l: computeTotalCapacityL(g),
  };
}

export interface DeviceConfigPayload extends OperationalConfig, Partial<GeometryBlock> {
  config_version: number;
}

// Pure merge: operational + (optional) geometry + version. Unprovisioned
// devices (no TankProfile) still receive operational config; the geometry
// block is simply omitted.
export function mergeDeviceConfig(
  operational: OperationalConfig,
  geometry: GeometrySource | null,
  configVersion: number
): DeviceConfigPayload {
  return {
    ...operational,
    ...(geometry ? buildGeometryBlock(geometry) : {}),
    config_version: configVersion,
  };
}

// The device is stale (and must be sent the full config) when it reports no
// version at all, or a version older than what the server currently holds.
export function isConfigStale(serverVersion: number, reportedVersion: number | null | undefined): boolean {
  return reportedVersion == null || reportedVersion < serverVersion;
}

// Merged device-facing config: operational + geometry + version. Reused by
// GET /config and the measurement piggyback path.
export async function buildDeviceConfig(device: Device): Promise<DeviceConfigPayload> {
  const [config, profile] = await Promise.all([
    prisma.deviceConfig.findUnique({ where: { deviceId: device.id } }),
    getTankProfileRaw(device.id),
  ]);
  const operational = config ? toOperationalConfig(config) : DEFAULT_OPERATIONAL;
  const geometry = profile ? profileToGeometry(profile) : null;
  return mergeDeviceConfig(operational, geometry, device.configVersion);
}

// Per-device sync mode, defaulting to `piggyback` when no DeviceConfig row
// exists. Used by the MQTT gateway to decide whether to push fresh config on
// every telemetry (live) or only when the device is stale (piggyback).
export async function getSyncMode(internalDeviceId: string): Promise<SyncMode> {
  const config = await prisma.deviceConfig.findUnique({ where: { deviceId: internalDeviceId } });
  return (config?.syncMode as SyncMode) ?? 'piggyback';
}

// Set a device's MQTT sync mode. Bumps the config version so the change
// propagates on the device's next check-in (or an immediate push in live mode).
export async function setSyncMode(device: Device, syncMode: SyncMode): Promise<SyncMode> {
  const updated = await prisma.deviceConfig.upsert({
    where: { deviceId: device.id },
    create: { deviceId: device.id, syncMode },
    update: { syncMode },
  });
  await bumpConfigVersion(device.id);
  void pushConfigToDevice(device.id);
  return updated.syncMode as SyncMode;
}

export interface AlertThresholdsInput {
  tank_low_threshold_pct?: number | null;
  tank_full_threshold_pct?: number | null;
  battery_low_threshold_v?: number | null;
}

export async function updateAlertThresholds(device: Device, input: AlertThresholdsInput): Promise<ConfigDto> {
  const existing = await prisma.deviceConfig.findUnique({ where: { deviceId: device.id } });

  const data = {
    tankLowThresholdPct: input.tank_low_threshold_pct !== undefined ? input.tank_low_threshold_pct : existing?.tankLowThresholdPct ?? null,
    tankFullThresholdPct: input.tank_full_threshold_pct !== undefined ? input.tank_full_threshold_pct : existing?.tankFullThresholdPct ?? null,
    batteryLowThresholdV: input.battery_low_threshold_v !== undefined ? input.battery_low_threshold_v : existing?.batteryLowThresholdV ?? null,
  };

  const config = await prisma.deviceConfig.upsert({
    where: { deviceId: device.id },
    create: { deviceId: device.id, ...data },
    update: data,
  });

  // Config changed -> device is now stale on its next check-in.
  await bumpConfigVersion(device.id);

  // Fire-and-forget MQTT push (retained). Never throws (broker-down is
  // swallowed + logged), so it can't break this HTTP response.
  void pushConfigToDevice(device.id);

  return toConfigDto(config);
}

export async function claimDevice(claimCode: string, hardwareId: string): Promise<{ deviceToken: string; deviceId: string }> {
  const codeHash = hashClaimCode(claimCode);

  const device = await prisma.$transaction(async (tx) => {
    const claim = await tx.deviceClaimCode.findFirst({
      where: { codeHash, consumedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!claim) throw new HttpError(404, 'Invalid or expired claim code');

    let device = await tx.device.findUnique({ where: { deviceId: hardwareId } });
    if (device) {
      if (device.tenantId !== claim.tenantId) {
        throw new HttpError(409, 'Device already claimed by a different account');
      }
    } else {
      device = await tx.device.create({
        data: { deviceId: hardwareId, tenantId: claim.tenantId, status: 'offline' },
      });
    }

    // A 0-row update means a concurrent request already won the race to
    // consume this code.
    const consumed = await tx.deviceClaimCode.updateMany({
      where: { id: claim.id, consumedAt: null },
      data: { consumedAt: new Date(), deviceId: device.id },
    });
    if (consumed.count === 0) {
      throw new HttpError(404, 'Invalid or expired claim code');
    }

    return device;
  });

  const deviceToken = await createDeviceToken(hardwareId);

  // The device verifies provisioning by subscribing to its retained MQTT
  // config immediately after this response. Publish it before replying, so a
  // brand-new claim is bootstrappable even when no dashboard setting changed.
  await pushConfigToDevice(device.id);

  return { deviceToken, deviceId: hardwareId };
}

export interface MeasurementInput {
  firmwareVersion?: string;
  // null means the device couldn't get a real reading this cycle - stored
  // as-is (never coerced to 0) so it's excluded from percent/aggregate math.
  levelCm: number | null;
  volumeL: number | null;
  temperatureC?: number | null;
  batteryV?: number;
  rssi?: number;
  // Config version the device currently holds; used to decide whether to
  // piggyback the full config on the response.
  configVersion?: number | null;
}

export async function recordMeasurement(
  device: Device,
  data: MeasurementInput
): Promise<{ measurementId: string; config: DeviceConfigPayload | null; configVersion: number }> {
  // Canonical volume is computed server-side from the measured level and the
  // tank's calibration profile, so liters and percent are always derived from
  // the same geometry and can never disagree on the dashboard. The device-sent
  // volumeL (computed on-chip from compile-time constants) is only trusted as a
  // fallback for unprovisioned devices that have no TankProfile yet.
  const profile = await getTankProfileRaw(device.id);
  const volumeL = profile
    ? computeVolumeL(
        {
          shape: profile.shape,
          parallelUnitCount: profile.parallelUnitCount,
          heightCm: profile.heightCm.toNumber(),
          diameterCm: profile.diameterCm?.toNumber() ?? null,
          lengthCm: profile.lengthCm?.toNumber() ?? null,
          widthCm: profile.widthCm?.toNumber() ?? null,
          nominalUnitVolumeL: profile.nominalUnitVolumeL?.toNumber() ?? null,
          sensorOffsetCm: profile.sensorOffsetCm.toNumber(),
          deadZoneCm: profile.deadZoneCm.toNumber(),
        },
        data.levelCm
      )
    : data.volumeL;

  const measurement = await prisma.measurement.create({
    data: {
      deviceId: device.id,
      levelCm: data.levelCm,
      volumeL,
      temperatureC: data.temperatureC ?? null,
      batteryV: data.batteryV ?? null,
      rssi: data.rssi ?? null,
    },
  });

  await prisma.device.update({
    where: { id: device.id },
    data: {
      lastSeen: new Date(),
      status: 'online',
      firmwareVersion: data.firmwareVersion ?? device.firmwareVersion,
    },
  });

  // Fire-and-forget: the device shouldn't wait on alert delivery.
  processAlertsForMeasurement(device.id, {
    levelCm: data.levelCm,
    volumeL,
    batteryV: data.batteryV ?? null,
  }).catch((err) => {
    console.error('Error processing alerts:', err);
  });

  // Piggyback: only send the full merged config when the device is stale.
  // Otherwise it's up to date, so we save bandwidth and return config: null.
  // recordMeasurement never mutates config, so device.configVersion is current.
  const config = isConfigStale(device.configVersion, data.configVersion)
    ? await buildDeviceConfig(device)
    : null;

  return {
    measurementId: measurement.id,
    config,
    configVersion: device.configVersion,
  };
}

export async function getDeviceConfig(device: Device): Promise<DeviceConfigPayload> {
  return buildDeviceConfig(device);
}
