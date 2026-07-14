import { DeviceStatus, Role, User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { isUniqueConstraintError } from '../lib/prisma-errors';
import { getAuth } from '../config/firebase';
import { createDeviceToken } from '../lib/device-token';
import { toConfigDto } from './device.service';
import { getTankProfileRaw, volumeLForProfile } from './tank-profile.service';

function toRawUserDto(user: User) {
  return {
    id: user.id,
    firebase_uid: user.firebaseUid,
    email: user.email,
    name: user.name,
    tenant_id: user.tenantId,
    role: user.role,
    fcm_token: user.fcmToken,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

export async function listDevices(filters: { tenantId?: string; status?: DeviceStatus }) {
  const devices = await prisma.device.findMany({
    where: {
      ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: { tenant: true },
    orderBy: { createdAt: 'desc' },
  });

  return Promise.all(
    devices.map(async (device) => {
      const [latest, profile] = await Promise.all([
        prisma.measurement.findFirst({
          where: { deviceId: device.id },
          orderBy: { timestamp: 'desc' },
          select: { levelCm: true, volumeL: true, timestamp: true },
        }),
        getTankProfileRaw(device.id),
      ]);
      return {
        id: device.id,
        device_id: device.deviceId,
        name: device.name,
        tenant_id: device.tenantId,
        tenant_name: device.tenant?.name ?? null,
        status: device.status,
        firmware_version: device.firmwareVersion,
        last_seen: device.lastSeen,
        // Volume derived at read time from the current profile + level (like
        // level_percent); no profile -> stored snapshot; null level -> null.
        current_volume:
          profile != null
            ? volumeLForProfile(profile, latest?.levelCm?.toNumber() ?? null)
            : latest?.volumeL != null
              ? latest.volumeL.toNumber()
              : null,
        last_measurement: latest ? latest.timestamp : null,
        created_at: device.createdAt,
      };
    })
  );
}

export async function createDevice(data: { deviceId: string; tenantId: string; name?: string }) {
  const existing = await prisma.device.findUnique({ where: { deviceId: data.deviceId } });
  if (existing) throw new HttpError(409, 'Device ID already exists');

  const tenant = await prisma.tenant.findUnique({ where: { id: data.tenantId } });
  if (!tenant) throw new HttpError(404, 'Tenant not found');

  let device;
  try {
    device = await prisma.device.create({
      data: { deviceId: data.deviceId, tenantId: data.tenantId, name: data.name || null, status: 'offline' },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new HttpError(409, 'Device ID already exists');
    throw err;
  }

  const token = await createDeviceToken(data.deviceId);

  return {
    device: {
      id: device.id,
      device_id: device.deviceId,
      tenant_id: device.tenantId,
      name: device.name,
      status: device.status,
      created_at: device.createdAt,
    },
    token,
  };
}

export async function getDeviceDetail(deviceId: string) {
  const device = await prisma.device.findUnique({
    where: { deviceId },
    include: { tenant: true, config: true },
  });
  if (!device) throw new HttpError(404, 'Device not found');

  const latestMeasurement = await prisma.measurement.findFirst({
    where: { deviceId: device.id },
    orderBy: { timestamp: 'desc' },
  });
  const recentAlerts = await prisma.alert.findMany({
    where: { deviceId: device.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return {
    id: device.id,
    device_id: device.deviceId,
    name: device.name,
    tenant_id: device.tenantId,
    tenant_name: device.tenant?.name ?? null,
    status: device.status,
    firmware_version: device.firmwareVersion,
    last_seen: device.lastSeen,
    created_at: device.createdAt,
    config: device.config ? toConfigDto(device.config) : null,
    latest_measurement: latestMeasurement
      ? {
          timestamp: latestMeasurement.timestamp,
          level_cm: latestMeasurement.levelCm?.toNumber() ?? null,
          volume_l: latestMeasurement.volumeL?.toNumber() ?? null,
          temperature_c: latestMeasurement.temperatureC?.toNumber() ?? null,
          battery_v: latestMeasurement.batteryV?.toNumber() ?? null,
          rssi: latestMeasurement.rssi,
        }
      : null,
    recent_alerts: recentAlerts,
  };
}

export interface DeviceConfigInput {
  measurement_interval_ms?: number;
  report_interval_ms?: number;
  tank_full_threshold_l?: number | null;
  tank_low_threshold_l?: number | null;
  battery_low_threshold_v?: number | null;
  level_empty_cm?: number | null;
  level_full_cm?: number | null;
  config_json?: unknown;
}

export async function upsertDeviceConfig(deviceId: string, body: DeviceConfigInput): Promise<void> {
  const device = await prisma.device.findUnique({ where: { deviceId } });
  if (!device) throw new HttpError(404, 'Device not found');

  const data = {
    measurementIntervalMs: body.measurement_interval_ms ?? 60000,
    reportIntervalMs: body.report_interval_ms ?? 300000,
    tankFullThresholdL: body.tank_full_threshold_l ?? null,
    tankLowThresholdL: body.tank_low_threshold_l ?? null,
    batteryLowThresholdV: body.battery_low_threshold_v ?? null,
    levelEmptyCm: body.level_empty_cm ?? null,
    levelFullCm: body.level_full_cm ?? null,
    configJson: (body.config_json ?? null) as any,
  };

  await prisma.deviceConfig.upsert({
    where: { deviceId: device.id },
    create: { deviceId: device.id, ...data },
    update: data,
  });
}

export async function analyticsSummary() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalDevices, onlineDevices, totalTenants, recentAlerts, todayMeasurements] = await Promise.all([
    prisma.device.count(),
    prisma.device.count({ where: { status: 'online' } }),
    prisma.tenant.count(),
    prisma.alert.count({ where: { createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    prisma.measurement.count({ where: { timestamp: { gte: startOfToday } } }),
  ]);

  return {
    total_devices: totalDevices,
    online_devices: onlineDevices,
    offline_devices: totalDevices - onlineDevices,
    total_tenants: totalTenants,
    recent_alerts_24h: recentAlerts,
    measurements_today: todayMeasurements,
  };
}

export async function listTenants() {
  const tenants = await prisma.tenant.findMany({
    include: { _count: { select: { devices: true, users: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return tenants.map((t) => ({
    id: t.id,
    name: t.name,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    device_count: t._count.devices,
    user_count: t._count.users,
  }));
}

export async function createTenant(name: string) {
  const existing = await prisma.tenant.findFirst({ where: { name } });
  if (existing) throw new HttpError(409, 'Tenant name already exists');
  return prisma.tenant.create({ data: { name } });
}

export async function updateTenant(tenantId: string, name: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new HttpError(404, 'Tenant not found');

  const nameTaken = await prisma.tenant.findFirst({ where: { name, NOT: { id: tenantId } } });
  if (nameTaken) throw new HttpError(409, 'Tenant name already exists');

  return prisma.tenant.update({ where: { id: tenantId }, data: { name } });
}

export async function createOrLinkUser(data: {
  firebaseUid: string;
  email: string;
  name?: string;
  tenantId: string;
  role: Role;
}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: data.tenantId } });
  if (!tenant) throw new HttpError(404, 'Tenant not found');

  const existing = await prisma.user.findUnique({ where: { firebaseUid: data.firebaseUid } });
  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { email: data.email, name: data.name || null, tenantId: data.tenantId, role: data.role },
    });
    return { user: toRawUserDto(updated), message: 'User updated and linked to tenant' };
  }

  try {
    const user = await prisma.user.create({
      data: { firebaseUid: data.firebaseUid, email: data.email, name: data.name || null, tenantId: data.tenantId, role: data.role },
    });
    return { user: toRawUserDto(user), message: 'User created and linked to tenant' };
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new HttpError(409, 'User already exists');
    throw err;
  }
}

export async function reissueDeviceToken(deviceId: string): Promise<string> {
  return createDeviceToken(deviceId);
}

export async function listUsers(filters: { tenantId?: string; search?: string }) {
  const users = await prisma.user.findMany({
    where: {
      ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
      ...(filters.search
        ? {
            OR: [
              { email: { contains: filters.search } },
              { name: { contains: filters.search } },
              { firebaseUid: { contains: filters.search } },
            ],
          }
        : {}),
    },
    include: { tenant: true },
    orderBy: { createdAt: 'desc' },
  });

  return users.map((u) => ({
    id: u.id,
    firebase_uid: u.firebaseUid,
    email: u.email,
    name: u.name,
    tenant_id: u.tenantId,
    tenant_name: u.tenant?.name ?? null,
    role: u.role,
    fcm_token: u.fcmToken ? '***' : null, // Don't expose full token
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  }));
}

export async function listFirebaseUsers(search: string | undefined, limit: number) {
  const maxResults = Math.min(limit, 100); // Cap at 100 for performance
  const { users: firebaseUsers } = await getAuth().listUsers(maxResults);

  let filtered = firebaseUsers;
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = firebaseUsers.filter(
      (u) =>
        u.email?.toLowerCase().includes(searchLower) ||
        u.displayName?.toLowerCase().includes(searchLower) ||
        u.uid.toLowerCase().includes(searchLower)
    );
  }

  const existingUsers = await prisma.user.findMany({
    where: { firebaseUid: { in: filtered.map((u) => u.uid) } },
    select: { firebaseUid: true, tenantId: true },
  });
  const existingMap = new Map(existingUsers.map((u) => [u.firebaseUid, u.tenantId]));

  const tenantIds = Array.from(new Set(existingUsers.map((u) => u.tenantId).filter((id): id is string => !!id)));
  const tenants = tenantIds.length > 0 ? await prisma.tenant.findMany({ where: { id: { in: tenantIds } } }) : [];
  const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

  return {
    users: filtered.map((u) => {
      const tenantId = existingMap.get(u.uid);
      return {
        uid: u.uid,
        email: u.email || null,
        displayName: u.displayName || null,
        photoURL: u.photoURL || null,
        emailVerified: u.emailVerified,
        disabled: u.disabled,
        metadata: { creationTime: u.metadata.creationTime, lastSignInTime: u.metadata.lastSignInTime },
        tenant_id: tenantId || null,
        tenant_name: tenantId ? tenantMap.get(tenantId) ?? null : null,
        is_linked: !!tenantId,
      };
    }),
    total: filtered.length,
  };
}

export async function syncFirebaseUsers(limit: number | undefined, dryRun: boolean) {
  const maxResults = limit ? Math.min(limit, 1000) : 100;

  let allUsers = [] as import('firebase-admin').auth.UserRecord[];
  let nextPageToken: string | undefined;
  do {
    const result = await getAuth().listUsers(maxResults, nextPageToken);
    allUsers = allUsers.concat(result.users);
    nextPageToken = result.pageToken;
    if (allUsers.length >= maxResults) break;
  } while (nextPageToken);

  const existing = await prisma.user.findMany({
    where: { firebaseUid: { in: allUsers.map((u) => u.uid) } },
    select: { firebaseUid: true },
  });
  const existingUids = new Set(existing.map((u) => u.firebaseUid));

  const usersToCreate = allUsers.filter((u) => !existingUids.has(u.uid));
  const stats = {
    total_firebase_users: allUsers.length,
    existing_in_db: existingUids.size,
    to_create: usersToCreate.length,
    created: 0,
    errors: 0,
    error_details: [] as { uid: string; email?: string; error: string }[],
  };

  if (dryRun) {
    return {
      dry_run: true,
      stats,
      users_to_create: usersToCreate.map((u) => ({ uid: u.uid, email: u.email, displayName: u.displayName })),
    };
  }

  for (const fbUser of usersToCreate) {
    try {
      const name = fbUser.displayName || fbUser.email?.split('@')[0] || 'User';
      await prisma.user.create({
        data: { firebaseUid: fbUser.uid, email: fbUser.email || '', name, tenantId: null, role: 'user' },
      });
      stats.created++;
    } catch (err) {
      if (isUniqueConstraintError(err)) continue;
      stats.errors++;
      stats.error_details.push({ uid: fbUser.uid, email: fbUser.email, error: (err as Error).message });
      console.error(`Error creating user ${fbUser.uid}:`, err);
    }
  }

  return { dry_run: false, stats };
}

export async function updateUserTenant(userIdOrUid: string, tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new HttpError(404, 'Tenant not found');

  const user = await prisma.user.findFirst({ where: { OR: [{ id: userIdOrUid }, { firebaseUid: userIdOrUid }] } });
  if (!user) throw new HttpError(404, 'User not found in database');

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { tenantId },
    include: { tenant: true },
  });

  return {
    ...toRawUserDto(updated),
    tenant_name: updated.tenant?.name ?? null,
  };
}
