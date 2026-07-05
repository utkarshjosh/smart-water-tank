import * as crypto from 'crypto';
import { prisma } from './prisma';
import { HttpError } from './http-error';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Mints a new bearer token for a device identified by its firmware-facing
// device_id string (not the internal UUID). Used by the claim flow and by
// admin routes re-issuing credentials.
export async function createDeviceToken(deviceId: string): Promise<string> {
  const device = await prisma.device.findUnique({ where: { deviceId } });
  if (!device) throw new HttpError(404, 'Device not found');

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.deviceToken.create({
    data: { deviceId: device.id, tokenHash: hashToken(token) },
  });

  return token;
}
