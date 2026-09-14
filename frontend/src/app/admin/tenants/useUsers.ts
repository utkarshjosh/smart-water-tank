import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminUsersResponseSchema, firebaseUsersResponseSchema } from '@aquamind/contracts';
import api, { get } from '@/lib/api';
import { errorMessage } from '../_shared/useAdminData';
import type { FirebaseUser, UserRole } from './types';

const userKeys = {
  database: (includeArchived: boolean) => ['admin', 'users', { includeArchived }] as const,
  firebase: (search: string) => ['admin', 'users', 'firebase', search] as const,
};

export const useDatabaseUsers = (enabled: boolean, includeArchived = false) =>
  useQuery({
    queryKey: userKeys.database(includeArchived),
    enabled,
    queryFn: () =>
      get(`/api/v1/admin/users${includeArchived ? '?include_archived=true' : ''}`, adminUsersResponseSchema).then(
        (r) => r.users
      ),
  });

export const useFirebaseUsers = (search: string, enabled: boolean) =>
  useQuery({
    queryKey: userKeys.firebase(search),
    enabled,
    placeholderData: (previous) => previous,
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      params.append('limit', '50');
      return get(`/api/v1/admin/users/firebase?${params}`, firebaseUsersResponseSchema).then((r) => r.users);
    },
  });

/** Both lists change when a link or role changes, so both are invalidated. */
function useUserMutation<TVars>(
  fn: (vars: TVars) => Promise<unknown>,
  { success, failure }: { success: string; failure: string }
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      toast.success(success);
    },
    onError: (err) => toast.error(failure, { description: errorMessage(err, 'Please try again.') }),
  });
}

export const useLinkFirebaseUser = () =>
  useUserMutation(
    (vars: { user: FirebaseUser; role: UserRole; tenantId: string | null }) =>
      api.post('/api/v1/admin/users', {
        firebase_uid: vars.user.uid,
        email: vars.user.email,
        name: vars.user.displayName || undefined,
        role: vars.role,
        ...(vars.role === 'super_admin' ? {} : { tenant_id: vars.tenantId }),
      }),
    { success: 'User linked', failure: "Couldn't link that user" }
  );

export const useUpdateUserRole = () =>
  useUserMutation(
    (vars: { userId: string; role: UserRole }) =>
      api.put(`/api/v1/admin/users/${vars.userId}/role`, { role: vars.role }),
    { success: 'Role updated', failure: "Couldn't update the role" }
  );

export const useUpdateUserTenant = () =>
  useUserMutation(
    (vars: { userId: string; tenantId: string }) =>
      api.put(`/api/v1/admin/users/${vars.userId}/tenant`, { tenant_id: vars.tenantId }),
    { success: 'Tenant updated', failure: "Couldn't move that user" }
  );

/**
 * Deactivating blocks sign-in without deleting the account, so alerts the user
 * acknowledged keep their attribution. The endpoints have always been there;
 * until now nothing in the console called them.
 */
export const useDeactivateUser = () =>
  useUserMutation((userId: string) => api.delete(`/api/v1/admin/users/${userId}`), {
    success: 'User deactivated',
    failure: "Couldn't deactivate that user",
  });

export const useRestoreUser = () =>
  useUserMutation((userId: string) => api.post(`/api/v1/admin/users/${userId}/restore`), {
    success: 'User reactivated',
    failure: "Couldn't reactivate that user",
  });

export const useCreateTenant = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post('/api/v1/admin/tenants', { name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      toast.success('Tenant created');
    },
    onError: (err) =>
      toast.error("Couldn't create the tenant", {
        description: errorMessage(err, 'Please try again.'),
      }),
  });
};
