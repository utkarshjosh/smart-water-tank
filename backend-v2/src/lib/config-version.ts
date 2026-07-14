import { prisma } from './prisma';

// Monotonic per-device config version. Lives on the Device row (which always
// exists) rather than DeviceConfig/TankProfile (which may not), so bumping it
// never needs an upsert. Called after any DeviceConfig/TankProfile mutation so
// the device knows, on its next check-in, that its cached config is stale.
//
// `deviceId` is the internal Device.id (PK), not the hardware device_id.
// Kept in lib/ (not a service) to avoid a device.service <-> tank-profile.service
// import cycle, since both need to bump it.
export async function bumpConfigVersion(deviceId: string): Promise<void> {
  await prisma.device.update({
    where: { id: deviceId },
    data: { configVersion: { increment: 1 } },
  });
}
