import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { CaretRight, Drop, Plus, SlidersHorizontal, Warning } from '@phosphor-icons/react';
import api from '@/lib/api';
import { AppShell } from '@/components/shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusDot } from '@/components/ui/status-dot';
import TankLevel from '@/components/TankLevel';
import MeasurementExportDialog from '@/components/MeasurementExportDialog';

interface Device {
  id: string;
  name: string;
  status: string;
  firmware_version: string;
  last_seen: string;
  current_volume: number | null;
  level_percent: number | null;
  has_tank_profile: boolean;
  last_measurement: string | null;
  active_alert: 'leak' | 'low' | null;
}

export default function TenantDevicesPage() {
  const navigate = useNavigate();
  const devices = useQuery({
    queryKey: ['devices'],
    queryFn: () =>
      api.get<{ devices: Device[] }>('/api/v1/user/devices').then((r) => r.data.devices),
  });

  const list = devices.data ?? [];
  const online = list.filter((d) => d.status === 'online').length;
  const needsAttention = list.filter((d) => d.active_alert).length;

  return (
    <AppShell
      variant="tenant"
      title="My tanks"
      action={
        <Button size="sm" onClick={() => navigate('/app/onboarding')} className="hidden sm:inline-flex">
          <Plus size={16} weight="bold" />
          Add device
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-display">My tanks</h1>
            <p className="mt-1 text-body text-ink-2">Live levels, alerts and setup state.</p>
          </div>
          {list.length > 0 && (
            <MeasurementExportDialog
              devices={list.map((d) => ({ id: d.id, name: d.name }))}
              endpoint="/api/v1/user/measurements/export"
            />
          )}
        </div>

        {devices.isError && (
          <Alert variant="critical">
            <AlertTitle>Couldn't load your devices</AlertTitle>
            <AlertDescription>
              {(devices.error as { message?: string })?.message ?? 'Please try again.'}
            </AlertDescription>
          </Alert>
        )}

        {list.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Tanks" value={list.length} />
            <StatTile label="Online" value={online} tone={online === list.length ? 'good' : 'default'} />
            <StatTile
              label="Attention"
              value={needsAttention}
              tone={needsAttention > 0 ? 'warning' : 'default'}
            />
          </div>
        )}

        {devices.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={Drop}
            title="No devices yet"
            description="Pair your first AquaMind sensor to start seeing live data."
            action={
              <Button onClick={() => navigate('/app/onboarding')}>
                <Plus size={16} weight="bold" />
                Pair your first device
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((device) => (
              <li key={device.id}>
                <Link
                  to={`/app/devices/${device.id}`}
                  className="group flex h-full items-center gap-4 rounded-lg border border-hairline bg-surface p-4 transition-[border-color,transform] duration-instant ease-out hover:border-line-strong active:scale-[0.99]"
                >
                  <div className="w-14 shrink-0">
                    {device.has_tank_profile && device.level_percent != null ? (
                      <TankLevel level={device.level_percent} alert={device.active_alert} showLabel={false} />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-line-strong text-ink-3">
                        <SlidersHorizontal size={18} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label text-ink-1">{device.name}</p>
                    <StatusDot
                      className="mt-1"
                      status={device.status === 'online' ? 'online' : 'offline'}
                      label={device.status === 'online' ? 'Online' : 'Offline'}
                    />
                    {device.has_tank_profile && device.level_percent != null ? (
                      <p className="mt-2 text-metric-sm tnum text-ink-1">
                        {Math.round(device.level_percent)}
                        <span className="text-label text-ink-3">%</span>
                        {device.current_volume != null && (
                          <span className="ml-2 text-caption text-ink-3">
                            {Number(device.current_volume).toFixed(0)}L
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="mt-2 text-caption text-brand">Set up your tank</p>
                    )}
                    {device.active_alert && (
                      <p className="mt-1 inline-flex items-center gap-1 text-caption text-warning-text">
                        <Warning size={13} weight="fill" aria-hidden />
                        {device.active_alert === 'leak' ? 'Possible leak' : 'Level low'}
                      </p>
                    )}
                  </div>

                  <CaretRight
                    size={16}
                    className="shrink-0 text-ink-3 transition-transform duration-instant ease-out group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
