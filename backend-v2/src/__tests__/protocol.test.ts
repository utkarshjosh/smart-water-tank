import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeviceMessage, buildConfigMessage, buildCmdMessage } from '../protocol';

// --- valid messages ----------------------------------------------------------

test('parseDeviceMessage: valid telemetry with HTTP-parity field names', () => {
  const raw = JSON.stringify({
    type: 'telemetry',
    id: 'node-1',
    ts: 12345,
    configVersion: 7,
    data: { level_cm: 42.5, temperature_c: 21.3, battery_v: 3.9, rssi: -60 },
  });
  const r = parseDeviceMessage(raw);
  assert.equal(r.ok, true);
  if (r.ok && r.message.type === 'telemetry') {
    assert.equal(r.message.id, 'node-1');
    assert.equal(r.message.configVersion, 7);
    assert.equal(r.message.data.level_cm, 42.5);
    assert.equal(r.message.data.battery_v, 3.9);
  } else {
    assert.fail('expected telemetry');
  }
});

test('parseDeviceMessage: telemetry accepts null level_cm (no reading)', () => {
  const r = parseDeviceMessage({ type: 'telemetry', id: 'n', data: { level_cm: null } });
  assert.equal(r.ok, true);
  if (r.ok && r.message.type === 'telemetry') {
    assert.equal(r.message.data.level_cm, null);
  }
});

test('parseDeviceMessage: accepts a Buffer payload (MQTT)', () => {
  const buf = Buffer.from(JSON.stringify({ type: 'ack', id: 'n', cmd: 'reboot', ok: true, msg: 'ok' }));
  const r = parseDeviceMessage(buf);
  assert.equal(r.ok, true);
  if (r.ok && r.message.type === 'ack') {
    assert.equal(r.message.cmd, 'reboot');
    assert.equal(r.message.ok, true);
  }
});

test('parseDeviceMessage: valid announce with caps + configVersion', () => {
  const r = parseDeviceMessage({
    type: 'announce',
    id: 'node-1',
    role: 'tank',
    name: 'Roof Tank',
    fw: 'net-0.1.0',
    caps: ['ultrasonic', 'temp'],
    configVersion: 3,
  });
  assert.equal(r.ok, true);
  if (r.ok && r.message.type === 'announce') {
    assert.deepEqual(r.message.caps, ['ultrasonic', 'temp']);
    assert.equal(r.message.fw, 'net-0.1.0');
  }
});

test('parseDeviceMessage: getConfig/setConfig/ping parity messages (id optional)', () => {
  assert.equal(parseDeviceMessage({ type: 'ping' }).ok, true);
  assert.equal(parseDeviceMessage({ type: 'getConfig' }).ok, true);
  assert.equal(parseDeviceMessage({ type: 'setConfig', config: { sampleMs: 1000 } }).ok, true);
});

test('parseDeviceMessage: config message carries an open config object', () => {
  const r = parseDeviceMessage({ type: 'config', id: 'n', config: { config_version: 5, measurement_interval_ms: 60000 } });
  assert.equal(r.ok, true);
  if (r.ok && r.message.type === 'config') {
    assert.equal(r.message.config.config_version, 5);
  }
});

// --- invalid messages --------------------------------------------------------

test('parseDeviceMessage: non-JSON string is rejected', () => {
  const r = parseDeviceMessage('not json{');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /invalid JSON/);
});

test('parseDeviceMessage: unknown type is rejected', () => {
  const r = parseDeviceMessage({ type: 'bogus', id: 'n' });
  assert.equal(r.ok, false);
});

test('parseDeviceMessage: telemetry missing data is rejected', () => {
  const r = parseDeviceMessage({ type: 'telemetry', id: 'n' });
  assert.equal(r.ok, false);
});

test('parseDeviceMessage: telemetry with wrong-typed level_cm is rejected', () => {
  const r = parseDeviceMessage({ type: 'telemetry', id: 'n', data: { level_cm: 'high' } });
  assert.equal(r.ok, false);
});

test('parseDeviceMessage: announce missing id is rejected', () => {
  const r = parseDeviceMessage({ type: 'announce', role: 'tank' });
  assert.equal(r.ok, false);
});

test('parseDeviceMessage: message with no type is rejected', () => {
  const r = parseDeviceMessage({ id: 'n', data: { level_cm: 1 } });
  assert.equal(r.ok, false);
});

// --- envelope builders -------------------------------------------------------

test('buildConfigMessage: wraps payload with type + id', () => {
  const m = buildConfigMessage('node-1', { config_version: 9, measurement_interval_ms: 60000 });
  assert.equal(m.type, 'config');
  assert.equal(m.id, 'node-1');
  assert.equal(m.config.config_version, 9);
});

test('buildCmdMessage: builds a cmd envelope with args default', () => {
  const m = buildCmdMessage('node-1', 'getConfig');
  assert.equal(m.type, 'cmd');
  assert.equal(m.cmd, 'getConfig');
  assert.deepEqual(m.args, {});
});
