import { z } from 'zod';

import { request } from '@/api/client';
import {
  alertFeedSchema,
  claimCodeSchema,
  historySeriesSchema,
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
 * Charts read the server-bucketed /history/series rather than raw rows, so a
 * span of any length costs a bounded number of points. Still outstanding from
 * plans/android-app-v2.md §5 is /user/overview, which collapses the launch
 * requests below into one.
 */

const BASE = '/api/v1/user';
const okSchema = z.object({ success: z.boolean() });
const id = encodeURIComponent;

export const api = {
  me: () => request(`${BASE}/me`, meSchema),

  listDevices: () => request(`${BASE}/devices`, devicesSchema).then((r) => r.devices),

  getCurrent: (deviceId: string) => request(`${BASE}/devices/${id(deviceId)}/current`, currentReadingSchema),

  /**
   * Server-bucketed history: MIN/AVG/MAX per time bucket, so any span costs a
   * bounded number of points. Preferred over getHistory for charts.
   */
  getHistorySeries: (deviceId: string, days: number, metrics = 'level_percent,volume_l') =>
    request(
      `${BASE}/devices/${id(deviceId)}/history/series?days=${days}&metrics=${encodeURIComponent(metrics)}`,
      historySeriesSchema
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
