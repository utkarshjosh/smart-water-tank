import { useQuery } from '@tanstack/react-query';
import {
  currentReadingSchema,
  deviceAlertsResponseSchema,
  deviceConfigPayloadSchema,
  deviceInfoSchema,
  firmwareStatusSchema,
  sharesResponseSchema,
  tankProfileResponseSchema,
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
  UsageDay,
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
