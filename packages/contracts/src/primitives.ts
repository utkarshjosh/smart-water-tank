import { z } from 'zod';

// Every schema here describes the WIRE: what the server actually puts on the
// network after JSON.stringify. Dates are therefore ISO strings, never Date
// objects. The backend feeds sendJson() objects that still hold Dates; the
// serialisation happens before validation. Clients that want Date values
// (the Android app) derive them at their own boundary.

/** `2026-01-01T00:00:00.000Z` — what Date#toISOString produces. */
export const isoDateTime = z.iso.datetime();
export const nullableIsoDateTime = isoDateTime.nullable();

/** `2026-01-01` — calendar days, used by the usage endpoint. */
export const isoDate = z.iso.date();

// --- Enums mirrored from prisma/schema.prisma -------------------------------
// If one of these changes in the schema it must change here in the same PR;
// the backend's typecheck fails otherwise, which is the point.

export const roleSchema = z.enum(['user', 'tenant_owner', 'admin', 'super_admin']);
export type Role = z.infer<typeof roleSchema>;

export const deviceStatusSchema = z.enum(['online', 'offline']);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

export const alertTypeSchema = z.enum(['tank_full', 'tank_low', 'battery_low', 'device_offline', 'leak_detected']);
export type AlertType = z.infer<typeof alertTypeSchema>;

export const alertSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type AlertSeverity = z.infer<typeof alertSeveritySchema>;

export const tankShapeSchema = z.enum(['cylindrical', 'cuboidal']);
export type TankShape = z.infer<typeof tankShapeSchema>;

export const syncModeSchema = z.enum(['live', 'piggyback']);
export type SyncMode = z.infer<typeof syncModeSchema>;

// --- Envelopes ---------------------------------------------------------------

/** Mutations with nothing to return. */
export const okSchema = z.object({ success: z.literal(true) });
export type Ok = z.infer<typeof okSchema>;

/**
 * What the backend's error handler emits for every 4xx/5xx. `details` is the
 * zod issue list for a 400, or whatever an HttpError carried.
 */
export const errorEnvelopeSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
