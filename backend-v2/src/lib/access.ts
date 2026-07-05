import { NextFunction, Request, Response } from 'express';
import { Device, User } from '@prisma/client';
import { prisma } from './prisma';
import { HttpError } from './http-error';

export interface DeviceAccessRequest extends Request {
  user?: User;
  device?: Device;
}

// The single place that decides whether a user can see a given device:
// admin/super_admin bypass by role, tenant match, or an explicit
// user_device_mappings grant. Every tenant-scoped route that takes a
// :deviceId param goes through this.
export async function getAccessibleDeviceOrThrow(opts: {
  deviceId: string;
  user: Pick<User, 'id' | 'role' | 'tenantId'>;
}): Promise<Device> {
  const device = await prisma.device.findUnique({ where: { deviceId: opts.deviceId } });
  if (!device) throw new HttpError(404, 'Device not found');

  if (opts.user.role === 'admin' || opts.user.role === 'super_admin') return device;
  if (device.tenantId && device.tenantId === opts.user.tenantId) return device;

  const mapping = await prisma.userDeviceMapping.findFirst({
    where: { deviceId: device.id, userId: opts.user.id },
  });
  if (mapping) return device;

  throw new HttpError(403, 'Device not accessible');
}

export function requireDeviceAccess(req: DeviceAccessRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new HttpError(401, 'Unauthorized'));
    return;
  }
  getAccessibleDeviceOrThrow({ deviceId: req.params.deviceId, user: req.user })
    .then((device) => {
      req.device = device;
      next();
    })
    .catch(next);
}
