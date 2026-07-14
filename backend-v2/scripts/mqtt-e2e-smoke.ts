import crypto from 'crypto';
import mqtt from 'mqtt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const mqttUrl = process.env.MQTT_URL || 'mqtt://localhost:1883';
const hardwareId = process.env.MQTT_SMOKE_DEVICE_ID || `mqtt-smoke-${Date.now()}`;
const token = process.env.MQTT_SMOKE_DEVICE_TOKEN || `mqtt-smoke-token-${crypto.randomBytes(6).toString('hex')}`;
const tenantId = process.env.MQTT_SMOKE_TENANT_ID || '00000000-0000-0000-0000-000000000201';

function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function waitForConnect(client: mqtt.MqttClient): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('MQTT connect timeout')), 10_000);
    client.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    client.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function waitForConfig(client: mqtt.MqttClient, topic: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${topic}`)), 10_000);
    client.subscribe(topic, { qos: 1 }, (err) => {
      if (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
    client.on('message', (receivedTopic, payload) => {
      if (receivedTopic !== topic) return;
      clearTimeout(timeout);
      resolve(payload.toString('utf8'));
    });
  });
}

async function seedDevice(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { id: tenantId },
    create: { id: tenantId, name: 'MQTT Smoke Tenant' },
    update: { name: 'MQTT Smoke Tenant' },
  });

  const device = await prisma.device.upsert({
    where: { deviceId: hardwareId },
    create: {
      deviceId: hardwareId,
      tenantId: tenant.id,
      name: 'MQTT Smoke Device',
      status: 'offline',
      configVersion: 1,
    },
    update: {
      tenantId: tenant.id,
      name: 'MQTT Smoke Device',
    },
  });

  await prisma.deviceConfig.upsert({
    where: { deviceId: device.id },
    create: {
      deviceId: device.id,
      measurementIntervalMs: 60_000,
      reportIntervalMs: 60_000,
      syncMode: 'piggyback',
    },
    update: {
      measurementIntervalMs: 60_000,
      reportIntervalMs: 60_000,
      syncMode: 'piggyback',
    },
  });

  await prisma.tankProfile.upsert({
    where: { deviceId: device.id },
    create: {
      deviceId: device.id,
      shape: 'cylindrical',
      parallelUnitCount: 1,
      heightCm: 90,
      diameterCm: 120,
      sensorOffsetCm: 0,
      deadZoneCm: 20,
    },
    update: {
      shape: 'cylindrical',
      parallelUnitCount: 1,
      heightCm: 90,
      diameterCm: 120,
      sensorOffsetCm: 0,
      deadZoneCm: 20,
    },
  });

  await prisma.deviceToken.upsert({
    where: { tokenHash: hashToken(token) },
    create: { deviceId: device.id, tokenHash: hashToken(token) },
    update: { deviceId: device.id, expiresAt: null },
  });
}

async function main(): Promise<void> {
  await seedDevice();

  const client = mqtt.connect(mqttUrl, {
    username: hardwareId,
    password: token,
    reconnectPeriod: 0,
    connectTimeout: 10_000,
  });

  await waitForConnect(client);
  console.log(`[mqtt-smoke] connected as ${hardwareId}`);

  const configTopic = `devices/${hardwareId}/config`;
  const configPromise = waitForConfig(client, configTopic);

  const telemetry = {
    type: 'telemetry',
    id: hardwareId,
    configVersion: 0,
    data: {
      level_cm: 45,
      temperature_c: 27.5,
      battery_v: 3.91,
      rssi: -51,
    },
  };

  await new Promise<void>((resolve, reject) => {
    client.publish(`devices/${hardwareId}/telemetry`, JSON.stringify(telemetry), { qos: 1 }, (err) =>
      err ? reject(err) : resolve()
    );
  });
  console.log('[mqtt-smoke] telemetry published');

  const configPayload = await configPromise;
  const config = JSON.parse(configPayload);
  if (config?.config?.config_version == null) {
    throw new Error(`retained config missing config_version: ${configPayload}`);
  }
  console.log(`[mqtt-smoke] retained config received version=${config.config.config_version}`);

  await new Promise((resolve) => setTimeout(resolve, 500));
  const device = await prisma.device.findUniqueOrThrow({
    where: { deviceId: hardwareId },
    include: { measurements: { orderBy: { timestamp: 'desc' }, take: 1 } },
  });

  const latest = device.measurements[0];
  if (!latest) throw new Error('measurement was not inserted');
  console.log(
    `[mqtt-smoke] DB measurement level=${latest.levelCm?.toString() ?? 'null'} volume=${
      latest.volumeL?.toString() ?? 'null'
    }`
  );

  client.end(true);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[mqtt-smoke] failed:', err);
  try {
    await prisma.$disconnect();
  } catch {
    // ignore shutdown error
  }
  process.exit(1);
});
