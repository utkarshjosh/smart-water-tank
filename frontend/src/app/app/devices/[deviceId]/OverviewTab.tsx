import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Drop } from '@phosphor-icons/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import TankLevel from '@/components/TankLevel';
import { LiveIndicator } from './LiveIndicator';
import { WaterSnapshot } from './WaterSnapshot';
import { UsagePanel } from './UsagePanel';
import { formatReading, useCurrent, useDevice, useTankProfile } from './useDevice';
import './water-story.css';

export default function OverviewTab() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const current = useCurrent(deviceId);
  const device = useDevice(deviceId);
  const profile = useTankProfile(deviceId);
  const reading = current.data;
  const stale = Boolean(
    reading?.level_percent_stale || (device.data && device.data.status !== 'online')
  );
  const level = profile.data ? (reading?.level_percent ?? null) : null;
  const capacity = profile.data?.total_capacity_l;
  const volume = profile.data ? reading?.volume_l : null;
  return (
    <div className="device-overview water-overview">
      {current.isError && (
        <Alert variant="critical">
          <AlertDescription>
            Couldn’t refresh the tank reading.{' '}
            <button className="underline" onClick={() => current.refetch()}>
              Try again
            </button>
          </AlertDescription>
        </Alert>
      )}
      <section className={`water-reserve ${stale ? 'is-stale' : ''}`} aria-label="Water available">
        <div className="water-reserve-copy">
          <span className="water-eyebrow">
            <Drop size={15} weight="fill" aria-hidden />{' '}
            {stale ? 'Last recorded reserve' : 'Your water, at a glance'}
          </span>
          <h2>{level == null ? 'Waiting for your tank' : 'Here’s what’s in your tank'}</h2>
          <p className="water-reserve-number tnum">
            {volume == null ? '—' : Math.round(volume).toLocaleString()}
            <span>L {stale ? 'last recorded' : 'available'}</span>
          </p>
          <div
            className="water-reserve-track"
            role="meter"
            aria-label="Tank level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={level == null ? undefined : Math.max(0, Math.min(100, level))}
            aria-valuetext={level == null ? 'Unknown' : `${Math.round(level)}% full`}
          >
            <span style={{ width: `${Math.max(0, Math.min(100, level ?? 0))}%` }} />
          </div>
          <div className="water-reserve-meta">
            <span>{level == null ? 'Level unknown' : `${Math.round(level)}% full`}</span>
            <span>
              {capacity
                ? `${Math.round(capacity).toLocaleString()} L capacity`
                : 'Tank setup needed'}
            </span>
          </div>
          {reading?.timestamp ? (
            <LiveIndicator
              timestamp={reading.level_percent_as_of ?? reading.timestamp}
              fetching={current.isFetching}
              stale={stale}
            />
          ) : (
            <p className="text-caption text-ink-3">
              Fresh readings will appear here when the sensor reports.
            </p>
          )}
          {!profile.isLoading && !profile.data && (
            <Link
              className="text-label text-brand underline"
              to={`/app/onboarding/tank-setup/${deviceId}`}
            >
              Set up your tank
            </Link>
          )}
        </div>
        <div className="water-reserve-art">
          <TankLevel
            level={level}
            shape={profile.data?.shape}
            stale={stale}
            showLabel={false}
          />
        </div>
      </section>
      {deviceId && <WaterSnapshot deviceId={deviceId} />}
      <UsagePanel deviceId={deviceId} />
      <details className="water-sensor-details">
        <summary>
          Sensor health &amp; technical readings <span>Temperature, battery and level history</span>
        </summary>
        <div className="device-secondary-readings">
          <span>
            Temperature <strong>{formatReading(reading?.temperature_c, 1) ?? '—'} °C</strong>
          </span>
          <span>
            Battery <strong>{formatReading(reading?.battery_v, 2) ?? '—'} V</strong>
          </span>
          <Link to="history?view=level">
            Open sensor history <ArrowRight size={14} />
          </Link>
        </div>
      </details>
    </div>
  );
}
