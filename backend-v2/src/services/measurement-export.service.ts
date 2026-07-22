import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';

export const MAX_EXPORT_DEVICES = 100;
export const MAX_EXPORT_ROWS = 100_000;
export const MAX_EXPORT_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

export interface MeasurementExportRequest {
  hardwareDeviceIds: string[];
  from: Date;
  to: Date;
}

interface ExportDevice {
  id: string;
  deviceId: string;
  name: string | null;
  tenantId: string | null;
  tenant: { name: string } | null;
}

export interface MeasurementExportRow {
  id: string;
  timestamp: Date;
  createdAt: Date;
  levelCm: Prisma.Decimal | null;
  volumeL: Prisma.Decimal | null;
  temperatureC: Prisma.Decimal | null;
  batteryV: Prisma.Decimal | null;
  rssi: number | null;
  device: ExportDevice;
}

function normalizeDeviceIds(deviceIds: string[]): string[] {
  return [...new Set(deviceIds.map((id) => id.trim()).filter(Boolean))];
}

export function validateMeasurementExportRequest(request: MeasurementExportRequest): MeasurementExportRequest {
  const hardwareDeviceIds = normalizeDeviceIds(request.hardwareDeviceIds);
  if (hardwareDeviceIds.length === 0) throw new HttpError(400, 'Select at least one device');
  if (hardwareDeviceIds.length > MAX_EXPORT_DEVICES) {
    throw new HttpError(400, `Select no more than ${MAX_EXPORT_DEVICES} devices`);
  }
  if (!Number.isFinite(request.from.getTime()) || !Number.isFinite(request.to.getTime())) {
    throw new HttpError(400, 'Invalid export time range');
  }
  if (request.to <= request.from) throw new HttpError(400, 'Export end time must be after start time');
  if (request.to.getTime() - request.from.getTime() > MAX_EXPORT_RANGE_MS) {
    throw new HttpError(400, 'Export time range cannot exceed 366 days');
  }
  if (request.to.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new HttpError(400, 'Export end time cannot be in the future');
  }
  return { hardwareDeviceIds, from: request.from, to: request.to };
}

function csvCell(value: string | number | null): string {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  let rendered = String(value);
  // Prevent spreadsheet programs from interpreting names/IDs as formulas.
  if (/^[=+\-@\t\r]/.test(rendered)) rendered = `'${rendered}`;
  return `"${rendered.replace(/"/g, '""')}"`;
}

function decimalValue(value: Prisma.Decimal | null): number | null {
  return value?.toNumber() ?? null;
}

export function buildMeasurementsCsv(rows: MeasurementExportRow[]): string {
  const header = [
    'timestamp_utc',
    'received_at_utc',
    'measurement_id',
    'device_id',
    'device_name',
    'tenant_id',
    'tenant_name',
    'level_cm',
    'volume_l',
    'temperature_c',
    'battery_v',
    'rssi',
  ];
  const lines = rows.map((row) => [
    row.timestamp.toISOString(),
    row.createdAt.toISOString(),
    row.id,
    row.device.deviceId,
    row.device.name ?? row.device.deviceId,
    row.device.tenantId,
    row.device.tenant?.name ?? null,
    decimalValue(row.levelCm),
    decimalValue(row.volumeL),
    decimalValue(row.temperatureC),
    decimalValue(row.batteryV),
    row.rssi,
  ].map(csvCell).join(','));

  // UTF-8 BOM keeps device/tenant names readable when opened directly in Excel.
  return `\uFEFF${header.join(',')}\r\n${lines.join('\r\n')}${lines.length ? '\r\n' : ''}`;
}

async function loadExportRows(devices: ExportDevice[], request: MeasurementExportRequest): Promise<MeasurementExportRow[]> {
  const rows = await prisma.measurement.findMany({
    where: {
      deviceId: { in: devices.map((device) => device.id) },
      timestamp: { gte: request.from, lte: request.to },
    },
    include: {
      device: {
        select: {
          id: true,
          deviceId: true,
          name: true,
          tenantId: true,
          tenant: { select: { name: true } },
        },
      },
    },
    orderBy: [{ timestamp: 'asc' }, { deviceId: 'asc' }],
    take: MAX_EXPORT_ROWS + 1,
  });

  if (rows.length > MAX_EXPORT_ROWS) {
    throw new HttpError(413, `Export exceeds ${MAX_EXPORT_ROWS.toLocaleString('en-US')} rows; select fewer devices or a shorter timeline`);
  }
  return rows;
}

function assertAllDevicesResolved(requestedIds: string[], devices: ExportDevice[], status: number): void {
  const found = new Set(devices.map((device) => device.deviceId));
  if (requestedIds.some((id) => !found.has(id))) {
    throw new HttpError(status, status === 403 ? 'One or more selected devices are not accessible' : 'One or more selected devices were not found');
  }
}

export function buildUserExportDeviceWhere(tenantId: string, userId: string, hardwareDeviceIds: string[]) {
  return {
    deviceId: { in: hardwareDeviceIds },
    OR: [{ tenantId }, { userMappings: { some: { userId } } }],
  };
}

export async function exportUserMeasurements(
  tenantId: string,
  userId: string,
  input: MeasurementExportRequest
): Promise<{ csv: string; rowCount: number }> {
  const request = validateMeasurementExportRequest(input);
  const devices = await prisma.device.findMany({
    where: buildUserExportDeviceWhere(tenantId, userId, request.hardwareDeviceIds),
    select: {
      id: true,
      deviceId: true,
      name: true,
      tenantId: true,
      tenant: { select: { name: true } },
    },
  });
  assertAllDevicesResolved(request.hardwareDeviceIds, devices, 403);
  const rows = await loadExportRows(devices, request);
  return { csv: buildMeasurementsCsv(rows), rowCount: rows.length };
}

export async function exportAdminMeasurements(
  input: MeasurementExportRequest
): Promise<{ csv: string; rowCount: number }> {
  const request = validateMeasurementExportRequest(input);
  const devices = await prisma.device.findMany({
    where: { deviceId: { in: request.hardwareDeviceIds } },
    select: {
      id: true,
      deviceId: true,
      name: true,
      tenantId: true,
      tenant: { select: { name: true } },
    },
  });
  assertAllDevicesResolved(request.hardwareDeviceIds, devices, 404);
  const rows = await loadExportRows(devices, request);
  return { csv: buildMeasurementsCsv(rows), rowCount: rows.length };
}
