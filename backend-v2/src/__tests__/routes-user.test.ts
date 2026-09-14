import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../lib/http-error';
import * as userService from '../services/user.service';
import * as tankProfileService from '../services/tank-profile.service';
import * as historyService from '../services/history.service';
import * as deviceService from '../services/device.service';
import { callArgs, claimCodeDto, deviceConfigPayloadDto, deviceInfoDto, deviceLookupReturns, deviceRow, deviceSummaryDto, historySeriesDto, http, signInAs, userRow } from './helpers/http';

// Tenant routes: request validation, what each handler passes to its service,
// and the envelope it wraps the result in. Services are mocked; their own
// behaviour is covered by the *.service.test.ts files.

test('GET /devices wraps the list in { devices } and scopes it to the caller', async (t) => {
  const headers = signInAs(t, userRow({ id: 'user-9', tenantId: 'tenant-9' }));
  const row = deviceSummaryDto({ id: 'AQM-1' });
  const list = t.mock.method(userService, 'listDevicesForTenant', async () => [row]);

  const res = await http().get('/api/v1/user/devices').set(headers);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { devices: [row] });
  assert.deepEqual(callArgs(list), ['tenant-9', 'user-9']);
});

test('POST /devices/claim-code -> 201 minted for the caller', async (t) => {
  const headers = signInAs(t, userRow({ id: 'user-9', tenantId: 'tenant-9' }));
  const minted = claimCodeDto();
  const mint = t.mock.method(userService, 'mintClaimCode', async () => minted);

  const res = await http().post('/api/v1/user/devices/claim-code').set(headers);

  assert.equal(res.status, 201);
  assert.deepEqual(res.body, minted);
  assert.deepEqual(callArgs(mint), ['tenant-9', 'user-9']);
});

test('PUT /devices/:id rejects a non-string name', async (t) => {
  const headers = signInAs(t, userRow());
  deviceLookupReturns(t, deviceRow());
  const res = await http().put('/api/v1/user/devices/AQM-0042').set(headers).send({ name: 42 });
  assert.equal(res.status, 400);
});

test('PUT /devices/:id passes the device row and the new name through', async (t) => {
  const headers = signInAs(t, userRow());
  deviceLookupReturns(t, deviceRow());
  const renamed = deviceInfoDto({ name: 'Garden' });
  const rename = t.mock.method(userService, 'renameDevice', async () => renamed);

  const res = await http().put('/api/v1/user/devices/AQM-0042').set(headers).send({ name: 'Garden' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, renamed);
  assert.equal(callArgs<typeof userService.renameDevice>(rename)[0].id, 'dev-uuid');
  assert.equal(callArgs(rename)[1], 'Garden');
});

test('DELETE /devices/:id -> 204 and unpairs as the caller', async (t) => {
  const me = userRow({ id: 'user-9', role: 'user', tenantId: 'tenant-1' });
  const headers = signInAs(t, me);
  deviceLookupReturns(t, deviceRow());
  const unpair = t.mock.method(userService, 'unpairDevice', async () => undefined);

  const res = await http().delete('/api/v1/user/devices/AQM-0042').set(headers);

  assert.equal(res.status, 204);
  assert.equal(res.text, '');
  const actor = callArgs<typeof userService.unpairDevice>(unpair)[1];
  assert.deepEqual({ id: actor.id, role: actor.role, tenantId: actor.tenantId }, { id: 'user-9', role: 'user', tenantId: 'tenant-1' });
});

test('GET /devices/:id/tank-profile wraps the profile, null when unset', async (t) => {
  const headers = signInAs(t, userRow());
  deviceLookupReturns(t, deviceRow());
  t.mock.method(tankProfileService, 'getTankProfile', async () => null);

  const res = await http().get('/api/v1/user/devices/AQM-0042/tank-profile').set(headers);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { profile: null });
});

test('GET /devices/:id/history/series rejects an unknown bucket', async (t) => {
  const headers = signInAs(t, userRow());
  deviceLookupReturns(t, deviceRow());
  const res = await http().get('/api/v1/user/devices/AQM-0042/history/series?bucket=fortnight').set(headers);
  assert.equal(res.status, 400);
});

test('GET /devices/:id/history/series defaults bucket to auto and forwards the range', async (t) => {
  const headers = signInAs(t, userRow());
  deviceLookupReturns(t, deviceRow());
  const series = t.mock.method(historyService, 'getDeviceHistorySeries', async () => historySeriesDto());

  const res = await http()
    .get('/api/v1/user/devices/AQM-0042/history/series?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z')
    .set(headers);

  assert.equal(res.status, 200);
  const options = callArgs<typeof historyService.getDeviceHistorySeries>(series)[1];
  assert.equal(options.bucket, 'auto');
  assert.equal(options.from, '2026-01-01T00:00:00Z');
  assert.equal(options.to, '2026-01-02T00:00:00Z');
});

test('GET /alerts applies query defaults and forwards the caller identity', async (t) => {
  const headers = signInAs(t, userRow({ id: 'user-9', tenantId: 'tenant-9' }));
  const alerts = t.mock.method(userService, 'getUserAlerts', async () => ({ alerts: [], unacknowledged: 0, next_cursor: null }));

  const res = await http().get('/api/v1/user/alerts').set(headers);

  assert.equal(res.status, 200);
  assert.deepEqual(callArgs(alerts)[0], { id: 'user-9', tenantId: 'tenant-9' });
  assert.deepEqual(callArgs(alerts)[1], {
    limit: 50,
    includeDismissed: false,
    onlyUnacknowledged: false,
    cursor: undefined,
  });
});

test('GET /alerts caps limit at 200', async (t) => {
  const headers = signInAs(t, userRow());
  const res = await http().get('/api/v1/user/alerts?limit=500').set(headers);
  assert.equal(res.status, 400);
});

// --- #9: tank-profile delete and user-settable intervals ---------------------

test('DELETE /devices/:id/tank-profile -> 204; 404 when there is none', async (t) => {
  const headers = signInAs(t, userRow());
  deviceLookupReturns(t, deviceRow());
  const del = t.mock.method(tankProfileService, 'deleteTankProfile', async () => undefined);

  const res = await http().delete('/api/v1/user/devices/AQM-0042/tank-profile').set(headers);
  assert.equal(res.status, 204);
  assert.equal(callArgs<typeof tankProfileService.deleteTankProfile>(del)[0].id, 'dev-uuid');

  t.mock.method(tankProfileService, 'deleteTankProfile', async () => {
    throw new HttpError(404, 'This device has no tank profile');
  });
  const missing = await http().delete('/api/v1/user/devices/AQM-0042/tank-profile').set(headers);
  assert.equal(missing.status, 404);
});

test('PUT /devices/:id/config rejects out-of-range and empty bodies', async (t) => {
  const headers = signInAs(t, userRow());
  deviceLookupReturns(t, deviceRow());
  const put = (body: object) => http().put('/api/v1/user/devices/AQM-0042/config').set(headers).send(body);

  assert.equal((await put({})).status, 400);
  assert.equal((await put({ measurement_interval_ms: 5_000 })).status, 400); // below 10 s
  assert.equal((await put({ report_interval_ms: 90_000_000 })).status, 400); // above 24 h
  assert.equal((await put({ report_interval_ms: 60000.5 })).status, 400); // not an integer
});

test('PUT /devices/:id/config forwards the intervals and returns the merged config', async (t) => {
  const headers = signInAs(t, userRow());
  deviceLookupReturns(t, deviceRow());
  const payload = deviceConfigPayloadDto({ measurement_interval_ms: 600_000, report_interval_ms: 1_800_000, config_version: 4 });
  const update = t.mock.method(deviceService, 'updateIntervals', async () => payload);

  const res = await http()
    .put('/api/v1/user/devices/AQM-0042/config')
    .set(headers)
    .send({ measurement_interval_ms: 600_000, report_interval_ms: 1_800_000 });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, payload);
  assert.deepEqual(callArgs<typeof deviceService.updateIntervals>(update)[1], {
    measurement_interval_ms: 600_000,
    report_interval_ms: 1_800_000,
  });
});
