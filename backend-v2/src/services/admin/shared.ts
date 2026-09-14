import { Alert, Role, Tenant, User } from '@prisma/client';
import { getAuth } from '../../config/firebase';

// DTO mappers and helpers shared by the admin services. Everything the admin
// API returns is snake_case, never a raw Prisma record.

export function toTenantDto(tenant: Tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    created_at: tenant.createdAt,
    updated_at: tenant.updatedAt,
    archived_at: tenant.archivedAt,
  };
}

// The admin console's alert shape: no payload, with acknowledgement time.
export function toAdminAlertDto(a: Alert) {
  return {
    id: a.id,
    type: a.type,
    severity: a.severity,
    message: a.message,
    acknowledged: a.acknowledged,
    acknowledged_at: a.acknowledgedAt,
    dismissed: a.dismissedAt != null,
    created_at: a.createdAt,
  };
}

export function toRawUserDto(user: User) {
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

// Firebase is the identity provider; AquaMind's database remains the source
// of truth for authorisation. Mirroring the role as a custom claim makes the
// Firebase account observable and keeps the two systems aligned.
export async function syncFirebaseRole(firebaseUid: string, role: Role): Promise<void> {
  const auth = getAuth();
  const firebaseUser = await auth.getUser(firebaseUid);
  await auth.setCustomUserClaims(firebaseUid, { ...(firebaseUser.customClaims || {}), role });
}
