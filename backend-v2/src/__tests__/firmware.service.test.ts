import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { FirmwareBinary } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { env } from '../config/env';
import { deleteFirmware, unrollFirmware } from '../services/firmware.service';

const firmware = {
  id: 'firmware-id',
  version: 'v0.1.2-ota-debug.10',
  filePath: '/tmp/firmware.bin',
  fileSize: 123,
  checksum: null,
  description: null,
  isActive: true,
  rolloutPercentage: 100,
  createdAt: new Date(),
} as FirmwareBinary;

test('unrollFirmware deactivates release and removes only in-flight assignments', async (t) => {
  let deleteWhere: unknown;
  let updateData: unknown;
  const tx = {
    firmwareBinary: {
      findUnique: async () => firmware,
      update: async ({ data }: { data: unknown }) => {
        updateData = data;
        return firmware;
      },
    },
    deviceFirmwareAssignment: {
      deleteMany: async ({ where }: { where: unknown }) => {
        deleteWhere = where;
        return { count: 3 };
      },
    },
  };
  t.mock.method(prisma, '$transaction', async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx));

  const result = await unrollFirmware(firmware.id);

  assert.deepEqual(result, {
    firmwareId: firmware.id,
    version: firmware.version,
    cancelledAssignments: 3,
  });
  assert.deepEqual(updateData, { isActive: false, rolloutPercentage: 0 });
  assert.deepEqual(deleteWhere, {
    firmwareId: firmware.id,
    status: { in: ['pending', 'downloading', 'installing'] },
  });
});

test('deleteFirmware refuses an active release', async (t) => {
  const tx = {
    firmwareBinary: {
      findUnique: async () => firmware,
      delete: async () => firmware,
    },
    deviceFirmwareAssignment: {
      count: async () => 1,
    },
  };
  t.mock.method(prisma, '$transaction', async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx));

  await assert.rejects(
    deleteFirmware(firmware.id),
    (err: unknown) => err instanceof HttpError && err.status === 409 && err.message.includes('unroll')
  );
});

test('deleteFirmware removes withdrawn metadata and managed binary', async (t) => {
  const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'aquamind-firmware-test-'));
  const binaryPath = path.join(storagePath, 'firmware.bin');
  fs.writeFileSync(binaryPath, Buffer.from([0xe9, 0x00, 0x00, 0x00]));
  t.after(() => fs.rmSync(storagePath, { recursive: true, force: true }));

  const previousStoragePath = env.firmwareStoragePath;
  env.firmwareStoragePath = storagePath;
  t.after(() => {
    env.firmwareStoragePath = previousStoragePath;
  });

  const withdrawnFirmware = { ...firmware, filePath: binaryPath, isActive: false, rolloutPercentage: 0 };
  let deletedId: string | undefined;
  const tx = {
    firmwareBinary: {
      findUnique: async () => withdrawnFirmware,
      delete: async ({ where }: { where: { id: string } }) => {
        deletedId = where.id;
        return withdrawnFirmware;
      },
    },
    deviceFirmwareAssignment: {
      count: async () => 0,
    },
  };
  t.mock.method(prisma, '$transaction', async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx));

  const result = await deleteFirmware(withdrawnFirmware.id);

  assert.equal(deletedId, withdrawnFirmware.id);
  assert.equal(result.fileDeleted, true);
  assert.equal(fs.existsSync(binaryPath), false);
});
