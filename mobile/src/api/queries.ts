import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import type { CurrentReading, DeviceSummary, HistoryMetric } from '@/api/schemas';

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
  /** Tenant-wide feed. Distinct from the per-device history below. */
  alerts: ['alerts'] as const,
  series: (deviceId: string, from: string, to: string, metric: HistoryMetric) =>
    ['device', deviceId, 'series', from, to, metric] as const,
  deviceAlerts: (deviceId: string) => ['device', deviceId, 'alerts'] as const,
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

/**
 * One metric's bucketed history for a fixed window. The window is ISO
 * `from`/`to` rather than "last N days" so the key is stable across renders
 * and the server picks the bucket (`auto`) exactly as it does for the webapp.
 */
export function useHistorySeries(
  deviceId: string | undefined,
  window: { from: string; to: string },
  metric: HistoryMetric
) {
  return useQuery({
    queryKey: queryKeys.series(deviceId ?? '', window.from, window.to, metric),
    enabled: !!deviceId,
    staleTime: 5 * 60_000,
    // Switching range or metric keeps the old plot on screen, dimmed, until
    // the new one lands — never a blank chart between two full ones.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        return await api.getHistorySeries(deviceId!, { ...window, metrics: [metric] });
      } catch (error) {
        // No readings yet is a state the chart renders, not an error.
        if (error instanceof ApiError && error.isNotFound) return null;
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

/**
 * The Activity feed. One request per page across every tank, replacing the
 * per-device fan-out the old app did on every launch.
 */
export function useAlertFeed() {
  return useInfiniteQuery({
    queryKey: queryKeys.alerts,
    queryFn: ({ pageParam }) => api.listAlerts({ limit: 30, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: 60_000,
  });
}

/**
 * Rename, optimistically: the row shows the new name before the server
 * confirms it, and snaps back if the call fails. An empty name is sent as
 * null, which clears it — the server then shows the hardware id instead.
 */
export function useRenameDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceId, name }: { deviceId: string; name: string }) =>
      api.renameDevice(deviceId, name.trim() || null),
    onMutate: async ({ deviceId, name }) => {
      await client.cancelQueries({ queryKey: queryKeys.devices });
      const previous = client.getQueryData<DeviceSummary[]>(queryKeys.devices);
      client.setQueryData<DeviceSummary[]>(queryKeys.devices, (old) =>
        old?.map((device) => (device.id === deviceId ? { ...device, name: name.trim() || device.id } : device))
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(queryKeys.devices, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.devices }),
  });
}

/** True when the server predates DELETE /user/devices/:id, not when a device is missing. */
export function isUnsupportedByServer(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405);
}

/**
 * Remove a device from this account. Not optimistic: a tank vanishing and
 * reappearing because the server said no would be worse than a short wait.
 */
export function useRemoveDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) => api.removeDevice(deviceId),
    onSuccess: (_result, deviceId) => {
      client.setQueryData<DeviceSummary[]>(queryKeys.devices, (old) =>
        old?.filter((device) => device.id !== deviceId)
      );
      client.removeQueries({ queryKey: ['device', deviceId] });
      void client.invalidateQueries({ queryKey: queryKeys.devices });
      void client.invalidateQueries({ queryKey: queryKeys.alerts });
    },
  });
}
