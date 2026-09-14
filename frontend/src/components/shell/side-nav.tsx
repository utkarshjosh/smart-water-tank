import { ArrowUpRight, Drop, Waves } from '@phosphor-icons/react';
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
    <nav className="workspace-nav flex h-full flex-col" aria-label={variant === 'admin' ? 'Administration' : 'Your workspace'}>
      <Link
        to={home}
        onClick={onNavigate}
        className="workspace-wordmark"
      >
        <Drop size={28} weight="fill" />
        <span className="text-title">AquaMind</span>
        {variant === 'admin' && (
          <span className="workspace-admin-badge">
            Admin
          </span>
        )}
      </Link>

      <div className="workspace-nav-section"><span className="workspace-eyebrow">{variant === 'admin' ? 'Control center' : 'Personal workspace'}</span></div>
      <div className="flex-1 space-y-1 px-4 py-2">
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
                'workspace-nav-link flex items-center gap-3 text-label transition-colors duration-instant ease-out',
                active
                  ? 'is-active'
                  : ''
              )}
            >
              <Icon size={20} weight={active ? 'fill' : 'regular'} />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="workspace-nav-note"><Waves size={26} /><p>A clearer view<br />of your water.</p><span>Every tank. Every day.</span></div>
      <Link to="/welcome" className="workspace-nav-home" onClick={onNavigate}>Explore AquaMind <ArrowUpRight size={16} /></Link>
    </nav>
  );
}
