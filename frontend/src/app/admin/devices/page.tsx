import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, MagnifyingGlass } from '@phosphor-icons/react';
import { AppShell } from '@/components/shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusDot } from '@/components/ui/status-dot';
import MeasurementExportDialog from '@/components/MeasurementExportDialog';
import { relativeTime, timeSortValue } from '@/lib/time';
import { CreateDeviceDialog } from './CreateDeviceDialog';
import {
  errorMessage,
  useAdminDevices,
  useAdminTenants,
  type AdminDevice,
} from '../_shared/useAdminData';

export default function AdminDevicesPage() {
  const navigate = useNavigate();
  const devices = useAdminDevices();
  const tenants = useAdminTenants();
  const [query, setQuery] = useState('');

  const list = devices.data ?? [];
  const online = list.filter((d) => d.status === 'online').length;
  const offline = list.filter((d) => d.status !== 'online').length;
  const assignedTenants = new Set(list.map((d) => d.tenant_id)).size;
  const totalVolume = list.reduce((sum, d) => sum + (Number(d.current_volume) || 0), 0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((device) =>
      [device.name, device.device_id, device.tenant_name, device.status, device.firmware_version]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [list, query]);

  const columns: Column<AdminDevice>[] = [
    {
      key: 'name',
      header: 'Device',
      primary: true,
      sortValue: (d) => d.name || d.device_id,
      cell: (d) => (
        <div className="min-w-0">
          <div className="truncate text-label text-ink-1">{d.name || d.device_id}</div>
          <div className="truncate font-mono text-caption text-ink-3">{d.device_id}</div>
        </div>
      ),
    },
    {
      key: 'tenant',
      header: 'Tenant',
      sortValue: (d) => d.tenant_name,
      cell: (d) => <span className="truncate text-body text-ink-2">{d.tenant_name || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (d) => d.status,
      cell: (d) => (
        <StatusDot
          status={d.status === 'online' ? 'online' : 'offline'}
          label={d.status === 'online' ? 'Online' : 'Offline'}
        />
      ),
    },
    {
      key: 'firmware',
      header: 'Firmware',
      sortValue: (d) => d.firmware_version,
      cell: (d) =>
        d.firmware_version ? (
          <Badge variant="neutral" className="font-mono">
            {d.firmware_version}
          </Badge>
        ) : (
          <span className="text-ink-3">Unknown</span>
        ),
    },
    {
      key: 'volume',
      header: 'Volume',
      align: 'right',
      sortValue: (d) => (d.current_volume == null ? null : Number(d.current_volume)),
      cell: (d) =>
        d.current_volume == null ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className="tnum">{Number(d.current_volume).toFixed(0)} L</span>
        ),
    },
    {
      key: 'last_seen',
      header: 'Last seen',
      align: 'right',
      sortValue: (d) => timeSortValue(d.last_seen),
      cell: (d) => (
        <span className="whitespace-nowrap text-ink-2">{relativeTime(d.last_seen)}</span>
      ),
    },
  ];

  return (
    <AppShell variant="admin" title="Devices">
      <div className="space-y-4">
        <PageHeader
          title="Devices"
          description="Provisioned sensors, tenant ownership and reporting state."
          actions={
            <>
              <MeasurementExportDialog
                devices={list.map((device) => ({
                  id: device.device_id,
                  name: device.name || device.device_id,
                  context: device.tenant_name,
                }))}
                endpoint="/api/v1/admin/measurements/export"
              />
              <CreateDeviceDialog tenants={tenants.data ?? []} />
            </>
          }
        />

        {devices.isError && (
          <Alert variant="critical">
            <AlertTitle>Couldn&apos;t load devices</AlertTitle>
            <AlertDescription>{errorMessage(devices.error, 'Please try again.')}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatTile label="Devices" value={list.length} loading={devices.isLoading} />
          <StatTile label="Online" value={online} tone="good" loading={devices.isLoading} />
          <StatTile
            label="Offline"
            value={offline}
            tone={offline > 0 ? 'critical' : 'default'}
            loading={devices.isLoading}
          />
          <StatTile label="Tenants" value={assignedTenants} loading={devices.isLoading} />
        </div>

        <div className="relative">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, ID, tenant or firmware"
            className="pl-9"
            aria-label="Search devices"
          />
        </div>

        <DataTable
          rows={filtered}
          columns={columns}
          getRowKey={(d) => d.id}
          onRowClick={(d) => navigate(`/admin/devices/${d.device_id}`)}
          loading={devices.isLoading}
          initialSort={{ key: 'last_seen', direction: 'desc' }}
          caption="Provisioned devices"
          empty={
            <EmptyState
              icon={Cpu}
              title={query ? 'No devices match that search' : 'No devices yet'}
              description={
                query
                  ? 'Try a different name, ID or tenant.'
                  : 'Create a device to hand a token to a sensor.'
              }
            />
          }
        />

        {totalVolume > 0 && (
          <p className="px-1 text-caption tnum text-ink-3">
            {filtered.length} of {list.length} shown · {totalVolume.toFixed(0)} L stored across the
            fleet
          </p>
        )}
      </div>
    </AppShell>
  );
}
