import { Device, DeviceConfig, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { hashClaimCode } from '../lib/claim-code';
import { createDeviceToken } from '../lib/device-token';

export function toMeasurementDto(m: {
  timestamp: Date;
  levelCm: Prisma.Decimal;
  volumeL: Prisma.Decimal;
  temperatureC: Prisma.Decimal | null;
  batteryV: Prisma.Decimal | null;
  rssi: number | null;
}) {
  return {
    timestamp: m.timestamp,
    level_cm: m.levelCm.toNumber(),
    volume_l: m.volumeL.toNumber(),
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

const DEFAULT_CONFIG: ConfigDto = {
  measurement_interval_ms: 60000,
  report_interval_ms: 300000,
  tank_full_threshold_l: 900.0,
  tank_low_threshold_l: 100.0,
  tank_full_threshold_pct: null,
  tank_low_threshold_pct: null,
  battery_low_threshold_v: 3.3,
  level_empty_cm: null,
  level_full_cm: null,
};

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

  return toConfigDto(config);
}

export async function claimDevice(claimCode: string, hardwareId: string): Promise<{ deviceToken: string; deviceId: string }> {
  const codeHash = hashClaimCode(claimCode);

  await prisma.$transaction(async (tx) => {
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
  });

  const deviceToken = await createDeviceToken(hardwareId);
  return { deviceToken, deviceId: hardwareId };
}

export interface MeasurementInput {
  firmwareVersion?: string;
  levelCm: number;
  volumeL: number;
  temperatureC?: number;
  batteryV?: number;
  rssi?: number;
}

export async function recordMeasurement(
  device: Device,
  data: MeasurementInput
): Promise<{ measurementId: string; config: ConfigDto | null }> {
  const measurement = await prisma.measurement.create({
    data: {
      deviceId: device.id,
      levelCm: data.levelCm,
      volumeL: data.volumeL,
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

  const config = await prisma.deviceConfig.findUnique({ where: { deviceId: device.id } });

  // Fire-and-forget: the device shouldn't wait on alert delivery.
  processAlertsForMeasurement(device.id, {
    levelCm: data.levelCm,
    volumeL: data.volumeL,
    batteryV: data.batteryV ?? null,
  }).catch((err) => {
    console.error('Error processing alerts:', err);
  });

  return {
    measurementId: measurement.id,
    config: config ? toConfigDto(config) : null,
  };
}

export async function getDeviceConfig(device: Device): Promise<ConfigDto> {
  const config = await prisma.deviceConfig.findUnique({ where: { deviceId: device.id } });
  return config ? toConfigDto(config) : DEFAULT_CONFIG;
}
