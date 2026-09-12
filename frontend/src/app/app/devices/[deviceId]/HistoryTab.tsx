import { Suspense, lazy, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState } from '@/components/ui/empty-state';
import { ChartLine } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  METRICS,
  METRIC_BY_VALUE,
  RANGES,
  rangeToWindow,
  useHistorySeries,
  type Metric,
  type RangeKey,
} from '@/lib/history';
import { useDeviceConfig } from './useDevice';

const TimeSeriesChart = lazy(() => import('@/components/charts/TimeSeriesChart'));

const BUCKET_LABEL: Record<string, string> = {
  raw: 'every reading',
  '1m': '1-minute averages',
  '5m': '5-minute averages',
  '15m': '15-minute averages',
  '1h': 'hourly averages',
  '6h': '6-hour averages',
  '1d': 'daily averages',
};

/**
 * The browsable chart, on its own route so it owns the full height of a phone
 * screen instead of being the third card down.
 */
export default function HistoryTab() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [params, setParams] = useSearchParams();

  // Range and metric live in the URL, so a view is shareable and survives a
  // refresh or a back-navigation from another tab.
  const range = (params.get('range') as RangeKey) ?? '7d';
  const metric = (params.get('metric') as Metric) ?? 'level_percent';
  const [widened, setWidened] = useState(false);

  const window = useMemo(() => rangeToWindow(range), [range]);
  const config = useDeviceConfig(deviceId);
  const { data, isLoading, isFetching } = useHistorySeries({
    deviceId,
    ...window,
    metrics: [metric],
  });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
    setWidened(false);
  };

  const series = data?.series[metric];
  const points = series?.points ?? [];
  const hasData = points.some((p) => p[2] != null);

  // The alert bounds drawn on the data itself, so the thresholds stop being an
  // abstract number on a settings screen.
  const thresholds =
    metric === 'level_percent'
      ? [
          config.data?.tank_low_threshold_pct != null
            ? { value: Number(config.data.tank_low_threshold_pct), label: 'Low' }
            : null,
          config.data?.tank_full_threshold_pct != null
            ? { value: Number(config.data.tank_full_threshold_pct), label: 'Full' }
            : null,
        ].filter((t): t is { value: number; label: string } => t != null)
      : [];

  const widen = () => {
    const order = RANGES.map((r) => r.value);
    const next = order[Math.min(order.indexOf(range) + 1, order.length - 1)];
    if (next !== range) {
      setParam('range', next);
      setWidened(true);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          aria-label="Metric"
          value={metric}
          onChange={(value) => setParam('metric', value)}
          options={METRICS.map((m) => ({ value: m.value, label: m.label, swatch: m.color }))}
        />
        <SegmentedControl
          aria-label="Time range"
          className="ml-auto"
          value={range}
          onChange={(value) => setParam('range', value)}
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
      </div>

      <Card className="overflow-hidden">
        {/* A 2px progress hairline instead of blanking the plot on refetch. */}
        <div
          className={cn(
            'h-0.5 bg-brand transition-opacity duration-quick ease-out',
            isFetching && !isLoading ? 'opacity-100' : 'opacity-0'
          )}
          aria-hidden
        />
        <CardContent className="px-1 pb-2 pt-2">
          {isLoading ? (
            <Skeleton className="h-[360px] w-full" />
          ) : hasData ? (
            <Suspense fallback={<Skeleton className="h-[360px] w-full" />}>
              <TimeSeriesChart
                points={points}
                metric={metric}
                unit={series?.unit ?? METRIC_BY_VALUE[metric].unit}
                height={360}
                thresholds={thresholds}
                onZoomBeyond={widen}
                dimmed={isFetching && !isLoading}
              />
            </Suspense>
          ) : (
            <div className="p-3">
              <EmptyState
                icon={ChartLine}
                title={`No ${METRIC_BY_VALUE[metric].label.toLowerCase()} data yet`}
                description="Readings will appear here once the device reports them."
              />
            </div>
          )}
        </CardContent>
      </Card>

      {data && hasData && (
        <p className="px-1 text-caption text-ink-3">
          {data.point_count.toLocaleString()} points · {BUCKET_LABEL[data.bucket] ?? data.bucket}
          {data.truncated && ' · window narrowed to the most recent readings'}
          {widened && ' · widened range'}
          {' · '}drag to pan, pinch or scroll to zoom
        </p>
      )}
    </div>
  );
}
