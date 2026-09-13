import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as adminService from '../services/admin.service';
import { callArgs, http, signInAs, userRow } from './helpers/http';

// Admin routes: query parsing and the filters handed to the service. The role
// gate itself is covered in routes-auth.test.ts.

const admin = () => userRow({ id: 'admin-1', role: 'admin', tenantId: null });

test('GET /devices with no filters lists live devices only', async (t) => {
  const headers = signInAs(t, admin());
  const list = t.mock.method(adminService, 'listDevices', async () => [{ id: 'AQM-1' }]);

  const res = await http().get('/api/v1/admin/devices').set(headers);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { devices: [{ id: 'AQM-1' }] });
  assert.deepEqual(callArgs(list)[0], { tenantId: undefined, status: undefined, includeArchived: false });
});

test('GET /devices forwards tenant_id, status and include_archived', async (t) => {
  const headers = signInAs(t, admin());
  const list = t.mock.method(adminService, 'listDevices', async () => []);

  const res = await http()
    .get('/api/v1/admin/devices?tenant_id=123e4567-e89b-12d3-a456-426614174000&status=offline&include_archived=true')
    .set(headers);

  assert.equal(res.status, 200);
  assert.deepEqual(callArgs(list)[0], {
    tenantId: '123e4567-e89b-12d3-a456-426614174000',
    status: 'offline',
    includeArchived: true,
  });
});

test('GET /devices rejects a tenant_id that is not a uuid', async (t) => {
  const headers = signInAs(t, admin());
  const res = await http().get('/api/v1/admin/devices?tenant_id=tenant-1').set(headers);
  assert.equal(res.status, 400);
});

test('POST /measurements/export rejects an empty device list', async (t) => {
  const headers = signInAs(t, admin());
  const res = await http()
    .post('/api/v1/admin/measurements/export')
    .set(headers)
    .send({ device_ids: [], from: '2026-01-01', to: '2026-01-02' });
  assert.equal(res.status, 400);
});
