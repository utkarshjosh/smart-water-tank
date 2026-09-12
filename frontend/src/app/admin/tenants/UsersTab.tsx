import { useState } from 'react';
import { CheckCircle, MagnifyingGlass, Users } from '@phosphor-icons/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { relativeTime, timeSortValue } from '@/lib/time';
import { errorMessage, useAdminTenants } from '../_shared/useAdminData';
import {
  ROLE_LABEL,
  ROLE_OPTIONS,
  isTenantless,
  type DatabaseUser,
  type FirebaseUser,
  type UserRole,
} from './types';
import {
  useDatabaseUsers,
  useFirebaseUsers,
  useLinkFirebaseUser,
  useUpdateUserRole,
  useUpdateUserTenant,
} from './useUsers';

export function UsersTab() {
  const tenants = useAdminTenants();
  const users = useDatabaseUsers(true);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const firebase = useFirebaseUsers(search, searchOpen);

  const updateRole = useUpdateUserRole();
  const updateTenant = useUpdateUserTenant();
  const link = useLinkFirebaseUser();

  // Pending per-row selections for the link form, keyed by Firebase uid.
  const [draftRole, setDraftRole] = useState<Record<string, UserRole>>({});
  const [draftTenant, setDraftTenant] = useState<Record<string, string>>({});

  const tenantList = tenants.data ?? [];

  const columns: Column<DatabaseUser>[] = [
    {
      key: 'user',
      header: 'User',
      primary: true,
      sortValue: (u) => u.name || u.email,
      cell: (u) => (
        <div className="min-w-0">
          <div className="truncate text-label text-ink-1">{u.name || u.email}</div>
          {u.name && <div className="truncate text-caption text-ink-3">{u.email}</div>}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortValue: (u) => u.role,
      cell: (u) => (
        <Select
          value={u.role}
          onValueChange={(value: UserRole) => updateRole.mutate({ userId: u.id, role: value })}
          disabled={updateRole.isPending}
        >
          <SelectTrigger className="h-9 w-[168px]" aria-label={`Role for ${u.email}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'tenant',
      header: 'Tenant',
      sortValue: (u) => u.tenant_name,
      cell: (u) =>
        isTenantless(u.role) ? (
          <Badge variant="brand">Platform-wide</Badge>
        ) : (
          <Select
            value={u.tenant_id ?? ''}
            onValueChange={(value) => updateTenant.mutate({ userId: u.id, tenantId: value })}
            disabled={updateTenant.isPending}
          >
            <SelectTrigger className="h-9 w-[180px]" aria-label={`Tenant for ${u.email}`}>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              {tenantList.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
    },
    {
      key: 'created',
      header: 'Joined',
      align: 'right',
      desktopOnly: true,
      sortValue: (u) => timeSortValue(u.created_at),
      cell: (u) => (
        <span className="whitespace-nowrap text-ink-2">{relativeTime(u.created_at)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {users.isError && (
        <Alert variant="critical">
          <AlertTitle>Couldn&apos;t load users</AlertTitle>
          <AlertDescription>{errorMessage(users.error, 'Please try again.')}</AlertDescription>
        </Alert>
      )}

      <DataTable
        rows={users.data ?? []}
        columns={columns}
        getRowKey={(u) => u.id}
        loading={users.isLoading}
        initialSort={{ key: 'user' }}
        caption="Linked users"
        empty={
          <EmptyState
            icon={Users}
            title="No linked users"
            description="Search Firebase below to link an existing account to a tenant."
          />
        }
      />

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-label text-ink-2">Link a Firebase account</CardTitle>
            <CardDescription>
              Accounts that signed in but are not attached to a tenant yet.
            </CardDescription>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setSearchOpen(!searchOpen)}>
            {searchOpen ? 'Hide' : 'Search'}
          </Button>
        </CardHeader>

        {searchOpen && (
          <CardContent className="space-y-3">
            <div className="relative">
              <MagnifyingGlass
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Firebase by email or name"
                className="pl-9"
                aria-label="Search Firebase accounts"
              />
            </div>

            {firebase.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : firebase.isError ? (
              <Alert variant="critical">
                <AlertTitle>Search failed</AlertTitle>
                <AlertDescription>
                  {errorMessage(firebase.error, 'Please try again.')}
                </AlertDescription>
              </Alert>
            ) : !firebase.data?.length ? (
              <p className="py-6 text-center text-body text-ink-3">
                No Firebase accounts match that search.
              </p>
            ) : (
              <ul className="space-y-2">
                {firebase.data.map((user) => (
                  <FirebaseUserRow
                    key={user.uid}
                    user={user}
                    tenants={tenantList}
                    role={draftRole[user.uid] ?? user.role ?? 'user'}
                    tenantId={draftTenant[user.uid] ?? user.tenant_id ?? ''}
                    busy={link.isPending}
                    onRoleChange={(role) => setDraftRole((d) => ({ ...d, [user.uid]: role }))}
                    onTenantChange={(id) => setDraftTenant((d) => ({ ...d, [user.uid]: id }))}
                    onSave={(role, tenantId) =>
                      link.mutate(
                        { user, role, tenantId },
                        {
                          onSuccess: () => {
                            setDraftRole(({ [user.uid]: _r, ...rest }) => rest);
                            setDraftTenant(({ [user.uid]: _t, ...rest }) => rest);
                          },
                        }
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function FirebaseUserRow({
  user,
  tenants,
  role,
  tenantId,
  busy,
  onRoleChange,
  onTenantChange,
  onSave,
}: {
  user: FirebaseUser;
  tenants: { id: string; name: string }[];
  role: UserRole;
  tenantId: string;
  busy: boolean;
  onRoleChange: (role: UserRole) => void;
  onTenantChange: (tenantId: string) => void;
  onSave: (role: UserRole, tenantId: string | null) => void;
}) {
  // A super admin is tenantless by design, so it is the one role that can be
  // saved without picking a tenant.
  const needsTenant = !isTenantless(role) && !tenantId;

  return (
    <li className="rounded-lg border border-hairline p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-label text-ink-1">
            {user.displayName || user.email || user.uid}
          </p>
          <p className="truncate text-caption text-ink-3">{user.email ?? 'No email address'}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {user.is_linked ? (
              <Badge variant="good">
                <CheckCircle size={12} weight="fill" aria-hidden />
                Linked{user.tenant_name ? ` · ${user.tenant_name}` : ''}
              </Badge>
            ) : (
              <Badge variant="neutral">Not linked</Badge>
            )}
            {user.role && <Badge variant="outline">{ROLE_LABEL[user.role] ?? user.role}</Badge>}
            {user.disabled && <Badge variant="critical">Disabled</Badge>}
            {!user.emailVerified && <Badge variant="warning">Email unverified</Badge>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={role} onValueChange={(v: UserRole) => onRoleChange(v)} disabled={busy}>
            <SelectTrigger
              className="h-9 w-[168px]"
              aria-label={`Role for ${user.email ?? user.uid}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!isTenantless(role) && (
            <Select value={tenantId} onValueChange={onTenantChange} disabled={busy}>
              <SelectTrigger
                className="h-9 w-[180px]"
                aria-label={`Tenant for ${user.email ?? user.uid}`}
              >
                <SelectValue placeholder="Pick a tenant" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            size="sm"
            onClick={() => onSave(role, isTenantless(role) ? null : tenantId)}
            loading={busy}
            disabled={needsTenant || !user.email}
          >
            {user.is_linked ? 'Update' : 'Link'}
          </Button>
        </div>
      </div>

      {!user.email && (
        <p className="mt-2 text-caption text-warning-text">
          This account has no email address and cannot be linked.
        </p>
      )}
      {needsTenant && user.email && (
        <p className="mt-2 text-caption text-ink-3">Pick a tenant to link this account.</p>
      )}
    </li>
  );
}
