import { test, TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma, type Device, type DeviceConfig } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { env } from '../config/env';
import * as fcm from '../services/fcm.service';
import {
  buildAlertRulesWrite,
  getAlertRules,
  resolveAlertRules,
  updateAlertRules,
} from '../services/alert-rules.service';
import { checkDeviceOfflineAlerts, processAlertsForMeasurement } from '../services/alert.service';
import { unpairDevice } from '../services/user.service';

// --- fixtures ---------------------------------------------------------------

const device = {
  id: 'dev-uuid',
  deviceId: 'AQM-0042',
  tenantId: 'tenant-1',
  name: 'Roof tank',
  firmwareVersion: null,
  lastSeen: new Date(),
  status: 'online',
  lastOtaCheckAt: null,
  configVersion: 3,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Device;

function configRow(overrides: Partial<DeviceConfig> = {}): DeviceConfig {
  return {
    id: 'cfg-uuid',
    deviceId: device.id,
    measurementIntervalMs: 60000,
    reportIntervalMs: 300000,
    tankFullThresholdL: null,
    tankLowThresholdL: null,
    tankFullThresholdPct: null,
    tankLowThresholdPct: null,
    batteryLowThresholdV: null,
    levelEmptyCm: null,
    levelFullCm: null,
    syncMode: 'piggyback',
    configJson: null,
    alertRules: null,
    offlineThresholdMin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Prisma model delegates are proxies with no own methods, so t.mock.method
// cannot patch `prisma.device.findUnique`; the whole delegate is swapped for
// the duration of one test instead.
function stubModel(t: TestContext, model: keyof typeof prisma, impl: Record<string, unknown>): void {
  const original = prisma[model];
  Object.defineProperty(prisma, model, { value: impl, configurable: true, writable: true });
  t.after(() => Object.defineProperty(prisma, model, { value: original, configurable: true, writable: true }));
}

// Alert creation and push delivery, stubbed. Returns the alerts "raised".
function stubAlertSink(t: TestContext): { created: Array<{ type: string; severity: string }> } {
  const created: Array<{ type: string; severity: string }> = [];
  stubModel(t, 'alert', {
    findFirst: async () => null,
    create: async ({ data }: { data: { type: string; severity: string } }) => {
      created.push({ type: data.type, severity: data.severity });
      return { id: `alert-${created.length}`, ...data };
    },
    update: async () => ({}),
  });
  t.mock.method(fcm, 'sendNotificationToTenant', async () => 0);
  return { created };
}

// --- GET --------------------------------------------------------------------

test('GET returns all five rules, enabled, with catalog defaults', async (t) => {
  stubModel(t, 'deviceConfig', { findUnique: async () => null });

  const { rules } = await getAlertRules(device);

  assert.deepEqual(
    rules.map((r) => r.type),
    ['tank_low', 'tank_full', 'battery_low', 'leak_detected', 'device_offline']
  );
  assert.ok(rules.every((r) => r.enabled));

  const byType = Object.fromEntries(rules.map((r) => [r.type, r]));
  assert.deepEqual(byType.tank_low.threshold, {
    value: null,
    default: null,
    unit: '%',
    min: 0,
    max: 100,
    comparison: 'below',
  });
  assert.equal(byType.tank_full.threshold?.comparison, 'above');
  assert.equal(byType.battery_low.threshold?.default, 3.3);
  assert.equal(byType.battery_low.threshold?.unit, 'V');
  assert.equal(byType.leak_detected.threshold, null);
  assert.equal(byType.leak_detected.source, 'pattern');
  assert.equal(byType.device_offline.threshold?.default, env.alertOfflineThresholdMinutes);
  assert.equal(byType.device_offline.threshold?.unit, 'min');
  assert.equal(byType.device_offline.source, 'schedule');

  for (const rule of rules) {
    assert.ok(rule.label.length > 0 && rule.description.length > 0, `${rule.type} needs copy`);
    assert.ok(['critical', 'high', 'medium', 'low'].includes(rule.severity));
  }
});

test('GET reflects stored overrides and switches', () => {
  const rules = resolveAlertRules(
    configRow({
      batteryLowThresholdV: new Prisma.Decimal(3.6),
      offlineThresholdMin: 240,
      alertRules: { leak_detected: { enabled: false } },
    })
  );
  const byType = Object.fromEntries(rules.map((r) => [r.type, r]));

  assert.equal(byType.battery_low.threshold?.value, 3.6);
  assert.equal(byType.battery_low.threshold?.default, 3.3);
  assert.equal(byType.device_offline.threshold?.value, 240);
  assert.equal(byType.leak_detected.enabled, false);
  assert.equal(byType.tank_low.enabled, true);
});

// --- PUT --------------------------------------------------------------------

test('PUT disables battery_low, and a reading below threshold then raises nothing', async (t) => {
  // No config row yet: the upsert creates one from the write.
  let stored: DeviceConfig | null = null;
  stubModel(t, 'deviceConfig', {
    findUnique: async () => stored,
    upsert: async ({ create }: { create: Partial<DeviceConfig> }) => {
      stored = configRow(create);
      return stored;
    },
  });
  stubModel(t, 'device', {
    update: async () => device, // bumpConfigVersion
    findUnique: async () => ({ ...device, config: stored, tankProfile: null }),
  });
  const sink = stubAlertSink(t);

  // Control: with the rule on, 3.0 V is below the 3.3 V default and fires.
  await processAlertsForMeasurement(device.id, { levelCm: null, volumeL: null, batteryV: 3.0 });
  assert.deepEqual(sink.created, [{ type: 'battery_low', severity: 'medium' }]);

  const { rules } = await updateAlertRules(device, { battery_low: { enabled: false } });
  assert.equal(rules.find((r) => r.type === 'battery_low')?.enabled, false);
  assert.deepEqual(stored!.alertRules, { battery_low: { enabled: false } });

  sink.created.length = 0;
  await processAlertsForMeasurement(device.id, { levelCm: null, volumeL: null, batteryV: 3.0 });
  assert.deepEqual(sink.created, []);
});

test('PUT threshold null clears the override back to the default', async (t) => {
  let stored = configRow({ batteryLowThresholdV: new Prisma.Decimal(3.5) });
  let written: Record<string, unknown> | null = null;
  stubModel(t, 'deviceConfig', {
    findUnique: async () => stored,
    upsert: async ({ update }: { update: Record<string, unknown> }) => {
      written = update;
      stored = configRow({ ...stored, ...(update as Partial<DeviceConfig>) });
      return stored;
    },
  });
  stubModel(t, 'device', { update: async () => device });

  const { rules } = await updateAlertRules(device, { battery_low: { threshold: null } });

  assert.equal(written!.batteryLowThresholdV, null);
  const battery = rules.find((r) => r.type === 'battery_low')!;
  assert.equal(battery.threshold?.value, null);
  assert.equal(battery.threshold?.default, 3.3);
  // Untouched rules keep their switch.
  assert.ok(rules.every((r) => r.enabled));
});

test('PUT rejects an unknown rule type with 400', () => {
  assert.throws(
    () => buildAlertRulesWrite(null, { fridge_open: { enabled: false } }),
    (err: unknown) => err instanceof HttpError && err.status === 400 && err.message.includes('fridge_open')
  );
});

test('PUT rejects a threshold on a rule that has none, and one out of range', () => {
  assert.throws(
    () => buildAlertRulesWrite(null, { leak_detected: { threshold: 5 } }),
    (err: unknown) => err instanceof HttpError && err.status === 400
  );
  assert.throws(
    () => buildAlertRulesWrite(null, { tank_low: { threshold: 101 } }),
    (err: unknown) => err instanceof HttpError && err.status === 400
  );
  assert.throws(
    () => buildAlertRulesWrite(null, { device_offline: { threshold: 0 } }),
    (err: unknown) => err instanceof HttpError && err.status === 400
  );
  // In range writes the column, and other stored switches survive the merge.
  const write = buildAlertRulesWrite(configRow({ alertRules: { tank_full: { enabled: false } } }), {
    device_offline: { threshold: 90 },
  });
  assert.equal(write.offlineThresholdMin, 90);
  assert.deepEqual(write.alertRules, { tank_full: { enabled: false } });
});

// --- enforcement ------------------------------------------------------------

test('a litre threshold of 0 is a real setting, not "off"', async (t) => {
  const stored = configRow({ tankLowThresholdL: new Prisma.Decimal(0) });
  stubModel(t, 'device', {
    findUnique: async () => ({ ...device, config: stored, tankProfile: null }),
  });
  const sink = stubAlertSink(t);

  await processAlertsForMeasurement(device.id, { levelCm: 90, volumeL: 0, batteryV: null });
  assert.deepEqual(sink.created, [{ type: 'tank_low', severity: 'critical' }]);
});

test('offline check honours a per-device threshold override', async (t) => {
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const patient = { ...device, id: 'dev-a', deviceId: 'AQM-A', lastSeen: anHourAgo };
  const strict = { ...device, id: 'dev-b', deviceId: 'AQM-B', lastSeen: anHourAgo };
  const muted = { ...device, id: 'dev-c', deviceId: 'AQM-C', lastSeen: anHourAgo };

  const flipped: string[] = [];
  stubModel(t, 'device', {
    findMany: async () => [
      // Two hours allowed: an hour of silence is fine.
      { ...patient, config: configRow({ offlineThresholdMin: 120 }) },
      // No row: falls back to the env default (15 min) and trips.
      { ...strict, config: null },
      // Trips, but the rule is off: status flips, no alert.
      { ...muted, config: configRow({ alertRules: { device_offline: { enabled: false } } }) },
    ],
    update: async ({ where }: { where: { id: string } }) => {
      flipped.push(where.id);
      return device;
    },
    findUnique: async () => device,
  });
  const sink = stubAlertSink(t);

  await checkDeviceOfflineAlerts();

  assert.deepEqual(flipped, ['dev-b', 'dev-c']);
  assert.deepEqual(sink.created, [{ type: 'device_offline', severity: 'high' }]);
});

// --- unpair -----------------------------------------------------------------

test('unpair: the tenant owner detaches the device, clears its name and drops shares', async (t) => {
  let deletedMappings: unknown = null;
  let deviceWrite: unknown = null;
  stubModel(t, 'userDeviceMapping', {
    deleteMany: async ({ where }: { where: unknown }) => {
      deletedMappings = where;
      return { count: 2 };
    },
  });
  stubModel(t, 'device', {
    update: async ({ data }: { data: unknown }) => {
      deviceWrite = data;
      return { ...device, ...(data as object) };
    },
  });
  t.mock.method(prisma, '$transaction', async (ops: Promise<unknown>[]) => Promise.all(ops));

  await unpairDevice(device, { id: 'u-owner', role: 'tenant_owner', tenantId: 'tenant-1' });

  assert.deepEqual(deletedMappings, { deviceId: device.id });
  assert.deepEqual(deviceWrite, { tenantId: null, name: null });
});

test('unpair: a plain member or a share recipient is refused', async () => {
  await assert.rejects(
    unpairDevice(device, { id: 'u-member', role: 'user', tenantId: 'tenant-1' }),
    (err: unknown) => err instanceof HttpError && err.status === 403
  );
  // Owner of a different tenant who was only shared the device.
  await assert.rejects(
    unpairDevice(device, { id: 'u-other', role: 'tenant_owner', tenantId: 'tenant-2' }),
    (err: unknown) => err instanceof HttpError && err.status === 403
  );
});
