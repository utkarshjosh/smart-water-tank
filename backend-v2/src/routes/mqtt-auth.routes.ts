import express, { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { env } from '../config/env';
import { verifyDeviceCredentials } from '../lib/device-token';

// ---------------------------------------------------------------------------
// Mosquitto auth hook (for mosquitto-go-auth's HTTP backend).
//
// The broker calls these endpoints to authenticate a device CONNECTION and
// authorize each topic. Device credentials are validated against DeviceToken
// with the EXACT same hash + lookup as HTTP deviceAuth (verifyDeviceCredentials
// -> verifyDeviceToken -> hashToken). This is the per-connection auth callback
// the plan calls for: the backend is an MQTT client and can't inspect other
// connections' credentials, so the broker delegates that check here.
//
// Response contract: 200 => allow, 403 => deny. (Compatible with mosquitto-go-
// auth "status" response mode; the {Ok, Error} body also suits "json" mode.)
// ---------------------------------------------------------------------------

const router = express.Router();

function isLoopbackRequest(req: Request): boolean {
  const address = req.socket.remoteAddress;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

// Mosquitto-go-auth's HTTP backend does not support arbitrary static request
// headers. A local broker is therefore trusted by its loopback connection;
// production binds Node to loopback and Nginx must not proxy this route. The
// shared secret remains useful for any non-loopback deployment or test setup.
function requireHookSecret(req: Request, res: Response, next: NextFunction): void {
  if (isLoopbackRequest(req)) {
    next();
    return;
  }

  const secret = env.mqttAuthHookSecret;
  const provided = req.headers['x-broker-auth'];
  if (!secret || provided !== secret) {
    res.status(403).json({ Ok: false, Error: 'forbidden' });
    return;
  }
  next();
}

router.use(requireHookSecret);

function logAuthEvent(kind: string, body: Record<string, unknown>): void {
  if (env.nodeEnv === 'production') return;
  const safe = { ...body };
  if ('password' in safe) safe.password = '<redacted>';
  console.log(`[mqtt-auth] ${kind}`, JSON.stringify(safe));
}

const userSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// POST /api/v1/mqtt-auth/user - authenticate a device connection.
router.post(
  '/user',
  asyncHandler(async (req: Request, res: Response) => {
    logAuthEvent('user', req.body);
    const parsed = userSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(403).json({ Ok: false, Error: 'missing credentials' });
      return;
    }
    const device = await verifyDeviceCredentials(parsed.data.username, parsed.data.password);
    if (!device) {
      res.status(403).json({ Ok: false, Error: 'invalid credentials' });
      return;
    }
    res.status(200).json({ Ok: true });
  })
);

const aclSchema = z.object({
  username: z.string().min(1),
  topic: z.string().min(1),
  // Mosquitto access values: 1 read, 2 write, 3 read/write, 4 subscribe.
  acc: z.number().int().min(1).max(4),
  clientid: z.string().optional(),
});

// POST /api/v1/mqtt-auth/acl - devices get only the exact transport topics
// they need: publish telemetry/announce/ack; read or subscribe config/cmd.
// This prevents a device from overwriting its retained config or sending a
// command, while also preventing cross-device access.
router.post(
  '/acl',
  asyncHandler(async (req: Request, res: Response) => {
    logAuthEvent('acl', req.body);
    const parsed = aclSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(403).json({ Ok: false, Error: 'bad acl request' });
      return;
    }
    const { username, topic, acc } = parsed.data;
    const base = `devices/${username}`;
    const deviceWrites = new Set([`${base}/telemetry`, `${base}/announce`, `${base}/ack`]);
    const deviceReads = new Set([`${base}/config`, `${base}/cmd`]);
    const allowed = (acc === 2 && deviceWrites.has(topic)) ||
      ((acc === 1 || acc === 4) && deviceReads.has(topic));

    if (!allowed) {
      res.status(403).json({ Ok: false, Error: 'topic access denied' });
      return;
    }
    res.status(200).json({ Ok: true });
  })
);

// POST /api/v1/mqtt-auth/superuser - devices are never superusers. The backend
// itself connects with static broker credentials, not through this hook.
router.post('/superuser', (req: Request, res: Response) => {
  logAuthEvent('superuser', req.body);
  if (req.body?.username === env.mqttUsername) {
    res.status(200).json({ Ok: true });
    return;
  }
  res.status(403).json({ Ok: false });
});

export default router;
