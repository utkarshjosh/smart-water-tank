import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as deviceService from '../services/device.service';
import { callArgs, deviceConfigPayloadDto, deviceRow, deviceTokenResolvesTo, http } from './helpers/http';

// Device-facing routes: the unauthenticated claim exchange and the
// bearer-token routes a provisioned device calls from firmware.
//
// Note: /devices/claim sits behind a per-IP limiter of 10 per 10 minutes.
// Bare supertest calls share the loopback bucket, so keep those few; the
// limiter tests below use X-Forwarded-For to get buckets of their own.

test('POST /devices/claim rejects a body missing claim_code or hardware_id', async () => {
  const res = await http().post('/api/v1/devices/claim').send({ claim_code: 'ABCD' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid request data');
});

test('POST /devices/claim returns the token and id for the device', async (t) => {
  const claim = t.mock.method(deviceService, 'claimDevice', async () => ({
    deviceToken: 'tok-secret',
    deviceId: 'AQM-0042',
  }));

  const res = await http().post('/api/v1/devices/claim').send({ claim_code: 'ABCD-1234', hardware_id: 'esp-aa:bb' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { device_token: 'tok-secret', device_id: 'AQM-0042' });
  assert.deepEqual(callArgs(claim), ['ABCD-1234', 'esp-aa:bb']);
});

test('POST /measurements without a bearer -> 401', async () => {
  const res = await http().post('/api/v1/measurements').send({ level_cm: 10, volume_l: 100 });
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Missing or invalid authorization header' });
});

test('POST /measurements with a token no device holds -> 401', async (t) => {
  const headers = deviceTokenResolvesTo(t, null);
  const res = await http().post('/api/v1/measurements').set(headers).send({ level_cm: 10, volume_l: 100 });
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Invalid device token' });
});

test('POST /measurements requires level_cm and volume_l (null allowed, absent not)', async (t) => {
  const headers = deviceTokenResolvesTo(t, deviceRow());
  const res = await http().post('/api/v1/measurements').set(headers).send({ level_cm: 10 });
  assert.equal(res.status, 400);
});

test('POST /measurements -> 201 with the echoed config_version and no config when in sync', async (t) => {
  const headers = deviceTokenResolvesTo(t, deviceRow());
  const record = t.mock.method(deviceService, 'recordMeasurement', async () => ({
    measurementId: 'm-1',
    configVersion: 3,
    config: undefined,
  }));

  const res = await http()
    .post('/api/v1/measurements')
    .set(headers)
    .send({ level_cm: null, volume_l: null, battery_v: 3.9, rssi: -60, config_version: 3, firmware_version: '1.2.0' });

  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { success: true, measurement_id: 'm-1', config_version: 3 });
  // null must reach the service as null (sensor could not read), never 0.
  const input = callArgs<typeof deviceService.recordMeasurement>(record)[1];
  assert.equal(input.levelCm, null);
  assert.equal(input.volumeL, null);
  assert.equal(input.firmwareVersion, '1.2.0');
  assert.equal(input.configVersion, 3);
});

test('POST /measurements piggybacks the full config when the device is stale', async (t) => {
  const headers = deviceTokenResolvesTo(t, deviceRow());
  const config = deviceConfigPayloadDto({ config_version: 4 });
  t.mock.method(deviceService, 'recordMeasurement', async () => ({
    measurementId: 'm-2',
    configVersion: 4,
    config,
  }));

  const res = await http().post('/api/v1/measurements').set(headers).send({ level_cm: 12.5, volume_l: 800, config_version: 3 });

  assert.equal(res.status, 201);
  assert.deepEqual(res.body.config, config);
});

test('GET /devices/:id/config returns the config for the token holder, ignoring the URL id', async (t) => {
  const headers = deviceTokenResolvesTo(t, deviceRow({ deviceId: 'AQM-0042' }));
  const payload = deviceConfigPayloadDto({ config_version: 3 });
  const config = t.mock.method(deviceService, 'getDeviceConfig', async () => payload);

  const res = await http().get('/api/v1/devices/AQM-9999/config').set(headers);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, payload);
  // Identity comes from the bearer, not the path.
  assert.equal(callArgs<typeof deviceService.getDeviceConfig>(config)[0].deviceId, 'AQM-0042');
});

// --- per-IP rate limiting behind the proxy ---------------------------------
//
// nginx forwards every client from 127.0.0.1. With `trust proxy` set, req.ip
// is taken from X-Forwarded-For, so each client gets its own bucket instead
// of the whole internet sharing one.

const claimFrom = (ip: string) =>
  http().post('/api/v1/devices/claim').set('X-Forwarded-For', ip).send({});

test('claim limiter counts per forwarded client address', async () => {
  const first = await claimFrom('203.0.113.10');
  assert.equal(first.status, 400);
  assert.equal(first.headers['ratelimit-remaining'], '9');

  const second = await claimFrom('203.0.113.10');
  assert.equal(second.headers['ratelimit-remaining'], '8');

  const other = await claimFrom('203.0.113.11');
  assert.equal(other.headers['ratelimit-remaining'], '9');
});

test('the 11th claim attempt from one address in the window -> 429; others unaffected', async () => {
  for (let i = 0; i < 10; i++) {
    assert.equal((await claimFrom('203.0.113.20')).status, 400);
  }
  assert.equal((await claimFrom('203.0.113.20')).status, 429);
  assert.equal((await claimFrom('203.0.113.21')).status, 400);
});

test('a spoofed loopback hop in X-Forwarded-For does not hide the real client', async () => {
  // nginx appends the real address: "spoofed, real". Only proxies on loopback
  // are trusted, so req.ip resolves to the first address that is not one —
  // the attacker's — and the limiter keys on that.
  const res = await claimFrom('127.0.0.1, 203.0.113.30');
  assert.equal(res.headers['ratelimit-remaining'], '9');
  const again = await claimFrom('127.0.0.1, 203.0.113.30');
  assert.equal(again.headers['ratelimit-remaining'], '8');
  const direct = await claimFrom('203.0.113.30');
  assert.equal(direct.headers['ratelimit-remaining'], '7');
});
