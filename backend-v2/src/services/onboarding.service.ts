import { User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isUniqueConstraintError } from '../lib/prisma-errors';

// Every self-serve signup gets its own 1-person tenant ("personal org"), so
// the tenant-scoped access-control logic (requireTenant, requireDeviceAccess)
// works unchanged: a user only ever sees their own devices, and inviting a
// teammate later is just another users row in the same tenant.
export async function provisionPersonalTenantAndUser(params: {
  firebaseUid: string;
  email: string;
  name?: string;
}): Promise<User> {
  const { firebaseUid, email, name } = params;
  const displayName = name || email.split('@')[0] || 'User';
  const tenantName = `${displayName}'s Home`;

  try {
    return await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: tenantName } });
      return tx.user.create({
        data: {
          firebaseUid,
          email,
          name: displayName,
          tenantId: tenant.id,
          role: 'tenant_owner',
        },
      });
    });
  } catch (error) {
    // Two racing first-requests for the same firebase_uid - re-select the winner.
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.user.findUnique({ where: { firebaseUid } });
      if (existing) return existing;
    }
    throw error;
  }
}
