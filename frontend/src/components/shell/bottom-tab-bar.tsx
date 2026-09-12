import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { navFor, type ShellVariant } from './nav-config';

/**
 * Mobile navigation. Replaces the hamburger drawer that held two links - on a
 * phone the primary destinations should cost one thumb tap, not two.
 * Sits above the home indicator via safe-area padding.
 */
export function BottomTabBar({ variant }: { variant: ShellVariant }) {
  const { pathname } = useLocation();
  const items = navFor(variant).filter((item) => !item.desktopOnly);

  return (
    <nav
      aria-label="Primary"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/95 backdrop-blur md:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                to={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-tabbar flex-col items-center justify-center gap-1 transition-colors duration-instant ease-out active:bg-surface-hover',
                  active ? 'text-brand' : 'text-ink-3'
                )}
              >
                <Icon size={22} weight={active ? 'fill' : 'regular'} />
                <span className="text-[11px] font-medium leading-none">
                  {item.short ?? item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
