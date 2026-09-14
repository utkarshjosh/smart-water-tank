import { AlertSeverity, AlertType, Device, Role, User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { isUniqueConstraintError } from '../lib/prisma-errors';
import { getAuth } from '../config/firebase';
import { provisionPersonalTenantAndUser } from './onboarding.service';
import { CLAIM_CODE_TTL_MS, generateClaimCode, hashClaimCode } from '../lib/claim-code';
import { toMeasurementDto } from './device.service';
import { computeLevelPercent, getTankProfileRaw, volumeLForProfile } from './tank-profile.service';

type TankProfileRaw = {
  heightCm: { toNumber(): number };
  sensorOffsetCm: { toNumber(): number };
  deadZoneCm: { toNumber(): number };
};

function levelPercentFor(profile: TankProfileRaw | null, levelCm: number | null): number | null {
  if (!profile) return null;
  return computeLevelPercent(levelCm, {
    heightCm: profile.heightCm.toNumber(),
    sensorOffsetCm: profile.sensorOffsetCm.toNumber(),
    deadZoneCm: profile.deadZoneCm.toNumber(),
  });
}

interface LevelPercentInfo {
  level_percent: number | null;
  level_percent_stale: boolean;
  level_percent_as_of: Date | null;
}

// The latest measurement's level_cm can be null (sensor unreadable this
// cycle). Rather than showing a fabricated 0%/100%, fall back to the most
// recent reading that was actually valid and flag it as stale, so the UI
// can show "last known" instead of guessing.
async function resolveLevelPercent(
  deviceId: string,
  latest: { levelCm: { toNumber(): number } | null; timestamp: Date } | null,
  profile: TankProfileRaw | null
): Promise<LevelPercentInfo> {
  if (!profile) return { level_percent: null, level_percent_stale: false, level_percent_as_of: null };

  if (latest?.levelCm != null) {
    return {
      level_percent: levelPercentFor(profile, latest.levelCm.toNumber()),
      level_percent_stale: false,
      level_percent_as_of: latest.timestamp,
    };
  }

  const lastGood = await prisma.measurement.findFirst({
    where: { deviceId, levelCm: { not: null } },
    orderBy: { timestamp: 'desc' },
    select: { levelCm: true, timestamp: true },
  });
  if (!lastGood?.levelCm) return { level_percent: null, level_percent_stale: false, level_percent_as_of: null };

  return {
    level_percent: levelPercentFor(profile, lastGood.levelCm.toNumber()),
    level_percent_stale: true,
    level_percent_as_of: lastGood.timestamp,
  };
}

function toUserDto(user: { id: string; email: string; name: string | null; role: Role; tenantId: string | null; tenant?: { name: string } | null }) {
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

/**
 * Rename a device, or clear the name back to the hardware ID.
 *
 * Devices paired through the self-claim flow are created with no name at all
 * (claimDevice inserts only deviceId/tenantId/status), and until now nothing
 * could set one - so every self-claimed tank showed its raw hardware ID
 * forever. `name` was only ever populated by the admin create path.
 */
export async function renameDevice(device: Device, name: string | null) {
  const trimmed = name?.trim() ?? '';
  const updated = await prisma.device.update({
    where: { id: device.id },
    data: { name: trimmed === '' ? null : trimmed },
  });
  return getDeviceInfo(updated);
}

/**
 * Unpair a device from the caller's account - the reverse of claimDevice.
 *
 * The tenant link and the name are cleared and every explicit share dropped,
 * so the hardware can be claimed again (by this account or another) and a
 * re-pair starts from a clean slate rather than resurrecting a stale name.
 * Measurements, alerts, config and tank profile stay with the hardware ID:
 * history is valuable and the tank's geometry does not change hands with the
 * account. The device token is left alone too - it only ever lived on this
 * physical node, and revoking it would just knock the node offline until
 * someone re-provisions it.
 *
 * Only the tenant's owner (or a platform admin) may do this. A household
 * member with `user` role, or someone who was merely shared the device, can
 * look but must not be able to strip the device out from under the owner.
 */
export async function unpairDevice(device: Device, actor: Pick<User, 'id' | 'role' | 'tenantId'>): Promise<void> {
  const isAdmin = actor.role === 'admin' || actor.role === 'super_admin';
  const isOwner = actor.role === 'tenant_owner' && device.tenantId != null && device.tenantId === actor.tenantId;
  if (!isAdmin && !isOwner) {
    throw new HttpError(403, 'Only the account owner can unpair a device');
  }

  await prisma.$transaction([
    prisma.userDeviceMapping.deleteMany({ where: { deviceId: device.id } }),
    prisma.device.update({
      where: { id: device.id },
      data: { tenantId: null, name: null },
    }),
  ]);
}

/** Update the caller's own profile. Email and role are deliberately not editable here. */
export async function updateMe(userId: string, input: { name?: string }) {
  const data: { name?: string } = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (trimmed === '') throw new HttpError(400, 'name cannot be empty');
    data.name = trimmed;
  }
  if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to update');

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    include: { tenant: true },
  });
  return toUserDto(user);
}

/**
 * Drop the stored push token. Without this a signed-out phone keeps receiving
 * this account's alerts until some other login overwrites the token.
 */
export async function clearFCMToken(userId: string): Promise<void> {
  // Read the token BEFORE nulling it: fan-out reads push_tokens now, so
  // clearing only the legacy column would leave a signed-out phone still
  // receiving alerts. Delete just that one row - this route carries no body,
  // and wiping every row would sign push out on the user's other installs,
  // which is the multi-device regression push_tokens exists to prevent.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
  if (!user) throw new HttpError(404, 'User not found');

  await prisma.user.update({ where: { id: userId }, data: { fcmToken: null } });

  if (user.fcmToken) {
    await prisma.pushToken.deleteMany({ where: { userId, token: user.fcmToken } });
  }
}

/** Expire a live claim code early, so a code read aloud by mistake can be killed. */
export async function revokeClaimCode(tenantId: string, code: string): Promise<void> {
  const codeHash = hashClaimCode(code);
  const claim = await prisma.deviceClaimCode.findFirst({ where: { codeHash, tenantId } });
  if (!claim) throw new HttpError(404, 'Claim code not found');
  if (claim.consumedAt) throw new HttpError(409, 'That code has already been used');

  // Expiring rather than deleting keeps the audit trail of who minted it.
  await prisma.deviceClaimCode.update({
    where: { id: claim.id },
    data: { expiresAt: new Date() },
  });
}

export async function listDevicesForTenant(tenantId: string, userId: string) {
  const devices = await prisma.device.findMany({
    where: {
      // Decommissioned devices drop out of the tenant's list; their history
      // stays queryable by an admin.
      archivedAt: null,
      OR: [{ tenantId }, { userMappings: { some: { userId } } }],
    },
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
      const levelInfo = await resolveLevelPercent(device.id, latest, profile);
      return {
        id: device.deviceId,
        name: device.name || device.deviceId,
        status: device.status,
        firmware_version: device.firmwareVersion,
        last_seen: device.lastSeen,
        // Volume is derived at read time from the current profile + level (like
        // level_percent), so profile edits correct it with no re-report/backfill.
        // No profile -> fall back to the stored snapshot; null level -> null.
        current_volume:
          profile != null
            ? volumeLForProfile(profile, latest?.levelCm?.toNumber() ?? null)
            : latest?.volumeL != null
              ? latest.volumeL.toNumber()
              : null,
        level_percent: levelInfo.level_percent,
        level_percent_stale: levelInfo.level_percent_stale,
        level_percent_as_of: levelInfo.level_percent_as_of,
        has_tank_profile: !!profile,
        last_measurement: latest ? latest.timestamp : null,
        active_alert: activeAlert ? (activeAlert.type === 'leak_detected' ? ('leak' as const) : ('low' as const)) : null,
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
  const levelInfo = await resolveLevelPercent(device.id, m, profile);
  const dto = toMeasurementDto(m);
  return {
    device_id: device.deviceId,
    ...dto,
    // Volume is derived at read time from the current profile + level (like
    // level_percent) instead of echoing the stored column. No profile ->
    // fall back to the stored snapshot; null level -> null (never 0).
    volume_l: profile != null ? volumeLForProfile(profile, dto.level_cm) : dto.volume_l,
    level_percent: levelInfo.level_percent,
    level_percent_stale: levelInfo.level_percent_stale,
    level_percent_as_of: levelInfo.level_percent_as_of,
  };
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
    // Per-row: a null reading stays null here (a gap in the chart), unlike
    // the "current status" endpoints above which fall back to last-known.
    // volume_l is derived at read time from each row's level + the current
    // profile (like level_percent); no profile -> stored snapshot per row.
    measurements: rows.map((m) => {
      const dto = toMeasurementDto(m);
      return {
        ...dto,
        volume_l: profile != null ? volumeLForProfile(profile, dto.level_cm) : dto.volume_l,
        level_percent: levelPercentFor(profile, m.levelCm?.toNumber() ?? null),
      };
    }),
  };
}

export async function getDeviceAlerts(device: Device, limit: number, includeDismissed = false) {
  const alerts = await prisma.alert.findMany({
    where: { deviceId: device.id, ...(includeDismissed ? {} : { dismissedAt: null }) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return { device_id: device.deviceId, alerts: alerts.map(toAlertDto) };
}

/** Shape shared by the per-device feed and the tenant-wide feed. */
function toAlertDto(a: {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string | null;
  payload: unknown;
  acknowledged: boolean;
  dismissedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: a.id,
    type: a.type,
    severity: a.severity,
    message: a.message,
    payload: a.payload,
    acknowledged: a.acknowledged,
    dismissed: a.dismissedAt != null,
    created_at: a.createdAt,
  };
}

/**
 * Every device the user can reach: their tenant's, plus any explicit
 * user_device_mappings grant. Mirrors getAccessibleDeviceOrThrow, which is the
 * single authority for per-device access.
 */
async function accessibleDeviceIds(user: { id: string; tenantId: string | null }) {
  const [tenantDevices, mapped] = await Promise.all([
    user.tenantId
      ? prisma.device.findMany({ where: { tenantId: user.tenantId }, select: { id: true } })
      : Promise.resolve([]),
    prisma.userDeviceMapping.findMany({ where: { userId: user.id }, select: { deviceId: true } }),
  ]);
  return [...new Set([...tenantDevices.map((d) => d.id), ...mapped.map((m) => m.deviceId)])];
}

/**
 * One inbox across every device the user can see. Previously alerts could
 * only be read one device at a time, so a combined feed had no endpoint.
 */
export async function getUserAlerts(
  user: { id: string; tenantId: string | null },
  opts: { limit: number; includeDismissed: boolean; onlyUnacknowledged: boolean; cursor?: string }
) {
  const deviceIds = await accessibleDeviceIds(user);
  if (deviceIds.length === 0) return { alerts: [], unacknowledged: 0, next_cursor: null };

  const where = {
    deviceId: { in: deviceIds },
    ...(opts.includeDismissed ? {} : { dismissedAt: null }),
    ...(opts.onlyUnacknowledged ? { acknowledged: false } : {}),
  };

  const [rows, unacknowledged] = await Promise.all([
    prisma.alert.findMany({
      where,
      // id breaks ties so paging can never skip or repeat alerts sharing a
      // timestamp - two thresholds crossing on one measurement does that.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // One extra row is how we know whether a next page exists without a
      // second count query.
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: { device: { select: { deviceId: true, name: true } } },
    }),
    prisma.alert.count({
      where: { deviceId: { in: deviceIds }, acknowledged: false, dismissedAt: null },
    }),
  ]);

  const alerts = rows.slice(0, opts.limit);

  return {
    // The tenant-wide feed names the tank each alert is about; the per-device
    // feed does not need to.
    alerts: alerts.map((a) => ({
      ...toAlertDto(a),
      device_id: a.device.deviceId,
      device_name: a.device.name || a.device.deviceId,
    })),
    unacknowledged,
    // Null rather than absent, so a client has one thing to check. Callers
    // that ignore it (the web UI) behave exactly as before.
    next_cursor: rows.length > opts.limit ? alerts[alerts.length - 1].id : null,
  };
}

/**
 * Hide an alert from the feed. The row is kept - a leak alert is an
 * operational event worth retaining after the user clears it off screen.
 */
export async function dismissAlert(device: Device, alertId: string): Promise<void> {
  const alert = await prisma.alert.findFirst({ where: { id: alertId, deviceId: device.id } });
  if (!alert) throw new HttpError(404, 'Alert not found');
  if (alert.dismissedAt) return; // Idempotent: dismissing twice is not an error.
  await prisma.alert.update({ where: { id: alertId }, data: { dismissedAt: new Date() } });
}

/** Bring a dismissed alert back into the feed. */
export async function restoreAlert(device: Device, alertId: string): Promise<void> {
  const alert = await prisma.alert.findFirst({ where: { id: alertId, deviceId: device.id } });
  if (!alert) throw new HttpError(404, 'Alert not found');
  await prisma.alert.update({ where: { id: alertId }, data: { dismissedAt: null } });
}

export async function acknowledgeAlert(device: Device, alertId: string, userId: string): Promise<void> {
  const alert = await prisma.alert.findFirst({ where: { id: alertId, deviceId: device.id } });
  if (!alert) throw new HttpError(404, 'Alert not found');
  await prisma.alert.update({
    where: { id: alertId },
    data: { acknowledged: true, acknowledgedBy: userId, acknowledgedAt: new Date() },
  });
}

/**
 * Acknowledge by alert id alone, scoped to what the caller can see.
 *
 * A notification action carries the alert id and nothing else, so requiring the
 * device id (as the route above does) would mean a lookup before the user's tap
 * could do anything. Access is checked against the same device set as the
 * inbox, so a shared device's alerts can be acknowledged too.
 */
export async function acknowledgeAlertById(
  user: { id: string; tenantId: string | null },
  alertId: string
): Promise<void> {
  const deviceIds = await accessibleDeviceIds(user);
  const alert = await prisma.alert.findFirst({
    where: { id: alertId, deviceId: { in: deviceIds } },
  });
  if (!alert) throw new HttpError(404, 'Alert not found');
  if (alert.acknowledged) return; // Idempotent: a double-tap is not an error.

  await prisma.alert.update({
    where: { id: alertId },
    data: { acknowledged: true, acknowledgedBy: user.id, acknowledgedAt: new Date() },
  });
}

// --- Device sharing --------------------------------------------------------
// user_device_mappings has always been read by getAccessibleDeviceOrThrow as a
// third access path ("admin bypass, tenant match, or an explicit grant"), but
// nothing in the codebase ever wrote a row - so the grant path could only ever
// be empty and sharing a tank with a household member was unreachable. These
// are the writers.

/** Who can see this device, and how they got access. */
export async function listDeviceShares(device: Device) {
  const [tenantUsers, mappings] = await Promise.all([
    device.tenantId
      ? prisma.user.findMany({
          where: { tenantId: device.tenantId },
          select: { id: true, email: true, name: true, role: true },
          orderBy: { email: 'asc' },
        })
      : Promise.resolve([]),
    prisma.userDeviceMapping.findMany({
      where: { deviceId: device.id },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const tenantUserIds = new Set(tenantUsers.map((u) => u.id));

  return {
    device_id: device.deviceId,
    // Access via tenant membership is implicit and cannot be revoked per
    // device - the UI needs to know that so it does not offer a Remove button.
    members: tenantUsers.map((u) => ({
      user_id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      via: 'tenant' as const,
      revocable: false,
    })),
    // Explicit grants, which can be revoked. A grant to someone who is also a
    // tenant member is redundant but harmless, so it is reported as such.
    shares: mappings.map((m) => ({
      user_id: m.user.id,
      email: m.user.email,
      name: m.user.name,
      role: m.user.role,
      via: 'share' as const,
      revocable: true,
      redundant: tenantUserIds.has(m.user.id),
      shared_at: m.createdAt,
    })),
  };
}

/**
 * Grant a specific user access to a device by email.
 *
 * Deliberately does NOT create accounts: the person must already have signed
 * up, otherwise this becomes an invite system with email delivery, tokens and
 * expiry, which is a much bigger feature.
 */
export async function shareDevice(device: Device, email: string) {
  const target = await prisma.user.findFirst({ where: { email: email.trim() } });
  if (!target) {
    throw new HttpError(404, 'No AquaMind account with that email. Ask them to sign up first.');
  }

  if (device.tenantId && target.tenantId === device.tenantId) {
    throw new HttpError(409, 'That person already has access through their tenant.');
  }

  try {
    await prisma.userDeviceMapping.create({ data: { userId: target.id, deviceId: device.id } });
  } catch (err) {
    // @@unique([userId, deviceId]) - sharing twice is not an error.
    if (!isUniqueConstraintError(err)) throw err;
  }

  return { user_id: target.id, email: target.email, name: target.name };
}

/** Revoke an explicit grant. Tenant-membership access is untouched by this. */
export async function unshareDevice(device: Device, userId: string): Promise<void> {
  const result = await prisma.userDeviceMapping.deleteMany({
    where: { deviceId: device.id, userId },
  });
  if (result.count === 0) throw new HttpError(404, 'That user has no explicit share on this device');
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
