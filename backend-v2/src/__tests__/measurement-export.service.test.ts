import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { HttpError } from '../lib/http-error';
import {
  buildMeasurementsCsv,
  buildUserExportDeviceWhere,
  validateMeasurementExportRequest,
  type MeasurementExportRow,
} from '../services/measurement-export.service';

test('buildMeasurementsCsv emits chronological inspection fields and preserves null sensor values', () => {
  const rows: MeasurementExportRow[] = [{
    id: 'reading-1',
    timestamp: new Date('2026-07-21T05:30:00.000Z'),
    createdAt: new Date('2026-07-21T05:30:02.000Z'),
    levelCm: new Prisma.Decimal('42.25'),
    volumeL: new Prisma.Decimal('756.10'),
    temperatureC: null,
    batteryV: new Prisma.Decimal('4.98'),
    rssi: -61,
    device: {
      id: 'internal-device-1',
      deviceId: 'tank-001',
      name: 'Roof tank',
      tenantId: 'tenant-1',
      tenant: { name: 'Joshi Home' },
    },
  }];

  const csv = buildMeasurementsCsv(rows);
  assert.match(csv, /^\uFEFFtimestamp_utc,received_at_utc/);
  assert.match(csv, /"2026-07-21T05:30:00.000Z"/);
  assert.match(csv, /"tank-001","Roof tank"/);
  assert.match(csv, /42.25,756.1,,4.98,-61/);
});

test('buildMeasurementsCsv neutralizes spreadsheet formulas in names', () => {
  const row = {
    id: 'reading-1',
    timestamp: new Date('2026-07-21T05:30:00.000Z'),
    createdAt: new Date('2026-07-21T05:30:00.000Z'),
    levelCm: null,
    volumeL: null,
    temperatureC: null,
    batteryV: null,
    rssi: null,
    device: {
      id: 'internal-device-1',
      deviceId: 'tank-001',
      name: '=HYPERLINK("https://example.test")',
      tenantId: null,
      tenant: null,
    },
  } as MeasurementExportRow;

  assert.match(buildMeasurementsCsv([row]), /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
});

test('validateMeasurementExportRequest deduplicates devices and rejects invalid ranges', () => {
  const valid = validateMeasurementExportRequest({
    hardwareDeviceIds: ['tank-001', ' tank-001 ', 'tank-002'],
    from: new Date('2026-07-01T00:00:00.000Z'),
    to: new Date('2026-07-02T00:00:00.000Z'),
  });
  assert.deepEqual(valid.hardwareDeviceIds, ['tank-001', 'tank-002']);

  assert.throws(
    () => validateMeasurementExportRequest({
      hardwareDeviceIds: ['tank-001'],
      from: new Date('2026-07-02T00:00:00.000Z'),
      to: new Date('2026-07-01T00:00:00.000Z'),
    }),
    (err: unknown) => err instanceof HttpError && err.status === 400
  );
});

test('buildUserExportDeviceWhere scopes selections to tenant or explicit user-device access', () => {
  assert.deepEqual(buildUserExportDeviceWhere('tenant-1', 'user-1', ['tank-001', 'tank-002']), {
    deviceId: { in: ['tank-001', 'tank-002'] },
    OR: [
    { tenantId: 'tenant-1' },
    { userMappings: { some: { userId: 'user-1' } } },
    ],
  });
});
