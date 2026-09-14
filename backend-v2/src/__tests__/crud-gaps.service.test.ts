import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../lib/http-error';
import { deleteTankProfile } from '../services/tank-profile.service';
import { updateIntervals } from '../services/device.service';
import { deviceRow, stubModel } from './helpers/http';

// Service-level tests for the two tenant-side writes added in #9. Both must
// bump config_version (prisma.device.update) so the device picks the change
// up on its next check-in; pushConfigToDevice is a no-op with no gateway set.

test('deleteTankProfile: 404 without a profile; otherwise deletes and bumps the version', async (t) => {
  const device = deviceRow();
  stubModel(t, 'tankProfile', { findUnique: async () => null });
  await assert.rejects(deleteTankProfile(device), (err: unknown) => err instanceof HttpError && err.status === 404);

  let deleted: unknown;
  let bumped: unknown;
  stubModel(t, 'tankProfile', {
    findUnique: async () => ({ id: 'p1', deviceId: device.id }),
    delete: async (args: { where: unknown }) => {
      deleted = args.where;
      return {};
    },
  });
  stubModel(t, 'device', {
    update: async (args: { data: unknown }) => {
      bumped = args.data;
      return device;
    },
  });

  await deleteTankProfile(device);

  assert.deepEqual(deleted, { deviceId: device.id });
  assert.deepEqual(bumped, { configVersion: { increment: 1 } });
});

test('updateIntervals: keeps the other value, rejects report < measurement, bumps, returns the merged config', async (t) => {
  const device = deviceRow();
  const existing = { measurementIntervalMs: 60_000, reportIntervalMs: 300_000, syncMode: 'piggyback' };
  stubModel(t, 'deviceConfig', { findUnique: async () => existing });

  // 30 s reports against the stored 60 s measurements: pointless, refused.
  await assert.rejects(
    updateIntervals(device, { report_interval_ms: 30_000 }),
    (err: unknown) => err instanceof HttpError && err.status === 400 && /at least measurement_interval_ms/.test(err.message)
  );

  let upsert: { create: unknown; update: unknown } | undefined;
  let bumped = false;
  // Stateful: buildDeviceConfig re-reads the row after the write.
  let stored = existing;
  stubModel(t, 'deviceConfig', {
    findUnique: async () => stored,
    upsert: async (args: { create: unknown; update: { measurementIntervalMs: number; reportIntervalMs: number } }) => {
      upsert = args;
      stored = { ...existing, ...args.update };
      return stored;
    },
  });
  stubModel(t, 'device', {
    update: async () => {
      bumped = true;
      return { ...device, configVersion: 4 };
    },
    findUnique: async () => ({ ...device, configVersion: 4 }),
  });
  stubModel(t, 'tankProfile', { findUnique: async () => null });

  const config = await updateIntervals(device, { measurement_interval_ms: 1_800_000, report_interval_ms: 1_800_000 });

  assert.deepEqual(upsert?.update, { measurementIntervalMs: 1_800_000, reportIntervalMs: 1_800_000 });
  assert.equal(bumped, true);
  assert.equal(config.measurement_interval_ms, 1_800_000);
  assert.equal(config.report_interval_ms, 1_800_000);
});

test('updateIntervals: with no stored config, the untouched value comes from the defaults', async (t) => {
  const device = deviceRow();
  let upsert: { create: unknown } | undefined;
  stubModel(t, 'deviceConfig', {
    findUnique: async () => null,
    upsert: async (args: { create: unknown }) => {
      upsert = args;
      return { measurementIntervalMs: 60_000, reportIntervalMs: 3_600_000, syncMode: 'piggyback' };
    },
  });
  stubModel(t, 'device', { update: async () => device, findUnique: async () => device });
  stubModel(t, 'tankProfile', { findUnique: async () => null });

  await updateIntervals(device, { report_interval_ms: 3_600_000 });

  assert.deepEqual(upsert?.create, { deviceId: device.id, measurementIntervalMs: 60_000, reportIntervalMs: 3_600_000 });
});
