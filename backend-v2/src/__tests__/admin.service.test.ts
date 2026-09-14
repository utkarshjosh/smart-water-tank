import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma, type Alert, type Tenant, type User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import * as firebase from '../config/firebase';
import * as deviceToken from '../lib/device-token';
import * as adminDevices from '../services/admin/devices';
import * as adminTenants from '../services/admin/tenants';
import * as adminUsers from '../services/admin/users';
import * as adminAnalytics from '../services/admin/analytics';
import { deviceRow, stubModel, userRow } from './helpers/http';

// Characterisation tests for the admin services, written against the single
// admin.service.ts before it was split into services/admin/*: they pin what
// each function returns and which Prisma calls it makes. Prisma is stubbed per
// test; Firebase's Admin SDK is replaced by a small fake.

const admin = { ...adminDevices, ...adminTenants, ...adminUsers, ...adminAnalytics };

const T = new Date('2026-09-14T10:00:00.000Z');
const dec = (n: number) => new Prisma.Decimal(n);

function tenantRow(overrides: Partial<Tenant> = {}): Tenant {
  return { id: 'tenant-1', name: 'Home', archivedAt: null, createdAt: T, updatedAt: T, ...overrides };
}

function alertRow(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    deviceId: 'dev-uuid',
    tenantId: 'tenant-1',
    type: 'tank_low',
    severity: 'high',
    message: 'Tank below 20%',
    payload: null,
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
    dismissedAt: null,
    deliveredToFirebase: false,
    createdAt: T,
    ...overrides,
  } as Alert;
}

function profileRow() {
  // A 1 m tall, 1 m diameter cylinder: capacity ≈ 785 L.
  return {
    id: 'profile-1',
    deviceId: 'dev-uuid',
    shape: 'cylindrical',
    parallelUnitCount: 1,
    heightCm: dec(100),
    diameterCm: dec(100),
    lengthCm: null,
    widthCm: null,
    nominalUnitVolumeL: null,
    sensorOffsetCm: dec(0),
    deadZoneCm: dec(0),
    createdAt: T,
    updatedAt: T,
  };
}

async function rejectsWith(promise: Promise<unknown>, status: number, message?: string | RegExp): Promise<void> {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof HttpError, `expected HttpError, got ${String(err)}`);
    assert.equal(err.status, status);
    if (typeof message === 'string') assert.equal(err.message, message);
    if (message instanceof RegExp) assert.match(err.message, message);
    return true;
  });
}

// Array-form $transaction: every op is already a promise from a stubbed model.
function arrayTransaction(t: TestContext): void {
  t.mock.method(prisma, '$transaction', async (ops: Promise<unknown>[]) => Promise.all(ops));
}

function fakeFirebaseAuth(t: TestContext, users: Record<string, Partial<import('firebase-admin').auth.UserRecord>> = {}) {
  const claims: Record<string, Record<string, unknown>> = {};
  const auth = {
    getUser: async (uid: string) => {
      const u = users[uid];
      if (!u) throw new Error(`auth/user-not-found: ${uid}`);
      return { uid, customClaims: claims[uid], ...u };
    },
    setCustomUserClaims: async (uid: string, next: Record<string, unknown>) => {
      claims[uid] = next;
    },
    listUsers: async (max: number) => ({ users: Object.entries(users).slice(0, max).map(([uid, u]) => ({ uid, ...u })), pageToken: undefined }),
  };
  t.mock.method(firebase, 'getAuth', () => auth as unknown as ReturnType<typeof firebase.getAuth>);
  return { auth, claims };
}

// --- devices -----------------------------------------------------------------

test('listDevices: default filters hide archived rows and derive volume from the profile', async (t) => {
  let capturedWhere: unknown;
  stubModel(t, 'device', {
    findMany: async (args: { where: unknown }) => {
      capturedWhere = args.where;
      return [{ ...deviceRow(), tenant: tenantRow() }];
    },
  });
  stubModel(t, 'measurement', { findFirst: async () => ({ levelCm: dec(50), volumeL: dec(1), timestamp: T }) });
  stubModel(t, 'tankProfile', { findUnique: async () => profileRow() });

  const rows = await admin.listDevices({});

  assert.deepEqual(capturedWhere, { archivedAt: null });
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.equal(row.device_id, 'AQM-0042');
  assert.equal(row.tenant_name, 'Home');
  // Derived at read time from geometry (half of ~785 L), not the stored 1 L snapshot.
  assert.ok(row.current_volume! > 390 && row.current_volume! < 395, `got ${row.current_volume}`);
  assert.equal(row.last_measurement, T);
  assert.equal(row.archived_at, null);
});

test('listDevices: tenant/status/includeArchived filters reach the query; no profile -> stored snapshot', async (t) => {
  let capturedWhere: unknown;
  stubModel(t, 'device', {
    findMany: async (args: { where: unknown }) => {
      capturedWhere = args.where;
      return [{ ...deviceRow({ archivedAt: T }), tenant: null }];
    },
  });
  stubModel(t, 'measurement', { findFirst: async () => ({ levelCm: dec(50), volumeL: dec(123.4), timestamp: T }) });
  stubModel(t, 'tankProfile', { findUnique: async () => null });

  const rows = await admin.listDevices({ tenantId: 'tenant-9', status: 'offline', includeArchived: true });

  assert.deepEqual(capturedWhere, { tenantId: 'tenant-9', status: 'offline' });
  assert.equal(rows[0]!.current_volume, 123.4);
  assert.equal(rows[0]!.tenant_name, null);
  assert.equal(rows[0]!.archived_at, T);
});

test('createDevice: 409 on a known hardware id, 404 on a missing tenant', async (t) => {
  stubModel(t, 'device', { findUnique: async () => deviceRow() });
  await rejectsWith(admin.createDevice({ deviceId: 'AQM-0042', tenantId: 'tenant-1' }), 409, 'Device ID already exists');

  stubModel(t, 'device', { findUnique: async () => null });
  stubModel(t, 'tenant', { findUnique: async () => null });
  await rejectsWith(admin.createDevice({ deviceId: 'AQM-0042', tenantId: 'tenant-1' }), 404, 'Tenant not found');
});

test('createDevice: creates offline with a null name and mints a token', async (t) => {
  let created: unknown;
  stubModel(t, 'device', {
    findUnique: async () => null,
    create: async (args: { data: unknown }) => {
      created = args.data;
      return deviceRow({ name: null, status: 'offline' });
    },
  });
  stubModel(t, 'tenant', { findUnique: async () => tenantRow() });
  const mint = t.mock.method(deviceToken, 'createDeviceToken', async () => 'tok-1');

  const result = await admin.createDevice({ deviceId: 'AQM-0042', tenantId: 'tenant-1' });

  assert.deepEqual(created, { deviceId: 'AQM-0042', tenantId: 'tenant-1', name: null, status: 'offline' });
  assert.equal(mint.mock.calls[0]?.arguments[0], 'AQM-0042');
  assert.equal(result.token, 'tok-1');
  assert.equal(result.device.status, 'offline');
});

test('getDeviceDetail: 404 when unknown; maps config, latest reading and recent alerts to DTOs', async (t) => {
  stubModel(t, 'device', { findUnique: async () => null });
  await rejectsWith(admin.getDeviceDetail('AQM-0042'), 404, 'Device not found');

  stubModel(t, 'device', {
    findUnique: async () => ({
      ...deviceRow(),
      tenant: tenantRow(),
      config: {
        id: 'cfg',
        deviceId: 'dev-uuid',
        measurementIntervalMs: 60000,
        reportIntervalMs: 300000,
        tankFullThresholdL: null,
        tankLowThresholdL: null,
        tankFullThresholdPct: dec(95),
        tankLowThresholdPct: null,
        batteryLowThresholdV: null,
        levelEmptyCm: null,
        levelFullCm: null,
        syncMode: 'piggyback',
        configJson: { custom: true },
        alertRules: null,
        offlineThresholdMin: null,
        createdAt: T,
        updatedAt: T,
      },
    }),
  });
  stubModel(t, 'measurement', {
    findFirst: async () => ({ timestamp: T, levelCm: dec(40), volumeL: null, temperatureC: dec(24.5), batteryV: null, rssi: -60 }),
  });
  stubModel(t, 'alert', { findMany: async () => [alertRow({ dismissedAt: T, acknowledgedAt: T })] });

  const detail = await admin.getDeviceDetail('AQM-0042');

  assert.equal(detail.tenant_name, 'Home');
  assert.equal(detail.config?.tank_full_threshold_pct, 95);
  assert.equal(detail.config?.custom, true);
  assert.deepEqual(detail.latest_measurement, { timestamp: T, level_cm: 40, volume_l: null, temperature_c: 24.5, battery_v: null, rssi: -60 });
  assert.deepEqual(detail.recent_alerts[0], {
    id: 'alert-1',
    type: 'tank_low',
    severity: 'high',
    message: 'Tank below 20%',
    acknowledged: false,
    acknowledged_at: T,
    dismissed: true,
    created_at: T,
  });
});

test('upsertDeviceConfig: 404 when unknown; missing fields fall back to defaults/null', async (t) => {
  stubModel(t, 'device', { findUnique: async () => null });
  await rejectsWith(admin.upsertDeviceConfig('AQM-0042', {}), 404);

  stubModel(t, 'device', { findUnique: async () => deviceRow() });
  let upsert: { where: unknown; create: unknown; update: unknown } | undefined;
  stubModel(t, 'deviceConfig', {
    upsert: async (args: { where: unknown; create: unknown; update: unknown }) => {
      upsert = args;
      return {};
    },
  });

  await admin.upsertDeviceConfig('AQM-0042', { report_interval_ms: 600000, tank_low_threshold_l: 50 });

  assert.deepEqual(upsert?.where, { deviceId: 'dev-uuid' });
  assert.deepEqual(upsert?.update, {
    measurementIntervalMs: 60000,
    reportIntervalMs: 600000,
    tankFullThresholdL: null,
    tankLowThresholdL: 50,
    batteryLowThresholdV: null,
    levelEmptyCm: null,
    levelFullCm: null,
    configJson: null,
  });
});

test('updateDevice: 404 on device or tenant; trims the name and clears it on empty', async (t) => {
  stubModel(t, 'device', { findUnique: async () => null });
  await rejectsWith(admin.updateDevice('AQM-0042', { name: 'x' }), 404, 'Device not found');

  stubModel(t, 'device', { findUnique: async () => deviceRow() });
  stubModel(t, 'tenant', { findUnique: async () => null });
  await rejectsWith(admin.updateDevice('AQM-0042', { tenantId: 'tenant-9' }), 404, 'Tenant not found');

  let data: unknown;
  stubModel(t, 'device', {
    findUnique: async () => deviceRow(),
    update: async (args: { data: unknown }) => {
      data = args.data;
      return { ...deviceRow({ name: null }), tenant: tenantRow() };
    },
  });
  const result = await admin.updateDevice('AQM-0042', { name: '   ' });
  assert.deepEqual(data, { name: null });
  assert.equal(result.tenant_name, 'Home');

  stubModel(t, 'tenant', { findUnique: async () => tenantRow({ id: 'tenant-9' }) });
  await admin.updateDevice('AQM-0042', { name: '  Garden ', tenantId: 'tenant-9' });
  assert.deepEqual(data, { name: 'Garden', tenantId: 'tenant-9' });
});

test('archiveDevice / restoreDevice: state guards and the retained-measurements count', async (t) => {
  stubModel(t, 'device', { findUnique: async () => deviceRow({ archivedAt: T }) });
  await rejectsWith(admin.archiveDevice('AQM-0042'), 409, 'Device is already decommissioned');

  let updated: unknown;
  stubModel(t, 'device', {
    findUnique: async () => deviceRow(),
    update: async (args: { data: unknown }) => {
      updated = args.data;
      return deviceRow();
    },
  });
  stubModel(t, 'measurement', { count: async () => 1234 });
  assert.deepEqual(await admin.archiveDevice('AQM-0042'), { device_id: 'AQM-0042', measurements_retained: 1234 });
  assert.ok((updated as { archivedAt: Date }).archivedAt instanceof Date);

  stubModel(t, 'device', { findUnique: async () => deviceRow() });
  await rejectsWith(admin.restoreDevice('AQM-0042'), 409, 'Device is not decommissioned');

  stubModel(t, 'device', { findUnique: async () => deviceRow({ archivedAt: T }) });
  stubModel(t, 'tenant', { findUnique: async () => tenantRow({ archivedAt: T }) });
  await rejectsWith(admin.restoreDevice('AQM-0042'), 409, 'Restore its tenant first');

  stubModel(t, 'tenant', { findUnique: async () => tenantRow() });
  stubModel(t, 'device', {
    findUnique: async () => deviceRow({ archivedAt: T }),
    update: async (args: { data: unknown }) => {
      updated = args.data;
      return deviceRow();
    },
  });
  assert.deepEqual(await admin.restoreDevice('AQM-0042'), { device_id: 'AQM-0042' });
  assert.deepEqual(updated, { archivedAt: null });
});

test('reissueDeviceToken mints through the shared token helper', async (t) => {
  const mint = t.mock.method(deviceToken, 'createDeviceToken', async () => 'tok-2');
  assert.equal(await admin.reissueDeviceToken('AQM-0042'), 'tok-2');
  assert.equal(mint.mock.calls[0]?.arguments[0], 'AQM-0042');
});

// --- analytics and alerts ----------------------------------------------------

test('analyticsSummary: offline is derived, archived rows excluded from the counts', async (t) => {
  const deviceWheres: unknown[] = [];
  stubModel(t, 'device', {
    count: async (args: { where: unknown }) => {
      deviceWheres.push(args.where);
      return deviceWheres.length === 1 ? 10 : 7;
    },
  });
  stubModel(t, 'tenant', { count: async () => 3 });
  stubModel(t, 'alert', { count: async () => 4 });
  stubModel(t, 'measurement', { count: async () => 2880 });

  const summary = await admin.analyticsSummary();

  assert.deepEqual(summary, {
    total_devices: 10,
    online_devices: 7,
    offline_devices: 3,
    total_tenants: 3,
    recent_alerts_24h: 4,
    measurements_today: 2880,
  });
  assert.deepEqual(deviceWheres, [{ archivedAt: null }, { status: 'online', archivedAt: null }]);
});

test('listAlerts: builds the where clause from every option and names device and tenant per row', async (t) => {
  let capturedWhere: unknown;
  stubModel(t, 'alert', {
    findMany: async (args: { where: unknown }) => {
      capturedWhere = args.where;
      return [{ ...alertRow(), device: { deviceId: 'AQM-0042', name: null }, tenant: { id: 'tenant-1', name: 'Home' } }];
    },
    count: async () => 42,
  });
  const since = new Date('2026-09-13T00:00:00.000Z');

  const result = await admin.listAlerts({
    limit: 10,
    tenantId: 'tenant-1',
    deviceId: 'AQM-0042',
    severity: 'high',
    acknowledged: false,
    includeDismissed: false,
    since,
  });

  assert.deepEqual(capturedWhere, {
    tenantId: 'tenant-1',
    device: { deviceId: 'AQM-0042' },
    severity: 'high',
    acknowledged: false,
    dismissedAt: null,
    createdAt: { gte: since },
  });
  assert.equal(result.total, 42);
  const row = result.alerts[0]!;
  assert.equal(row.device_name, 'AQM-0042'); // falls back to the hardware id
  assert.equal(row.tenant_name, 'Home');
  assert.equal(row.dismissed, false);
});

// --- tenants -----------------------------------------------------------------

test('listTenants: counts exclude archived children; archived tenants hidden unless asked', async (t) => {
  let capturedArgs: { where: unknown; include: unknown } | undefined;
  stubModel(t, 'tenant', {
    findMany: async (args: { where: unknown; include: unknown }) => {
      capturedArgs = args;
      return [{ ...tenantRow(), _count: { devices: 2, users: 3 } }];
    },
  });

  const rows = await admin.listTenants();
  assert.deepEqual(capturedArgs?.where, { archivedAt: null });
  assert.deepEqual(capturedArgs?.include, {
    _count: { select: { devices: { where: { archivedAt: null } }, users: { where: { archivedAt: null } } } },
  });
  assert.deepEqual(rows[0], { id: 'tenant-1', name: 'Home', created_at: T, updated_at: T, device_count: 2, user_count: 3, archived_at: null });

  await admin.listTenants({ includeArchived: true });
  assert.deepEqual(capturedArgs?.where, {});
});

test('createTenant / updateTenant: name uniqueness and the snake_case DTO', async (t) => {
  stubModel(t, 'tenant', { findFirst: async () => tenantRow() });
  await rejectsWith(admin.createTenant('Home'), 409, 'Tenant name already exists');

  stubModel(t, 'tenant', { findFirst: async () => null, create: async () => tenantRow({ id: 'tenant-2', name: 'Farm' }) });
  assert.deepEqual(await admin.createTenant('Farm'), { id: 'tenant-2', name: 'Farm', created_at: T, updated_at: T, archived_at: null });

  stubModel(t, 'tenant', { findUnique: async () => null });
  await rejectsWith(admin.updateTenant('tenant-9', 'X'), 404, 'Tenant not found');

  let nameQuery: unknown;
  stubModel(t, 'tenant', {
    findUnique: async () => tenantRow(),
    findFirst: async (args: { where: unknown }) => {
      nameQuery = args.where;
      return null;
    },
    update: async () => tenantRow({ name: 'Renamed' }),
  });
  const updated = await admin.updateTenant('tenant-1', 'Renamed');
  assert.deepEqual(nameQuery, { name: 'Renamed', NOT: { id: 'tenant-1' } });
  assert.equal(updated.name, 'Renamed');
});

test('previewTenantArchive counts what an archive would take; archiveTenant stamps one timestamp on the set', async (t) => {
  stubModel(t, 'tenant', { findUnique: async () => null });
  await rejectsWith(admin.previewTenantArchive('tenant-9'), 404);

  stubModel(t, 'tenant', { findUnique: async () => tenantRow() });
  stubModel(t, 'device', { findMany: async () => [{ id: 'd1' }, { id: 'd2' }] });
  stubModel(t, 'user', { count: async () => 3 });
  stubModel(t, 'measurement', { count: async () => 500 });
  assert.deepEqual(await admin.previewTenantArchive('tenant-1'), { tenants: 1, devices: 2, users: 3, measurements: 500 });

  stubModel(t, 'tenant', { findUnique: async () => tenantRow({ archivedAt: T }) });
  await rejectsWith(admin.archiveTenant('tenant-1'), 409, 'Tenant is already archived');

  const stamps: Date[] = [];
  const capture = (args: { data: { archivedAt: Date } }) => {
    stamps.push(args.data.archivedAt);
    return Promise.resolve({ count: 1 });
  };
  stubModel(t, 'tenant', { findUnique: async () => tenantRow(), update: capture });
  stubModel(t, 'device', { findMany: async () => [{ id: 'd1' }], updateMany: capture });
  stubModel(t, 'user', { count: async () => 1, updateMany: capture });
  stubModel(t, 'measurement', { count: async () => 9 });
  arrayTransaction(t);

  const summary = await admin.archiveTenant('tenant-1');

  assert.deepEqual(summary, { tenants: 1, devices: 1, users: 1, measurements: 9 });
  assert.equal(stamps.length, 3);
  assert.ok(stamps.every((s) => s.getTime() === stamps[0]!.getTime()), 'one timestamp for the whole set');
});

test('restoreTenant: 409 unless archived; reports what came back', async (t) => {
  stubModel(t, 'tenant', { findUnique: async () => tenantRow() });
  await rejectsWith(admin.restoreTenant('tenant-1'), 409, 'Tenant is not archived');

  stubModel(t, 'tenant', { findUnique: async () => tenantRow({ archivedAt: T }), update: async () => tenantRow() });
  stubModel(t, 'device', { updateMany: async () => ({ count: 4 }) });
  stubModel(t, 'user', { updateMany: async () => ({ count: 2 }) });
  arrayTransaction(t);

  assert.deepEqual(await admin.restoreTenant('tenant-1'), { tenants: 1, devices: 4, users: 2, measurements: 0 });
});

// --- users -------------------------------------------------------------------

test('archiveUser: cannot deactivate yourself or the last super admin', async (t) => {
  await rejectsWith(admin.archiveUser('me', 'me'), 409, 'You cannot deactivate your own account');

  stubModel(t, 'user', { findUnique: async () => userRow({ id: 'u2', role: 'super_admin' }), count: async () => 0 });
  await rejectsWith(admin.archiveUser('u2', 'me'), 409, 'Cannot deactivate the last super admin');
});

test('archiveUser clears the push token and device grants; restoreUser refuses under an archived tenant', async (t) => {
  let userUpdate: unknown;
  let mappingsDeleted: unknown;
  stubModel(t, 'user', {
    findUnique: async () => userRow({ id: 'u2', fcmToken: 'fcm' }),
    update: async (args: { data: unknown }) => {
      userUpdate = args.data;
      return userRow();
    },
  });
  stubModel(t, 'userDeviceMapping', {
    deleteMany: async (args: { where: unknown }) => {
      mappingsDeleted = args.where;
      return { count: 2 };
    },
  });
  arrayTransaction(t);

  assert.deepEqual(await admin.archiveUser('u2', 'me'), { user_id: 'u2', email: 'user@example.com' });
  assert.equal((userUpdate as { fcmToken: unknown }).fcmToken, null);
  assert.ok((userUpdate as { archivedAt: Date }).archivedAt instanceof Date);
  assert.deepEqual(mappingsDeleted, { userId: 'u2' });

  stubModel(t, 'user', { findUnique: async () => userRow({ id: 'u2', archivedAt: T }) });
  stubModel(t, 'tenant', { findUnique: async () => tenantRow({ archivedAt: T }) });
  await rejectsWith(admin.restoreUser('u2'), 409, 'Restore their tenant first');
});

test('createOrLinkUser: a super admin is tenantless; anyone else needs a tenant; role is mirrored to Firebase', async (t) => {
  const { claims } = fakeFirebaseAuth(t, { 'uid-1': { email: 'a@b.c' } });

  // An identity Firebase does not know is the SDK's own error, not an HttpError:
  // it surfaces as a 500. Pinned as-is; a 404 would be kinder.
  await assert.rejects(admin.createOrLinkUser({ firebaseUid: 'nope', email: 'x', role: 'user', tenantId: 't' }), /user-not-found/);
  await rejectsWith(
    admin.createOrLinkUser({ firebaseUid: 'uid-1', email: 'a@b.c', role: 'user' }),
    400,
    'A tenant is required unless the role is super_admin'
  );

  let created: unknown;
  stubModel(t, 'user', {
    findUnique: async () => null,
    create: async (args: { data: unknown }) => {
      created = args.data;
      return userRow({ id: 'u-new', firebaseUid: 'uid-1', role: 'super_admin', tenantId: null });
    },
  });
  const result = await admin.createOrLinkUser({ firebaseUid: 'uid-1', email: 'a@b.c', role: 'super_admin', tenantId: 'tenant-1' });

  assert.equal((created as { tenantId: unknown }).tenantId, null, 'super_admin ignores the tenant');
  assert.equal(result.message, 'User created and linked to tenant');
  assert.equal(result.user.role, 'super_admin');
  assert.deepEqual(claims['uid-1'], { role: 'super_admin' });
});

test('createOrLinkUser: an existing row is updated in place', async (t) => {
  fakeFirebaseAuth(t, { 'uid-1': { email: 'a@b.c' } });
  stubModel(t, 'tenant', { findUnique: async () => tenantRow() });
  let updated: unknown;
  stubModel(t, 'user', {
    findUnique: async () => userRow({ firebaseUid: 'uid-1' }),
    update: async (args: { data: unknown }) => {
      updated = args.data;
      return userRow({ firebaseUid: 'uid-1', role: 'tenant_owner' });
    },
  });

  const result = await admin.createOrLinkUser({ firebaseUid: 'uid-1', email: 'a@b.c', name: 'Ann', role: 'tenant_owner', tenantId: 'tenant-1' });

  assert.deepEqual(updated, { email: 'a@b.c', name: 'Ann', tenantId: 'tenant-1', role: 'tenant_owner' });
  assert.equal(result.message, 'User updated and linked to tenant');
});

test('updateUserRole: promoting to super_admin drops the tenant; demoting a tenantless super admin needs one first', async (t) => {
  const { claims } = fakeFirebaseAuth(t, { 'uid-1': {} });

  stubModel(t, 'user', { findFirst: async () => null });
  await rejectsWith(admin.updateUserRole('u1', 'admin'), 404);

  stubModel(t, 'user', { findFirst: async () => userRow({ role: 'super_admin', tenantId: null }) });
  await rejectsWith(admin.updateUserRole('u1', 'admin'), 400, /Assign a tenant/);

  let data: unknown;
  stubModel(t, 'user', {
    findFirst: async () => userRow({ role: 'user', tenantId: 'tenant-1' }),
    update: async (args: { data: unknown }) => {
      data = args.data;
      return { ...userRow({ role: 'super_admin', tenantId: null }), tenant: null };
    },
  });
  const result = await admin.updateUserRole('u1', 'super_admin');
  assert.deepEqual(data, { role: 'super_admin', tenantId: null });
  assert.equal(result.tenant_name, null);
  assert.deepEqual(claims['uid-1'], { role: 'super_admin' });
});

test('updateUserTenant: super admins cannot be assigned; tenant must exist', async (t) => {
  stubModel(t, 'user', { findFirst: async () => userRow({ role: 'super_admin' }) });
  await rejectsWith(admin.updateUserTenant('u1', 'tenant-1'), 400, /super admin/);

  stubModel(t, 'user', { findFirst: async () => userRow() });
  stubModel(t, 'tenant', { findUnique: async () => null });
  await rejectsWith(admin.updateUserTenant('u1', 'tenant-9'), 404, 'Tenant not found');

  stubModel(t, 'tenant', { findUnique: async () => tenantRow({ id: 'tenant-9', name: 'Farm' }) });
  stubModel(t, 'user', {
    findFirst: async () => userRow(),
    update: async () => ({ ...userRow({ tenantId: 'tenant-9' }), tenant: tenantRow({ id: 'tenant-9', name: 'Farm' }) }),
  });
  const result = await admin.updateUserTenant('u1', 'tenant-9');
  assert.equal(result.tenant_id, 'tenant-9');
  assert.equal(result.tenant_name, 'Farm');
});

test('listUsers: masks the push token and searches email, name and uid', async (t) => {
  let capturedWhere: unknown;
  stubModel(t, 'user', {
    findMany: async (args: { where: unknown }) => {
      capturedWhere = args.where;
      return [{ ...userRow({ fcmToken: 'secret-token' }), tenant: tenantRow() }, { ...userRow({ id: 'u2', fcmToken: null }), tenant: null }];
    },
  });

  const rows = await admin.listUsers({ search: 'ann' });

  assert.deepEqual(capturedWhere, {
    archivedAt: null,
    OR: [{ email: { contains: 'ann' } }, { name: { contains: 'ann' } }, { firebaseUid: { contains: 'ann' } }],
  });
  assert.equal(rows[0]!.fcm_token, '***');
  assert.equal(rows[0]!.tenant_name, 'Home');
  assert.equal(rows[1]!.fcm_token, null);
  assert.equal(rows[1]!.tenant_name, null);
});

test('listFirebaseUsers: filters by search, marks linked accounts, caps the page at 100', async (t) => {
  const { auth } = fakeFirebaseAuth(t, {
    'uid-a': { email: 'ann@example.com', displayName: 'Ann', emailVerified: true, disabled: false, metadata: { creationTime: 'c', lastSignInTime: 'l' } as never },
    'uid-b': { email: 'bob@example.com', displayName: 'Bob', emailVerified: false, disabled: false, metadata: { creationTime: 'c', lastSignInTime: null } as never },
  });
  const list = t.mock.method(auth, 'listUsers');
  stubModel(t, 'user', { findMany: async () => [{ firebaseUid: 'uid-a', tenantId: 'tenant-1', role: 'user' }] });
  stubModel(t, 'tenant', { findMany: async () => [tenantRow()] });

  const result = await admin.listFirebaseUsers('ann', 500);

  assert.equal(list.mock.calls[0]?.arguments[0], 100);
  assert.equal(result.total, 1);
  assert.deepEqual(result.users[0], {
    uid: 'uid-a',
    email: 'ann@example.com',
    displayName: 'Ann',
    photoURL: null,
    emailVerified: true,
    disabled: false,
    metadata: { creationTime: 'c', lastSignInTime: 'l' },
    tenant_id: 'tenant-1',
    tenant_name: 'Home',
    role: 'user',
    is_linked: true,
  });
});

test('syncFirebaseUsers: a dry run reports without writing; a real run creates the missing rows', async (t) => {
  fakeFirebaseAuth(t, { 'uid-a': { email: 'ann@example.com', displayName: 'Ann' }, 'uid-b': { email: 'bob@example.com' } });
  const created: unknown[] = [];
  stubModel(t, 'user', {
    findMany: async () => [{ firebaseUid: 'uid-a' }],
    create: async (args: { data: unknown }) => {
      created.push(args.data);
      return userRow();
    },
  });

  const dry = await admin.syncFirebaseUsers(undefined, true);
  assert.equal(dry.dry_run, true);
  assert.deepEqual(dry.stats, { total_firebase_users: 2, existing_in_db: 1, to_create: 1, created: 0, errors: 0, error_details: [] });
  assert.equal(created.length, 0);
  if (dry.dry_run) assert.deepEqual(dry.users_to_create, [{ uid: 'uid-b', email: 'bob@example.com', displayName: undefined }]);

  const real = await admin.syncFirebaseUsers(undefined, false);
  assert.equal(real.dry_run, false);
  assert.equal(real.stats.created, 1);
  assert.deepEqual(created[0], { firebaseUid: 'uid-b', email: 'bob@example.com', name: 'bob', tenantId: null, role: 'user' });
});
