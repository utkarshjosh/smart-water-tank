import { usageCoverageLabel } from '@aquamind/contracts';
import { Drop, ArrowBendDownRight, SunHorizon } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { formatLitres } from '@/lib/usage-format';
import { useHourlyUsage, useUsageHistory } from './useDevice';
import './water-story.css';

/** Daily totals and a baseline built only from complete days of readings. */
export function WaterSnapshot({ deviceId }: { deviceId: string }) {
  const today = useHourlyUsage(deviceId, 'today');
  const date = today.data?.today.date ?? new Date().toLocaleDateString('en-CA');
  const shift = (days: number) =>
    new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const baseline = useUsageHistory(deviceId, { from: shift(-14), to: shift(-1), group: 'day' });
  const total = today.data?.today;
  const fullDays = baseline.data?.totals.full_days ?? 0;
  const estimatedDays = baseline.data?.totals.estimated_days ?? 0;
  const average = fullDays >= 3 ? baseline.data?.totals.daily_average_l : null;
  const stats = [
    {
      icon: Drop,
      label: 'Used today',
      value: today.isError ? '—' : formatLitres(total?.used_l),
      note: today.isError ? 'Couldn’t refresh usage' : 'Recorded periods; gaps excluded',
    },
    {
      icon: ArrowBendDownRight,
      label: 'Added today',
      value: today.isError ? '—' : formatLitres(total?.filled_l),
      note: 'Water replenished by refilling',
    },
    {
      icon: SunHorizon,
      label: 'Your usual day',
      value: baseline.isError ? '—' : average == null ? 'Learning' : formatLitres(average),
      note: baseline.isError
        ? 'Couldn’t load your daily average'
        : average == null
          ? 'Needs 3 days with 20+ hours of readings'
          : estimatedDays
            ? `From ${fullDays} days, gaps filled from your usual hours`
            : `From ${fullDays} well-covered days`,
    },
  ];
  return (
    <section className="water-snapshot" aria-label="Your daily water summary">
      {stats.map(({ icon: Icon, label, value, note }) => (
        <div className="water-snapshot-stat" key={label}>
          <span className="water-snapshot-icon">
            <Icon size={19} weight="duotone" aria-hidden />
          </span>
          <p>{label}</p>
          <strong className="tnum">{value}</strong>
          <small>{note}</small>
        </div>
      ))}
      {today.data && !today.isError && (
        <div className="water-coverage-note">
          <span>
            <strong>{usageCoverageLabel(today.data)}</strong>
            <span> Estimates cover recorded periods only.</span>
          </span>
          <Link to={`/app/devices/${encodeURIComponent(deviceId)}/history`}>View history →</Link>
        </div>
      )}
    </section>
  );
}
