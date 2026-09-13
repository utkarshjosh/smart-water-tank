import { z } from 'zod';

import { request, requestNoContent } from '@/api/client';
import {
  alertFeedSchema,
  claimCodeSchema,
  historySeriesSchema,
  claimStatusSchema,
  currentReadingSchema,
  deviceAlertsSchema,
  deviceInfoSchema,
  devicesSchema,
  meSchema,
  tankProfileResponseSchema,
  type HistoryMetric,
  type RequestedBucket,
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

  /** `null` clears the name; the server then shows the hardware id as the name. */
  renameDevice: (deviceId: string, name: string | null) =>
    request(`${BASE}/devices/${id(deviceId)}`, deviceInfoSchema, { method: 'PUT', body: { name } }),

  /** 204 on success. An older server answers 404/405 — see useRemoveDevice. */
  removeDevice: (deviceId: string) => requestNoContent(`${BASE}/devices/${id(deviceId)}`, { method: 'DELETE' }),

  getCurrent: (deviceId: string) => request(`${BASE}/devices/${id(deviceId)}/current`, currentReadingSchema),

  /**
   * Server-bucketed history: MIN/AVG/MAX per time bucket, so any span costs a
   * bounded number of points. Preferred over getHistory for charts.
   *
   * `from`/`to` are ISO timestamps and the span may not exceed 400 days.
   * `bucket=auto` lets the server pick a rung that keeps the series under
   * ~2500 points (raw up to 24h, then 5m/1h/6h/1d); an explicit rung is
   * rejected with a 400 if it would exceed 5000 points. Omitting `metrics`
   * returns level_percent, volume_l, temperature_c and battery_v.
   */
  getHistorySeries: (
    deviceId: string,
    options: { from: string; to: string; bucket?: RequestedBucket; metrics?: HistoryMetric[] }
  ) => {
    const params = new URLSearchParams({ from: options.from, to: options.to, bucket: options.bucket ?? 'auto' });
    if (options.metrics?.length) params.set('metrics', options.metrics.join(','));
    return request(`${BASE}/devices/${id(deviceId)}/history/series?${params.toString()}`, historySeriesSchema);
  },

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
