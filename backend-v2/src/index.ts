import * as fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { initializeFirebase } from './config/firebase';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { HttpError } from './lib/http-error';
import deviceRoutes from './routes/device.routes';
import userRoutes from './routes/user.routes';
import adminRoutes from './routes/admin.routes';
import mqttAuthRoutes from './routes/mqtt-auth.routes';
import { startCronJobs } from './jobs/cron';
import { gatewayCore, HttpAdapter, MqttAdapter, setActiveGateway } from './gateway';
import type { DeviceGateway } from './gateway';

const app = express();

try {
  initializeFirebase();
} catch (error) {
  console.error('Failed to initialize Firebase:', error);
  process.exit(1);
}

app.use(helmet());

function getCorsOrigins(): string | string[] {
  const fallback = env.nodeEnv === 'production' ? 'https://aquamind.utkarshjoshi.com' : '*';
  const corsOrigin = env.corsOrigin || fallback;
  return corsOrigin.includes(',') ? corsOrigin.split(',').map((o) => o.trim()) : corsOrigin;
}

app.use(cors({ origin: getCorsOrigins(), credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

app.use('/api/v1', deviceRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/mqtt-auth', mqttAuthRoutes);

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Invalid request data', details: err.errors });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    return;
  }
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

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

app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`);
  console.log(`Environment: ${env.nodeEnv}`);

  startCronJobs();
  startMqttIfConfigured();
});

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
