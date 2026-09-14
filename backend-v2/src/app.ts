import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { HttpError } from './lib/http-error';
import deviceRoutes from './routes/device.routes';
import userRoutes from './routes/user.routes';
import adminRoutes from './routes/admin.routes';
import mqttAuthRoutes from './routes/mqtt-auth.routes';

function getCorsOrigins(): string | string[] {
  const fallback = env.nodeEnv === 'production' ? 'https://aquamind.utkarshjoshi.com' : '*';
  const corsOrigin = env.corsOrigin || fallback;
  return corsOrigin.includes(',') ? corsOrigin.split(',').map((o) => o.trim()) : corsOrigin;
}

// Builds the HTTP app and nothing else: no listen, no Firebase init, no MQTT,
// no cron. index.ts owns process lifecycle; tests drive this with supertest.
export function createApp(): express.Express {
  const app = express();

  // Without this, behind nginx every request has req.ip === 127.0.0.1 and the
  // per-IP rate limiters collapse into one bucket shared by every client.
  app.set('trust proxy', env.trustProxy);

  app.use(helmet());
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
      res.status(400).json({ error: 'Invalid request data', details: err.issues });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
      return;
    }
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
