import { useMemo } from 'react';
import type { SeriesPoint } from '@/lib/metrics';

/**
 * Dependency-free trace for preview contexts. Exists so opening a device does
 * not pull the ~189KB ECharts bundle for a glanceable 24-hour shape - that
 * chunk now loads only when the user actually opens the History tab.
 *
 * Renders gaps as breaks, matching the real chart: each run of consecutive
 * non-null points becomes its own path.
 */
export function Sparkline({
  points,
  color = 'var(--series-level)',
  height = 120,
  min,
  max,
}: {
  points: SeriesPoint[];
  color?: string;
  height?: number;
  /** Pin the domain (level% pins 0..100 so the shape is not exaggerated). */
  min?: number;
  max?: number;
}) {
  const { paths, area } = useMemo(() => {
    const W = 300;
    const H = 100;
    const real = points.filter((p) => p[2] != null);
    if (real.length < 2) return { paths: [], area: '' };

    const t0 = points[0][0];
    const t1 = points[points.length - 1][0];
    const tSpan = Math.max(1, t1 - t0);
    const values = real.map((p) => p[2] as number);
    const lo = min ?? Math.min(...values);
    const hi = max ?? Math.max(...values);
    const vSpan = Math.max(1e-6, hi - lo);

    const x = (t: number) => ((t - t0) / tSpan) * W;
    const y = (v: number) => H - ((v - lo) / vSpan) * H;

    // Split into runs so an outage leaves a visible break.
    const runs: [number, number][][] = [];
    let run: [number, number][] = [];
    for (const p of points) {
      if (p[2] == null) {
        if (run.length > 1) runs.push(run);
        run = [];
      } else {
        run.push([x(p[0]), y(p[2])]);
      }
    }
    if (run.length > 1) runs.push(run);

    const toPath = (r: [number, number][]) =>
      r.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join('');

    const longest = runs.reduce((a, b) => (b.length > a.length ? b : a), runs[0] ?? []);
    const areaPath = longest.length
      ? `${toPath(longest)}L${longest[longest.length - 1][0].toFixed(1)},${H}L${longest[0][0].toFixed(1)},${H}Z`
      : '';

    return { paths: runs.map(toPath), area: areaPath };
  }, [points, min, max]);

  if (paths.length === 0) return null;

  return (
    <svg
      viewBox="0 0 300 100"
      preserveAspectRatio="none"
      style={{ height }}
      className="w-full"
      aria-hidden
    >
      {area && <path d={area} fill={color} opacity={0.1} />}
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export default Sparkline;
