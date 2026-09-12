import { useDelayed } from '@/lib/useDelayed';

/**
 * Boot state, for the one case that earns a full screen: waiting on the auth
 * session before we know which app to render. Route chunks use RouteFallback
 * instead. The old version stacked two blur-120px pulsing gradient orbs behind
 * a spinning ring.
 *
 * `delay` holds the loader back so a fast resolve shows nothing at all rather
 * than blinking a logo at the user.
 */
export function AppLoader({ label = 'Loading AquaMind', delay = 400 }: { label?: string; delay?: number }) {
  const visible = useDelayed(true, delay);
  if (!visible) return <div className="min-h-screen bg-canvas" aria-busy="true" />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas">
      <img src="/logo.png" alt="" className="h-12 w-12 object-contain" />
      <div className="h-1 w-32 overflow-hidden rounded-full bg-surface-sunk">
        <div className="h-full w-1/3 rounded-full bg-brand motion-safe:animate-[shimmer_1.2s_ease-in-out_infinite]" />
      </div>
      <p className="text-caption text-ink-3">{label}</p>
    </div>
  );
}
