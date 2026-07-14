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
    console.error('Device authentication error:', error);
    res.status(401).json({ error: 'Device authentication failed' });
  }
}
