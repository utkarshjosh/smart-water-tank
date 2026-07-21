import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import { Device, FirmwareBinary } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { env } from '../config/env';

const IN_FLIGHT_ASSIGNMENT_STATUSES = ['pending', 'downloading', 'installing'] as const;

function resolveManagedFirmwarePath(filePathValue: string): string {
  const configuredStorageRoot = path.resolve(env.firmwareStoragePath);
  const storageRoot = fs.existsSync(configuredStorageRoot)
    ? fs.realpathSync.native(configuredStorageRoot)
    : configuredStorageRoot;
  const configuredFilePath = path.resolve(filePathValue);
  const filePath = fs.existsSync(configuredFilePath)
    ? fs.realpathSync.native(configuredFilePath)
    : configuredFilePath;
  const relativePath = path.relative(storageRoot, filePath);
  if (relativePath.startsWith('..' + path.sep) || relativePath === '..' || path.isAbsolute(relativePath)) {
    throw new HttpError(409, 'Refusing to delete a firmware file outside the configured storage directory');
  }
  return filePath;
}

export async function uploadFirmware(
  file: Express.Multer.File,
  version: string | undefined,
  description: string | undefined
): Promise<FirmwareBinary> {
  if (!version) {
    fs.unlinkSync(file.path);
    throw new HttpError(400, 'Version is required');
  }

  try {
    const fileBuffer = fs.readFileSync(file.path);
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    return await prisma.firmwareBinary.create({
      data: {
        version,
        filePath: file.path,
        fileSize: file.size,
        checksum,
        description: description || null,
        isActive: false,
      },
    });
  } catch (err) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    throw err;
  }
}

export async function listFirmware(): Promise<FirmwareBinary[]> {
  return prisma.firmwareBinary.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getFirmwareBinaryOrThrow(firmwareId: string): Promise<FirmwareBinary> {
  const firmware = await prisma.firmwareBinary.findUnique({ where: { id: firmwareId } });
  if (!firmware) throw new HttpError(404, 'Firmware not found');
  return firmware;
}

/**
 * Withdraw a release from OTA without deleting its binary or install history.
 *
 * Deactivating the firmware makes both the update check and authenticated
 * download endpoint reject it. Removing in-flight assignments prevents the
 * same release from becoming pending again if an operator later reactivates it.
 * Installed/failed assignments are retained as deployment history.
 */
export async function unrollFirmware(
  firmwareId: string
): Promise<{ firmwareId: string; version: string; cancelledAssignments: number }> {
  return prisma.$transaction(async (tx) => {
    const firmware = await tx.firmwareBinary.findUnique({ where: { id: firmwareId } });
    if (!firmware) throw new HttpError(404, 'Firmware not found');

    const cancelled = await tx.deviceFirmwareAssignment.deleteMany({
      where: {
        firmwareId,
        status: { in: [...IN_FLIGHT_ASSIGNMENT_STATUSES] },
      },
    });
    await tx.firmwareBinary.update({
      where: { id: firmwareId },
      data: { isActive: false, rolloutPercentage: 0 },
    });

    return {
      firmwareId,
      version: firmware.version,
      cancelledAssignments: cancelled.count,
    };
  });
}

/**
 * Delete a withdrawn firmware release and its managed binary.
 *
 * Active/in-flight releases must be unrolled first so an operator cannot
 * accidentally remove a binary that devices are still being told to install.
 */
export async function deleteFirmware(
  firmwareId: string
): Promise<{ firmwareId: string; version: string; fileDeleted: boolean }> {
  const deletion = await prisma.$transaction(async (tx) => {
    const record = await tx.firmwareBinary.findUnique({ where: { id: firmwareId } });
    if (!record) throw new HttpError(404, 'Firmware not found');

    const inFlightAssignments = await tx.deviceFirmwareAssignment.count({
      where: {
        firmwareId,
        status: { in: [...IN_FLIGHT_ASSIGNMENT_STATUSES] },
      },
    });
    if (record.isActive || inFlightAssignments > 0) {
      throw new HttpError(409, 'Firmware is active or still assigned; unroll it before deleting');
    }

    const filePath = resolveManagedFirmwarePath(record.filePath);
    await tx.firmwareBinary.delete({ where: { id: firmwareId } });
    return { firmware: record, filePath };
  });
  const { firmware, filePath } = deletion;

  let fileDeleted = false;
  try {
    await fs.promises.unlink(filePath);
    fileDeleted = true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Firmware ${firmwareId} metadata was deleted but its binary could not be removed:`, err);
    }
  }

  return { firmwareId, version: firmware.version, fileDeleted };
}

export async function rolloutFirmware(
  version: string,
  opts: { deviceIds?: string[]; tenantIds?: string[]; rolloutPercentage?: number }
): Promise<{ assignedDevices: number }> {
  const firmware = await prisma.firmwareBinary.findUnique({ where: { version } });
  if (!firmware) throw new HttpError(404, 'Firmware version not found');

  let deviceIds: string[];

  if (opts.deviceIds && opts.deviceIds.length > 0) {
    const devices = await prisma.device.findMany({
      where: { deviceId: { in: opts.deviceIds } },
      select: { id: true },
    });
    deviceIds = devices.map((d) => d.id);
  } else if (opts.tenantIds && opts.tenantIds.length > 0) {
    const devices = await prisma.device.findMany({
      where: { tenantId: { in: opts.tenantIds } },
      select: { id: true },
    });
    deviceIds = devices.map((d) => d.id);
  } else if (opts.rolloutPercentage) {
    const totalDevices = await prisma.device.count();
    const targetCount = Math.ceil((opts.rolloutPercentage / 100) * totalDevices);
    // Prisma's query builder has no random-order primitive; this is the
    // sole raw-SQL escape hatch in the app.
    const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM devices ORDER BY RAND() LIMIT ${targetCount}`;
    deviceIds = rows.map((r) => r.id);
  } else {
    throw new HttpError(400, 'Must specify device_ids, tenant_ids, or rollout_percentage');
  }

  for (const deviceId of deviceIds) {
    await prisma.deviceFirmwareAssignment.upsert({
      where: { deviceId_firmwareId: { deviceId, firmwareId: firmware.id } },
      create: { deviceId, firmwareId: firmware.id, status: 'pending' },
      update: { status: 'pending', assignedAt: new Date() },
    });
  }

  await prisma.firmwareBinary.update({
    where: { id: firmware.id },
    data: { rolloutPercentage: opts.rolloutPercentage || 0, isActive: true },
  });

  return { assignedDevices: deviceIds.length };
}

export async function checkOtaUpdate(device: Device, headerVersion?: string) {
  const currentVersion = headerVersion || device.firmwareVersion || '0.0.0';

  await prisma.device.update({ where: { id: device.id }, data: { lastOtaCheckAt: new Date() } });

  const assignment = await prisma.deviceFirmwareAssignment.findFirst({
    // A download request can fail after the server has started streaming the
    // binary. Keep `downloading` assignments eligible so the device can retry
    // rather than becoming permanently stuck until an operator re-rolls it.
    where: { deviceId: device.id, status: { in: ['pending', 'downloading'] }, firmware: { isActive: true } },
    include: { firmware: true },
    orderBy: { firmware: { createdAt: 'desc' } },
  });

  if (!assignment || assignment.firmware.version === currentVersion) {
    return { update_available: false, current_version: currentVersion };
  }

  const firmware = assignment.firmware;
  return {
    update_available: true,
    current_version: currentVersion,
    latest_version: firmware.version,
    download_url: `${env.apiBaseUrl}/api/v1/devices/${device.deviceId}/ota/download/${firmware.id}`,
    file_size: firmware.fileSize,
    checksum: firmware.checksum,
  };
}

export async function getTenantFacingOtaStatus(device: Device) {
  const latestActive = await prisma.firmwareBinary.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  const pendingAssignment = await prisma.deviceFirmwareAssignment.findFirst({
    where: { deviceId: device.id, status: { in: ['pending', 'downloading', 'installing'] } },
    include: { firmware: true },
    orderBy: { assignedAt: 'desc' },
  });

  return {
    current_version: device.firmwareVersion,
    latest_known_version: latestActive?.version ?? null,
    update_pending: !!pendingAssignment && pendingAssignment.firmware.version !== device.firmwareVersion,
    last_checked_at: device.lastOtaCheckAt,
  };
}

export async function getAssignedFirmwareOrThrow(device: Device, firmwareId: string): Promise<FirmwareBinary> {
  const assignment = await prisma.deviceFirmwareAssignment.findFirst({
    where: {
      deviceId: device.id,
      firmwareId,
      status: { in: ['pending', 'downloading'] },
      firmware: { isActive: true },
    },
    include: { firmware: true },
  });
  if (!assignment) throw new HttpError(404, 'Firmware not found or not assigned to this device');
  return assignment.firmware;
}

export async function markFirmwareDownloading(deviceId: string, firmwareId: string): Promise<void> {
  try {
    await prisma.deviceFirmwareAssignment.updateMany({
      where: { deviceId, firmwareId },
      data: { status: 'downloading' },
    });
  } catch (err) {
    console.error('Error updating assignment status:', err);
  }
}
