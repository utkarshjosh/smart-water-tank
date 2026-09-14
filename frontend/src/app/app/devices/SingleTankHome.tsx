import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, ChartLine, GearSix, Warning } from '@phosphor-icons/react';
import TankLevel from '@/components/TankLevel';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { relativeTime } from '@/lib/time';

interface HomeDevice {
  id: string;
  status: string;
  has_tank_profile: boolean;
  level_percent: number | null;
  current_volume: number | null;
  level_percent_stale: boolean;
  last_measurement: string | null;
  active_alert: 'leak' | 'low' | null;
}

/** A personal home when there is one tank, rather than a fleet of one. */
export function SingleTankHome({ device }: { device: HomeDevice }) {
  const base = `/app/devices/${encodeURIComponent(device.id)}`;
  const online = device.status === 'online';
  const stale = device.level_percent_stale || !online;
  const level = device.has_tank_profile && device.level_percent != null && Number.isFinite(device.level_percent)
    ? Math.max(0, Math.min(100, device.level_percent)) : null;
  const volume = device.has_tank_profile && device.current_volume != null && Number.isFinite(device.current_volume)
    ? Math.round(device.current_volume).toLocaleString() : null;
  const actions = [
    { icon: ChartLine, title: 'Water history', detail: 'See how your level changes', href: `${base}/history` },
    { icon: Bell, title: 'Alerts', detail: device.active_alert ? 'Review what needs attention' : 'Review your tank notifications', href: `${base}/alerts` },
    { icon: GearSix, title: 'Tank settings', detail: 'Dimensions, thresholds and sharing', href: `${base}/settings` },
  ];

  return (
    <div className="single-tank-home">
      <section className="single-tank-hero" aria-label="Your tank at a glance">
        <div className="single-tank-art">
          <span className="workspace-eyebrow">Your everyday reservoir</span>
          <TankLevel level={level} alert={device.active_alert} stale={stale} showLabel={false} />
          <StatusDot status={online ? 'online' : 'offline'} label={online ? 'Sensor online' : 'Sensor offline'} />
        </div>
        <div className="single-tank-reading">
          <p className="workspace-eyebrow">{level == null ? 'Let’s get you connected' : stale ? 'Last known water level' : 'Water level'}</p>
          <p className="single-tank-number tnum">{level == null ? '—' : Math.round(level)}{level != null && <span>%</span>}</p>
          <p className="single-tank-volume">{volume == null ? 'Volume unavailable' : <><strong className="tnum">{volume} L</strong> {stale ? 'last recorded' : 'in your tank'}</>}</p>
          <p className="single-tank-freshness">{!device.has_tank_profile ? 'Add your tank dimensions to see accurate water levels.' : level == null ? 'Your level will appear when the sensor sends a reading.' : <>{stale ? 'Last reading' : 'Measured'} · {relativeTime(device.last_measurement, 'Time unavailable')}{stale && '. Waiting for a fresh reading.'}</>}</p>
          {device.active_alert && (
            <Link to={`${base}/alerts`} className={`single-tank-alert ${device.active_alert === 'leak' ? 'bg-critical-wash text-critical-text' : 'bg-warning-wash text-warning-text'}`}>
              <Warning size={19} weight="fill" aria-hidden />
              <span>{device.active_alert === 'leak' ? 'Possible leak. Check your tank.' : 'Water is running low.'}</span>
              <ArrowUpRight size={16} aria-hidden />
            </Link>
          )}
          <Button asChild className="single-tank-primary">
            <Link to={device.has_tank_profile ? base : `/app/onboarding/tank-setup/${encodeURIComponent(device.id)}`}>
              {device.has_tank_profile ? 'View tank details' : 'Set up your tank'} <ArrowUpRight size={17} aria-hidden />
            </Link>
          </Button>
        </div>
      </section>
      <nav className="single-tank-actions" aria-label="Tank shortcuts">
        {actions.map(({ icon: Icon, title, detail, href }) => (
          <Link key={href} to={href}>
            <span className="single-tank-action-icon"><Icon size={23} weight="duotone" aria-hidden /></span>
            <span><strong>{title}</strong><small>{detail}</small></span>
            <ArrowUpRight size={17} aria-hidden />
          </Link>
        ))}
      </nav>
    </div>
  );
}
