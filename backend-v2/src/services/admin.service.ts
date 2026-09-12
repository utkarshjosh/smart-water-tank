import { AlertSeverity, DeviceStatus, Role, User } from '@prisma/client';
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

export async function listDevices(filters: {
  tenantId?: string;
  status?: DeviceStatus;
  includeArchived?: boolean;
}) {
  const devices = await prisma.device.findMany({
    where: {
      ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.includeArchived ? {} : { archivedAt: null }),
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
        // The admin list is the only place a decommissioned device can be seen
        // or restored, so it has to say which rows are decommissioned. Without
        // this the client cannot tell them apart and offers to decommission a
        // device that already is.
        archived_at: device.archivedAt,
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
    prisma.device.count({ where: { archivedAt: null } }),
    prisma.device.count({ where: { status: 'online', archivedAt: null } }),
    prisma.tenant.count({ where: { archivedAt: null } }),
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

export async function listTenants(opts: { includeArchived?: boolean } = {}) {
  const tenants = await prisma.tenant.findMany({
    where: opts.includeArchived ? {} : { archivedAt: null },
    // Counts exclude archived children, so an archived device does not inflate
    // a tenant's device count in the admin list.
    include: {
      _count: {
        select: { devices: { where: { archivedAt: null } }, users: { where: { archivedAt: null } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return tenants.map((t) => ({
    id: t.id,
    name: t.name,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    device_count: t._count.devices,
    user_count: t._count.users,
    archived_at: t.archivedAt,
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

/**
 * Admin-side device edit: rename, and move a device between tenants.
 *
 * Reassigning a tenant is deliberately explicit rather than a side effect of
 * some other call - it changes who can see the device's whole history.
 */
/**
 * Fleet-wide alert feed. The admin dashboard showed a 24-hour alert count with
 * nothing to drill into, because no endpoint listed alerts across devices.
 */
export async function listAlerts(opts: {
  limit: number;
  tenantId?: string;
  deviceId?: string;
  severity?: AlertSeverity;
  acknowledged?: boolean;
  includeDismissed: boolean;
  since?: Date;
}) {
  const where = {
    ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
    ...(opts.deviceId ? { device: { deviceId: opts.deviceId } } : {}),
    ...(opts.severity ? { severity: opts.severity } : {}),
    ...(opts.acknowledged !== undefined ? { acknowledged: opts.acknowledged } : {}),
    ...(opts.includeDismissed ? {} : { dismissedAt: null }),
    ...(opts.since ? { createdAt: { gte: opts.since } } : {}),
  };

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
      include: {
        device: { select: { deviceId: true, name: true } },
        tenant: { select: { id: true, name: true } },
      },
    }),
    prisma.alert.count({ where }),
  ]);

  return {
    total,
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      message: a.message,
      acknowledged: a.acknowledged,
      acknowledged_at: a.acknowledgedAt,
      dismissed: a.dismissedAt != null,
      created_at: a.createdAt,
      device_id: a.device.deviceId,
      device_name: a.device.name || a.device.deviceId,
      tenant_id: a.tenant.id,
      tenant_name: a.tenant.name,
    })),
  };
}

export async function updateDevice(
  deviceIdString: string,
  data: { name?: string | null; tenantId?: string }
) {
  const device = await prisma.device.findUnique({ where: { deviceId: deviceIdString } });
  if (!device) throw new HttpError(404, 'Device not found');

  if (data.tenantId !== undefined) {
    const tenant = await prisma.tenant.findUnique({ where: { id: data.tenantId } });
    if (!tenant) throw new HttpError(404, 'Tenant not found');
  }

  const trimmed = data.name?.trim();
  const updated = await prisma.device.update({
    where: { id: device.id },
    data: {
      ...(data.name !== undefined ? { name: trimmed ? trimmed : null } : {}),
      ...(data.tenantId !== undefined ? { tenantId: data.tenantId } : {}),
    },
    include: { tenant: true },
  });

  return {
    id: updated.id,
    device_id: updated.deviceId,
    name: updated.name,
    tenant_id: updated.tenantId,
    tenant_name: updated.tenant?.name ?? null,
    status: updated.status,
  };
}

// --- Soft delete -----------------------------------------------------------
// Nothing here hard-deletes. Tenant -> User, Tenant -> Device and
// Device -> everything are onDelete: Cascade, so a real DELETE on a tenant row
// would destroy every reading ever taken under it. Archiving blocks access
// (see firebaseAuth and getAccessibleDeviceOrThrow) while keeping history.

export interface ArchiveSummary {
  tenants: number;
  devices: number;
  users: number;
  measurements: number;
}

/** What a tenant archive would take with it, for a confirmation prompt. */
export async function previewTenantArchive(tenantId: string): Promise<ArchiveSummary> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new HttpError(404, 'Tenant not found');

  const devices = await prisma.device.findMany({ where: { tenantId }, select: { id: true } });
  const [users, measurements] = await Promise.all([
    prisma.user.count({ where: { tenantId, archivedAt: null } }),
    devices.length
      ? prisma.measurement.count({ where: { deviceId: { in: devices.map((d) => d.id) } } })
      : Promise.resolve(0),
  ]);

  return { tenants: 1, devices: devices.length, users, measurements };
}

/**
 * Archive a tenant together with its devices and users, so no orphan keeps
 * access. One timestamp for the whole set makes the group obvious in the data.
 */
export async function archiveTenant(tenantId: string): Promise<ArchiveSummary> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  if (tenant.archivedAt) throw new HttpError(409, 'Tenant is already archived');

  const summary = await previewTenantArchive(tenantId);
  const archivedAt = new Date();

  await prisma.$transaction([
    prisma.tenant.update({ where: { id: tenantId }, data: { archivedAt } }),
    prisma.device.updateMany({ where: { tenantId, archivedAt: null }, data: { archivedAt } }),
    prisma.user.updateMany({ where: { tenantId, archivedAt: null }, data: { archivedAt } }),
  ]);

  return summary;
}

/** Bring a tenant back, along with everything archived under it. */
export async function restoreTenant(tenantId: string): Promise<ArchiveSummary> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  if (!tenant.archivedAt) throw new HttpError(409, 'Tenant is not archived');

  const [devices, users] = await prisma.$transaction([
    prisma.device.updateMany({ where: { tenantId }, data: { archivedAt: null } }),
    prisma.user.updateMany({ where: { tenantId }, data: { archivedAt: null } }),
  ]);
  await prisma.tenant.update({ where: { id: tenantId }, data: { archivedAt: null } });

  return { tenants: 1, devices: devices.count, users: users.count, measurements: 0 };
}

/** Decommission a device. Its readings stay; the API stops serving it. */
export async function archiveDevice(deviceIdString: string) {
  const device = await prisma.device.findUnique({ where: { deviceId: deviceIdString } });
  if (!device) throw new HttpError(404, 'Device not found');
  if (device.archivedAt) throw new HttpError(409, 'Device is already decommissioned');

  const measurements = await prisma.measurement.count({ where: { deviceId: device.id } });
  await prisma.device.update({ where: { id: device.id }, data: { archivedAt: new Date() } });
  return { device_id: device.deviceId, measurements_retained: measurements };
}

export async function restoreDevice(deviceIdString: string) {
  const device = await prisma.device.findUnique({ where: { deviceId: deviceIdString } });
  if (!device) throw new HttpError(404, 'Device not found');
  if (!device.archivedAt) throw new HttpError(409, 'Device is not decommissioned');

  // A device in an archived tenant would come back unreachable anyway.
  if (device.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: device.tenantId } });
    if (tenant?.archivedAt) throw new HttpError(409, 'Restore its tenant first');
  }

  await prisma.device.update({ where: { id: device.id }, data: { archivedAt: null } });
  return { device_id: device.deviceId };
}

/**
 * Deactivate a user. Their Firebase credentials still exist, so the block is
 * enforced in firebaseAuth rather than by removing the row - historic
 * "acknowledged by" references on alerts stay intact.
 */
export async function archiveUser(userId: string, actingUserId: string) {
  if (userId === actingUserId) throw new HttpError(409, 'You cannot deactivate your own account');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found');
  if (user.archivedAt) throw new HttpError(409, 'User is already deactivated');

  // Locking out the last super admin would leave nobody able to undo it.
  if (user.role === 'super_admin') {
    const remaining = await prisma.user.count({
      where: { role: 'super_admin', archivedAt: null, NOT: { id: userId } },
    });
    if (remaining === 0) throw new HttpError(409, 'Cannot deactivate the last super admin');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      // Clear the push token too, or a deactivated account keeps receiving alerts.
      data: { archivedAt: new Date(), fcmToken: null },
    }),
    // Explicit device grants go with them; tenant access is handled by the flag.
    prisma.userDeviceMapping.deleteMany({ where: { userId } }),
  ]);

  return { user_id: userId, email: user.email };
}

export async function restoreUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found');
  if (!user.archivedAt) throw new HttpError(409, 'User is not deactivated');

  if (user.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
    if (tenant?.archivedAt) throw new HttpError(409, 'Restore their tenant first');
  }

  await prisma.user.update({ where: { id: userId }, data: { archivedAt: null } });
  return { user_id: userId, email: user.email };
}

export async function createOrLinkUser(data: {
  firebaseUid: string;
  email: string;
  name?: string;
  tenantId?: string;
  role: Role;
}) {
  // Do not create a local account for an identity that does not exist in
  // Firebase; this keeps the linking operation genuinely two-way.
  await getAuth().getUser(data.firebaseUid);

  // A super admin is an AquaMind platform operator, not a member of a
  // customer organisation. Every other role must remain tenant-scoped.
  const tenantId = data.role === 'super_admin' ? null : data.tenantId;
  if (data.role !== 'super_admin' && !tenantId) {
    throw new HttpError(400, 'A tenant is required unless the role is super_admin');
  }

  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new HttpError(404, 'Tenant not found');
  }

  const existing = await prisma.user.findUnique({ where: { firebaseUid: data.firebaseUid } });
  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { email: data.email, name: data.name || null, tenantId, role: data.role },
    });
    await syncFirebaseRole(updated.firebaseUid, updated.role);
    return { user: toRawUserDto(updated), message: 'User updated and linked to tenant' };
  }

  try {
    const user = await prisma.user.create({
      data: { firebaseUid: data.firebaseUid, email: data.email, name: data.name || null, tenantId, role: data.role },
    });
    await syncFirebaseRole(user.firebaseUid, user.role);
    return { user: toRawUserDto(user), message: 'User created and linked to tenant' };
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new HttpError(409, 'User already exists');
    throw err;
  }
}

// Firebase is the identity provider; AquaMind's database remains the source
// of truth for authorisation. Mirroring the role as a custom claim makes the
// Firebase account observable and keeps the two systems aligned.
async function syncFirebaseRole(firebaseUid: string, role: Role): Promise<void> {
  const auth = getAuth();
  const firebaseUser = await auth.getUser(firebaseUid);
  await auth.setCustomUserClaims(firebaseUid, { ...(firebaseUser.customClaims || {}), role });
}

export async function updateUserRole(userIdOrUid: string, role: Role) {
  const user = await prisma.user.findFirst({ where: { OR: [{ id: userIdOrUid }, { firebaseUid: userIdOrUid }] } });
  if (!user) throw new HttpError(404, 'User not found in database');

  if (role !== 'super_admin' && !user.tenantId) {
    throw new HttpError(400, 'Assign a tenant before changing a platform super admin to another role');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role, tenantId: role === 'super_admin' ? null : user.tenantId },
    include: { tenant: true },
  });
  await syncFirebaseRole(updated.firebaseUid, updated.role);

  return {
    ...toRawUserDto(updated),
    tenant_name: updated.tenant?.name ?? null,
  };
}

export async function reissueDeviceToken(deviceId: string): Promise<string> {
  return createDeviceToken(deviceId);
}

export async function listUsers(filters: {
  tenantId?: string;
  search?: string;
  includeArchived?: boolean;
}) {
  const users = await prisma.user.findMany({
    where: {
      ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
      ...(filters.includeArchived ? {} : { archivedAt: null }),
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
    archived_at: u.archivedAt,
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
    select: { firebaseUid: true, tenantId: true, role: true },
  });
  const existingMap = new Map(existingUsers.map((u) => [u.firebaseUid, u]));

  const tenantIds = Array.from(new Set(existingUsers.map((u) => u.tenantId).filter((id): id is string => !!id)));
  const tenants = tenantIds.length > 0 ? await prisma.tenant.findMany({ where: { id: { in: tenantIds } } }) : [];
  const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

  return {
    users: filtered.map((u) => {
      const existingUser = existingMap.get(u.uid);
      const tenantId = existingUser?.tenantId;
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
        role: existingUser?.role ?? null,
        is_linked: !!existingUser,
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
  const user = await prisma.user.findFirst({ where: { OR: [{ id: userIdOrUid }, { firebaseUid: userIdOrUid }] } });
  if (!user) throw new HttpError(404, 'User not found in database');
  if (user.role === 'super_admin') {
    throw new HttpError(400, 'A platform super admin cannot be assigned to a tenant');
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new HttpError(404, 'Tenant not found');

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
