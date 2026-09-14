import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../lib/http-error';
import { isUniqueConstraintError } from '../../lib/prisma-errors';
import { getAuth } from '../../config/firebase';
import { syncFirebaseRole, toRawUserDto } from './shared';

// User administration: linking Firebase identities to AquaMind users, roles,
// tenant membership, and deactivation.

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
      dry_run: true as const,
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

  return { dry_run: false as const, stats };
}
