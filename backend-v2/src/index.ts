import * as fs from 'fs';
import { initializeFirebase } from './config/firebase';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { createApp } from './app';
import { startCronJobs } from './jobs/cron';
import { gatewayCore, HttpAdapter, MqttAdapter, setActiveGateway } from './gateway';
import type { DeviceGateway } from './gateway';

try {
  initializeFirebase();
} catch (error) {
  console.error('Failed to initialize Firebase:', error);
  process.exit(1);
}

const app = createApp();

// Server-initiated config transport. Defaults to the HTTP adapter (push is a
// no-op; devices pull). If MQTT_URL is configured, the MqttAdapter takes over
// and pushes retained config on change. Kept resilient: MQTT setup failure or a
// down broker only logs — the HTTP API always stays up.
let activeGateway: DeviceGateway = new HttpAdapter(gatewayCore);
setActiveGateway(activeGateway);

function startMqttIfConfigured(): void {
  if (!env.mqttUrl) {
    console.log('MQTT disabled (MQTT_URL unset) - running HTTP-only');
    return;
  }
  try {
    let ca: Buffer | undefined;
    if (env.mqttTlsCaPath) {
      ca = fs.readFileSync(env.mqttTlsCaPath);
    }
    const mqttAdapter = new MqttAdapter(gatewayCore, {
      url: env.mqttUrl,
      username: env.mqttUsername,
      password: env.mqttPassword,
      ca,
      rejectUnauthorized: env.mqttTlsRejectUnauthorized,
    });
    // start() only kicks off an async connect with auto-reconnect; it does not
    // block on the broker being reachable, so a down broker never delays boot.
    mqttAdapter.start().catch((err) => console.error('[mqtt] failed to start adapter:', err));
    activeGateway = mqttAdapter;
    setActiveGateway(mqttAdapter);
    console.log('MQTT adapter starting for broker', env.mqttUrl);
  } catch (err) {
    // Never let MQTT init take down the HTTP server.
    console.error('[mqtt] initialization error, continuing HTTP-only:', err);
  }
}

function onServerListening(): void {
  console.log(`Server running on port ${env.port}`);
  if (env.apiBindHost) console.log(`Server bound to ${env.apiBindHost}`);
  console.log(`Environment: ${env.nodeEnv}`);

  startCronJobs();
  startMqttIfConfigured();
}

if (env.apiBindHost) {
  app.listen(env.port, env.apiBindHost, onServerListening);
} else {
  app.listen(env.port, onServerListening);
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  try {
    if (activeGateway.stop) await activeGateway.stop();
  } catch (err) {
    console.error('Error stopping gateway:', err);
  }
  await prisma.$disconnect();
  process.exit(0);
});
