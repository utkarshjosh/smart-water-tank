import { z } from 'zod';

import type { WidgetTank } from '@/widget/state';

/**
 * The alert push payload, as built by backend-v2's `buildAlertNotification`.
 *
 * FCM data values are always strings on the wire, so numbers and booleans are
 * coerced here rather than trusted. A payload that fails this schema is
 * ignored: a malformed push must never crash a background handler that Android
 * gives us a few seconds to run.
 */
export const alertPayloadSchema = z.object({
  alert_id: z.string().min(1),
  device_id: z.string().min(1),
  device_name: z.string().default('Your tank'),
  type: z.enum(['tank_full', 'tank_low', 'battery_low', 'device_offline', 'leak_detected']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  channel_id: z.string().min(1),
  as_of: z.string().optional(),
  online: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  level_percent: z.coerce.number().optional(),
});

export type AlertPayload = z.infer<typeof alertPayloadSchema>;

export function parseAlertPayload(data: unknown): AlertPayload | null {
  const parsed = alertPayloadSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** What this push implies about the tank, for merging into widget state. */
export function tankPatchFromAlert(payload: AlertPayload): Partial<WidgetTank> & { deviceId: string } {
  return {
    deviceId: payload.device_id,
    name: payload.device_name,
    ...(payload.level_percent === undefined ? {} : { levelPercent: payload.level_percent }),
    ...(payload.online === undefined ? {} : { online: payload.online }),
    ...(payload.as_of ? { asOf: new Date(payload.as_of).getTime() } : {}),
    alert: payload.type === 'leak_detected' ? 'leak' : payload.type === 'tank_low' ? 'low' : null,
  };
}
