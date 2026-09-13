import { z } from 'zod';
import {
  alertSeveritySchema,
  alertTypeSchema,
  deviceStatusSchema,
  isoDateTime,
  nullableIsoDateTime,
  roleSchema,
} from './primitives';
import { configDtoSchema } from './user';

// Responses of /api/v1/admin/* — backend-v2/src/services/admin.service.ts and
// the firmware routes. Only the web console reads these.

// --- Dashboard ---------------------------------------------------------------

/** GET /analytics/summary. */
export const adminSummarySchema = z.object({
  total_devices: z.number(),
  online_devices: z.number(),
  offline_devices: z.number(),
  total_tenants: z.number(),
  recent_alerts_24h: z.number(),
  measurements_today: z.number(),
});
export type AdminSummary = z.infer<typeof adminSummarySchema>;

// --- Devices -----------------------------------------------------------------

/**
 * One row of GET /devices — listDevices. Unlike the tenant view, `name`,
 * `tenant_id` and `last_seen` really can be null here: an unclaimed or
 * unpaired device has no tenant and has never reported.
 */
export const adminDeviceSchema = z.object({
  id: z.string(),
  device_id: z.string(),
  name: z.string().nullable(),
  tenant_id: z.string().nullable(),
  tenant_name: z.string().nullable(),
  status: deviceStatusSchema,
  firmware_version: z.string().nullable(),
  last_seen: nullableIsoDateTime,
  current_volume: z.number().nullable(),
  last_measurement: nullableIsoDateTime,
  created_at: isoDateTime,
  /** The admin list is the only place a decommissioned device is visible or restorable. */
  archived_at: nullableIsoDateTime,
});
export type AdminDevice = z.infer<typeof adminDeviceSchema>;

export const adminDevicesResponseSchema = z.object({ devices: z.array(adminDeviceSchema) });
export type AdminDevicesResponse = z.infer<typeof adminDevicesResponseSchema>;

/** POST /devices — createDevice. 201. The token is shown once and never again. */
export const adminDeviceCreatedSchema = z.object({
  device: z.object({
    id: z.string(),
    device_id: z.string(),
    tenant_id: z.string().nullable(),
    name: z.string().nullable(),
    status: deviceStatusSchema,
    created_at: isoDateTime,
  }),
  token: z.string(),
});
export type AdminDeviceCreated = z.infer<typeof adminDeviceCreatedSchema>;

/** PUT /devices/:id — updateDevice (rename or move between tenants). */
export const adminDeviceUpdatedSchema = z.object({
  id: z.string(),
  device_id: z.string(),
  name: z.string().nullable(),
  tenant_id: z.string().nullable(),
  tenant_name: z.string().nullable(),
  status: deviceStatusSchema,
});
export type AdminDeviceUpdated = z.infer<typeof adminDeviceUpdatedSchema>;

/** An alert as the admin console sees it: no payload, with acknowledgement time. */
export const adminAlertSchema = z.object({
  id: z.string(),
  type: alertTypeSchema,
  severity: alertSeveritySchema,
  message: z.string().nullable(),
  acknowledged: z.boolean(),
  acknowledged_at: nullableIsoDateTime,
  dismissed: z.boolean(),
  created_at: isoDateTime,
});
export type AdminAlert = z.infer<typeof adminAlertSchema>;

/** GET /devices/:id — getDeviceDetail. */
export const adminDeviceDetailSchema = z.object({
  id: z.string(),
  device_id: z.string(),
  name: z.string().nullable(),
  tenant_id: z.string().nullable(),
  tenant_name: z.string().nullable(),
  status: deviceStatusSchema,
  firmware_version: z.string().nullable(),
  last_seen: nullableIsoDateTime,
  created_at: isoDateTime,
  config: configDtoSchema.nullable(),
  latest_measurement: z
    .object({
      timestamp: isoDateTime,
      level_cm: z.number().nullable(),
      volume_l: z.number().nullable(),
      temperature_c: z.number().nullable(),
      battery_v: z.number().nullable(),
      rssi: z.number().nullable(),
    })
    .nullable(),
  /** Ten most recent, newest first. */
  recent_alerts: z.array(adminAlertSchema),
});
export type AdminDeviceDetail = z.infer<typeof adminDeviceDetailSchema>;

/** DELETE /devices/:id — archiveDevice. Readings are kept. */
export const deviceArchivedSchema = z.object({
  device_id: z.string(),
  measurements_retained: z.number(),
});
export type DeviceArchived = z.infer<typeof deviceArchivedSchema>;

/** POST /devices/:id/restore. */
export const deviceRestoredSchema = z.object({ device_id: z.string() });
export type DeviceRestored = z.infer<typeof deviceRestoredSchema>;

/** POST /devices/:id/token — a fresh bearer token; the old one keeps working. */
export const deviceTokenResponseSchema = z.object({
  success: z.literal(true),
  token: z.string(),
  device_id: z.string(),
});
export type DeviceTokenResponse = z.infer<typeof deviceTokenResponseSchema>;

// --- Alerts ------------------------------------------------------------------

/** One row of GET /alerts — the fleet-wide feed. */
export const adminFeedAlertSchema = adminAlertSchema.extend({
  device_id: z.string(),
  device_name: z.string(),
  tenant_id: z.string(),
  tenant_name: z.string(),
});
export type AdminFeedAlert = z.infer<typeof adminFeedAlertSchema>;

export const adminAlertsResponseSchema = z.object({
  /** Matching rows before `limit` was applied. */
  total: z.number(),
  alerts: z.array(adminFeedAlertSchema),
});
export type AdminAlertsResponse = z.infer<typeof adminAlertsResponseSchema>;

// --- Tenants -----------------------------------------------------------------

export const tenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
  archived_at: nullableIsoDateTime,
});
export type Tenant = z.infer<typeof tenantSchema>;

/** One row of GET /tenants — listTenants. Counts exclude archived children. */
export const adminTenantSchema = tenantSchema.extend({
  device_count: z.number(),
  user_count: z.number(),
});
export type AdminTenant = z.infer<typeof adminTenantSchema>;

export const adminTenantsResponseSchema = z.object({ tenants: z.array(adminTenantSchema) });
export type AdminTenantsResponse = z.infer<typeof adminTenantsResponseSchema>;

/** POST /tenants (201) and PUT /tenants/:id. */
export const tenantResponseSchema = z.object({ tenant: tenantSchema });
export type TenantResponse = z.infer<typeof tenantResponseSchema>;

/**
 * What a tenant archive takes with it (GET /tenants/:id/archive-preview),
 * what it took (DELETE /tenants/:id), and what a restore brought back
 * (POST /tenants/:id/restore — `measurements` is 0 there; they were never gone).
 */
export const archiveSummarySchema = z.object({
  tenants: z.number(),
  devices: z.number(),
  users: z.number(),
  measurements: z.number(),
});
export type ArchiveSummary = z.infer<typeof archiveSummarySchema>;

// --- Users -------------------------------------------------------------------

/** One row of GET /users — listUsers. `fcm_token` is masked to "***" when set. */
export const adminUserSchema = z.object({
  id: z.string(),
  firebase_uid: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  tenant_id: z.string().nullable(),
  tenant_name: z.string().nullable(),
  role: roleSchema,
  fcm_token: z.string().nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
  archived_at: nullableIsoDateTime,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUsersResponseSchema = z.object({ users: z.array(adminUserSchema) });
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;

/** admin.service toRawUserDto — echoed by the link / role / tenant mutations. */
export const rawUserSchema = z.object({
  id: z.string(),
  firebase_uid: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  tenant_id: z.string().nullable(),
  role: roleSchema,
  fcm_token: z.string().nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type RawUser = z.infer<typeof rawUserSchema>;

/** POST /users — createOrLinkUser. */
export const userLinkedResponseSchema = z.object({
  user: rawUserSchema,
  message: z.string(),
});
export type UserLinkedResponse = z.infer<typeof userLinkedResponseSchema>;

/** PUT /users/:id/role and PUT /users/:id/tenant. */
export const userUpdatedResponseSchema = z.object({
  user: rawUserSchema.extend({ tenant_name: z.string().nullable() }),
  message: z.string(),
});
export type UserUpdatedResponse = z.infer<typeof userUpdatedResponseSchema>;

/** DELETE /users/:id and POST /users/:id/restore. */
export const userArchivedSchema = z.object({
  user_id: z.string(),
  email: z.string(),
});
export type UserArchived = z.infer<typeof userArchivedSchema>;

/**
 * One row of GET /users/firebase — a Firebase Auth account, with whether an
 * AquaMind user row is linked to it. Firebase's own field names are kept
 * (camelCase, and RFC 2822 timestamps rather than ISO) because they are
 * passed through from the Admin SDK.
 */
export const firebaseUserSchema = z.object({
  uid: z.string(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  photoURL: z.string().nullable(),
  emailVerified: z.boolean(),
  disabled: z.boolean(),
  metadata: z.object({
    creationTime: z.string(),
    lastSignInTime: z.string().nullable(),
  }),
  tenant_id: z.string().nullable(),
  tenant_name: z.string().nullable(),
  role: roleSchema.nullable(),
  is_linked: z.boolean(),
});
export type FirebaseUser = z.infer<typeof firebaseUserSchema>;

export const firebaseUsersResponseSchema = z.object({
  users: z.array(firebaseUserSchema),
  total: z.number(),
});
export type FirebaseUsersResponse = z.infer<typeof firebaseUsersResponseSchema>;

const syncStatsSchema = z.object({
  total_firebase_users: z.number(),
  existing_in_db: z.number(),
  to_create: z.number(),
  created: z.number(),
  errors: z.number(),
  error_details: z.array(z.object({ uid: z.string(), email: z.string().optional(), error: z.string() })),
});

/** POST /users/sync-firebase. */
export const syncFirebaseUsersResponseSchema = z.discriminatedUnion('dry_run', [
  z.object({
    dry_run: z.literal(true),
    stats: syncStatsSchema,
    users_to_create: z.array(
      z.object({ uid: z.string(), email: z.string().optional(), displayName: z.string().optional() })
    ),
  }),
  z.object({ dry_run: z.literal(false), stats: syncStatsSchema }),
]);
export type SyncFirebaseUsersResponse = z.infer<typeof syncFirebaseUsersResponseSchema>;

// --- Firmware ----------------------------------------------------------------

/** One row of GET /firmware. */
export const firmwareSchema = z.object({
  id: z.string(),
  version: z.string(),
  file_size: z.number().nullable(),
  checksum: z.string().nullable(),
  description: z.string().nullable(),
  is_active: z.boolean(),
  rollout_percentage: z.number(),
  created_at: isoDateTime,
});
export type Firmware = z.infer<typeof firmwareSchema>;

export const firmwareListResponseSchema = z.object({ firmware: z.array(firmwareSchema) });
export type FirmwareListResponse = z.infer<typeof firmwareListResponseSchema>;

/** POST /firmware/upload. The release starts inactive. */
export const firmwareUploadedResponseSchema = z.object({
  success: z.literal(true),
  firmware: z.object({
    id: z.string(),
    version: z.string(),
    file_size: z.number().nullable(),
    checksum: z.string().nullable(),
    description: z.string().nullable(),
  }),
});
export type FirmwareUploadedResponse = z.infer<typeof firmwareUploadedResponseSchema>;

/** POST /firmware/:version/rollout. */
export const firmwareRolloutResponseSchema = z.object({
  success: z.literal(true),
  assigned_devices: z.number(),
});
export type FirmwareRolloutResponse = z.infer<typeof firmwareRolloutResponseSchema>;

/** POST /firmware/:id/unroll — in-flight assignments are cancelled, history kept. */
export const firmwareUnrolledResponseSchema = z.object({
  success: z.literal(true),
  firmware_id: z.string(),
  version: z.string(),
  cancelled_assignments: z.number(),
});
export type FirmwareUnrolledResponse = z.infer<typeof firmwareUnrolledResponseSchema>;

/** DELETE /firmware/:id. */
export const firmwareDeletedResponseSchema = z.object({
  success: z.literal(true),
  firmware_id: z.string(),
  version: z.string(),
  file_deleted: z.boolean(),
});
export type FirmwareDeletedResponse = z.infer<typeof firmwareDeletedResponseSchema>;
