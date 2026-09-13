import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Warning } from '@phosphor-icons/react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import TankLevel from '@/components/TankLevel';
import TankDiagram from '@/components/tank-setup/TankDiagram';
import { UsageBars } from '@/components/charts/UsageBars';
import { LiveIndicator } from './LiveIndicator';
import { MiniHistory } from './MiniHistory';
import {
  formatReading,
  useAlerts,
  useCurrent,
  useDevice,
  useTankProfile,
  useUsage,
} from './useDevice';

/** One screenful: where the tank is right now, plus the last day at a glance. */
export default function OverviewTab() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const current = useCurrent(deviceId);
  const device = useDevice(deviceId);
  const profile = useTankProfile(deviceId);
  const alerts = useAlerts(deviceId);
  const usage = useUsage(deviceId, 30);

  const active = alerts.data?.find(
    (a) => !a.acknowledged && (a.type === 'leak_detected' || a.type === 'tank_low')
  );
  const tankAlert = active ? (active.type === 'leak_detected' ? 'leak' : 'low') : null;
  const reading = current.data;
  const loading = current.isLoading || profile.isLoading;
  const stale = Boolean(
    reading?.level_percent_stale || (device.data && device.data.status !== 'online')
  );

  // The usage card reads `days` and `totals` together, so narrow once here.
  // api.get's generic is a compile-time assertion rather than a runtime check,
  // so an unexpected response shape should collapse this card, not the page.
  const usageSummary = usage.data?.days?.length && usage.data.totals ? usage.data : null;

  return (
    <div className="space-y-4">
      {active && (
        <Alert variant={tankAlert === 'leak' ? 'critical' : 'warning'}>
          <AlertTitle>{tankAlert === 'leak' ? 'Possible leak' : 'Level is low'}</AlertTitle>
          <AlertDescription>{active.message ?? 'Check the tank.'}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col items-center gap-4 pt-5">
          {loading ? (
            <Skeleton className="h-72 w-64" />
          ) : profile.data && reading?.level_percent != null ? (
            <>
              <div className="w-60 sm:w-72">
                <TankLevel
                  level={reading.level_percent}
                  alert={tankAlert}
                  shape={profile.data.shape}
                  stale={stale}
                />
              </div>
              {reading.level_percent_stale && (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunk px-2.5 py-1 text-caption text-ink-2">
                  <Warning size={13} weight="fill" aria-hidden />
                  Last known
                  {reading.level_percent_as_of
                    ? ` · ${new Date(reading.level_percent_as_of).toLocaleString()}`
                    : ''}
                </p>
              )}
              <LiveIndicator
                timestamp={reading.timestamp}
                fetching={current.isFetching}
                stale={stale}
              />
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-48">
                <TankLevel level={null} showLabel={false} animated={false} />
              </div>
              <p className="text-body text-ink-2">
                {profile.data
                  ? 'No sensor reading yet.'
                  : 'Set up your tank to see accurate levels.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="Level"
          value={formatReading(reading?.level_percent)}
          unit="%"
          loading={loading}
        />
        <StatTile
          label="Volume"
          value={formatReading(reading?.volume_l)}
          unit="L"
          loading={loading}
        />
        <StatTile
          label="Temp"
          value={formatReading(reading?.temperature_c, 1)}
          unit="°C"
          loading={loading}
        />
        <StatTile
          label="Battery"
          value={formatReading(reading?.battery_v, 2)}
          unit="V"
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-label text-ink-2">Last 24 hours</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="history">
              Browse history
              <ArrowRight size={15} />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="px-2">
          <MiniHistory deviceId={deviceId} />
        </CardContent>
      </Card>

      {/* Usage history, from the nightly aggregation the app never surfaced. */}
      {usageSummary && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-label text-ink-2">Daily usage</CardTitle>
              <p className="mt-0.5 text-caption text-ink-3">
                Last {usageSummary.totals.days_with_data} days with readings
              </p>
            </div>
            {usageSummary.totals.daily_average_l != null && (
              <div className="text-right">
                <p className="text-metric-sm tnum text-ink-1">
                  {Math.round(usageSummary.totals.daily_average_l)}
                  <span className="text-label text-ink-3"> L</span>
                </p>
                <p className="text-caption text-ink-3">per day</p>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <UsageBars days={usageSummary.days} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-sm bg-series-volume" />
                Litres used
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
                {usageSummary.totals.refill_events} refill
                {usageSummary.totals.refill_events === 1 ? '' : 's'}
              </span>
              {usageSummary.totals.leak_days > 0 && (
                <span className="inline-flex items-center gap-1.5 text-critical-text">
                  <span aria-hidden className="h-2 w-2 rounded-sm bg-critical" />
                  {usageSummary.totals.leak_days} day
                  {usageSummary.totals.leak_days === 1 ? '' : 's'} flagged
                </span>
              )}
              {usageSummary.totals.days_aggregated < usageSummary.totals.days_with_data && (
                <span>
                  {usageSummary.totals.days_with_data - usageSummary.totals.days_aggregated} day
                  {usageSummary.totals.days_with_data - usageSummary.totals.days_aggregated === 1
                    ? ''
                    : 's'}{' '}
                  pending overnight totals
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {profile.data && (
        <div className="flex items-center justify-center gap-3 pb-2 text-caption text-ink-3">
          <TankDiagram
            shape={profile.data.shape}
            unitCount={profile.data.parallel_unit_count}
            className="h-10"
          />
          <span>
            {profile.data.parallel_unit_count > 1
              ? `${profile.data.parallel_unit_count} tanks · `
              : ''}
            {profile.data.height_cm}cm tall · ~{profile.data.total_capacity_l.toFixed(0)}L capacity
          </span>
        </div>
      )}
    </div>
  );
}
