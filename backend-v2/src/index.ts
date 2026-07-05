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
import { startCronJobs } from './jobs/cron';

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

app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`);
  console.log(`Environment: ${env.nodeEnv}`);

  startCronJobs();
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});
