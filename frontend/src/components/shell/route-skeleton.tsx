import { useLocation } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const Tiles = ({ count, className }: { count: number; className?: string }) => (
  <div className={cn('grid grid-cols-2 gap-2 lg:grid-cols-4', className)}>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="rounded-lg border border-hairline bg-surface px-3 py-2.5">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-2 h-6 w-10" />
      </div>
    ))}
  </div>
);

const Heading = () => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <Skeleton className="h-8 w-44" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
    </div>
    <Skeleton className="h-9 w-32" />
  </div>
);

const Rows = ({ count = 5 }: { count?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: count }, (_, i) => (
      <Skeleton key={i} className="h-14 w-full" />
    ))}
  </div>
);

/**
 * Shown while a route's code chunk is still downloading.
 *
 * Before this existed the whole tree - sidebar, header and tab bar included -
 * was replaced by an empty screen on every navigation, which read as the app
 * reloading rather than moving. The chrome now stays put and only this swaps
 * in, shaped like the page that is arriving so nothing jumps when it lands.
 *
 * The shape is chosen from the path rather than passed per route, because one
 * Suspense boundary in the layout is what keeps the chrome mounted.
 */
export function RouteSkeleton() {
  const { pathname } = useLocation();

  const shape = pathname.startsWith('/admin/dashboard')
    ? 'dashboard'
    : pathname.startsWith('/admin/analytics')
      ? 'analytics'
      : /^\/(admin|app)\/devices\/[^/]+/.test(pathname)
        ? 'detail'
        : 'list';

  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <Heading />

      {shape === 'dashboard' && (
        <>
          <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
            <Skeleton className="h-52 w-full" />
            <Skeleton className="h-52 w-full" />
          </div>
          <Tiles count={6} className="sm:grid-cols-3 xl:grid-cols-6" />
        </>
      )}

      {shape === 'analytics' && (
        <>
          <Tiles count={4} />
          <Skeleton className="h-64 w-full" />
        </>
      )}

      {shape === 'detail' && (
        <>
          <Skeleton className="h-16 w-full" />
          <Tiles count={4} />
          <Skeleton className="h-72 w-full" />
        </>
      )}

      {shape === 'list' && (
        <>
          <Tiles count={4} />
          <Skeleton className="h-10 w-full" />
          <Rows />
        </>
      )}
    </div>
  );
}
