import { NextFunction, Request, Response } from 'express';
import { Device } from '@prisma/client';
import { extractBearer } from '../lib/bearer';
import { verifyDeviceToken } from '../lib/device-token';
import { HttpError } from '../lib/http-error';

export interface DeviceAuthRequest extends Request {
  device?: Device;
}

export async function deviceAuth(req: DeviceAuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearer(req);
    if (!token) {
      next(new HttpError(401, 'Missing or invalid authorization header'));
      return;
    }

    const device = await verifyDeviceToken(token);
    if (!device) {
      res.status(401).json({ error: 'Invalid device token' });
      return;
    }

    req.device = device;
    next();
  } catch (error) {
    // 401 must only ever mean "this token is not valid": firmware that sees
    // enough of them wipes its credentials and waits for a human to re-pair.
    // A lookup that threw (database down, pool exhausted) says nothing about
    // the token, so answer 503 and let the device retry with what it has.
    console.error('Device authentication error:', error);
    next(new HttpError(503, 'Device authentication temporarily unavailable'));
  }
}
