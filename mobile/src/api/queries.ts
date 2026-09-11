import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import type { CurrentReading, DeviceSummary, HistoryPoint } from '@/api/schemas';

/**
 * Query keys and hooks. Stale times are chosen against the device's reporting
 * cadence, not plucked: DeviceConfig defaults to a 5-minute report interval, so
 * polling the summary faster than ~60s only burns battery for data that cannot
 * have changed.
 */
export const queryKeys = {
  me: ['me'] as const,
  devices: ['devices'] as const,
  current: (deviceId: string) => ['device', deviceId, 'current'] as const,
  history: (deviceId: string, days: number) => ['device', deviceId, 'history', days] as const,
  alerts: (deviceId: string) => ['device', deviceId, 'alerts'] as const,
  tankProfile: (deviceId: string) => ['device', deviceId, 'tank-profile'] as const,
};

export function useDevices(): UseQueryResult<DeviceSummary[], Error> {
  return useQuery({
    queryKey: queryKeys.devices,
    queryFn: () => api.listDevices(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useCurrentReading(deviceId: string | undefined): UseQueryResult<CurrentReading | null, Error> {
  return useQuery({
    queryKey: queryKeys.current(deviceId ?? ''),
    enabled: !!deviceId,
    staleTime: 60_000,
    // 404 here means "this device has never reported", which is a state the UI
    // renders, not an error to retry.
    queryFn: async () => {
      try {
        return await api.getCurrent(deviceId!);
      } catch (error) {
        if (error instanceof ApiError && error.isNotFound) return null;
        throw error;
      }
    },
  });
}

export function useHistory(deviceId: string | undefined, days: number): UseQueryResult<HistoryPoint[], Error> {
  return useQuery({
    queryKey: queryKeys.history(deviceId ?? '', days),
    enabled: !!deviceId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        return await api.getHistory(deviceId!, days);
      } catch (error) {
        if (error instanceof ApiError && error.isNotFound) return [];
        throw error;
      }
    },
  });
}

export function useTankProfile(deviceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tankProfile(deviceId ?? ''),
    enabled: !!deviceId,
    // Geometry changes only when the user edits it.
    staleTime: 30 * 60_000,
    queryFn: () => api.getTankProfile(deviceId!),
  });
}
