import * as crypto from 'crypto';
import { Device } from '@prisma/client';
import { prisma } from './prisma';
import { HttpError } from './http-error';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Resolve a bearer token to its Device using the same hash + non-expiry lookup
// as the HTTP deviceAuth middleware. Shared so BOTH transports (HTTP header and
// MQTT username/password) authenticate identically against DeviceToken.
// Returns the Device or null; never throws on a bad token.
export async function verifyDeviceToken(token: string): Promise<Device | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const record = await prisma.deviceToken.findFirst({
    where: {
      tokenHash,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: { device: true },
  });
  return record?.device ?? null;
}

// MQTT-style credential check: username MUST equal the device's hardware
// deviceId and the password MUST be a valid bearer token for that same device.
// Returns the Device only when both agree, so one device's token can't be used
// to publish under another device's id/topic.
export async function verifyDeviceCredentials(username: string, password: string): Promise<Device | null> {
  const device = await verifyDeviceToken(password);
  if (!device) return null;
  if (device.deviceId !== username) return null;
  return device;
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
