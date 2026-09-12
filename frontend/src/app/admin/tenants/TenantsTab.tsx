import { useState } from 'react';
import { Buildings, Plus } from '@phosphor-icons/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatTile } from '@/components/ui/stat-tile';
import { relativeTime, timeSortValue } from '@/lib/time';
import { errorMessage, useAdminTenants, type AdminTenant } from '../_shared/useAdminData';
import { useCreateTenant } from './useUsers';

export function TenantsTab() {
  const tenants = useAdminTenants();
  const createTenant = useCreateTenant();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');

  const list = tenants.data ?? [];
  const totalDevices = list.reduce((sum, t) => sum + t.device_count, 0);
  const totalUsers = list.reduce((sum, t) => sum + t.user_count, 0);

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
      cell: (t) => <span className="truncate text-label text-ink-1">{t.name}</span>,
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
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Tenants" value={list.length} loading={tenants.isLoading} />
        <StatTile label="Devices" value={totalDevices} loading={tenants.isLoading} />
        <StatTile label="Users" value={totalUsers} loading={tenants.isLoading} />
      </div>

      {tenants.isError && (
        <Alert variant="critical">
          <AlertTitle>Couldn&apos;t load tenants</AlertTitle>
          <AlertDescription>{errorMessage(tenants.error, 'Please try again.')}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
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
        caption="Tenants"
        empty={
          <EmptyState
            icon={Buildings}
            title="No tenants yet"
            description="A tenant owns devices and users. Create one to start provisioning."
          />
        }
      />
    </div>
  );
}
