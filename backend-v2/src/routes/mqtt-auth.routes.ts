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

// Optional shared-secret guard so only the broker can reach these endpoints.
// If MQTT_AUTH_HOOK_SECRET is unset, calls are accepted (rely on network
// isolation between broker and backend).
function requireHookSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = env.mqttAuthHookSecret;
  if (!secret) {
    next();
    return;
  }
  const provided = req.headers['x-broker-auth'];
  if (provided !== secret) {
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
  // acc / clientid are provided by the broker but the only rule we enforce is
  // topic-subtree ownership, so they are accepted-but-unused.
  acc: z.number().optional(),
  clientid: z.string().optional(),
});

// POST /api/v1/mqtt-auth/acl - a device may only touch its own subtree
// devices/{deviceId}/# (deviceId == its broker username). This stops one
// authenticated device from reading/publishing another device's topics.
router.post(
  '/acl',
  asyncHandler(async (req: Request, res: Response) => {
    logAuthEvent('acl', req.body);
    const parsed = aclSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(403).json({ Ok: false, Error: 'bad acl request' });
      return;
    }
    const prefix = `devices/${parsed.data.username}/`;
    if (!parsed.data.topic.startsWith(prefix)) {
      res.status(403).json({ Ok: false, Error: 'topic outside device subtree' });
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
