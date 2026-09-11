/**
 * Boot state. The old version stacked two blur-120px pulsing gradient orbs
 * behind a spinning ring; this is the logo and a determinate-looking bar.
 */
export function AppLoader({ label = 'Loading AquaMind' }: { label?: string }) {
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
