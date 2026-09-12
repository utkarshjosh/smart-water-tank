import { cn } from '@/lib/utils';

/**
 * Status never rides on colour alone: the dot always ships beside its label.
 */
export function StatusDot({
  status,
  label,
  className,
}: {
  status: 'online' | 'offline' | 'warning';
  label?: string;
  className?: string;
}) {
  const dot = {
    online: 'bg-good',
    offline: 'bg-ink-3',
    warning: 'bg-warning',
  }[status];

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-caption text-ink-2', className)}>
      <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
      {label ?? status}
    </span>
  );
}
