import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Warning } from '@phosphor-icons/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat-tile';
import TankLevel from '@/components/TankLevel';
import { UsageBarChart } from '@/components/charts/UsageBarChart';
import { LiveIndicator } from './LiveIndicator';
import { MiniHistory } from './MiniHistory';
import { UsagePanel } from './UsagePanel';
import {
  formatReading,
  useAlerts,
  useCurrent,
  useDevice,
  useHourlyUsage,
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
  // Today's total from the server's hourly rollup, cut at the tank's local
  // midnight - shares its query with the panel's Today view.
  const today = useHourlyUsage(deviceId, 'today');
  const todayUsed = today.isError ? null : formatReading(today.data?.today.used_l);
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
          hint={todayUsed == null ? 'No readings yet today' : 'Since midnight · updates every 5 min'}
          loading={today.isLoading}
        />
        <StatTile
          label="Daily average"
          value={formatReading(usageSummary?.totals.daily_average_l)}
          unit="L"
          hint="Last 30 days, not counting today"
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
            <span className="text-caption text-ink-3">Last 30 days</span>
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
                <UsageBarChart
                  ariaLabel="Water used per day"
                  showFills={false}
                  height={120}
                  slots={usageSummary.days.map((day, i, all) => {
                    const date = new Date(`${day.date}T00:00:00`);
                    const isToday = i === all.length - 1;
                    const notes = [
                      day.refill_events ? `filled ${day.refill_events}×` : null,
                      day.leak_suspected ? 'possible leak' : null,
                      isToday ? 'so far' : null,
                    ].filter(Boolean);
                    return {
                      key: day.date,
                      tick: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
                      title: date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
                      usedL: day.used_l,
                      note: notes.join(' · ') || undefined,
                      alert: day.leak_suspected,
                    };
                  })}
                />
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
      <UsagePanel deviceId={deviceId} />
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
