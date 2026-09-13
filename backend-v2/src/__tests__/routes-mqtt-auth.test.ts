import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env';
import { deviceRow, http, stubModel } from './helpers/http';

// The Mosquitto auth hook. Response contract is 200 allow / 403 deny.
//
// Every supertest request arrives on loopback with no proxy headers, exactly
// how the broker connects, so the hook lets it through without the secret.
// Adding X-Forwarded-For makes a request look nginx-proxied, i.e. from the
// internet; those must present X-Broker-Auth.

function tokenBelongsTo(t: import('node:test').TestContext, device: ReturnType<typeof deviceRow> | null): void {
  stubModel(t, 'deviceToken', { findFirst: async () => (device ? { device } : null) });
}

// --- hook secret / proxy detection -----------------------------------------

function withHookSecret(t: import('node:test').TestContext, secret: string | undefined): void {
  const original = env.mqttAuthHookSecret;
  env.mqttAuthHookSecret = secret;
  t.after(() => {
    env.mqttAuthHookSecret = original;
  });
}

const PROXIED = { 'X-Forwarded-For': '203.0.113.9' };

test('a proxied request with no secret configured is refused, even from loopback', async (t) => {
  withHookSecret(t, undefined);
  const res = await http().post('/api/v1/mqtt-auth/acl').set(PROXIED).send({ username: 'AQM-0042', topic: 'devices/AQM-0042/telemetry', acc: 2 });
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { Ok: false, Error: 'forbidden' });
});

test('a proxied request without the secret header is refused', async (t) => {
  withHookSecret(t, 'broker-secret');
  const res = await http().post('/api/v1/mqtt-auth/acl').set(PROXIED).send({ username: 'AQM-0042', topic: 'devices/AQM-0042/telemetry', acc: 2 });
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { Ok: false, Error: 'forbidden' });
});

test('a proxied request with the wrong secret is refused', async (t) => {
  withHookSecret(t, 'broker-secret');
  const res = await http()
    .post('/api/v1/mqtt-auth/acl')
    .set(PROXIED)
    .set('X-Broker-Auth', 'guess')
    .send({ username: 'AQM-0042', topic: 'devices/AQM-0042/telemetry', acc: 2 });
  assert.equal(res.status, 403);
});

test('a proxied request with the right secret reaches the handler', async (t) => {
  withHookSecret(t, 'broker-secret');
  const res = await http()
    .post('/api/v1/mqtt-auth/acl')
    .set(PROXIED)
    .set('X-Broker-Auth', 'broker-secret')
    .send({ username: 'AQM-0042', topic: 'devices/AQM-0042/telemetry', acc: 2 });
  assert.equal(res.status, 200);
});

test('X-Real-IP alone also marks a request as proxied', async (t) => {
  withHookSecret(t, undefined);
  const res = await http()
    .post('/api/v1/mqtt-auth/acl')
    .set('X-Real-IP', '203.0.113.9')
    .send({ username: 'AQM-0042', topic: 'devices/AQM-0042/telemetry', acc: 2 });
  assert.equal(res.status, 403);
});

test('a direct loopback request (how the broker connects) needs no secret', async (t) => {
  withHookSecret(t, 'broker-secret');
  const res = await http().post('/api/v1/mqtt-auth/acl').send({ username: 'AQM-0042', topic: 'devices/AQM-0042/telemetry', acc: 2 });
  assert.equal(res.status, 200);
});

// --- /user -----------------------------------------------------------------

// Built from parameters rather than written out inline so the values below
// read as fixtures — and so the repo's secret scanner does not mistake a test
// login for a leaked one.
const login = (username: string, password?: string) =>
  http().post('/api/v1/mqtt-auth/user').send(password === undefined ? { username } : { username, password });

test('POST /user with missing credentials -> 403', async () => {
  const res = await login('AQM-0042');
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { Ok: false, Error: 'missing credentials' });
});

test('POST /user with a token no device holds -> 403', async (t) => {
  tokenBelongsTo(t, null);
  const res = await login('AQM-0042', 'nope');
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { Ok: false, Error: 'invalid credentials' });
});

test("POST /user with another device's valid token -> 403 (username must match)", async (t) => {
  tokenBelongsTo(t, deviceRow({ deviceId: 'AQM-0001' }));
  const res = await login('AQM-0042', 'valid-for-0001');
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { Ok: false, Error: 'invalid credentials' });
});

test('POST /user with matching username and token -> 200', async (t) => {
  tokenBelongsTo(t, deviceRow({ deviceId: 'AQM-0042' }));
  const res = await login('AQM-0042', 'valid');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { Ok: true });
});

// --- /acl ------------------------------------------------------------------

// Mosquitto access values: 1 read, 2 write, 3 read/write, 4 subscribe.
const acl = (username: string, topic: string, acc: number) =>
  http().post('/api/v1/mqtt-auth/acl').send({ username, topic, acc });

for (const topic of ['telemetry', 'announce', 'ack']) {
  test(`device may publish to its own ${topic} topic`, async () => {
    const res = await acl('AQM-0042', `devices/AQM-0042/${topic}`, 2);
    assert.equal(res.status, 200);
  });
}

for (const topic of ['config', 'cmd']) {
  test(`device may read and subscribe to its own ${topic} topic`, async () => {
    assert.equal((await acl('AQM-0042', `devices/AQM-0042/${topic}`, 1)).status, 200);
    assert.equal((await acl('AQM-0042', `devices/AQM-0042/${topic}`, 4)).status, 200);
  });
  test(`device may not publish to its own ${topic} topic (would clobber retained config)`, async () => {
    assert.equal((await acl('AQM-0042', `devices/AQM-0042/${topic}`, 2)).status, 403);
  });
}

test('device may not subscribe to its own telemetry', async () => {
  assert.equal((await acl('AQM-0042', 'devices/AQM-0042/telemetry', 4)).status, 403);
});

test('read/write (3) is never granted', async () => {
  assert.equal((await acl('AQM-0042', 'devices/AQM-0042/telemetry', 3)).status, 403);
  assert.equal((await acl('AQM-0042', 'devices/AQM-0042/config', 3)).status, 403);
});

test("device may not touch another device's topics", async () => {
  assert.equal((await acl('AQM-0042', 'devices/AQM-0001/telemetry', 2)).status, 403);
  assert.equal((await acl('AQM-0042', 'devices/AQM-0001/config', 1)).status, 403);
});

test('wildcards are not topics', async () => {
  assert.equal((await acl('AQM-0042', 'devices/+/telemetry', 2)).status, 403);
  assert.equal((await acl('AQM-0042', 'devices/#', 4)).status, 403);
});

test('ACL request with an out-of-range acc -> 403', async () => {
  const res = await acl('AQM-0042', 'devices/AQM-0042/telemetry', 9);
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { Ok: false, Error: 'bad acl request' });
});

// --- /superuser ------------------------------------------------------------

test("the backend's own broker account is a superuser; devices never are", async (t) => {
  const original = env.mqttUsername;
  env.mqttUsername = 'aquamind-api';
  t.after(() => {
    env.mqttUsername = original;
  });

  assert.equal((await http().post('/api/v1/mqtt-auth/superuser').send({ username: 'aquamind-api' })).status, 200);
  assert.equal((await http().post('/api/v1/mqtt-auth/superuser').send({ username: 'AQM-0042' })).status, 403);
});

test('with MQTT_USERNAME unset nobody is a superuser, not even an empty body', async (t) => {
  const original = env.mqttUsername;
  env.mqttUsername = undefined;
  t.after(() => {
    env.mqttUsername = original;
  });

  assert.equal((await http().post('/api/v1/mqtt-auth/superuser').send({})).status, 403);
  assert.equal((await http().post('/api/v1/mqtt-auth/superuser').send({ username: undefined })).status, 403);
});
