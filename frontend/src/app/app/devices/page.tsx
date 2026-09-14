import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { CaretRight, Drop, Plus, Warning } from '@phosphor-icons/react';
import { devicesResponseSchema, type DeviceSummary } from '@aquamind/contracts';
import { get } from '@/lib/api';
import { SingleTankHome } from './SingleTankHome';
import { ShellAction, usePageHeading } from '@/components/shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusDot } from '@/components/ui/status-dot';
import TankLevel from '@/components/TankLevel';
import MeasurementExportDialog from '@/components/MeasurementExportDialog';

type Device = DeviceSummary;

export default function TenantDevicesPage() {
  const navigate = useNavigate();
  const devices = useQuery({
    queryKey: ['devices'],
    queryFn: () => get('/api/v1/user/devices', devicesResponseSchema).then((r) => r.devices),
    refetchInterval: (query) => query.state.data?.length === 1 && document.visibilityState === 'visible' ? 15_000 : false,
    refetchIntervalInBackground: false,
  });

  const list = devices.data ?? [];
  const online = list.filter((d) => d.status === 'online').length;
  const needsAttention = list.filter((d) => d.active_alert).length;

  const singleDevice = list.length === 1 ? list[0] : null;
  usePageHeading(singleDevice ? 'My tank' : 'My tanks');

  return (
    <div className="space-y-4">
      <ShellAction>
        <Button
          size="sm"
          onClick={() => navigate('/app/onboarding')}
          className="hidden sm:inline-flex"
        >
          <Plus size={16} weight="bold" />
          Add device
        </Button>
      </ShellAction>

      <div className="workspace-page-intro flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="workspace-eyebrow">Your water, at a glance</p>
          <h1 className="text-display">{singleDevice ? singleDevice.name : 'My tanks'}<span className="workspace-title-dot">.</span></h1>
          <p className="mt-1 text-body text-ink-2">{singleDevice ? 'Your water, without the guesswork.' : 'A little clarity for every tank. Levels, connections and anything that needs you.'}</p>
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

      {list.length > 1 && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Tanks" value={list.length} />
          <StatTile
            label="Online"
            value={online}
            tone={online === list.length ? 'good' : 'default'}
          />
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
      ) : singleDevice ? (
        <SingleTankHome device={singleDevice} />
      ) : devices.isError && list.length === 0 ? null : list.length === 0 ? (
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
        <ul className="tank-collection grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((device) => (
            <li key={device.id}>
              <Link
                to={`/app/devices/${device.id}`}
                className="workspace-tank-card group"
              >
                <div className="workspace-tank-visual">
                  <TankLevel
                    level={device.has_tank_profile ? device.level_percent : null}
                    alert={device.active_alert}
                    showLabel={false}
                    stale={device.level_percent_stale || device.status !== 'online'}
                    animated={false}
                  />
                </div>

                <div className="workspace-tank-details min-w-0 flex-1">
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
                    <p className="mt-2 text-caption text-brand">
                      {device.has_tank_profile ? 'Awaiting a reading' : 'Set up your tank'}
                    </p>
                  )}
                  {device.has_tank_profile &&
                    device.level_percent != null &&
                    device.level_percent_stale && (
                      <p className="mt-1 text-caption text-ink-3">Last known level</p>
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
                  className="workspace-tank-arrow shrink-0 text-ink-3"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
