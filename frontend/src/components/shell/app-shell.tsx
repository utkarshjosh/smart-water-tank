import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { AppHeader } from './app-header';
import { BottomTabBar } from './bottom-tab-bar';
import { SideNav } from './side-nav';
import { AppLoader } from './app-loader';
import type { ShellVariant } from './nav-config';

/**
 * The single application shell. Replaces Layout.tsx + TenantLayout.tsx and the
 * seven sidebar/header/drawer files that sat under them, which had drifted to
 * different widths, colours and content padding for the same job.
 *
 * Desktop: fixed side nav. Mobile: header + bottom tab bar, content scrolling
 * between them.
 */
export function AppShell({
  variant,
  title,
  subtitle,
  action,
  children,
}: {
  variant: ShellVariant;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { status, isAdmin } = useAuth();

  useEffect(() => {
    if (status === 'unauthenticated') {
      navigate('/login', { replace: true });
    } else if (status === 'authenticated' && variant === 'admin' && !isAdmin) {
      navigate('/app/devices', { replace: true });
    }
  }, [status, isAdmin, variant, navigate]);

  if (status === 'initializing') return <AppLoader />;
  if (status !== 'authenticated') return null;
  if (variant === 'admin' && !isAdmin) return null;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="fixed inset-y-0 left-0 z-40 hidden w-sidebar md:block">
        <SideNav variant={variant} />
      </div>

      <div className="md:pl-sidebar">
        <AppHeader title={title} subtitle={subtitle} action={action} />
        <main className="mx-auto max-w-content px-4 pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px)+16px)] pt-4 sm:px-6 md:pb-10">
          {children}
        </main>
      </div>

      <BottomTabBar variant={variant} />
    </div>
  );
}
