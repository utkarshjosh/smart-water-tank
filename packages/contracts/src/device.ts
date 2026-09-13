import { z } from 'zod';
import { syncModeSchema, tankShapeSchema } from './primitives';

// Device-facing responses: /api/v1/devices/claim, /measurements, and the
// per-device config and OTA routes. The firmware reads these, so a field
// rename here is a firmware change too.

/** POST /devices/claim — the one-time exchange of a claim code for a permanent bearer token. */
export const claimResponseSchema = z.object({
  device_token: z.string(),
  device_id: z.string(),
});
export type ClaimResponse = z.infer<typeof claimResponseSchema>;

/**
 * device.service DeviceConfigPayload: operational settings, the geometry block
 * when a tank profile exists, and the version the device echoes back. Loose
 * because DeviceConfig.configJson is spread in. Also the body of the MQTT
 * `config` message.
 */
export const deviceConfigPayloadSchema = z.looseObject({
  measurement_interval_ms: z.number(),
  report_interval_ms: z.number(),
  tank_full_threshold_l: z.number().nullable(),
  tank_low_threshold_l: z.number().nullable(),
  tank_full_threshold_pct: z.number().nullable(),
  tank_low_threshold_pct: z.number().nullable(),
  battery_low_threshold_v: z.number().nullable(),
  sync_mode: syncModeSchema,
  // Geometry — present only once a tank profile exists.
  shape: tankShapeSchema.optional(),
  diameter_cm: z.number().nullable().optional(),
  length_cm: z.number().nullable().optional(),
  width_cm: z.number().nullable().optional(),
  height_cm: z.number().optional(),
  sensor_offset_cm: z.number().optional(),
  dead_zone_cm: z.number().optional(),
  parallel_unit_count: z.number().optional(),
  /** Raw distance when the tank is empty: sensor offset + height. */
  level_empty_cm: z.number().optional(),
  /** Closest measurable distance: max(sensor offset, ultrasonic dead zone). */
  level_full_cm: z.number().optional(),
  total_capacity_l: z.number().optional(),
  config_version: z.number(),
});
export type DeviceConfigPayload = z.infer<typeof deviceConfigPayloadSchema>;

/**
 * POST /measurements — 201. `config` is piggybacked only when the device's
 * reported config_version is missing or older than the server's.
 */
export const measurementResponseSchema = z.object({
  success: z.literal(true),
  measurement_id: z.string(),
  config_version: z.number(),
  config: deviceConfigPayloadSchema.optional(),
});
export type MeasurementResponse = z.infer<typeof measurementResponseSchema>;

/** GET /devices/:id/ota/latest — firmware.service checkOtaUpdate. */
export const otaCheckSchema = z.discriminatedUnion('update_available', [
  z.object({
    update_available: z.literal(false),
    current_version: z.string(),
  }),
  z.object({
    update_available: z.literal(true),
    current_version: z.string(),
    latest_version: z.string(),
    download_url: z.string(),
    file_size: z.number().nullable(),
    checksum: z.string().nullable(),
  }),
]);
export type OtaCheck = z.infer<typeof otaCheckSchema>;
