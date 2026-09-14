import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Warning } from '@phosphor-icons/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat-tile';
import TankLevel from '@/components/TankLevel';
import { UsageBars } from '@/components/charts/UsageBars';
import { useHistorySeries } from '@/lib/history';
import { estimateUsage } from '@/lib/usage-estimate';
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

export default function OverviewTab() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const current = useCurrent(deviceId);
  const device = useDevice(deviceId);
  const profile = useTankProfile(deviceId);
  const alerts = useAlerts(deviceId);
  const usage = useUsage(deviceId, 30);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  // Minute precision avoids refetching an entire day on every live reading.
  const today = useHistorySeries({
    deviceId,
    from: start.toISOString(),
    to: new Date(Math.max(+start + 1000, Math.floor(Date.now() / 60000) * 60000)).toISOString(),
    metrics: ['volume_l'],
    bucket: 'raw',
    enabled: Boolean(profile.data),
  });
  const todayUsed =
    today.isError || today.isPlaceholderData
      ? null
      : estimateUsage(today.data?.series.volume_l?.points ?? [], today.data?.truncated);
  const active = alerts.data?.find(
    (a) => !a.acknowledged && (a.type === 'leak_detected' || a.type === 'tank_low')
  );
  const tankAlert = active ? (active.type === 'leak_detected' ? 'leak' : 'low') : null;
  const reading = current.data;
  const loading = current.isLoading || profile.isLoading;
  const stale = Boolean(
    reading?.level_percent_stale || (device.data && device.data.status !== 'online')
  );
  const usageSummary = usage.data?.days?.length && usage.data.totals ? usage.data : null;

  return (
    <div className="device-overview">
      {active && (
        <Link
          to="alerts"
          className={`device-alert-strip ${tankAlert === 'leak' ? 'bg-critical-wash text-critical-text' : 'bg-warning-wash text-warning-text'}`}
        >
          <Warning size={18} weight="fill" aria-hidden />
          <span>{tankAlert === 'leak' ? 'Possible leak' : 'Water is running low'}</span>
          <span className="ml-auto">View alert</span>
          <ArrowRight size={15} aria-hidden />
        </Link>
      )}
      {current.isError && (
        <Alert variant="critical">
          <AlertDescription>
            Couldn’t refresh the readings.{' '}
            <button type="button" className="underline" onClick={() => current.refetch()}>
              Retry
            </button>
          </AlertDescription>
        </Alert>
      )}
      <div className="device-reading-grid">
        <Card className="device-tank-summary">
          <div className="device-tank-mini">
            <TankLevel
              level={profile.data ? (reading?.level_percent ?? null) : null}
              shape={profile.data?.shape}
              showLabel={false}
              stale={stale}
              alert={tankAlert}
            />
          </div>
          <div>
            <p className="workspace-eyebrow">{stale ? 'Last known level' : 'Water level'}</p>
            <p className="device-level-value tnum">
              {profile.data ? (formatReading(reading?.level_percent) ?? '—') : '—'}
              <small>%</small>
            </p>
            <>
              {reading?.timestamp ? (
                <LiveIndicator
                  timestamp={reading.timestamp}
                  fetching={current.isFetching}
                  stale={stale}
                />
              ) : (
                <p className="text-caption text-ink-3">Awaiting reading</p>
              )}
            </>
          </div>
        </Card>
        <StatTile
          label="Volume"
          value={profile.data ? formatReading(reading?.volume_l) : null}
          unit="L"
          hint={stale ? 'Last known reading' : 'In your tank'}
          loading={loading}
        />
        <StatTile
          label="Today’s usage"
          value={todayUsed}
          unit="L"
          hint={
            todayUsed == null ? 'Not enough complete readings' : 'Estimate · since local midnight'
          }
          loading={today.isLoading}
        />
        <StatTile
          label="Daily average"
          value={formatReading(usageSummary?.totals.daily_average_l)}
          unit="L"
          hint="Completed daily summaries"
          loading={usage.isLoading}
        />
      </div>
      {!loading && !profile.data && (
        <Alert variant="info">
          <AlertDescription>
            Set up your tank dimensions for accurate levels and usage.{' '}
            <Link className="underline" to={`/app/onboarding/tank-setup/${deviceId}`}>
              Set up tank
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <div className="device-chart-grid">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Water level · 24h</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="history">
                Explore <ArrowRight size={15} />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="px-2">
            <MiniHistory deviceId={deviceId} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Daily usage</CardTitle>
            <span className="text-caption text-ink-3">Last 30 days · UTC</span>
          </CardHeader>
          <CardContent>
            {usage.isError ? (
              <p className="py-8 text-caption text-critical-text">
                Couldn’t load daily usage.{' '}
                <button type="button" className="underline" onClick={() => usage.refetch()}>
                  Retry
                </button>
              </p>
            ) : usageSummary ? (
              <>
                <UsageBars days={usageSummary.days} height={120} />
                <div className="mt-2 flex justify-between text-caption text-ink-3">
                  <span>{usageSummary.days[0].date}</span>
                  <span>{usageSummary.days[usageSummary.days.length - 1].date}</span>
                </div>
                <p className="mt-2 text-caption text-ink-3">
                  {usageSummary.totals.refill_events} refills ·{' '}
                  {usageSummary.totals.days_aggregated} completed days. Dashed bars await overnight
                  totals.
                </p>
              </>
            ) : (
              <p className="py-8 text-caption text-ink-3">
                {usage.isLoading
                  ? 'Loading daily usage…'
                  : 'Daily usage appears after your first readings are processed.'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="device-secondary-readings">
        <span>
          Temperature <strong>{formatReading(reading?.temperature_c, 1) ?? '—'} °C</strong>
        </span>
        <span>
          Battery <strong>{formatReading(reading?.battery_v, 2) ?? '—'} V</strong>
        </span>
        {profile.data && (
          <span>
            Capacity <strong>{profile.data.total_capacity_l.toFixed(0)} L</strong>
          </span>
        )}
        <Link to="settings">
          Tank settings <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
