import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma, type Device, type HourlyUsage, type TankEvent } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { rebuildDeviceDays } from '../services/rollup.service';
import { stubModel } from './helpers/http';
import { getHourlyUsage, getTankEvents, getUsageHistory } from '../services/usage.service';

const now = new Date('2026-10-22T12:00:00Z');
const device = {
  id: 'internal-1',
  deviceId: 'tank-1',
  status: 'online',
  timezone: 'Asia/Kolkata',
} as Device;
const D = (v: number) => new Prisma.Decimal(v);
const hour = (usedL: number, observedSeconds: number): HourlyUsage => ({
  id: 'h1',
  deviceId: device.id,
  hourStart: new Date('2026-10-22T11:30:00Z'),
  usedL: D(usedL),
  filledL: D(0),
  minL: null,
  maxL: null,
  avgL: null,
  readings: 1,
  observedSeconds,
  updatedAt: now,
});

test('unverified legacy cache and an isolated sample cannot expose 278 L or fake zero use', async (t) => {
  stubModel(t, 'hourlyUsage', { findMany: async () => [hour(278, 0)] });
  const result = await getHourlyUsage(device, 'today', now);
  assert.equal(result.hours[0].used_l, null);
  assert.equal(result.totals.used_l, null);
  assert.equal(result.today.used_l, null);
  assert.equal(result.totals.observed_seconds, 0);
});

test('measured zero remains zero, distinct from an empty window', async (t) => {
  stubModel(t, 'hourlyUsage', { findMany: async () => [hour(0, 1200)] });
  const result = await getHourlyUsage(device, 'today', now);
  assert.equal(result.totals.used_l, 0);
  assert.equal(result.today.used_l, 0);
  assert.equal(result.totals.observed_seconds, 1200);
});

test('no hourly rows produce unknown usage rather than zero', async (t) => {
  stubModel(t, 'hourlyUsage', { findMany: async () => [] });
  const result = await getHourlyUsage(device, '24h', now);
  assert.equal(result.totals.used_l, null);
  assert.equal(result.today.filled_l, null);
});

test('offline and stale activity cannot retain a cached ongoing flag', async (t) => {
  const event: TankEvent = {
    id: 'e1',
    deviceId: device.id,
    kind: 'fill',
    startedAt: new Date('2026-10-22T11:00:00Z'),
    endedAt: new Date('2026-10-22T11:59:00Z'),
    startL: D(200),
    endL: D(600),
    volumeL: D(400),
    rateLPerMin: D(7),
    readings: 12,
    ongoing: true,
    createdAt: now,
  };
  stubModel(t, 'tankEvent', { findMany: async () => [event] });
  stubModel(t, 'deviceConfig', {
    findUnique: async () => ({ reportIntervalMs: 300000, offlineThresholdMin: null }),
  });
  assert.equal(
    (await getTankEvents({ ...device, status: 'offline' }, 'today', now)).events[0].ongoing,
    false,
  );
  assert.equal((await getTankEvents(device, 'today', now)).events[0].ongoing, true);
  assert.equal(
    (await getTankEvents(device, 'today', new Date('2026-10-22T13:00:00Z'))).events[0].ongoing,
    false,
  );
});

test('one reading per hour is not a full day or a reliable hour-of-day pattern', async (t) => {
  stubModel(t, 'tankProfile', { findUnique: async () => null });
  stubModel(t, 'hourlyUsage', {
    findMany: async () =>
      Array.from({ length: 24 }, (_, i) => ({
        ...hour(0, 0),
        hourStart: new Date(Date.parse('2026-10-21T18:30:00Z') + i * 3600000),
      })),
  });
  stubModel(t, 'dailySummary', {
    findMany: async () => [
      {
        id: 'd1',
        deviceId: device.id,
        date: new Date('2026-10-22T00:00:00Z'),
        totalUsageL: D(0),
        totalFilledL: D(0),
        minVolumeL: null,
        maxVolumeL: null,
        avgVolumeL: null,
        refillEvents: 0,
        leakSuspected: false,
        readings: 24,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
  const result = await getUsageHistory(device, { from: '2026-10-22', to: '2026-10-22' }, now);
  assert.equal(result.totals.full_days, 0);
  assert.equal(result.totals.daily_average_l, null);
  assert.equal(result.totals.used_l, null);
  assert.ok(result.by_hour.every((h) => h.average_l == null));
});

test('rebuilding the real reconnect pattern preserves invalid cycles and never caches a phantom draw', async (t) => {
  const profile = {
    shape: 'cylindrical',
    parallelUnitCount: 2,
    heightCm: D(90),
    diameterCm: D(90),
    lengthCm: null,
    widthCm: null,
    nominalUnitVolumeL: null,
    sensorOffsetCm: D(5),
    deadZoneCm: D(25),
  };
  stubModel(t, 'device', {
    findUnique: async () => ({
      ...device,
      tenantId: null,
      tankProfile: profile,
      config: { reportIntervalMs: 300000 },
    }),
  });
  const row = (time: string, level: number | null) => ({
    timestamp: new Date(`2026-10-22T${time}:00+05:30`),
    levelCm: level == null ? null : D(level),
    volumeL: null,
  });
  const rows = [row('16:49', 49), row('16:50', null), row('16:51', 70), row('16:52', 70)];
  stubModel(t, 'measurement', {
    findFirst: async () => ({
      timestamp: new Date('2026-10-18T13:13:10.925Z'),
      levelCm: D(32),
      volumeL: D(1030.6),
    }),
    findMany: async () => rows,
  });
  let savedHours: Array<{ usedL: number; observedSeconds: number }> = [];
  let savedEvents: unknown[] = [];
  stubModel(t, 'hourlyUsage', {
    deleteMany: async () => ({ count: 0 }),
    createMany: async ({ data }: { data: typeof savedHours }) => {
      savedHours = data;
      return { count: data.length };
    },
  });
  stubModel(t, 'tankEvent', {
    deleteMany: async () => ({ count: 0 }),
    createMany: async ({ data }: { data: unknown[] }) => {
      savedEvents = data;
      return { count: data.length };
    },
  });
  stubModel(t, 'dailySummary', {
    findUnique: async () => null,
    upsert: async () => ({}),
    deleteMany: async () => ({ count: 0 }),
  });
  t.mock.method(prisma, '$transaction', async (ops: Promise<unknown>[]) => Promise.all(ops));
  await rebuildDeviceDays(device.id, ['2026-10-22'], new Date('2026-10-22T14:00:00Z'));
  assert.equal(
    savedHours.reduce((s, h) => s + h.usedL, 0),
    0,
  );
  assert.equal(
    savedHours.reduce((s, h) => s + h.observedSeconds, 0),
    60,
  );
  assert.deepEqual(savedEvents, []);
});

test('a partial recorded hour remains visible for one day but cannot become a usual-hour pattern', async (t) => {
  stubModel(t, 'tankProfile', { findUnique: async () => null });
  stubModel(t, 'dailySummary', { findMany: async () => [] });
  stubModel(t, 'hourlyUsage', { findMany: async () => [hour(40, 1200)] });
  const oneDay = await getUsageHistory(device, { from: '2026-10-22', to: '2026-10-22' }, now);
  assert.equal(oneDay.by_hour.find((h) => h.hour === 17)?.average_l, 40);
  const pattern = await getUsageHistory(device, { from: '2026-10-21', to: '2026-10-22' }, now);
  assert.ok(pattern.by_hour.every((h) => h.average_l == null));
});
