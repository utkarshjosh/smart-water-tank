import type { Role } from '@aquamind/contracts';

export type UserRole = Role;

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

// Both shapes come from the contract; the names below are what this folder
// has always called them.
export type { AdminUser as DatabaseUser, FirebaseUser } from '@aquamind/contracts';
