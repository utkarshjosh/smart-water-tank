import { useCallback, useMemo, useRef } from 'react';
import type { SeriesPoint } from '@/lib/metrics';
import type { Range } from './gestures';
import { clampToBounds } from './gestures';

const W = 1000;
const H = 100;
const HANDLE_HIT = 14;

type DragMode = 'lo' | 'hi' | 'body' | null;

/**
 * Range selector under the plot: the whole series in miniature with the
 * visible window cut out of a scrim. Drag a handle to resize, drag the middle
 * to scrub. Kept as plain SVG so it costs nothing on top of uPlot.
 */
export function BrushOverview({
  points,
  view,
  bounds,
  color,
  onChange,
  minSpan,
}: {
  points: SeriesPoint[];
  /** Visible window, in the same seconds-domain uPlot uses. */
  view: Range;
  bounds: Range;
  color: string;
  onChange: (range: Range) => void;
  minSpan: number;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ mode: DragMode; startX: number; startView: Range }>({
    mode: null,
    startX: 0,
    startView: view,
  });

  const path = useMemo(() => {
    const real = points.filter((p) => p[2] != null);
    if (real.length < 2) return '';
    const span = Math.max(1, bounds[1] - bounds[0]);
    const values = real.map((p) => p[2] as number);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const vSpan = Math.max(1e-6, hi - lo);

    const runs: string[] = [];
    let run: string[] = [];
    for (const p of points) {
      if (p[2] == null) {
        if (run.length > 1) runs.push(run.join(''));
        run = [];
        continue;
      }
      const x = ((p[0] / 1000 - bounds[0]) / span) * W;
      const y = H - ((p[2] - lo) / vSpan) * H;
      run.push(`${run.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    if (run.length > 1) runs.push(run.join(''));
    return runs.join(' ');
  }, [points, bounds]);

  const toX = useCallback(
    (value: number) => ((value - bounds[0]) / Math.max(1, bounds[1] - bounds[0])) * W,
    [bounds]
  );

  const perPixel = useCallback(() => {
    const width = svg.current?.clientWidth ?? 1;
    return (bounds[1] - bounds[0]) / Math.max(1, width);
  }, [bounds]);

  const onPointerDown = (mode: DragMode) => (event: React.PointerEvent) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode, startX: event.clientX, startView: view };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const { mode, startX, startView } = drag.current;
    if (!mode) return;
    const delta = (event.clientX - startX) * perPixel();

    if (mode === 'body') {
      onChange(clampToBounds([startView[0] + delta, startView[1] + delta], bounds));
      return;
    }
    if (mode === 'lo') {
      const lo = Math.min(startView[0] + delta, startView[1] - minSpan);
      onChange([Math.max(bounds[0], lo), startView[1]]);
      return;
    }
    const hi = Math.max(startView[1] + delta, startView[0] + minSpan);
    onChange([startView[0], Math.min(bounds[1], hi)]);
  };

  const endDrag = () => {
    drag.current.mode = null;
  };

  const loX = toX(view[0]);
  const hiX = toX(view[1]);

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-9 w-full cursor-ew-resize touch-none select-none"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="slider"
      aria-label="Visible time range"
      aria-valuemin={bounds[0]}
      aria-valuemax={bounds[1]}
      aria-valuenow={view[0]}
      aria-valuetext={`${new Date(view[0] * 1000).toLocaleString()} to ${new Date(view[1] * 1000).toLocaleString()}`}
      data-view={`${Math.round(view[0])},${Math.round(view[1])}`}
    >
      <rect x="0" y="0" width={W} height={H} fill="hsl(var(--surface-sunk))" rx="4" />
      {path && <path d={path} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity="0.55" />}

      {/* Scrim over what is not currently in view. */}
      <rect x="0" y="0" width={Math.max(0, loX)} height={H} fill="hsl(var(--surface))" opacity="0.72" />
      <rect x={hiX} y="0" width={Math.max(0, W - hiX)} height={H} fill="hsl(var(--surface))" opacity="0.72" />

      <rect
        x={loX}
        y="0"
        width={Math.max(1, hiX - loX)}
        height={H}
        fill={color}
        opacity="0.1"
        onPointerDown={onPointerDown('body')}
        style={{ cursor: 'grab' }}
      />

      {([
        ['lo', loX],
        ['hi', hiX],
      ] as const).map(([mode, x]) => (
        <g key={mode} onPointerDown={onPointerDown(mode)} style={{ cursor: 'ew-resize' }}>
          {/* Invisible widened hit area - a 2px handle is unusable with a thumb. */}
          <rect x={x - HANDLE_HIT} y="0" width={HANDLE_HIT * 2} height={H} fill="transparent" />
          <rect x={x - 1.5} y="0" width="3" height={H} fill={color} rx="1.5" />
        </g>
      ))}
    </svg>
  );
}
