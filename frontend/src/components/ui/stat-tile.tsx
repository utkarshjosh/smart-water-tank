import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

/**
 * A reading. Values sit on tabular numerals so a live poll changes the digits
 * without shifting their position - jitter is a large part of why the old
 * dashboard read as cheap.
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  tone,
  loading,
  className,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  hint?: string;
  tone?: 'default' | 'good' | 'warning' | 'critical';
  loading?: boolean;
  className?: string;
}) {
  const toneClass = {
    default: 'text-ink-1',
    good: 'text-good-text',
    warning: 'text-warning-text',
    critical: 'text-critical-text',
  }[tone ?? 'default'];

  return (
    <div className={cn('rounded-lg border border-hairline bg-surface px-3 py-2.5', className)}>
      <p className="text-caption font-medium uppercase tracking-wide text-ink-3">{label}</p>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-16" />
      ) : (
        <p className={cn('mt-1 flex items-baseline gap-0.5 text-metric-sm tnum', toneClass)}>
          {value ?? <span className="text-ink-3">—</span>}
          {value != null && unit && <span className="text-label text-ink-3">{unit}</span>}
        </p>
      )}
      {hint && <p className="mt-1 truncate text-caption text-ink-3">{hint}</p>}
    </div>
  );
}
