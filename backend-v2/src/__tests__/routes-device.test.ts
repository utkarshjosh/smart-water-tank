import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as deviceService from '../services/device.service';
import { callArgs, deviceRow, deviceTokenResolvesTo, http } from './helpers/http';

// Device-facing routes: the unauthenticated claim exchange and the
// bearer-token routes a provisioned device calls from firmware.
//
// Note: /devices/claim sits behind a per-IP limiter of 10 per 10 minutes and
// every supertest call comes from loopback, so keep the claim tests few.

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
  t.mock.method(deviceService, 'recordMeasurement', async () => ({
    measurementId: 'm-2',
    configVersion: 4,
    config: { config_version: 4, report_interval_ms: 300000 },
  }));

  const res = await http().post('/api/v1/measurements').set(headers).send({ level_cm: 12.5, volume_l: 800, config_version: 3 });

  assert.equal(res.status, 201);
  assert.deepEqual(res.body.config, { config_version: 4, report_interval_ms: 300000 });
});

test('GET /devices/:id/config returns the config for the token holder, ignoring the URL id', async (t) => {
  const headers = deviceTokenResolvesTo(t, deviceRow({ deviceId: 'AQM-0042' }));
  const config = t.mock.method(deviceService, 'getDeviceConfig', async () => ({ config_version: 3 }));

  const res = await http().get('/api/v1/devices/AQM-9999/config').set(headers);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { config_version: 3 });
  // Identity comes from the bearer, not the path.
  assert.equal(callArgs<typeof deviceService.getDeviceConfig>(config)[0].deviceId, 'AQM-0042');
});
