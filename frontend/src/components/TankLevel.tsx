import { cn } from '@/lib/utils';
import { TankVisual, type TankShape } from './TankVisual';

export type TankAlert = 'leak' | 'low' | null;

export function TankLevel({
  level,
  alert = null,
  showLabel = true,
  stale = false,
  animated = true,
  shape = 'cylindrical',
  className,
}: {
  level: number | null;
  alert?: TankAlert;
  showLabel?: boolean;
  stale?: boolean;
  animated?: boolean;
  shape?: TankShape;
  className?: string;
}) {
  const value = level != null && Number.isFinite(level) ? Math.max(0, Math.min(100, level)) : null;
  const status = value == null ? 'No reading' : stale ? 'Last known level' : 'Tank level';
  const tone =
    alert === 'leak' ? 'text-critical-text' : alert === 'low' ? 'text-warning-text' : 'text-ink-1';

  return (
    <div
      className={cn('flex flex-col items-center', className)}
      role="img"
      aria-label={`${status}${value == null ? '' : ` ${Math.round(value)} percent full`}${alert === 'leak' ? ', possible leak' : alert === 'low' ? ', level low' : ''}`}
    >
      <TankVisual level={value} shape={shape} animated={animated && !stale} />
      {showLabel && (
        <div className="text-center" aria-hidden="true">
          <p className={cn('tnum text-[2rem] font-medium leading-none tracking-tight', tone)}>
            {value == null ? '—' : Math.round(value)}
            {value != null && <span className="ml-0.5 text-label font-normal text-ink-3">%</span>}
          </p>
          <p className="mt-2 text-caption text-ink-3">
            {value == null ? 'Awaiting a reading' : 'of tank capacity'}
          </p>
        </div>
      )}
    </div>
  );
}

export default TankLevel;
