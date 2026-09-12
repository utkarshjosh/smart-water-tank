import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface AdminSummary {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  total_tenants: number;
  recent_alerts_24h: number;
  measurements_today: number;
}

export interface AdminDevice {
  id: string;
  device_id: string;
  name: string;
  tenant_id: string;
  tenant_name: string;
  status: string;
  firmware_version: string;
  last_seen: string;
  current_volume: number | null;
  last_measurement: string | null;
  created_at: string;
}

export interface AdminTenant {
  id: string;
  name: string;
  created_at: string;
  device_count: number;
  user_count: number;
}

const get = <T>(url: string) => api.get<T>(url).then((r) => r.data);

/** The dashboard and analytics pages read the same summary endpoint. */
export const useAdminSummary = () =>
  useQuery({
    queryKey: ['admin', 'summary'],
    queryFn: () => get<AdminSummary>('/api/v1/admin/analytics/summary'),
  });

export const useAdminDevices = () =>
  useQuery({
    queryKey: ['admin', 'devices'],
    queryFn: () => get<{ devices: AdminDevice[] }>('/api/v1/admin/devices').then((d) => d.devices),
  });

export const useAdminTenants = () =>
  useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: () => get<{ tenants: AdminTenant[] }>('/api/v1/admin/tenants').then((d) => d.tenants),
  });

export const errorMessage = (err: unknown, fallback: string) => {
  const response = (err as { response?: { data?: { error?: string } } })?.response;
  return response?.data?.error ?? (err instanceof Error ? err.message : fallback);
};
