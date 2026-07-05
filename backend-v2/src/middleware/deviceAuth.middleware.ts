import { NextFunction, Request, Response } from 'express';
import { Device } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { extractBearer } from '../lib/bearer';
import { hashToken } from '../lib/device-token';
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

    const tokenHash = hashToken(token);
    const record = await prisma.deviceToken.findFirst({
      where: {
        tokenHash,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { device: true },
    });

    if (!record) {
      res.status(401).json({ error: 'Invalid device token' });
      return;
    }

    req.device = record.device;
    next();
  } catch (error) {
    console.error('Device authentication error:', error);
    res.status(401).json({ error: 'Device authentication failed' });
  }
}
