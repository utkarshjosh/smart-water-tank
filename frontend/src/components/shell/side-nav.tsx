import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { navFor, type ShellVariant } from './nav-config';

/**
 * Desktop navigation. The old app had two of these - a gray-900 rail at 288px
 * for admin and a slate-950 one at 240px for tenants - so crossing between
 * them felt like two products. One component, one width, one palette.
 */
export function SideNav({
  variant,
  onNavigate,
}: {
  variant: ShellVariant;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const items = navFor(variant);
  const home = items[0]?.href ?? '/';

  return (
    <nav className="flex h-full flex-col border-r border-hairline bg-surface">
      <Link
        to={home}
        onClick={onNavigate}
        className="flex h-header items-center gap-2.5 px-4"
      >
        <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
        <span className="text-title">AquaMind</span>
        {variant === 'admin' && (
          <span className="rounded-sm bg-surface-sunk px-1.5 py-0.5 text-caption font-medium text-ink-2">
            Admin
          </span>
        )}
      </Link>

      <div className="flex-1 space-y-0.5 px-2 py-2">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-10 items-center gap-3 rounded-md px-3 text-label transition-colors duration-instant ease-out',
                active
                  ? 'bg-brand-wash text-brand'
                  : 'text-ink-2 hover:bg-surface-hover hover:text-ink-1'
              )}
            >
              <Icon size={20} weight={active ? 'fill' : 'regular'} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
