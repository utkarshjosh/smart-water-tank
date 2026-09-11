import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsType } from 'echarts/core';
import { METRIC_BY_VALUE, METRIC_SLUG, type Metric, type SeriesPoint } from '@/lib/metrics';

// Tree-shaken build: only what this chart draws. Recharts could not do pan,
// pinch-zoom or brushing, and its SVG marks degrade past a few thousand points.
echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, CanvasRenderer]);

export interface ThresholdLine {
  value: number;
  label: string;
}

/** Resolve a CSS custom property to a literal colour - canvas cannot use var(). */
function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

export interface TimeSeriesChartProps {
  points: SeriesPoint[];
  metric: Metric;
  unit: string;
  height?: number;
  /** Draws the alert bounds on the data itself. */
  thresholds?: ThresholdLine[];
  /** Shows the min/max envelope behind the average line. */
  showBand?: boolean;
  /** Slider brush under the plot. Off for compact/preview charts. */
  showBrush?: boolean;
  /** Fires when the user zooms or pans past the loaded window. */
  onZoomBeyond?: () => void;
  dimmed?: boolean;
}

export default function TimeSeriesChart({
  points,
  metric,
  unit,
  height = 320,
  thresholds = [],
  showBand = true,
  showBrush = true,
  onZoomBeyond,
  dimmed = false,
}: TimeSeriesChartProps) {
  const holder = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);
  const zoomBeyond = useRef(onZoomBeyond);
  zoomBeyond.current = onZoomBeyond;

  const option = useMemo(() => {
    const color = cssVar(`--series-${METRIC_SLUG[metric]}`, '#2a78d6');
    const ink3 = hsl(cssVar('--ink-3', '55 5% 42%'));
    const ink1 = hsl(cssVar('--ink-1', '240 8% 10%'));
    const hairline = hsl(cssVar('--hairline', '45 8% 90%'));
    const surface = hsl(cssVar('--surface', '0 0% 100%'));

    const avg = points.map((p) => [p[0], p[2]]);
    // The band is drawn as a transparent floor plus a stacked span, which is
    // how ECharts expresses a ribbon without a dedicated area-range series.
    const floor = points.map((p) => [p[0], p[1]]);
    const span = points.map((p) => [p[0], p[1] == null || p[3] == null ? null : p[3] - p[1]]);
    const hasBand = showBand && points.some((p) => p[1] != null && p[3] != null && p[3] - p[1] > 0);

    return {
      animation: true,
      animationDuration: 220,
      animationEasing: 'cubicOut' as const,
      grid: { left: 8, right: 12, top: 16, bottom: showBrush ? 56 : 24, containLabel: true },
      xAxis: {
        type: 'time' as const,
        axisLine: { lineStyle: { color: hairline } },
        axisTick: { show: false },
        // Bare day numbers ("5 6 7") are unreadable; label the unit that is
        // actually changing at this zoom level.
        axisLabel: {
          color: ink3,
          fontSize: 11,
          hideOverlap: true,
          formatter: {
            year: '{yyyy}',
            month: '{MMM}',
            day: '{d} {MMM}',
            hour: '{HH}:{mm}',
            minute: '{HH}:{mm}',
            second: '{HH}:{mm}:{ss}',
            millisecond: '{HH}:{mm}:{ss}',
            none: '{d} {MMM} {HH}:{mm}',
          },
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        scale: metric !== 'level_percent',
        ...(metric === 'level_percent' ? { min: 0, max: 100 } : {}),
        axisLabel: { color: ink3, fontSize: 11, formatter: (v: number) => `${v}${unit}` },
        splitLine: { lineStyle: { color: hairline, type: 'solid' as const } },
      },
      tooltip: {
        trigger: 'axis' as const,
        // Never let the tooltip escape the viewport on a phone.
        confine: true,
        backgroundColor: surface,
        borderColor: hairline,
        borderWidth: 1,
        padding: [8, 10],
        textStyle: { color: ink1, fontSize: 12 },
        axisPointer: {
          type: 'line' as const,
          snap: true,
          lineStyle: { color: ink3, width: 1, type: 'dashed' as const },
        },
        formatter: (params: { axisValue: number; dataIndex: number }[]) => {
          const index = params[0]?.dataIndex ?? 0;
          const point = points[index];
          if (!point || point[2] == null) return '';
          const when = new Date(point[0]).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          const range =
            point[1] != null && point[3] != null && point[3] - point[1] > 0.01
              ? `<div style="color:${ink3};font-size:11px;margin-top:2px">low ${fmt(point[1])}${unit} · high ${fmt(point[3])}${unit}</div>`
              : '';
          return `
            <div style="font-size:11px;color:${ink3}">${when}</div>
            <div style="font-weight:600;margin-top:2px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>
              ${fmt(point[2])}${unit}
            </div>${range}`;
        },
      },
      dataZoom: [
        // Drag to pan, wheel or pinch to zoom - the whole point of the rebuild.
        { type: 'inside' as const, zoomOnMouseWheel: true, moveOnMouseMove: true, preventDefaultMouseMove: false },
        ...(showBrush
          ? [
              {
                type: 'slider' as const,
                height: 28,
                bottom: 8,
                borderColor: hairline,
                backgroundColor: 'transparent',
                fillerColor: `${color}1f`,
                handleStyle: { color: surface, borderColor: color, borderWidth: 1.5 },
                moveHandleStyle: { color: hairline },
                dataBackground: {
                  lineStyle: { color, opacity: 0.5 },
                  areaStyle: { color, opacity: 0.12 },
                },
                selectedDataBackground: {
                  lineStyle: { color, opacity: 0.9 },
                  areaStyle: { color, opacity: 0.2 },
                },
                textStyle: { color: ink3, fontSize: 10 },
              },
            ]
          : []),
      ],
      series: [
        ...(hasBand
          ? [
              {
                name: 'floor',
                type: 'line' as const,
                data: floor,
                stack: 'band',
                lineStyle: { opacity: 0 },
                symbol: 'none' as const,
                itemStyle: { opacity: 0 },
                silent: true,
                z: 1,
              },
              {
                name: 'band',
                type: 'line' as const,
                data: span,
                stack: 'band',
                lineStyle: { opacity: 0 },
                symbol: 'none' as const,
                areaStyle: { color, opacity: 0.12 },
                silent: true,
                z: 1,
              },
            ]
          : []),
        {
          name: METRIC_BY_VALUE[metric].label,
          type: 'line' as const,
          data: avg,
          showSymbol: false,
          symbolSize: 8,
          lineStyle: { color, width: 2 },
          itemStyle: { color, borderColor: surface, borderWidth: 2 },
          // An explicit null point in the data breaks the line across an
          // outage instead of interpolating a straight line through it.
          connectNulls: false,
          sampling: 'lttb' as const,
          z: 3,
          markLine: thresholds.length
            ? {
                silent: true,
                symbol: 'none' as const,
                lineStyle: { color: ink3, type: 'dashed' as const, width: 1 },
                label: { color: ink3, fontSize: 10, position: 'insideEndTop' as const },
                data: thresholds.map((t) => ({ yAxis: t.value, name: t.label, label: { formatter: t.label } })),
              }
            : undefined,
        },
      ],
    };
  }, [points, metric, unit, thresholds, showBand, showBrush]);

  useEffect(() => {
    if (!holder.current) return;
    const instance = echarts.init(holder.current, undefined, { renderer: 'canvas' });
    chart.current = instance;

    const onResize = () => instance.resize();
    window.addEventListener('resize', onResize);
    const observer = new ResizeObserver(onResize);
    observer.observe(holder.current);

    return () => {
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const handler = (event: { start?: number; end?: number }) => {
      // Fully zoomed out and still dragging outward means the user wants more
      // history than the current window holds.
      if (event.start != null && event.start <= 0.5 && event.end != null && event.end >= 99.5) {
        zoomBeyond.current?.();
      }
    };
    instance.on('datazoom', handler as never);
    return () => {
      instance.off('datazoom', handler as never);
    };
  }, []);

  return (
    <div
      ref={holder}
      style={{ height }}
      className={`w-full transition-opacity duration-quick ease-out ${dimmed ? 'opacity-50' : 'opacity-100'}`}
      role="img"
      aria-label={`${METRIC_BY_VALUE[metric].label} over time`}
    />
  );
}

const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1));

/** Tokens are stored as bare HSL triples for Tailwind; canvas needs a colour. */
const hsl = (triple: string) => (triple.startsWith('#') ? triple : `hsl(${triple})`);
