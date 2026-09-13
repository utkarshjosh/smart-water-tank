import { Suspense, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { AppHeader } from './app-header';
import { AppLoader } from './app-loader';
import { BottomTabBar } from './bottom-tab-bar';
import { RouteSkeleton } from './route-skeleton';
import { SideNav } from './side-nav';
import { ShellContext, type ShellHeading } from './shell-context';
import type { ShellVariant } from './nav-config';

/**
 * The application frame, mounted once per section and kept mounted across every
 * navigation inside it.
 *
 * It used to be a component each page rendered around itself, which meant the
 * sidebar, header and tab bar lived inside the page's own lazy chunk: moving
 * between two admin screens unmounted the entire application and left an empty
 * canvas until the next chunk arrived. As a route element the chrome is stable,
 * the Suspense boundary sits around the outlet alone, and only the content area
 * swaps to a skeleton.
 *
 * It also absorbs the access check that used to be duplicated between the
 * router's gate and the shell, so an admin route resolves its answer once.
 */
export function ShellLayout({ variant }: { variant: ShellVariant }) {
  const { status, isAdmin } = useAuth();
  const [heading, setHeading] = useState<ShellHeading>({});
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);

  const shell = useMemo(() => ({ setHeading, actionSlot }), [actionSlot]);

  if (status === 'initializing') return <AppLoader />;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  if (variant === 'admin' && !isAdmin) return <Navigate to="/app/devices" replace />;

  return (
    <ShellContext.Provider value={shell}>
      <div className="min-h-screen bg-canvas">
        <div className="fixed inset-y-0 left-0 z-40 hidden w-sidebar md:block">
          <SideNav variant={variant} />
        </div>

        <div className="md:pl-sidebar">
          <AppHeader
            title={heading.title}
            subtitle={heading.subtitle}
            actionSlotRef={setActionSlot}
          />
          <main className="mx-auto max-w-content px-4 pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px)+16px)] pt-4 sm:px-6 md:pb-10">
            <Suspense fallback={<RouteSkeleton />}>
              <Outlet />
            </Suspense>
          </main>
        </div>

        <BottomTabBar variant={variant} />
      </div>
    </ShellContext.Provider>
  );
}

/**
 * Renders a control into the header bar from inside a route. A portal rather
 * than context state because the content is arbitrary JSX with a fresh identity
 * every render, which through state would re-render the layout forever.
 */
export function ShellAction({ children }: { children: ReactNode }) {
  const slot = useContext(ShellContext)?.actionSlot;
  if (!slot) return null;
  return createPortal(children, slot);
}
