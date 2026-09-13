import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import './tank-visual.css';

export type TankShape = 'cylindrical' | 'cuboidal';

/** Reservoir: a familiar tank silhouette with a measured, gently moving waterline. */
export function TankVisual({
  level,
  shape = 'cylindrical',
  animated = true,
  className,
}: {
  level: number | null;
  shape?: TankShape;
  animated?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const url = (name: string) => `url(#${id}-${name})`;
  const svg = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState(false);
  const value = level != null && Number.isFinite(level) ? Math.max(0, Math.min(100, level)) : null;
  const moving = animated && visible && value != null && value > 0 && value < 100;
  const corner = shape === 'cuboidal' ? 10 : 28;
  const waterY = 166 - ((value ?? 0) / 100) * 140;
  const wave = 'M-100 0Q-75 -7 -50 0T0 0T50 0T100 0T150 0T200 0T250 0T300 0V210H-100Z';

  useEffect(() => {
    const element = svg.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <svg
      ref={svg}
      viewBox="0 0 200 196"
      className={cn('tank-visual', className)}
      data-moving={moving}
      data-pattern="reservoir"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`${id}-chamber`}>
          <rect x="38" y="26" width="124" height="140" rx={corner} />
        </clipPath>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2=".6" y2="1">
          <stop stopColor="#74b5ef" />
          <stop offset="1" stopColor="var(--series-level)" />
        </linearGradient>
      </defs>
      <rect
        x="28"
        y="16"
        width="144"
        height="160"
        rx={corner + 9}
        fill="none"
        stroke="hsl(var(--hairline))"
        strokeWidth="1"
      />
      <rect x="38" y="26" width="124" height="140" rx={corner} fill="hsl(var(--brand-wash))" />
      <path d="M85 16H115" stroke="hsl(var(--brand))" strokeWidth="4" strokeLinecap="round" />
      <g clipPath={url('chamber')}>
        {value != null && (
          <g
            className="tank-visual__level"
            style={{ transform: `translateY(${waterY}px)`, opacity: value > 0 ? 1 : 0 }}
          >
            {value === 100 ? (
              <path d="M0 0H200V200H0Z" fill={url('water')} />
            ) : (
              <>
                <path
                  d={wave}
                  fill="#89bfed"
                  opacity=".42"
                  transform="translate(0 -5)"
                  className="tank-visual__wave tank-visual__wave--back"
                />
                <path d={wave} fill={url('water')} className="tank-visual__wave" />
              </>
            )}
          </g>
        )}
        {value != null && value > 0 && (
          <g fill="none" stroke="#fff" strokeWidth="1.2" opacity=".28">
            <path d="M47 127Q91 139 143 124M60 145Q103 152 132 143" />
          </g>
        )}
      </g>
      {value == null && (
        <g stroke="hsl(var(--ink-3))" strokeWidth="2" strokeLinecap="round">
          <path d="M94 96H106" />
        </g>
      )}
      <circle cx="100" cy="187" r="2" fill="hsl(var(--brand))" opacity=".35" />
    </svg>
  );
}
