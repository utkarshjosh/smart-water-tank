import { lazy, Suspense, type ReactNode } from 'react';

const UserMenu = lazy(() =>
  import('@/components/shell/user-menu').then((m) => ({ default: m.UserMenu }))
);

/**
 * One header for both shells. The title and the action slot are filled by
 * whichever route is currently mounted - see `usePageHeading` and `ShellAction`
 * - so the bar itself never remounts as the user moves around.
 */
export function AppHeader({
  title,
  subtitle,
  actionSlotRef,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actionSlotRef?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <header className="workspace-header safe-top sticky top-0 z-30 border-b border-hairline bg-surface/90 backdrop-blur">
      <div className="flex h-header items-center gap-3 px-4 sm:px-6">
        <img src="/logo.png" alt="" className="h-7 w-7 shrink-0 object-contain md:hidden" />
        <div className="min-w-0 flex-1">
          <span className="workspace-header-label">Workspace <span aria-hidden="true">/</span></span>
          {title && <div className="truncate text-label text-ink-1">{title}</div>}
          {subtitle && <div className="truncate text-caption text-ink-3">{subtitle}</div>}
        </div>
        <div ref={actionSlotRef} className="flex shrink-0 items-center gap-1" />
        <Suspense fallback={<div className="h-8 w-8 rounded-full bg-surface-sunk" aria-hidden />}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}
