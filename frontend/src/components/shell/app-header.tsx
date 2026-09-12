import { lazy, Suspense, type ReactNode } from 'react';

const UserMenu = lazy(() =>
  import('@/components/shell/user-menu').then((m) => ({ default: m.UserMenu }))
);

/**
 * One header for both shells. `title` and `action` let a route own the bar on
 * mobile, where there is no room for a page heading and a toolbar both.
 */
export function AppHeader({
  title,
  subtitle,
  action,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-hairline bg-surface/90 backdrop-blur">
      <div className="flex h-header items-center gap-3 px-4 sm:px-6">
        <img src="/logo.png" alt="" className="h-7 w-7 shrink-0 object-contain md:hidden" />
        <div className="min-w-0 flex-1">
          {title && <div className="truncate text-label text-ink-1">{title}</div>}
          {subtitle && <div className="truncate text-caption text-ink-3">{subtitle}</div>}
        </div>
        {action}
        <Suspense fallback={<div className="h-8 w-8 rounded-full bg-surface-sunk" aria-hidden />}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}
