import { cn } from '@/lib/utils';

/**
 * Shaped placeholders, not spinners: a skeleton that matches the final layout
 * keeps the page from reflowing when data lands, which is most of what makes
 * loading feel slow.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-md bg-surface-sunk',
        'motion-safe:after:absolute motion-safe:after:inset-0 motion-safe:after:-translate-x-full',
        'motion-safe:after:bg-gradient-to-r motion-safe:after:from-transparent motion-safe:after:via-white/60 motion-safe:after:to-transparent',
        'motion-safe:after:animate-shimmer',
        className
      )}
      {...props}
    />
  );
}
