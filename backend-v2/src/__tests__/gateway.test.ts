import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Device } from '@prisma/client';
import { GatewayCore, telemetryToMeasurementInput, shouldPushConfig } from '../gateway/core';
import * as deviceService from '../services/device.service';
import type { TelemetryMessage } from '../protocol';

const fakeDevice = { id: 'internal-uuid', deviceId: 'node-1', configVersion: 5 } as unknown as Device;

const telemetry: TelemetryMessage = {
  type: 'telemetry',
  id: 'node-1',
  ts: 1,
  configVersion: 4,
  data: { level_cm: 42.5, temperature_c: 21.3, battery_v: 3.9, rssi: -60 },
};

// --- pure telemetry -> measurement mapping -----------------------------------

test('telemetryToMeasurementInput: renames wire fields, defers volume to server', () => {
  const input = telemetryToMeasurementInput(telemetry);
  assert.equal(input.levelCm, 42.5);
  assert.equal(input.temperatureC, 21.3);
  assert.equal(input.batteryV, 3.9);
  assert.equal(input.rssi, -60);
  assert.equal(input.configVersion, 4);
  // Server computes canonical volume; the device sends none over MQTT.
  assert.equal(input.volumeL, null);
});

test('telemetryToMeasurementInput: null level_cm maps to null (no reading)', () => {
  const input = telemetryToMeasurementInput({ ...telemetry, data: { level_cm: null } });
  assert.equal(input.levelCm, null);
  assert.equal(input.temperatureC, null);
  assert.equal(input.batteryV, undefined);
});

// --- pure push decision ------------------------------------------------------

test('shouldPushConfig: stale device with config -> push', () => {
  assert.equal(shouldPushConfig({ stale: true, config: { config_version: 6 } as never, syncMode: 'piggyback' }), true);
});

test('shouldPushConfig: piggyback + up-to-date (no config) -> no push', () => {
  assert.equal(shouldPushConfig({ stale: false, config: null, syncMode: 'piggyback' }), false);
});

test('shouldPushConfig: live mode always pushes, even when up to date', () => {
  assert.equal(shouldPushConfig({ stale: false, config: null, syncMode: 'live' }), true);
});

test('shouldPushConfig: stale flag but null config -> no push (nothing to send)', () => {
  assert.equal(shouldPushConfig({ stale: true, config: null, syncMode: 'piggyback' }), false);
});

// --- handleTelemetry wiring (DB + recordMeasurement mocked) -------------------

test('handleTelemetry: maps telemetry, reuses recordMeasurement, reports stale + syncMode', async (t) => {
  const core = new GatewayCore();
  // Avoid the DB: resolve the device directly.
  core.resolveByHardwareId = async () => fakeDevice;

  let captured: deviceService.MeasurementInput | null = null;
  t.mock.method(deviceService, 'recordMeasurement', async (_device: Device, data: deviceService.MeasurementInput) => {
    captured = data;
    // Non-null config => the device was stale and gets a piggyback payload.
    return { measurementId: 'm-1', config: { config_version: 5 } as never, configVersion: 5 };
  });
  t.mock.method(deviceService, 'getSyncMode', async () => 'live' as const);

  const outcome = await core.handleTelemetry('node-1', telemetry);

  assert.equal(outcome.recognized, true);
  assert.equal(outcome.measurementId, 'm-1');
  assert.equal(outcome.stale, true); // config was non-null
  assert.equal(outcome.syncMode, 'live');
  assert.equal(outcome.configVersion, 5);
  // recordMeasurement received the mapped input, not raw wire fields.
  assert.equal(captured!.levelCm, 42.5);
  assert.equal(captured!.configVersion, 4);
  assert.equal(captured!.volumeL, null);
});

test('handleTelemetry: up-to-date device -> not stale, no piggyback config', async (t) => {
  const core = new GatewayCore();
  core.resolveByHardwareId = async () => fakeDevice;

  t.mock.method(deviceService, 'recordMeasurement', async () => ({
    measurementId: 'm-2',
    config: null, // device already current
    configVersion: 5,
  }));
  t.mock.method(deviceService, 'getSyncMode', async () => 'piggyback' as const);

  const outcome = await core.handleTelemetry('node-1', telemetry);
  assert.equal(outcome.stale, false);
  assert.equal(outcome.config, null);
  assert.equal(shouldPushConfig(outcome), false);
});

test('handleTelemetry: unknown device -> not recognized, nothing recorded', async (t) => {
  const core = new GatewayCore();
  core.resolveByHardwareId = async () => null;

  const spy = t.mock.method(deviceService, 'recordMeasurement', async () => {
    throw new Error('should not be called');
  });

  const outcome = await core.handleTelemetry('ghost', telemetry);
  assert.equal(outcome.recognized, false);
  assert.equal(outcome.config, null);
  assert.equal(spy.mock.callCount(), 0);
});
