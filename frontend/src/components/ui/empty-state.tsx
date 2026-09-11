import type { Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: IconComponent,
  title,
  description,
  action,
}: {
  icon: Icon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunk text-ink-3">
        <IconComponent size={22} aria-hidden />
      </span>
      <div>
        <p className="text-label text-ink-1">{title}</p>
        {description && <p className="mt-1 max-w-xs text-body text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}
