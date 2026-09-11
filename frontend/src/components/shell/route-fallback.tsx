import { useDelayed } from '@/lib/useDelayed';

/**
 * Fallback for a lazily-loaded route chunk. Deliberately not the branded
 * full-screen loader: a code-split chunk usually arrives in tens of
 * milliseconds, and a logo + "Loading AquaMind" for that reads as a page load
 * that never happened. Nothing shows at all unless it is genuinely slow, and
 * then only a hairline progress bar.
 */
export function RouteFallback() {
  const slow = useDelayed(true, 250);

  return (
    <div className="min-h-screen bg-canvas" aria-busy="true" aria-live="polite">
      {slow && (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-brand-wash">
          <div className="h-full w-1/3 rounded-full bg-brand motion-safe:animate-[shimmer_1.1s_ease-in-out_infinite]" />
        </div>
      )}
      <span className="sr-only">Loading</span>
    </div>
  );
}
