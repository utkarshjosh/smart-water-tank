import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkline } from '@/components/charts/Sparkline';
import { rangeToWindow, useHistorySeries } from '@/lib/history';

/**
 * Glanceable 24h level trace. Deliberately NOT the ECharts component: the
 * overview should not pay ~189KB for a shape the user cannot interact with.
 * Tapping through to History loads the real chart.
 */
export function MiniHistory({ deviceId }: { deviceId?: string }) {
  const window = useMemo(() => rangeToWindow('24h'), []);
  const { data, isLoading } = useHistorySeries({
    deviceId,
    ...window,
    metrics: ['level_percent'],
  });

  if (isLoading) return <Skeleton className="mx-2 h-[120px]" />;

  // `series?.`, not `series.`: the generic on api.get is a compile-time
  // assertion, not a runtime check, so a response without this key throws
  // here and takes the whole page down instead of showing the empty state
  // three lines below.
  const points = data?.series?.level_percent?.points ?? [];
  if (points.filter((p) => p[2] != null).length < 2) {
    return (
      <p className="px-2 py-8 text-center text-caption text-ink-3">
        Not enough readings in the last 24 hours yet.
      </p>
    );
  }

  const values = points.map((p) => p[2]).filter((v): v is number => v != null);
  const low = Math.min(...values);
  const high = Math.max(...values);

  return (
    <div className="px-2">
      <Sparkline points={points} min={0} max={100} height={120} />
      <div className="mt-1 flex justify-between text-caption tnum text-ink-3">
        <span>low {low.toFixed(0)}%</span>
        <span>high {high.toFixed(0)}%</span>
      </div>
    </div>
  );
}
