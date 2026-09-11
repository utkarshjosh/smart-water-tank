import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { METRIC_BY_VALUE, METRIC_SLUG, type Metric, type SeriesPoint } from '@/lib/metrics';
import { BrushOverview } from './BrushOverview';
import { attachGestures, clampToBounds, type Range } from './gestures';

// uPlot rather than ECharts: measured, ECharts' floor is 125KB gzip before a
// single chart is registered (172KB with line+grid+tooltip, 188KB as we used
// it). uPlot is 23KB and renders these series faster. The interactions below
// are hand-written because of it.

export interface ThresholdLine {
  value: number;
  label: string;
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
  /** Range selector under the plot. Off for compact/preview charts. */
  showBrush?: boolean;
  /** Fires when the user keeps zooming out past the loaded window. */
  onZoomBeyond?: () => void;
  dimmed?: boolean;
}

/** Resolve a CSS custom property - canvas cannot use var(). */
function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Tokens are stored as bare HSL triples for Tailwind; canvas needs a colour. */
const hsl = (triple: string) => (triple.startsWith('#') ? triple : `hsl(${triple})`);

function withAlpha(hex: string, alpha: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const fmtValue = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1));

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
  const tooltip = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  // uPlot's time scale works in seconds.
  const data = useMemo(() => {
    const xs = new Float64Array(points.length);
    const avg = new Array<number | null>(points.length);
    const lo = new Array<number | null>(points.length);
    const hi = new Array<number | null>(points.length);
    points.forEach((p, i) => {
      xs[i] = p[0] / 1000;
      avg[i] = p[2];
      lo[i] = p[1];
      hi[i] = p[3];
    });
    return [xs, avg, lo, hi] as unknown as uPlot.AlignedData;
  }, [points]);

  const bounds = useMemo<Range>(() => {
    if (points.length === 0) return [0, 1];
    return [points[0][0] / 1000, points[points.length - 1][0] / 1000];
  }, [points]);

  const [view, setViewState] = useState<Range>(bounds);
  const [viewOf, setViewOf] = useState<Range>(bounds);

  // A refetch replaces the series, so the window snaps to the new extent.
  // Adjusted during render rather than in an effect: an effect's setState
  // would not have landed by the time the chart effect below builds the plot,
  // leaving the plot on the new extent while the brush still showed the old
  // window. React re-renders immediately here, so both agree.
  if (viewOf[0] !== bounds[0] || viewOf[1] !== bounds[1]) {
    setViewOf(bounds);
    setViewState(bounds);
  }

  const viewRef = useRef(view);
  viewRef.current = view;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const zoomBeyond = useRef(onZoomBeyond);
  zoomBeyond.current = onZoomBeyond;

  const setView = useCallback((next: Range) => {
    const clamped = clampToBounds(next, boundsRef.current);
    setViewState(clamped);
    plot.current?.setScale('x', { min: clamped[0], max: clamped[1] });
  }, []);

  const hasBand =
    showBand && points.some((p) => p[1] != null && p[3] != null && (p[3] as number) - (p[1] as number) > 0);

  useEffect(() => {
    if (!holder.current) return;

    const color = cssVar(`--series-${METRIC_SLUG[metric]}`, '#2a78d6');
    const ink1 = hsl(cssVar('--ink-1', '240 8% 10%'));
    const ink3 = hsl(cssVar('--ink-3', '55 5% 42%'));
    const hairline = hsl(cssVar('--hairline', '45 8% 90%'));
    const surface = hsl(cssVar('--surface', '0 0% 100%'));
    const label = METRIC_BY_VALUE[metric].label;

    const invisible: uPlot.Series = { stroke: 'transparent', points: { show: false }, spanGaps: false };

    const options: uPlot.Options = {
      width: holder.current.clientWidth || 600,
      height,
      padding: [10, 10, 0, 0],
      cursor: {
        // Gestures are ours; uPlot's own drag-to-zoom would fight them.
        drag: { x: false, y: false, setScale: false },
        focus: { prox: 24 },
        points: { size: 8, width: 2, stroke: () => color, fill: () => surface },
      },
      legend: { show: false },
      // viewRef is correct in both cases: reset to the full extent when the
      // series changed, preserved when only styling (metric colour, height)
      // forced a rebuild.
      scales: {
        x: { time: true, min: viewRef.current[0], max: viewRef.current[1] },
        y: metric === 'level_percent' ? { range: [0, 100] } : {},
      },
      axes: [
        {
          stroke: ink3,
          grid: { show: false },
          ticks: { show: false, stroke: hairline },
          font: '11px Inter, system-ui, sans-serif',
          size: 28,
          // Format by TICK SPACING, not total span: a 7-day window still ticks
          // every few hours, and labelling those by date alone repeats
          // "Sep 5, Sep 5, Sep 5". Sub-day ticks show the time, and the
          // midnight tick carries the date so the day is still readable.
          values: (_u, splits) => {
            const gap = splits.length > 1 ? splits[1] - splits[0] : 86400;
            if (gap >= 28 * 86400) {
              return splits.map((v) =>
                new Date(v * 1000).toLocaleString(undefined, { month: 'short', year: '2-digit' })
              );
            }
            if (gap >= 86400) {
              return splits.map((v) =>
                new Date(v * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short' })
              );
            }
            return splits.map((v) => {
              const d = new Date(v * 1000);
              return d.getHours() === 0 && d.getMinutes() === 0
                ? d.toLocaleString(undefined, { day: 'numeric', month: 'short' })
                : d.toLocaleString(undefined, gap >= 3600
                    ? { hour: 'numeric' }
                    : { hour: 'numeric', minute: '2-digit' });
            });
          },
        },
        {
          stroke: ink3,
          grid: { stroke: hairline, width: 1 },
          ticks: { show: false },
          font: '11px Inter, system-ui, sans-serif',
          size: 44,
          ...(metric === 'level_percent' ? { splits: [0, 25, 50, 75, 100] } : {}),
          values: (_u, splits) => splits.map((v) => `${v}${unit}`),
        },
      ],
      series: [
        {},
        {
          label,
          stroke: color,
          width: 2,
          // Nulls stay holes, so the line breaks across an outage instead of
          // interpolating a straight line through it.
          spanGaps: false,
          points: { show: false },
        },
        invisible,
        invisible,
      ],
      bands: hasBand ? [{ series: [3, 2], fill: withAlpha(color, 0.14) }] : [],
      hooks: {
        draw: [
          (u) => {
            if (thresholds.length === 0) return;
            const ctx = u.ctx;
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = ink3;
            ctx.fillStyle = ink3;
            ctx.lineWidth = 1;
            ctx.font = `${10 * devicePixelRatio}px Inter, system-ui, sans-serif`;
            ctx.textBaseline = 'bottom';
            for (const t of thresholds) {
              const y = u.valToPos(t.value, 'y', true);
              if (y < u.bbox.top || y > u.bbox.top + u.bbox.height) continue;
              ctx.beginPath();
              ctx.moveTo(u.bbox.left, y);
              ctx.lineTo(u.bbox.left + u.bbox.width, y);
              ctx.stroke();
              ctx.setLineDash([]);
              const pad = 4 * devicePixelRatio;
              const textW = ctx.measureText(t.label).width;
              ctx.fillStyle = surface;
              ctx.fillRect(u.bbox.left + pad, y - 13 * devicePixelRatio, textW + pad * 2, 12 * devicePixelRatio);
              ctx.fillStyle = ink3;
              ctx.fillText(t.label, u.bbox.left + pad * 2, y - 2 * devicePixelRatio);
              ctx.setLineDash([4, 4]);
            }
            ctx.restore();
          },
        ],
        setCursor: [
          (u) => {
            const node = tooltip.current;
            if (!node) return;
            const idx = u.cursor.idx;
            const value = idx == null ? null : (u.data[1][idx] as number | null);
            if (idx == null || value == null || u.cursor.left == null || u.cursor.left < 0) {
              node.style.opacity = '0';
              return;
            }
            const point = points[idx];
            const when = new Date(point[0]).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
            const spread =
              point[1] != null && point[3] != null && point[3] - point[1] > 0.01
                ? `<div class="mt-0.5 text-[11px] text-ink-3">low ${fmtValue(point[1])}${unit} · high ${fmtValue(point[3])}${unit}</div>`
                : '';
            node.innerHTML = `
              <div class="text-[11px] text-ink-3">${when}</div>
              <div class="mt-0.5 flex items-center gap-1.5 text-label" style="color:${ink1}">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
                ${fmtValue(value)}${unit}
              </div>${spread}`;
            node.style.opacity = '1';

            // Flip the tooltip to the other side near the right edge so it can
            // never escape the viewport on a phone.
            const width = node.offsetWidth;
            const host = u.over.clientWidth;
            const left = u.cursor.left + 14 + width > host ? u.cursor.left - width - 14 : u.cursor.left + 14;
            node.style.transform = `translate(${Math.max(4, left)}px, 8px)`;
          },
        ],
      },
    };

    const instance = new uPlot(options, data, holder.current);
    plot.current = instance;

    const detach = attachGestures(instance.over, instance, {
      getView: () => viewRef.current,
      setView,
      getBounds: () => boundsRef.current,
      // Never zoom past roughly four buckets, or the plot becomes meaningless.
      minSpan: Math.max(60, ((boundsRef.current[1] - boundsRef.current[0]) / Math.max(1, points.length)) * 4),
      onZoomBeyond: () => zoomBeyond.current?.(),
    });

    const observer = new ResizeObserver(() => {
      if (holder.current) instance.setSize({ width: holder.current.clientWidth, height });
    });
    observer.observe(holder.current);

    return () => {
      detach();
      observer.disconnect();
      instance.destroy();
      plot.current = null;
    };
    // The instance is rebuilt when the series identity or its styling changes;
    // panning and zooming go through setScale, not through this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, metric, unit, height, hasBand, thresholds, setView]);

  return (
    <div
      className={`w-full transition-opacity duration-quick ease-out ${dimmed ? 'opacity-50' : 'opacity-100'}`}
    >
      <div className="relative">
        <div ref={holder} role="img" aria-label={`${METRIC_BY_VALUE[metric].label} over time`} />
        <div
          ref={tooltip}
          className="pointer-events-none absolute left-0 top-0 z-10 rounded-md border border-hairline bg-surface px-2.5 py-1.5 opacity-0 shadow-raised transition-opacity duration-instant"
        />
      </div>

      {showBrush && points.length > 1 && (
        <div className="px-2 pb-1 pt-2">
          <BrushOverview
            points={points}
            view={view}
            bounds={bounds}
            color={cssVar(`--series-${METRIC_SLUG[metric]}`, '#2a78d6')}
            onChange={setView}
            minSpan={Math.max(60, ((bounds[1] - bounds[0]) / Math.max(1, points.length)) * 4)}
          />
        </div>
      )}
    </div>
  );
}
