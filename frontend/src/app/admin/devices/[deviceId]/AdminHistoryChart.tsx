import { Suspense, lazy, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ChartLine } from '@phosphor-icons/react';
import { rangeToWindow, useHistorySeries } from '@/lib/history';

const TimeSeriesChart = lazy(() => import('@/components/charts/TimeSeriesChart'));

/**
 * Admin volume history, on the same bucketed endpoint and the same chart the
 * tenant app uses - so an operator and a customer are looking at the same
 * numbers rendered the same way.
 */
export default function AdminHistoryChart({ deviceId }: { deviceId?: string }) {
  const window = useMemo(() => rangeToWindow('7d'), []);
  const { data, isLoading } = useHistorySeries({ deviceId, ...window, metrics: ['volume_l'] });

  if (isLoading) return <Skeleton className="h-[280px] w-full" />;

  const series = data?.series.volume_l;
  const points = series?.points ?? [];
  if (points.filter((p) => p[2] != null).length < 2) {
    return <EmptyState icon={ChartLine} title="No volume data yet" />;
  }

  return (
    <Suspense fallback={<Skeleton className="h-[280px] w-full" />}>
      <TimeSeriesChart points={points} metric="volume_l" unit={series?.unit ?? 'L'} height={280} />
    </Suspense>
  );
}
