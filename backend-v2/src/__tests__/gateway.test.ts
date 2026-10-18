import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import mqtt, { type IClientOptions } from 'mqtt';
import type { Device } from '@prisma/client';
import { GatewayCore, telemetryToMeasurementInput, shouldPushConfig } from '../gateway/core';
import { MqttAdapter } from '../gateway/mqtt-adapter';
import { setActiveGateway, disconnectDeviceSession, disconnectDeviceSessions } from '../gateway/registry';
import * as deviceService from '../services/device.service';
import type { AnnounceMessage, TelemetryMessage } from '../protocol';
import { deviceRow, stubModel } from './helpers/http';

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

// --- archived (decommissioned) devices ----------------------------------------
// The broker only checks credentials on CONNECT, so a session opened before the
// device was archived keeps publishing. The core must drop those frames.

const archivedDevice = deviceRow({ deviceId: 'node-1', archivedAt: new Date('2026-10-01T00:00:00Z') });

const announce: AnnounceMessage = { type: 'announce', id: 'node-1', role: 'tank', fw: '1.1.6', configVersion: 2 };

test('handleTelemetry: archived device -> nothing recorded, no config, flagged archived', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const core = new GatewayCore();
  core.resolveByHardwareId = async () => archivedDevice;

  const record = t.mock.method(deviceService, 'recordMeasurement', async () => {
    throw new Error('should not be called');
  });
  const syncMode = t.mock.method(deviceService, 'getSyncMode', async () => 'live' as const);

  const outcome = await core.handleTelemetry('node-1', telemetry);

  assert.equal(outcome.archived, true);
  // recognized stays false so a caller that ignores `archived` still drops it.
  assert.equal(outcome.recognized, false);
  assert.equal(outcome.config, null);
  assert.equal(shouldPushConfig(outcome), false);
  assert.equal(record.mock.callCount(), 0);
  assert.equal(syncMode.mock.callCount(), 0);
});

test('handleAnnounce: archived device -> no liveness write, no config', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const core = new GatewayCore();
  core.resolveByHardwareId = async () => archivedDevice;

  const update = t.mock.fn(async () => {
    throw new Error('should not be called');
  });
  stubModel(t, 'device', { update });
  const build = t.mock.method(deviceService, 'buildDeviceConfig', async () => {
    throw new Error('should not be called');
  });

  const outcome = await core.handleAnnounce('node-1', announce);

  assert.equal(outcome.archived, true);
  assert.equal(outcome.recognized, false);
  assert.equal(outcome.config, null);
  assert.equal(update.mock.callCount(), 0);
  assert.equal(build.mock.callCount(), 0);
});

test('archived device: logged once per device, not once per frame', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const core = new GatewayCore();
  const other = deviceRow({ deviceId: 'node-2', archivedAt: new Date('2026-10-02T00:00:00Z') });
  core.resolveByHardwareId = async (id: string) => (id === 'node-2' ? other : archivedDevice);

  await core.handleTelemetry('node-1', telemetry);
  await core.handleTelemetry('node-1', telemetry);
  await core.handleAnnounce('node-1', announce);
  await core.handleTelemetry('node-1', telemetry);
  await core.handleTelemetry('node-2', { ...telemetry, id: 'node-2' });
  await core.handleTelemetry('node-2', { ...telemetry, id: 'node-2' });

  assert.equal(warn.mock.callCount(), 2);
  assert.match(String(warn.mock.calls[0].arguments[0]), /archived device node-1/);
  assert.match(String(warn.mock.calls[1].arguments[0]), /archived device node-2/);
});

test('archived device: restored then archived again is logged again', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  t.mock.method(deviceService, 'recordMeasurement', async () => ({ measurementId: 'm-3', config: null, configVersion: 3 }));
  t.mock.method(deviceService, 'getSyncMode', async () => 'piggyback' as const);
  const core = new GatewayCore();
  let current: typeof archivedDevice = archivedDevice;
  core.resolveByHardwareId = async () => current;

  await core.handleTelemetry('node-1', telemetry); // archived: logged
  current = deviceRow({ deviceId: 'node-1', archivedAt: null });
  const restored = await core.handleTelemetry('node-1', telemetry); // restored: recorded
  current = archivedDevice;
  await core.handleTelemetry('node-1', telemetry); // archived again: logged again

  assert.equal(restored.recognized, true);
  assert.equal(restored.measurementId, 'm-3');
  assert.equal(warn.mock.callCount(), 2);
});

test('MqttAdapter: archived telemetry/announce are dropped quietly with no config publish', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const core = new GatewayCore();
  const handleTelemetry = t.mock.method(core, 'handleTelemetry', async () => ({
    recognized: false,
    archived: true,
    stale: false,
    syncMode: 'live' as const,
    config: null,
    configVersion: 0,
  }));
  const handleAnnounce = t.mock.method(core, 'handleAnnounce', async () => ({ recognized: false, archived: true, config: null }));
  const resolveConfig = t.mock.method(core, 'resolveConfig', async () => {
    throw new Error('should not be called');
  });

  // Never started: a publish attempt would warn "broker is not connected", and
  // an unrecognized frame would warn "unknown device". Neither may happen.
  const adapter = new MqttAdapter(core, { url: 'mqtt://unused' });
  const onMessage = (adapter as unknown as { onMessage(topic: string, payload: Buffer): Promise<void> }).onMessage.bind(adapter);

  await onMessage('devices/node-1/telemetry', Buffer.from(JSON.stringify(telemetry)));
  await onMessage('devices/node-1/announce', Buffer.from(JSON.stringify(announce)));

  assert.equal(handleTelemetry.mock.callCount(), 1);
  assert.equal(handleAnnounce.mock.callCount(), 1);
  assert.equal(warn.mock.callCount(), 0);
  assert.equal(resolveConfig.mock.callCount(), 0);
});

// --- ending a live session (archive / token revoke) ---------------------------
// The adapter connects with the device's own client id, which makes the broker
// drop the device's session. mqtt.connect is replaced by a fake client.

class FakeMqttClient extends EventEmitter {
  endedWith: boolean | undefined;
  end(force?: boolean): this {
    this.endedWith = force ?? false;
    setImmediate(() => this.emit('close'));
    return this;
  }
}

function fakeConnect(t: import('node:test').TestContext, behave: (client: FakeMqttClient) => void) {
  const client = new FakeMqttClient();
  const connect = t.mock.method(mqtt, 'connect', (() => {
    setImmediate(() => behave(client));
    return client;
  }) as unknown as typeof mqtt.connect);
  return { client, connect };
}

test('MqttAdapter.disconnectDevice: takes over the device client id with backend credentials, then leaves', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { client, connect } = fakeConnect(t, (c) => c.emit('connect'));
  const adapter = new MqttAdapter(new GatewayCore(), {
    url: 'mqtt://127.0.0.1:1883',
    username: 'aquamind-backend',
    password: 'backend-secret',
    rejectUnauthorized: false,
  });

  await adapter.disconnectDevice('AQM-0042');

  assert.equal(connect.mock.callCount(), 1);
  const [url, opts] = connect.mock.calls[0]!.arguments as unknown as [string, IClientOptions];
  assert.equal(url, 'mqtt://127.0.0.1:1883');
  assert.equal(opts.clientId, 'AQM-0042'); // the device's id, not the adapter's
  assert.equal(opts.username, 'aquamind-backend');
  assert.equal(opts.password, 'backend-secret');
  assert.equal(opts.rejectUnauthorized, false);
  assert.equal(opts.clean, true);
  assert.equal(opts.reconnectPeriod, 0); // one attempt only
  assert.equal(client.endedWith, false); // graceful DISCONNECT once connected
});

test('MqttAdapter.disconnectDevice: unreachable broker -> logs, gives up, still resolves', async (t) => {
  const error = t.mock.method(console, 'error', () => {});
  const { client } = fakeConnect(t, (c) => c.emit('error', new Error('connect ECONNREFUSED 127.0.0.1:1883')));
  const adapter = new MqttAdapter(new GatewayCore(), { url: 'mqtt://127.0.0.1:1883' });

  await adapter.disconnectDevice('AQM-0042');

  assert.equal(client.endedWith, true);
  assert.equal(error.mock.callCount(), 1);
  assert.match(String(error.mock.calls[0]!.arguments[1]), /AQM-0042/);
});

test('disconnectDeviceSession: no gateway, or one without sessions (HTTP) -> no-op', async (t) => {
  t.after(() => setActiveGateway(null));
  setActiveGateway(null);
  await disconnectDeviceSession('AQM-0042');
  setActiveGateway({ pushConfig: async () => {} });
  await disconnectDeviceSession('AQM-0042');
});

test('disconnectDeviceSession: a throwing gateway is logged, never rethrown', async (t) => {
  t.after(() => setActiveGateway(null));
  const error = t.mock.method(console, 'error', () => {});
  setActiveGateway({
    pushConfig: async () => {},
    disconnectDevice: async () => {
      throw new Error('broker down');
    },
  });

  await disconnectDeviceSession('AQM-0042');
  assert.equal(error.mock.callCount(), 1);
});

test('disconnectDeviceSessions: one device at a time, in order', async (t) => {
  t.after(() => setActiveGateway(null));
  const events: string[] = [];
  setActiveGateway({
    pushConfig: async () => {},
    disconnectDevice: async (id: string) => {
      events.push(`start ${id}`);
      await new Promise((r) => setImmediate(r));
      events.push(`end ${id}`);
    },
  });

  await disconnectDeviceSessions(['A', 'B', 'C']);
  assert.deepEqual(events, ['start A', 'end A', 'start B', 'end B', 'start C', 'end C']);
});
