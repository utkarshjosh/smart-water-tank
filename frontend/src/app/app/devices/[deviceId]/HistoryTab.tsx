import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ChartLine } from '@phosphor-icons/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Range } from '@/components/charts/gestures';
import {
  METRICS,
  METRIC_BY_VALUE,
  RANGES,
  rangeToWindow,
  useHistorySeries,
  type Metric,
} from '@/lib/history';
import { useDeviceConfig } from './useDevice';

const TimeSeriesChart = lazy(() => import('@/components/charts/TimeSeriesChart'));
const BUCKET_LABEL: Record<string, string> = {
  raw: 'Individual readings',
  '1m': '1-minute averages',
  '5m': '5-minute averages',
  '15m': '15-minute averages',
  '1h': 'Hourly averages',
  '6h': '6-hour averages',
  '1d': 'Daily averages',
};
const localInput = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export default function HistoryTab() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [params, setParams] = useSearchParams();
  const range = RANGES.find((r) => r.value === params.get('range'))?.value ?? '7d';
  const metric: Metric =
    METRICS.find((m) => m.value === params.get('metric'))?.value ?? 'level_percent';
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const fullWindow = useMemo(() => {
    const from = Date.parse(fromParam ?? '');
    const to = Date.parse(toParam ?? '');
    return Number.isFinite(from) && Number.isFinite(to) && to > from && to - from <= 400 * 86400_000
      ? { from: new Date(from).toISOString(), to: new Date(to).toISOString() }
      : rangeToWindow(range);
  }, [range, fromParam, toParam]);
  const windowKey = `${deviceId}:${fullWindow.from}:${fullWindow.to}`;
  const timeBounds = useMemo<Range>(
    () => [Date.parse(fullWindow.from) / 1000, Date.parse(fullWindow.to) / 1000],
    [fullWindow]
  );
  const [pendingView, setPendingView] = useState<{ key: string; range: Range } | null>(null);
  const [requestedView, setRequestedView] = useState<typeof pendingView>(null);
  const [dateError, setDateError] = useState('');
  const onViewChange = useCallback(
    (next: Range) => setPendingView({ key: windowKey, range: next }),
    [windowKey]
  );
  useEffect(() => {
    const timer = setTimeout(() => setRequestedView(pendingView), 250);
    return () => clearTimeout(timer);
  }, [pendingView]);
  const zoom = requestedView?.key === windowKey ? requestedView.range : null;
  const zoomed = zoom != null && zoom[1] - zoom[0] < timeBounds[1] - timeBounds[0] - 1;
  const overview = useHistorySeries({ deviceId, ...fullWindow, metrics: [metric] });
  const detail = useHistorySeries({
    deviceId,
    from: zoom ? new Date(zoom[0] * 1000).toISOString() : fullWindow.from,
    to: zoom ? new Date(zoom[1] * 1000).toISOString() : fullWindow.to,
    metrics: [metric],
    enabled: zoomed,
  });
  const query = zoomed ? detail : overview;
  const data = query.data;
  const points = data?.series[metric]?.points ?? [];
  const config = useDeviceConfig(deviceId);
  const thresholds = useMemo(
    () =>
      metric === 'level_percent'
        ? [
            config.data?.tank_low_threshold_pct != null
              ? { value: Number(config.data.tank_low_threshold_pct), label: 'Low' }
              : null,
            config.data?.tank_full_threshold_pct != null
              ? { value: Number(config.data.tank_full_threshold_pct), label: 'Full' }
              : null,
          ].filter((t): t is { value: number; label: string } => t != null)
        : [],
    [metric, config.data]
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key === 'range') {
      next.delete('from');
      next.delete('to');
      setPendingView(null);
      setRequestedView(null);
    }
    setParams(next, { replace: true });
    setDateError('');
  };

  return (
    <div className="space-y-3">
      <div className="history-controls">
        <SegmentedControl
          aria-label="Metric"
          value={metric}
          onChange={(v) => setParam('metric', v)}
          options={METRICS.map((m) => ({ value: m.value, label: m.label, swatch: m.color }))}
        />
        <SegmentedControl
          aria-label="Time range"
          value={fromParam && toParam ? 'custom' : range}
          onChange={(v) => setParam('range', v)}
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
      </div>
      <form
        key={windowKey}
        className="history-date-range"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const from = new Date(String(form.get('from')));
          const to = new Date(String(form.get('to')));
          if (
            !Number.isFinite(+from) ||
            !Number.isFinite(+to) ||
            +to <= +from ||
            +to - +from > 400 * 86400_000
          ) {
            setDateError('Choose an end after the start, within a 400-day range.');
            return;
          }
          const next = new URLSearchParams(params);
          next.set('from', from.toISOString());
          next.set('to', to.toISOString());
          setPendingView(null);
          setRequestedView(null);
          setDateError('');
          setParams(next, { replace: true });
        }}
      >
        <label>
          From
          <input
            name="from"
            type="datetime-local"
            defaultValue={localInput(fullWindow.from)}
            required
          />
        </label>
        <label>
          To
          <input
            name="to"
            type="datetime-local"
            defaultValue={localInput(fullWindow.to)}
            required
          />
        </label>
        <Button size="sm" variant="secondary" type="submit">
          Apply dates
        </Button>
      </form>
      {dateError && (
        <p role="alert" className="text-caption text-critical-text">
          {dateError}
        </p>
      )}
      {query.isError && (
        <Alert variant="critical">
          <AlertDescription>
            Couldn’t load this window.{' '}
            <button type="button" className="underline" onClick={() => query.refetch()}>
              Try again
            </button>
          </AlertDescription>
        </Alert>
      )}
      <Card className="overflow-hidden">
        <div
          className={`h-0.5 bg-brand ${query.isFetching ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden
        />
        <CardContent className="px-1 pb-2 pt-2">
          {overview.isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
              <TimeSeriesChart
                key={windowKey}
                points={points}
                metric={metric}
                unit={METRIC_BY_VALUE[metric].unit}
                height={280}
                thresholds={thresholds}
                timeBounds={timeBounds}
                overviewPoints={overview.data?.series[metric]?.points ?? []}
                onViewChange={onViewChange}
                minViewSpan={3600}
                dimmed={query.isFetching}
              />
            </Suspense>
          )}
          {!query.isFetching && !query.isError && !points.some((p) => p[2] != null) && (
            <p className="flex items-center justify-center gap-2 py-3 text-caption text-ink-3">
              <ChartLine size={17} />
              No readings in this window. Adjust the dates or reset the view.
            </p>
          )}
        </CardContent>
      </Card>
      <p className="px-1 text-caption text-ink-3">
        {query.isFetching
          ? 'Loading detail…'
          : data
            ? `${BUCKET_LABEL[data.bucket] ?? data.bucket} · ${data.point_count.toLocaleString()} points`
            : ''}
        {data?.truncated && ' · Some readings were omitted; zoom in for full detail.'}
        {' · '}Use + / − to zoom, drag to pan, or Ctrl/⌘ + scroll. Dates use your local time.
      </p>
    </div>
  );
}
