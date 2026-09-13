import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowCounterClockwise,
  Cpu,
  Eye,
  EyeSlash,
  MagnifyingGlass,
  Power,
} from '@phosphor-icons/react';
import api from '@/lib/api';
import { usePageHeading } from '@/components/shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
  usePageHeading('Devices');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [decommissioning, setDecommissioning] = useState<AdminDevice | null>(null);

  const devices = useAdminDevices(showArchived);
  const tenants = useAdminTenants();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin'] });

  // Decommission, not delete: readings stay and the hardware ID stays claimed,
  // so a retired sensor cannot silently re-pair itself.
  const decommission = useMutation({
    mutationFn: (deviceId: string) => api.delete(`/api/v1/admin/devices/${deviceId}`),
    onSuccess: (res) => {
      invalidate();
      setDecommissioning(null);
      const retained = (res.data as { measurements_retained?: number })?.measurements_retained;
      toast.success('Device decommissioned', {
        description:
          retained != null
            ? `${retained.toLocaleString()} readings retained. It can be restored.`
            : 'It can be restored.',
      });
    },
    onError: (err) =>
      toast.error("Couldn't decommission that device", {
        description: errorMessage(err, 'Please try again.'),
      }),
  });

  const restore = useMutation({
    mutationFn: (deviceId: string) => api.post(`/api/v1/admin/devices/${deviceId}/restore`),
    onSuccess: () => {
      invalidate();
      toast.success('Device restored');
    },
    onError: (err) =>
      toast.error("Couldn't restore that device", {
        description: errorMessage(err, 'Please try again.'),
      }),
  });

  const list = devices.data ?? [];
  // Decommissioned rows are visible but not part of the fleet, so they stay out
  // of the tiles - otherwise "show decommissioned" appears to bring devices
  // online and inflates the offline count with hardware nobody is waiting on.
  const active = list.filter((d) => !d.archived_at);
  const online = active.filter((d) => d.status === 'online').length;
  const offline = active.filter((d) => d.status !== 'online').length;
  const assignedTenants = new Set(active.map((d) => d.tenant_id)).size;
  const totalVolume = active.reduce((sum, d) => sum + (Number(d.current_volume) || 0), 0);

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
      // Percentage hints so the name truncates instead of pushing the row
      // controls off the right edge of the table.
      width: '26%',
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
      width: '18%',
      sortValue: (d) => d.tenant_name,
      // block, so the width hint above actually clips a long tenant name
      // rather than the name setting the column's minimum width.
      cell: (d) => (
        <span className="block truncate text-body text-ink-2">{d.tenant_name || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (d) => d.status,
      // A decommissioned device is not offline - nothing is expecting it to
      // report - so it does not get an offline dot competing for attention.
      cell: (d) =>
        d.archived_at ? (
          <Badge variant="neutral" className="whitespace-nowrap">
            <Power size={11} weight="bold" aria-hidden />
            Decommissioned
          </Badge>
        ) : (
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
    {
      key: 'actions',
      header: '',
      align: 'right',
      actions: true,
      // Shrink-to-fit: without it the label competes with the data columns and
      // the button ends up clipped at the right edge of the table.
      hug: true,
      cell: (d) =>
        d.archived_at ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              restore.mutate(d.device_id);
            }}
            loading={restore.isPending && restore.variables === d.device_id}
          >
            <ArrowCounterClockwise size={14} />
            Restore
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              // The row itself navigates to the detail page.
              e.stopPropagation();
              setDecommissioning(d);
            }}
          >
            <Power size={14} />
            Decommission
          </Button>
        ),
    },
  ];

  return (
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
            <Button size="sm" variant="ghost" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? <EyeSlash size={15} /> : <Eye size={15} />}
              {showArchived ? 'Hide decommissioned' : 'Show decommissioned'}
            </Button>
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
        <StatTile label="Devices" value={active.length} loading={devices.isLoading} />
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
        rowClassName={(d) => (d.archived_at ? 'opacity-60' : undefined)}
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

      <ConfirmDialog
        open={decommissioning != null}
        onOpenChange={(next) => !next && setDecommissioning(null)}
        title={`Decommission ${decommissioning?.name || decommissioning?.device_id}?`}
        description="It leaves the fleet and its tenant loses access. Readings are kept, and it can be restored from this page."
        confirmLabel="Decommission"
        confirmIcon={<Power size={16} weight="bold" />}
        loading={decommission.isPending}
        onConfirm={() => decommissioning && decommission.mutate(decommissioning.device_id)}
      />

      {totalVolume > 0 && (
        <p className="px-1 text-caption tnum text-ink-3">
          {filtered.length} of {list.length} shown · {totalVolume.toFixed(0)} L stored across the
          fleet
        </p>
      )}
    </div>
  );
}
