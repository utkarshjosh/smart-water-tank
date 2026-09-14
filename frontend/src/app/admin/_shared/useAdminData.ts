import { useQuery } from '@tanstack/react-query';
import { adminDevicesResponseSchema, adminSummarySchema, adminTenantsResponseSchema } from '@aquamind/contracts';
import { get } from '@/lib/api';

// Types come from the contract, re-exported under the names the admin pages use.
export type { AdminDevice, AdminSummary, AdminTenant } from '@aquamind/contracts';

/** The dashboard and analytics pages read the same summary endpoint. */
export const useAdminSummary = () =>
  useQuery({
    queryKey: ['admin', 'summary'],
    queryFn: () => get('/api/v1/admin/analytics/summary', adminSummarySchema),
  });

export const useAdminDevices = (includeArchived = false) =>
  useQuery({
    queryKey: ['admin', 'devices', { includeArchived }],
    queryFn: () =>
      get(`/api/v1/admin/devices${includeArchived ? '?include_archived=true' : ''}`, adminDevicesResponseSchema).then(
        (d) => d.devices
      ),
  });

export const useAdminTenants = (includeArchived = false) =>
  useQuery({
    queryKey: ['admin', 'tenants', { includeArchived }],
    queryFn: () =>
      get(`/api/v1/admin/tenants${includeArchived ? '?include_archived=true' : ''}`, adminTenantsResponseSchema).then(
        (d) => d.tenants
      ),
  });

export const errorMessage = (err: unknown, fallback: string) => {
  const response = (err as { response?: { data?: { error?: string } } })?.response;
  return response?.data?.error ?? (err instanceof Error ? err.message : fallback);
};
