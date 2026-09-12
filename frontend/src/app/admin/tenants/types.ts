export type UserRole = 'user' | 'tenant_owner' | 'admin' | 'super_admin';

export const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'tenant_owner', label: 'Tenant owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Platform super admin' },
];

export const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label])) as Record<
  string,
  string
>;

/** Super admins are tenantless by design; everyone else needs a tenant. */
export const isTenantless = (role: UserRole | string | null | undefined) => role === 'super_admin';

export interface DatabaseUser {
  id: string;
  firebase_uid: string;
  email: string;
  name: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  role: string;
  created_at: string;
}

export interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  disabled: boolean;
  metadata: {
    creationTime: string;
    lastSignInTime: string | null;
  };
  tenant_id: string | null;
  tenant_name: string | null;
  is_linked: boolean;
  role: UserRole | null;
}
