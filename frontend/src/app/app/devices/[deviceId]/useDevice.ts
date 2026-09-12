import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { TankProfileDto } from '@/components/tank-setup/TankSetupWizard';

export interface DeviceInfo {
  id: string;
  name: string;
  status: string;
  firmware_version: string | null;
  last_seen: string | null;
}

export interface CurrentMeasurement {
  level_cm: number | null;
  volume_l: number | null;
  level_percent: number | null;
  level_percent_stale: boolean;
  level_percent_as_of: string | null;
  temperature_c: number | null;
  battery_v: number | null;
  timestamp: string;
}

export interface AlertItem {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string | null;
  acknowledged: boolean;
  created_at: string;
}

export interface ConfigDto {
  measurement_interval_ms: number;
  report_interval_ms: number;
  tank_low_threshold_pct: number | null;
  tank_full_threshold_pct: number | null;
  battery_low_threshold_v: number | null;
}

export interface FirmwareStatus {
  current_version: string | null;
  latest_known_version: string | null;
  last_checked_at: string | null;
}

const get = <T>(url: string) => api.get<T>(url).then((r) => r.data);

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
    queryFn: () => get<DeviceInfo>(`/api/v1/user/devices/${id}`),
  });

/**
 * Live readings. Polls only while the tab is visible - a backgrounded phone
 * should not keep waking the radio for a chart nobody is looking at.
 */
export const useCurrent = (id?: string) =>
  useQuery({
    queryKey: deviceKeys.current(id),
    enabled: Boolean(id),
    queryFn: () => get<CurrentMeasurement>(`/api/v1/user/devices/${id}/current`),
    refetchInterval: () => (document.visibilityState === 'visible' ? 15_000 : false),
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

export const useTankProfile = (id?: string) =>
  useQuery({
    queryKey: deviceKeys.profile(id),
    enabled: Boolean(id),
    queryFn: () =>
      get<{ profile: TankProfileDto | null }>(`/api/v1/user/devices/${id}/tank-profile`).then(
        (d) => d.profile
      ),
  });

export const useAlerts = (id?: string) =>
  useQuery({
    queryKey: deviceKeys.alerts(id),
    enabled: Boolean(id),
    queryFn: () =>
      get<{ alerts: AlertItem[] }>(`/api/v1/user/devices/${id}/alerts`).then((d) => d.alerts ?? []),
  });

export const useDeviceConfig = (id?: string) =>
  useQuery({
    queryKey: deviceKeys.config(id),
    enabled: Boolean(id),
    queryFn: () => get<ConfigDto>(`/api/v1/user/devices/${id}/config`),
  });

export const useFirmwareStatus = (id?: string) =>
  useQuery({
    queryKey: deviceKeys.firmware(id),
    enabled: Boolean(id),
    queryFn: () => get<FirmwareStatus>(`/api/v1/user/devices/${id}/firmware-status`),
  });

export const formatReading = (value: number | null | undefined, digits = 0) =>
  value == null ? null : Number(value).toFixed(digits);

export interface UsageDay {
  date: string;
  used_l: number | null;
  min_l: number | null;
  avg_l: number | null;
  max_l: number | null;
  refill_events: number;
  leak_suspected: boolean;
  readings: number;
}

export interface UsageResponse {
  device_id: string;
  from: string;
  to: string;
  has_tank_profile: boolean;
  capacity_l: number | null;
  days: UsageDay[];
  totals: {
    used_l: number | null;
    daily_average_l: number | null;
    refill_events: number;
    leak_days: number;
    days_with_data: number;
    days_aggregated: number;
  };
}

export const useUsage = (id?: string, days = 30) =>
  useQuery({
    queryKey: ['device', id, 'usage', days],
    enabled: Boolean(id),
    queryFn: () => get<UsageResponse>(`/api/v1/user/devices/${id}/usage?days=${days}`),
  });

export interface DeviceShare {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  via: 'tenant' | 'share';
  revocable: boolean;
  redundant?: boolean;
  shared_at?: string;
}

export const useDeviceShares = (id?: string) =>
  useQuery({
    queryKey: ['device', id, 'shares'],
    enabled: Boolean(id),
    queryFn: () =>
      get<{ device_id: string; members: DeviceShare[]; shares: DeviceShare[] }>(
        `/api/v1/user/devices/${id}/shares`
      ),
  });
