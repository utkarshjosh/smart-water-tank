import { DeviceStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../lib/http-error';
import { isUniqueConstraintError } from '../../lib/prisma-errors';
import { createDeviceToken } from '../../lib/device-token';
import { toConfigDto } from '../device.service';
import { getTankProfileRaw, volumeLForProfile } from '../tank-profile.service';
import { toAdminAlertDto } from './shared';

// Fleet-wide device administration: listing, creation, detail, config, and
// decommissioning. Tenant-scoped device access lives in user.service.

export async function listDevices(filters: {
  tenantId?: string;
  status?: DeviceStatus;
  includeArchived?: boolean;
}) {
  const devices = await prisma.device.findMany({
    where: {
      ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.includeArchived ? {} : { archivedAt: null }),
    },
    include: { tenant: true },
    orderBy: { createdAt: 'desc' },
  });

  return Promise.all(
    devices.map(async (device) => {
      const [latest, profile] = await Promise.all([
        prisma.measurement.findFirst({
          where: { deviceId: device.id },
          orderBy: { timestamp: 'desc' },
          select: { levelCm: true, volumeL: true, timestamp: true },
        }),
        getTankProfileRaw(device.id),
      ]);
      return {
        id: device.id,
        device_id: device.deviceId,
        name: device.name,
        tenant_id: device.tenantId,
        tenant_name: device.tenant?.name ?? null,
        status: device.status,
        firmware_version: device.firmwareVersion,
        last_seen: device.lastSeen,
        // Volume derived at read time from the current profile + level (like
        // level_percent); no profile -> stored snapshot; null level -> null.
        current_volume:
          profile != null
            ? volumeLForProfile(profile, latest?.levelCm?.toNumber() ?? null)
            : latest?.volumeL != null
              ? latest.volumeL.toNumber()
              : null,
        last_measurement: latest ? latest.timestamp : null,
        created_at: device.createdAt,
        // The admin list is the only place a decommissioned device can be seen
        // or restored, so it has to say which rows are decommissioned. Without
        // this the client cannot tell them apart and offers to decommission a
        // device that already is.
        archived_at: device.archivedAt,
      };
    })
  );
}

export async function createDevice(data: { deviceId: string; tenantId: string; name?: string }) {
  const existing = await prisma.device.findUnique({ where: { deviceId: data.deviceId } });
  if (existing) throw new HttpError(409, 'Device ID already exists');

  const tenant = await prisma.tenant.findUnique({ where: { id: data.tenantId } });
  if (!tenant) throw new HttpError(404, 'Tenant not found');

  let device;
  try {
    device = await prisma.device.create({
      data: { deviceId: data.deviceId, tenantId: data.tenantId, name: data.name || null, status: 'offline' },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new HttpError(409, 'Device ID already exists');
    throw err;
  }

  const token = await createDeviceToken(data.deviceId);

  return {
    device: {
      id: device.id,
      device_id: device.deviceId,
      tenant_id: device.tenantId,
      name: device.name,
      status: device.status,
      created_at: device.createdAt,
    },
    token,
  };
}

export async function getDeviceDetail(deviceId: string) {
  const device = await prisma.device.findUnique({
    where: { deviceId },
    include: { tenant: true, config: true },
  });
  if (!device) throw new HttpError(404, 'Device not found');

  const latestMeasurement = await prisma.measurement.findFirst({
    where: { deviceId: device.id },
    orderBy: { timestamp: 'desc' },
  });
  const recentAlerts = await prisma.alert.findMany({
    where: { deviceId: device.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return {
    id: device.id,
    device_id: device.deviceId,
    name: device.name,
    tenant_id: device.tenantId,
    tenant_name: device.tenant?.name ?? null,
    status: device.status,
    firmware_version: device.firmwareVersion,
    last_seen: device.lastSeen,
    created_at: device.createdAt,
    config: device.config ? toConfigDto(device.config) : null,
    latest_measurement: latestMeasurement
      ? {
          timestamp: latestMeasurement.timestamp,
          level_cm: latestMeasurement.levelCm?.toNumber() ?? null,
          volume_l: latestMeasurement.volumeL?.toNumber() ?? null,
          temperature_c: latestMeasurement.temperatureC?.toNumber() ?? null,
          battery_v: latestMeasurement.batteryV?.toNumber() ?? null,
          rssi: latestMeasurement.rssi,
        }
      : null,
    recent_alerts: recentAlerts.map(toAdminAlertDto),
  };
}

export interface DeviceConfigInput {
  measurement_interval_ms?: number;
  report_interval_ms?: number;
  tank_full_threshold_l?: number | null;
  tank_low_threshold_l?: number | null;
  battery_low_threshold_v?: number | null;
  level_empty_cm?: number | null;
  level_full_cm?: number | null;
  config_json?: unknown;
}

export async function upsertDeviceConfig(deviceId: string, body: DeviceConfigInput): Promise<void> {
  const device = await prisma.device.findUnique({ where: { deviceId } });
  if (!device) throw new HttpError(404, 'Device not found');

  const data = {
    measurementIntervalMs: body.measurement_interval_ms ?? 60000,
    reportIntervalMs: body.report_interval_ms ?? 300000,
    tankFullThresholdL: body.tank_full_threshold_l ?? null,
    tankLowThresholdL: body.tank_low_threshold_l ?? null,
    batteryLowThresholdV: body.battery_low_threshold_v ?? null,
    levelEmptyCm: body.level_empty_cm ?? null,
    levelFullCm: body.level_full_cm ?? null,
    configJson: (body.config_json ?? null) as any,
  };

  await prisma.deviceConfig.upsert({
    where: { deviceId: device.id },
    create: { deviceId: device.id, ...data },
    update: data,
  });
}

/**
 * Admin-side device edit: rename, and move a device between tenants.
 *
 * Reassigning a tenant is deliberately explicit rather than a side effect of
 * some other call - it changes who can see the device's whole history.
 */
export async function updateDevice(
  deviceIdString: string,
  data: { name?: string | null; tenantId?: string }
) {
  const device = await prisma.device.findUnique({ where: { deviceId: deviceIdString } });
  if (!device) throw new HttpError(404, 'Device not found');

  if (data.tenantId !== undefined) {
    const tenant = await prisma.tenant.findUnique({ where: { id: data.tenantId } });
    if (!tenant) throw new HttpError(404, 'Tenant not found');
  }

  const trimmed = data.name?.trim();
  const updated = await prisma.device.update({
    where: { id: device.id },
    data: {
      ...(data.name !== undefined ? { name: trimmed ? trimmed : null } : {}),
      ...(data.tenantId !== undefined ? { tenantId: data.tenantId } : {}),
    },
    include: { tenant: true },
  });

  return {
    id: updated.id,
    device_id: updated.deviceId,
    name: updated.name,
    tenant_id: updated.tenantId,
    tenant_name: updated.tenant?.name ?? null,
    status: updated.status,
  };
}

// --- Soft delete -----------------------------------------------------------
// Nothing here hard-deletes. Device -> everything is onDelete: Cascade, so a
// real DELETE would destroy every reading ever taken. Archiving blocks access
// (see getAccessibleDeviceOrThrow) while keeping history.

/** Decommission a device. Its readings stay; the API stops serving it. */
export async function archiveDevice(deviceIdString: string) {
  const device = await prisma.device.findUnique({ where: { deviceId: deviceIdString } });
  if (!device) throw new HttpError(404, 'Device not found');
  if (device.archivedAt) throw new HttpError(409, 'Device is already decommissioned');

  const measurements = await prisma.measurement.count({ where: { deviceId: device.id } });
  await prisma.device.update({ where: { id: device.id }, data: { archivedAt: new Date() } });
  return { device_id: device.deviceId, measurements_retained: measurements };
}

export async function restoreDevice(deviceIdString: string) {
  const device = await prisma.device.findUnique({ where: { deviceId: deviceIdString } });
  if (!device) throw new HttpError(404, 'Device not found');
  if (!device.archivedAt) throw new HttpError(409, 'Device is not decommissioned');

  // A device in an archived tenant would come back unreachable anyway.
  if (device.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: device.tenantId } });
    if (tenant?.archivedAt) throw new HttpError(409, 'Restore its tenant first');
  }

  await prisma.device.update({ where: { id: device.id }, data: { archivedAt: null } });
  return { device_id: device.deviceId };
}

export async function reissueDeviceToken(deviceId: string): Promise<string> {
  return createDeviceToken(deviceId);
}
