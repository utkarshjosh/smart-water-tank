import { query } from '../config/database';
import { User } from '../database/models';

// Every self-serve signup gets its own 1-person tenant ("personal org"),
// so the existing tenant-scoped access-control logic (enforceTenantAccess,
// validateDeviceAccess) works unchanged: a user only ever sees their own
// devices, and inviting a teammate later is just another users row in the
// same tenant.
export async function provisionPersonalTenantAndUser(params: {
  firebaseUid: string;
  email: string;
  name?: string;
}): Promise<User> {
  const { firebaseUid, email, name } = params;
  const displayName = name || email.split('@')[0] || 'User';
  const tenantName = `${displayName}'s Home`;

  try {
    const tenantResult = await query(
      `INSERT INTO tenants (name) VALUES ($1) RETURNING *`,
      [tenantName]
    );
    const tenantId = tenantResult.rows[0].id;

    const userResult = await query(
      `INSERT INTO users (firebase_uid, email, name, tenant_id, role)
       VALUES ($1, $2, $3, $4, 'tenant_owner')
       RETURNING *`,
      [firebaseUid, email, displayName, tenantId]
    );

    return userResult.rows[0] as User;
  } catch (error: any) {
    // Two racing first-requests for the same firebase_uid - re-select the winner.
    if (error.code === '23505') {
      const existing = await query(
        'SELECT * FROM users WHERE firebase_uid = $1',
        [firebaseUid]
      );
      if (existing.rows.length > 0) {
        return existing.rows[0] as User;
      }
    }
    throw error;
  }
}
