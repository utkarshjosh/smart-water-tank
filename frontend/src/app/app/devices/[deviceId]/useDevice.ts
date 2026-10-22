import { useQuery } from '@tanstack/react-query';
import {
  currentReadingSchema,
  deviceAlertsResponseSchema,
  deviceConfigPayloadSchema,
  deviceInfoSchema,
  firmwareStatusSchema,
  hourlyUsageResponseSchema,
  sharesResponseSchema,
  tankEventsResponseSchema,
  tankProfileResponseSchema,
  usageHistoryResponseSchema,
  usageResponseSchema,
} from '@aquamind/contracts';
import { get } from '@/lib/api';

// Types come from the contract; re-exported under the names this folder's
// components already use.
export type {
  Alert as AlertItem,
  CurrentReading as CurrentMeasurement,
  DeviceConfigPayload as ConfigDto,
  DeviceInfo,
  DeviceShare,
  FirmwareStatus,
  HourlyUsageResponse,
  TankEvent,
  UsageDay,
  UsageHistoryResponse,
  UsageHour,
  UsageResponse,
} from '@aquamind/contracts';

export const deviceKeys = {
  info: (id?: string) => ['device', id] as const,
  current: (id?: string) => ['device', id, 'current'] as const,
  profile: (id?: string) => ['device', id, 'tank-profile'] as const,
  alerts: (id?: string) => ['device', id, 'alerts'] as const,
  config: (id?: string) => ['device', id, 'config'] as const,
  firmware: (id?: string) => ['device', id, 'firmware-status'] as const,
};

export const useDevice = (id?: string) =>
  useQuery({
    queryKey: deviceKeys.info(id),
    enabled: Boolean(id),
    queryFn: () => get(`/api/v1/user/devices/${id}`, deviceInfoSchema),
  });

/**
 * Live readings. Polls only while the tab is visible - a backgrounded phone
 * should not keep waking the radio for a chart nobody is looking at.
 */
export const useCurrent = (id?: string) =>
  useQuery({
    queryKey: deviceKeys.current(id),
    enabled: Boolean(id),
    queryFn: () => get(`/api/v1/user/devices/${id}/current`, currentReadingSchema),
    refetchInterval: () => (document.visibilityState === 'visible' ? 15_000 : false),
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

export const useTankProfile = (id?: string) =>
  useQuery({
    queryKey: deviceKeys.profile(id),
    enabled: Boolean(id),
    queryFn: () => get(`/api/v1/user/devices/${id}/tank-profile`, tankProfileResponseSchema).then((d) => d.profile),
  });

export const useAlerts = (id?: string) =>
  useQuery({
    queryKey: deviceKeys.alerts(id),
    enabled: Boolean(id),
    queryFn: () => get(`/api/v1/user/devices/${id}/alerts`, deviceAlertsResponseSchema).then((d) => d.alerts),
  });

export const useDeviceConfig = (id?: string) =>
  useQuery({
    queryKey: deviceKeys.config(id),
    enabled: Boolean(id),
    queryFn: () => get(`/api/v1/user/devices/${id}/config`, deviceConfigPayloadSchema),
  });

export const useFirmwareStatus = (id?: string) =>
  useQuery({
    queryKey: deviceKeys.firmware(id),
    enabled: Boolean(id),
    queryFn: () => get(`/api/v1/user/devices/${id}/firmware-status`, firmwareStatusSchema),
  });

export const formatReading = (value: number | null | undefined, digits = 0) =>
  value == null ? null : Number(value).toFixed(digits);

export const useUsage = (id?: string, days = 30) =>
  useQuery({
    queryKey: ['device', id, 'usage', days],
    enabled: Boolean(id),
    queryFn: () => get(`/api/v1/user/devices/${id}/usage?days=${days}`, usageResponseSchema),
  });

export const useDeviceShares = (id?: string) =>
  useQuery({
    queryKey: ['device', id, 'shares'],
    enabled: Boolean(id),
    queryFn: () => get(`/api/v1/user/devices/${id}/shares`, sharesResponseSchema),
  });

// Rollups refresh on the server every 5 minutes; polling faster than once a
// minute would only re-read the same rows.
const ROLLUP_POLL_MS = 60_000;
const whileVisible = () => (document.visibilityState === 'visible' ? ROLLUP_POLL_MS : false);

/** Litres used and filled per local hour, plus today's total. */
export const useHourlyUsage = (id?: string, range: 'today' | '24h' = '24h') =>
  useQuery({
    queryKey: ['device', id, 'usage-hourly', range],
    enabled: Boolean(id),
    queryFn: () => get(`/api/v1/user/devices/${id}/usage/hourly?range=${range}`, hourlyUsageResponseSchema),
    refetchInterval: whileVisible,
    placeholderData: (previous) => previous,
  });

/** Fill and draw episodes, newest first. */
export const useTankEvents = (id?: string, range: 'today' | '24h' | '7d' = '24h') =>
  useQuery({
    queryKey: ['device', id, 'events', range],
    enabled: Boolean(id),
    queryFn: () => get(`/api/v1/user/devices/${id}/events?range=${range}`, tankEventsResponseSchema),
    refetchInterval: whileVisible,
    placeholderData: (previous) => previous,
  });

/** Usage over a date range, by day / week / month, with patterns. */
export const useUsageHistory = (id: string | undefined, query: { from: string; to: string; group?: 'day' | 'week' | 'month' }) =>
  useQuery({
    queryKey: ['device', id, 'usage-history', query.from, query.to, query.group ?? 'auto'],
    enabled: Boolean(id),
    queryFn: () =>
      get(`/api/v1/user/devices/${id}/usage/history`, usageHistoryResponseSchema, {
        params: { from: query.from, to: query.to, ...(query.group ? { group: query.group } : {}) },
      }),
    placeholderData: (previous) => previous,
  });
