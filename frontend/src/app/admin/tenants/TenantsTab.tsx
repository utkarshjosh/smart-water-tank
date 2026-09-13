import { useState } from 'react';
import {
  Archive,
  ArrowCounterClockwise,
  Buildings,
  Eye,
  EyeSlash,
  Plus,
} from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatTile } from '@/components/ui/stat-tile';
import { relativeTime, timeSortValue } from '@/lib/time';
import { errorMessage, useAdminTenants, type AdminTenant } from '../_shared/useAdminData';
import { ArchiveTenantDialog } from '../_shared/ArchiveDialog';
import { useCreateTenant } from './useUsers';

export function TenantsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<AdminTenant | null>(null);

  const tenants = useAdminTenants(showArchived);
  const createTenant = useCreateTenant();

  const restore = useMutation({
    mutationFn: (tenantId: string) => api.post(`/api/v1/admin/tenants/${tenantId}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success('Tenant restored');
    },
    onError: (err) =>
      toast.error("Couldn't restore that tenant", {
        description: errorMessage(err, 'Please try again.'),
      }),
  });

  const list = tenants.data ?? [];
  // The tiles count the live fleet, so they ignore archived rows even while
  // those rows are on screen - otherwise turning on "show archived" appears to
  // create tenants out of nowhere.
  const active = list.filter((t) => !t.archived_at);
  const totalDevices = active.reduce((sum, t) => sum + t.device_count, 0);
  const totalUsers = active.reduce((sum, t) => sum + t.user_count, 0);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    createTenant.mutate(name, {
      onSuccess: () => {
        setName('');
        setShowForm(false);
      },
    });
  };

  const columns: Column<AdminTenant>[] = [
    {
      key: 'name',
      header: 'Tenant',
      primary: true,
      sortValue: (t) => t.name,
      cell: (t) => (
        <span className="flex items-center gap-2">
          <span className="truncate text-label text-ink-1">{t.name}</span>
          {t.archived_at && (
            <Badge variant="neutral">
              <Archive size={11} weight="bold" aria-hidden />
              Archived
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'devices',
      header: 'Devices',
      align: 'right',
      sortValue: (t) => t.device_count,
      cell: (t) => <span className="tnum">{t.device_count}</span>,
    },
    {
      key: 'users',
      header: 'Users',
      align: 'right',
      sortValue: (t) => t.user_count,
      cell: (t) => <span className="tnum">{t.user_count}</span>,
    },
    {
      key: 'created',
      header: 'Created',
      align: 'right',
      sortValue: (t) => timeSortValue(t.created_at),
      cell: (t) => (
        <span className="whitespace-nowrap text-ink-2">{relativeTime(t.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      actions: true,
      hug: true,
      cell: (t) =>
        t.archived_at ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => restore.mutate(t.id)}
            loading={restore.isPending && restore.variables === t.id}
          >
            <ArrowCounterClockwise size={14} />
            Restore
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setArchiving(t)}>
            <Archive size={14} />
            Archive
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Tenants" value={active.length} loading={tenants.isLoading} />
        <StatTile label="Devices" value={totalDevices} loading={tenants.isLoading} />
        <StatTile label="Users" value={totalUsers} loading={tenants.isLoading} />
      </div>

      {tenants.isError && (
        <Alert variant="critical">
          <AlertTitle>Couldn&apos;t load tenants</AlertTitle>
          <AlertDescription>{errorMessage(tenants.error, 'Please try again.')}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? <EyeSlash size={15} /> : <Eye size={15} />}
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Button>
        <Button
          size="sm"
          variant={showForm ? 'secondary' : 'primary'}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? (
            'Cancel'
          ) : (
            <>
              <Plus size={16} weight="bold" />
              New tenant
            </>
          )}
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="tenant-name">Tenant name</Label>
            <Input
              id="tenant-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Joshi Home"
              disabled={createTenant.isPending}
              autoFocus
              required
            />
          </div>
          <Button type="submit" loading={createTenant.isPending} disabled={!name.trim()}>
            Create tenant
          </Button>
        </form>
      )}

      <DataTable
        rows={list}
        columns={columns}
        getRowKey={(t) => t.id}
        loading={tenants.isLoading}
        initialSort={{ key: 'devices', direction: 'desc' }}
        rowClassName={(t) => (t.archived_at ? 'opacity-60' : undefined)}
        caption="Tenants"
        empty={
          <EmptyState
            icon={Buildings}
            title="No tenants yet"
            description="A tenant owns devices and users. Create one to start provisioning."
          />
        }
      />

      <ArchiveTenantDialog
        tenantId={archiving?.id ?? null}
        tenantName={archiving?.name ?? ''}
        open={archiving != null}
        onOpenChange={(next) => !next && setArchiving(null)}
      />
    </div>
  );
}
