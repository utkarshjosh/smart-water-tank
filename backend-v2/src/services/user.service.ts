import { Device } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { isUniqueConstraintError } from '../lib/prisma-errors';
import { getAuth } from '../config/firebase';
import { provisionPersonalTenantAndUser } from './onboarding.service';
import { CLAIM_CODE_TTL_MS, generateClaimCode, hashClaimCode } from '../lib/claim-code';
import { toMeasurementDto } from './device.service';
import { computeLevelPercent, getTankProfileRaw } from './tank-profile.service';

function levelPercentFor(profile: { heightCm: { toNumber(): number }; sensorOffsetCm: { toNumber(): number } } | null, levelCm: number): number | null {
  if (!profile) return null;
  return computeLevelPercent(levelCm, {
    heightCm: profile.heightCm.toNumber(),
    sensorOffsetCm: profile.sensorOffsetCm.toNumber(),
  });
}

function toUserDto(user: { id: string; email: string; name: string | null; role: string; tenantId: string | null; tenant?: { name: string } | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenant_id: user.tenantId,
    tenant_name: user.tenant?.name ?? null,
  };
}

export async function registerUser(
  firebaseUid: string,
  name: string,
  tenantId?: string
): Promise<{ user: ReturnType<typeof toUserDto>; created: boolean }> {
  const firebaseUser = await getAuth().getUser(firebaseUid);

  const existing = await prisma.user.findUnique({ where: { firebaseUid } });
  if (existing) {
    const updated = await prisma.user.update({
      where: { firebaseUid },
      data: { name, email: firebaseUser.email || '' },
      include: { tenant: true },
    });
    return { user: toUserDto(updated), created: false };
  }

  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new HttpError(404, 'Tenant not found');

    try {
      const user = await prisma.user.create({
        data: { firebaseUid, email: firebaseUser.email || '', name, tenantId, role: 'user' },
        include: { tenant: true },
      });
      return { user: toUserDto(user), created: true };
    } catch (err) {
      if (isUniqueConstraintError(err)) throw new HttpError(409, 'User already exists');
      throw err;
    }
  }

  const newUser = await provisionPersonalTenantAndUser({ firebaseUid, email: firebaseUser.email || '', name });
  const withTenant = await prisma.user.findUniqueOrThrow({ where: { id: newUser.id }, include: { tenant: true } });
  return { user: toUserDto(withTenant), created: true };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { tenant: true } });
  if (!user) throw new HttpError(404, 'User not found');
  return toUserDto(user);
}

export async function listDevicesForTenant(tenantId: string, userId: string) {
  const devices = await prisma.device.findMany({
    where: { OR: [{ tenantId }, { userMappings: { some: { userId } } }] },
    orderBy: [{ name: 'asc' }, { deviceId: 'asc' }],
  });

  return Promise.all(
    devices.map(async (device) => {
      const [latest, profile, activeAlert] = await Promise.all([
        prisma.measurement.findFirst({
          where: { deviceId: device.id },
          orderBy: { timestamp: 'desc' },
          select: { levelCm: true, volumeL: true, timestamp: true },
        }),
        getTankProfileRaw(device.id),
        prisma.alert.findFirst({
          where: { deviceId: device.id, acknowledged: false, type: { in: ['leak_detected', 'tank_low'] } },
          orderBy: { createdAt: 'desc' },
          select: { type: true },
        }),
      ]);
      return {
        id: device.deviceId,
        name: device.name || device.deviceId,
        status: device.status,
        firmware_version: device.firmwareVersion,
        last_seen: device.lastSeen,
        current_volume: latest ? latest.volumeL.toNumber() : null,
        level_percent: latest ? levelPercentFor(profile, latest.levelCm.toNumber()) : null,
        has_tank_profile: !!profile,
        last_measurement: latest ? latest.timestamp : null,
        active_alert: activeAlert ? (activeAlert.type === 'leak_detected' ? 'leak' : 'low') : null,
      };
    })
  );
}

export async function getDeviceInfo(device: Device) {
  return {
    id: device.deviceId,
    name: device.name || device.deviceId,
    status: device.status,
    firmware_version: device.firmwareVersion,
    last_seen: device.lastSeen,
    created_at: device.createdAt,
  };
}

export async function getDeviceCurrent(device: Device) {
  const [m, profile] = await Promise.all([
    prisma.measurement.findFirst({ where: { deviceId: device.id }, orderBy: { timestamp: 'desc' } }),
    getTankProfileRaw(device.id),
  ]);
  if (!m) throw new HttpError(404, 'No measurements found');
  return { device_id: device.deviceId, ...toMeasurementDto(m), level_percent: levelPercentFor(profile, m.levelCm.toNumber()) };
}

export async function getDeviceHistory(device: Device, days: number, limit: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [rows, profile] = await Promise.all([
    prisma.measurement.findMany({
      where: { deviceId: device.id, timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' },
      take: limit,
    }),
    getTankProfileRaw(device.id),
  ]);
  return {
    device_id: device.deviceId,
    measurements: rows.map((m) => ({ ...toMeasurementDto(m), level_percent: levelPercentFor(profile, m.levelCm.toNumber()) })),
  };
}

export async function getDeviceAlerts(device: Device, limit: number) {
  const alerts = await prisma.alert.findMany({
    where: { deviceId: device.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return {
    device_id: device.deviceId,
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      message: a.message,
      payload: a.payload,
      acknowledged: a.acknowledged,
      created_at: a.createdAt,
    })),
  };
}

export async function acknowledgeAlert(device: Device, alertId: string, userId: string): Promise<void> {
  const alert = await prisma.alert.findFirst({ where: { id: alertId, deviceId: device.id } });
  if (!alert) throw new HttpError(404, 'Alert not found');
  await prisma.alert.update({
    where: { id: alertId },
    data: { acknowledged: true, acknowledgedBy: userId, acknowledgedAt: new Date() },
  });
}

export async function mintClaimCode(tenantId: string, userId: string) {
  const code = generateClaimCode();
  const codeHash = hashClaimCode(code);
  const expiresAt = new Date(Date.now() + CLAIM_CODE_TTL_MS);

  await prisma.$transaction([
    // Only one live code per tenant at a time - simplifies "regenerate".
    prisma.deviceClaimCode.updateMany({
      where: { tenantId, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    }),
    prisma.deviceClaimCode.create({
      data: { codeHash, tenantId, createdByUserId: userId, expiresAt },
    }),
  ]);

  return { claim_code: code, expires_at: expiresAt.toISOString(), expires_in_seconds: CLAIM_CODE_TTL_MS / 1000 };
}

export async function getClaimCodeStatus(tenantId: string, code: string) {
  const codeHash = hashClaimCode(code);
  const claim = await prisma.deviceClaimCode.findFirst({
    where: { codeHash, tenantId },
    include: { device: true },
  });
  if (!claim) throw new HttpError(404, 'Claim code not found');

  if (claim.consumedAt) {
    return {
      status: 'claimed' as const,
      device: claim.device
        ? { id: claim.device.deviceId, name: claim.device.name || claim.device.deviceId, status: claim.device.status }
        : null,
    };
  }

  if (claim.expiresAt.getTime() <= Date.now()) {
    return { status: 'expired' as const, device: null };
  }

  return { status: 'pending' as const, device: null };
}
