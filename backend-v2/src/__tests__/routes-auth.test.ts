import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../lib/http-error';
import * as onboarding from '../services/onboarding.service';
import * as userService from '../services/user.service';
import { callArgs, currentReadingDto, deviceLookupReturns, deviceRow, http, meDto, signInAs, userRow } from './helpers/http';

// The auth chain every tenant route sits behind:
//   firebaseAuth -> requireTenant -> requireDeviceAccess (for :deviceId routes)
// and the role gate on /admin. These pin the status codes and messages the
// clients already branch on.

// --- firebaseAuth ----------------------------------------------------------

test('no Authorization header -> 401', async () => {
  const res = await http().get('/api/v1/user/me');
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Missing or invalid authorization header' });
});

test('non-Bearer Authorization header -> 401', async () => {
  const res = await http().get('/api/v1/user/me').set('Authorization', 'Basic abc');
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Missing or invalid authorization header' });
});

test('token Firebase rejects -> 401 without leaking the reason', async (t) => {
  signInAs(t, userRow());
  const res = await http().get('/api/v1/user/me').set('Authorization', 'Bearer forged');
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Invalid or expired token' });
});

test('archived user still holds Firebase credentials but is refused -> 403', async (t) => {
  const headers = signInAs(t, userRow({ archivedAt: new Date() }));
  const res = await http().get('/api/v1/user/me').set(headers);
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { error: 'This account has been deactivated' });
});

test('first sign-in with no user row auto-provisions a personal tenant', async (t) => {
  const headers = signInAs(t, null, { uid: 'brand-new-uid' });
  const provisioned = userRow({ id: 'user-new', firebaseUid: 'brand-new-uid', tenantId: 'tenant-new' });
  const provision = t.mock.method(onboarding, 'provisionPersonalTenantAndUser', async () => provisioned);
  t.mock.method(userService, 'getMe', async (userId: string) => meDto({ id: userId, tenant_id: 'tenant-new' }));

  const res = await http().get('/api/v1/user/me').set(headers);

  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'user-new');
  assert.equal(provision.mock.callCount(), 1);
  assert.deepEqual(callArgs(provision)[0], {
    firebaseUid: 'brand-new-uid',
    email: 'new@example.com',
    name: 'New Person',
  });
});

// --- requireTenant ---------------------------------------------------------

test('/me works for a user with no tenant', async (t) => {
  const headers = signInAs(t, userRow({ tenantId: null }));
  t.mock.method(userService, 'getMe', async () => meDto({ tenant_id: null, tenant_name: null }));
  const res = await http().get('/api/v1/user/me').set(headers);
  assert.equal(res.status, 200);
});

test('tenant-scoped route with no tenant -> 403', async (t) => {
  const headers = signInAs(t, userRow({ tenantId: null }));
  const res = await http().get('/api/v1/user/devices').set(headers);
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { error: 'User tenant not found' });
});

// --- requireDeviceAccess ---------------------------------------------------

test('unknown device -> 404', async (t) => {
  const headers = signInAs(t, userRow());
  deviceLookupReturns(t, null);
  const res = await http().get('/api/v1/user/devices/AQM-0042/current').set(headers);
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'Device not found' });
});

test('decommissioned device -> 410, distinguishable from never-existed', async (t) => {
  const headers = signInAs(t, userRow());
  deviceLookupReturns(t, deviceRow({ archivedAt: new Date() }));
  const res = await http().get('/api/v1/user/devices/AQM-0042/current').set(headers);
  assert.equal(res.status, 410);
  assert.deepEqual(res.body, { error: 'This device has been decommissioned' });
});

test("another tenant's device with no share -> 403", async (t) => {
  const headers = signInAs(t, userRow({ tenantId: 'tenant-1' }));
  deviceLookupReturns(t, deviceRow({ tenantId: 'tenant-2' }), null);
  const res = await http().get('/api/v1/user/devices/AQM-0042/current').set(headers);
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { error: 'Device not accessible' });
});

test("another tenant's device with a user_device_mappings grant -> allowed", async (t) => {
  const headers = signInAs(t, userRow({ tenantId: 'tenant-1' }));
  deviceLookupReturns(t, deviceRow({ tenantId: 'tenant-2' }), { id: 'map-1' });
  t.mock.method(userService, 'getDeviceCurrent', async () => currentReadingDto());
  const res = await http().get('/api/v1/user/devices/AQM-0042/current').set(headers);
  assert.equal(res.status, 200);
});

test('same tenant -> allowed and the handler receives the device row', async (t) => {
  const headers = signInAs(t, userRow({ tenantId: 'tenant-1' }));
  deviceLookupReturns(t, deviceRow({ tenantId: 'tenant-1' }));
  const current = t.mock.method(userService, 'getDeviceCurrent', async () => currentReadingDto());
  const res = await http().get('/api/v1/user/devices/AQM-0042/current').set(headers);
  assert.equal(res.status, 200);
  assert.equal(callArgs<typeof userService.getDeviceCurrent>(current)[0].deviceId, 'AQM-0042');
});

test('admin role bypasses tenant and share checks', async (t) => {
  const headers = signInAs(t, userRow({ role: 'admin', tenantId: 'tenant-admin' }));
  deviceLookupReturns(t, deviceRow({ tenantId: 'tenant-2' }), null);
  t.mock.method(userService, 'getDeviceCurrent', async () => currentReadingDto());
  const res = await http().get('/api/v1/user/devices/AQM-0042/current').set(headers);
  assert.equal(res.status, 200);
});

// --- requireRole on /admin -------------------------------------------------

test('plain user on an admin route -> 403', async (t) => {
  const headers = signInAs(t, userRow({ role: 'user' }));
  const res = await http().get('/api/v1/admin/devices').set(headers);
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { error: 'Insufficient permissions' });
});

test('admin passes the role gate (reaches validation)', async (t) => {
  const headers = signInAs(t, userRow({ role: 'admin' }));
  const res = await http().get('/api/v1/admin/devices?status=bogus').set(headers);
  assert.equal(res.status, 400);
});

test('role changes are super_admin only', async (t) => {
  const admin = signInAs(t, userRow({ role: 'admin' }));
  const denied = await http().put('/api/v1/admin/users/user-2/role').set(admin).send({ role: 'admin' });
  assert.equal(denied.status, 403);
});

test('super_admin passes the role-change gate (reaches validation)', async (t) => {
  const headers = signInAs(t, userRow({ role: 'super_admin' }));
  const res = await http().put('/api/v1/admin/users/user-2/role').set(headers).send({});
  assert.equal(res.status, 400);
});

// --- error handler ---------------------------------------------------------

test('zod failure -> 400 with field details', async (t) => {
  const headers = signInAs(t, userRow());
  const res = await http().post('/api/v1/user/register').set(headers).send({ name: '' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid request data');
  assert.ok(Array.isArray(res.body.details));
  assert.deepEqual(res.body.details[0].path, ['name']);
});

test('HttpError -> its status, message and details', async (t) => {
  const headers = signInAs(t, userRow());
  t.mock.method(userService, 'getMe', async () => {
    throw new HttpError(409, 'Conflict here', { field: 'x' });
  });
  const res = await http().get('/api/v1/user/me').set(headers);
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: 'Conflict here', details: { field: 'x' } });
});

test('unexpected error -> 500 with a generic body (no stack or message)', async (t) => {
  const headers = signInAs(t, userRow());
  t.mock.method(userService, 'getMe', async () => {
    throw new Error('database password is hunter2');
  });
  t.mock.method(console, 'error', () => {});
  const res = await http().get('/api/v1/user/me').set(headers);
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
});

// --- contract enforcement ---------------------------------------------------

test('a handler whose payload does not match its contract -> 500 naming the fields', async (t) => {
  const headers = signInAs(t, userRow());
  // Drops email and sends role as something the enum does not allow.
  t.mock.method(userService, 'getMe', async () => ({ id: 'user-1', name: null, role: 'owner', tenant_id: null, tenant_name: null }) as never);
  const res = await http().get('/api/v1/user/me').set(headers);
  assert.equal(res.status, 500);
  assert.equal(res.body.error, 'Response does not match its contract');
  assert.ok(res.body.details.some((d: string) => d.startsWith('email:')));
  assert.ok(res.body.details.some((d: string) => d.startsWith('role:')));
});
