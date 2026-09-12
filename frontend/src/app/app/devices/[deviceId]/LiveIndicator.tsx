import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** "Live · updated 8s ago" - the reassurance an IoT dashboard owes the user. */
export function LiveIndicator({
  timestamp,
  fetching,
  stale,
}: {
  timestamp: string;
  fetching: boolean;
  stale?: boolean;
}) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  const seconds = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 1000));
  const ago =
    seconds < 60
      ? `${seconds}s ago`
      : seconds < 3600
        ? `${Math.round(seconds / 60)}m ago`
        : `${Math.round(seconds / 3600)}h ago`;

  return (
    <p className="flex items-center gap-1.5 text-caption text-ink-3">
      <span
        aria-hidden
        className={cn(
          'h-1.5 w-1.5 rounded-full transition-colors duration-quick',
          stale ? 'bg-ink-3' : 'bg-good',
          fetching && 'motion-safe:animate-pulse'
        )}
      />
      {stale ? 'Last reading' : 'Live'} · updated {ago}
    </p>
  );
}
