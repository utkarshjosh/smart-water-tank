import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Flat SVG replacement for GlassTank, which was a perspective-[1000px],
 * backdrop-blurred skeuomorphic cylinder mounted on a hardcoded #0f172a panel
 * inside otherwise-light pages, then scaled down to 0.68.
 *
 * Sized by WIDTH: the svg is `w-full h-auto`, so the caller sets a width and
 * the height follows the aspect ratio. (Height-driven sizing collapsed the
 * element to zero width inside a flex row.)
 */
export type TankAlert = 'leak' | 'low' | null;

const TONE: Record<'normal' | 'leak' | 'low', { fill: string; text: string }> = {
  normal: { fill: 'var(--series-level)', text: 'text-ink-1' },
  low: { fill: 'hsl(var(--warning))', text: 'text-warning-text' },
  leak: { fill: 'hsl(var(--critical))', text: 'text-critical-text' },
};

// Squat proportions and a visible base read as a water tank; the tall narrow
// capsule the first pass used read as a phone battery icon.
const VB_W = 120;
const VB_H = 104;
const BODY_X = 10;
const BODY_W = 100;
const BODY_TOP = 14;
const BODY_H = 78;

export function TankLevel({
  level,
  alert = null,
  showLabel = true,
  className,
}: {
  level: number;
  alert?: TankAlert;
  showLabel?: boolean;
  className?: string;
}) {
  const target = Math.max(0, Math.min(100, level));
  const [fill, setFill] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setFill(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const tone = TONE[alert ?? 'normal'];
  const fillH = (BODY_H * fill) / 100;
  const fillY = BODY_TOP + BODY_H - fillH;

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Tank ${Math.round(target)} percent full`}
      >
        <defs>
          <clipPath id="tank-body-clip">
            <rect x={BODY_X} y={BODY_TOP} width={BODY_W} height={BODY_H} rx="12" />
          </clipPath>
        </defs>

        {/* Inlet pipe and lid. */}
        <rect x="52" y="0" width="16" height="9" rx="3" fill="hsl(var(--line-strong))" />
        <rect x={BODY_X - 4} y="8" width={BODY_W + 8} height="8" rx="4" fill="hsl(var(--line-strong))" />

        <rect
          x={BODY_X}
          y={BODY_TOP}
          width={BODY_W}
          height={BODY_H}
          rx="12"
          fill="hsl(var(--surface-sunk))"
        />

        <g clipPath="url(#tank-body-clip)">
          <rect
            x={BODY_X}
            y={fillY}
            width={BODY_W}
            height={fillH}
            fill={tone.fill}
            style={{ transition: 'y 700ms var(--ease-emphasized), height 700ms var(--ease-emphasized)' }}
          />
          {/* Water surface: the one line that makes it read as liquid. */}
          {fill > 0.5 && fill < 99.5 && (
            <rect
              x={BODY_X}
              y={fillY - 1}
              width={BODY_W}
              height="2.5"
              fill={tone.fill}
              opacity="0.55"
              style={{ transition: 'y 700ms var(--ease-emphasized)' }}
            />
          )}
          {/* Quarter gauge marks, drawn short so they read as graduations. */}
          {[25, 50, 75].map((mark) => {
            const y = BODY_TOP + BODY_H - (BODY_H * mark) / 100;
            return (
              <line
                key={mark}
                x1={BODY_X}
                x2={BODY_X + 14}
                y1={y}
                y2={y}
                stroke="hsl(var(--line-strong))"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            );
          })}
        </g>

        <rect
          x={BODY_X}
          y={BODY_TOP}
          width={BODY_W}
          height={BODY_H}
          rx="12"
          fill="none"
          stroke="hsl(var(--line-strong))"
          strokeWidth="2"
        />

        {/* Feet, so the tank sits on something. */}
        <rect x="22" y={BODY_TOP + BODY_H} width="14" height="8" rx="2" fill="hsl(var(--line-strong))" />
        <rect x="84" y={BODY_TOP + BODY_H} width="14" height="8" rx="2" fill="hsl(var(--line-strong))" />
      </svg>

      {showLabel && (
        <p className={cn('text-metric tnum', tone.text)}>
          {Math.round(target)}
          <span className="text-label text-ink-3">%</span>
        </p>
      )}
    </div>
  );
}

export default TankLevel;
