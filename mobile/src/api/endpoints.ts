import { z } from 'zod';

import { request } from '@/api/client';
import {
  alertFeedSchema,
  claimCodeSchema,
  claimStatusSchema,
  currentReadingSchema,
  deviceAlertsSchema,
  devicesSchema,
  historySchema,
  meSchema,
  tankProfileResponseSchema,
} from '@/api/schemas';

/**
 * Every backend call the app makes, in one place.
 *
 * These are today's endpoints. plans/android-app-v2.md §5 adds /user/overview
 * and a bucketed /series; when they land, `listDevices` and `getHistory` are
 * the only two functions that change.
 */

const BASE = '/api/v1/user';
const okSchema = z.object({ success: z.boolean() });
const id = encodeURIComponent;

export const api = {
  me: () => request(`${BASE}/me`, meSchema),

  listDevices: () => request(`${BASE}/devices`, devicesSchema).then((r) => r.devices),

  getCurrent: (deviceId: string) => request(`${BASE}/devices/${id(deviceId)}/current`, currentReadingSchema),

  getHistory: (deviceId: string, days: number, limit = 500) =>
    request(`${BASE}/devices/${id(deviceId)}/history?days=${days}&limit=${limit}`, historySchema).then(
      (r) => r.measurements
    ),

  getAlerts: (deviceId: string, limit = 50) =>
    request(`${BASE}/devices/${id(deviceId)}/alerts?limit=${limit}`, deviceAlertsSchema).then((r) => r.alerts),

  acknowledgeAlert: (deviceId: string, alertId: string) =>
    request(`${BASE}/devices/${id(deviceId)}/alerts/${id(alertId)}/acknowledge`, okSchema, { method: 'POST' }),

  /** Tenant-wide feed. One request for every tank, cursor-paginated. */
  listAlerts: (options: { limit?: number; cursor?: string; acknowledged?: boolean } = {}) => {
    const params = new URLSearchParams({ limit: String(options.limit ?? 30) });
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.acknowledged !== undefined) params.set('acknowledged', String(options.acknowledged));
    return request(`${BASE}/alerts?${params.toString()}`, alertFeedSchema);
  },

  /** Acknowledge with only the alert id — all a notification action carries. */
  acknowledgeAlertById: (alertId: string) =>
    request(`${BASE}/alerts/${id(alertId)}/acknowledge`, okSchema, { method: 'POST' }),

  registerPushToken: (token: string, platform = 'android') =>
    request(`${BASE}/push-tokens`, okSchema, { method: 'POST', body: { token, platform } }),

  removePushToken: (token: string) =>
    request(`${BASE}/push-tokens`, okSchema, { method: 'DELETE', body: { token } }),

  getTankProfile: (deviceId: string) =>
    request(`${BASE}/devices/${id(deviceId)}/tank-profile`, tankProfileResponseSchema).then((r) => r.profile),

  mintClaimCode: () => request(`${BASE}/devices/claim-code`, claimCodeSchema, { method: 'POST', body: {} }),

  getClaimStatus: (code: string) => request(`${BASE}/devices/claim-code/${id(code)}/status`, claimStatusSchema),
};
