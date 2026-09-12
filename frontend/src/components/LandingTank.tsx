import { useId } from 'react';
import type { TankAlert } from './TankLevel';
import './landing-tank.css';

/** A dimensional cutaway for the landing demo; the water stays tied to its reading. */
export default function LandingTank({ level, alert }: { level: number; alert: TankAlert }) {
  const id = useId().replace(/:/g, '');
  const ref = (name: string) => `url(#${id}-${name})`;
  const percent = Math.max(0, Math.min(100, level));
  // The cylindrical chamber extends from y=112 (full) to y=286 (empty).
  const waterY = 286 - percent * 1.74;

  return (
    <div className="landing-tank">
      <svg
        viewBox="0 0 440 350"
        role="img"
        aria-label={`Roof tank ${Math.round(percent)} percent full, ${alert === 'leak' ? 'possible leak' : alert === 'low' ? 'level low' : 'all normal'}`}
      >
        <defs>
          <linearGradient id={`${id}-shell`} x1="0" x2="1">
            <stop stopColor="#b6c5ce" />
            <stop offset=".16" stopColor="#eff4f6" />
            <stop offset=".38" stopColor="#fff" />
            <stop offset=".72" stopColor="#e7eff3" />
            <stop offset="1" stopColor="#a6b9c6" />
          </linearGradient>
          <linearGradient id={`${id}-water`} x1="0" y1="0" x2=".85" y2="1">
            <stop stopColor="#88beef" />
            <stop offset=".45" stopColor="var(--series-level)" />
            <stop offset="1" stopColor="#124e96" />
          </linearGradient>
          <linearGradient id={`${id}-surface`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#c1e0fa" />
            <stop offset="1" stopColor="#6faee8" />
          </linearGradient>
          <linearGradient id={`${id}-lid`} x1="0" y1="0" x2=".3" y2="1">
            <stop stopColor="#fff" />
            <stop offset="1" stopColor="#d8e2e8" />
          </linearGradient>
          <linearGradient id={`${id}-shine`}>
            <stop stopColor="#fff" stopOpacity="0" />
            <stop offset=".3" stopColor="#fff" stopOpacity=".5" />
            <stop offset=".6" stopColor="#fff" stopOpacity=".1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`${id}-shadow`}>
            <stop stopColor="#526b7c" stopOpacity=".22" />
            <stop offset="1" stopColor="#526b7c" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${id}-chamber`}>
            <path d="M108 112 A112 27 0 0 0 332 112 L332 282 A112 27 0 0 1 108 282Z" />
          </clipPath>
        </defs>

        <ellipse cx="224" cy="320" rx="156" ry="25" fill={ref('shadow')} />
        {/* Low plinth, rolled base and a short outlet give the vessel physical weight. */}
        <path d="M116 287V301C116 337 324 337 324 301V287Z" fill={ref('shell')} stroke="#afc0cb" />
        <ellipse cx="220" cy="289" rx="104" ry="24" fill="#d4dfe5" />
        <path
          d="M317 276H352V299"
          fill="none"
          stroke="#9eafbb"
          strokeWidth="15"
          strokeLinejoin="round"
        />
        <path
          d="M317 273H352V297"
          fill="none"
          stroke="#e1e9ee"
          strokeWidth="9"
          strokeLinejoin="round"
        />
        <ellipse cx="352" cy="299" rx="7.5" ry="3.5" fill="#728d9f" />
        <path
          d="M340 272V261M331 261H349"
          fill="none"
          stroke="#3975a6"
          strokeWidth="4"
          strokeLinecap="round"
        />

        <path
          d="M108 106A112 27 0 0 1 332 106V282A112 27 0 0 1 108 282Z"
          fill={ref('shell')}
          stroke="#b8c8d2"
        />
        <g clipPath={ref('chamber')}>
          <g className="landing-tank__water" style={{ transform: `translateY(${waterY}px)` }}>
            <path d="M108 0H332V310H108Z" fill={ref('water')} />
            <ellipse
              cx="220"
              cy="0"
              rx="112"
              ry="27"
              fill={ref('surface')}
              stroke="#d4ebfc"
              strokeWidth="1.5"
            />
            <ellipse
              cx="220"
              cy="0"
              rx="77"
              ry="18"
              fill="none"
              stroke="#e4f3ff"
              strokeOpacity=".45"
            />
            <path
              d="M164 7C184 17 239 19 270 8"
              fill="none"
              stroke="#fff"
              strokeOpacity=".5"
              strokeLinecap="round"
            />
          </g>
          <path d="M121 109H183V310H121Z" fill={ref('shine')} />
          <path d="M304 107V290" stroke="#e9f6ff" strokeOpacity=".48" strokeWidth="3" />
          {/* Molded horizontal ribs follow the curvature of the tank. */}
          {[151, 195, 239, 278].map((y) => (
            <g key={y}>
              <path
                d={`M107 ${y}C107 ${y + 35} 333 ${y + 35} 333 ${y}`}
                fill="none"
                stroke="#254d6b"
                strokeOpacity=".15"
                strokeWidth="6"
              />
              <path
                d={`M107 ${y - 2}C107 ${y + 33} 333 ${y + 33} 333 ${y - 2}`}
                fill="none"
                stroke="#fff"
                strokeOpacity=".48"
                strokeWidth="2"
              />
            </g>
          ))}
        </g>
        <path
          d="M108 112V282A112 27 0 0 0 332 282V112"
          fill="none"
          stroke="#8da8bc"
          strokeOpacity=".6"
        />

        {/* Domed shoulder and recessed access lid. */}
        <path
          d="M104 108C104 87 129 66 174 60H266C311 66 336 87 336 108V116C336 155 104 155 104 116Z"
          fill={ref('shell')}
          stroke="#b6c6d0"
        />
        <ellipse cx="220" cy="106" rx="116" ry="31" fill={ref('lid')} />
        <path d="M109 110C128 144 312 144 331 110" fill="none" stroke="#fff" strokeWidth="2" />
        <ellipse cx="220" cy="80" rx="68" ry="20" fill="#d1dce4" />
        <path d="M157 71V79C157 102 283 102 283 79V71Z" fill={ref('shell')} stroke="#b4c4cf" />
        <ellipse cx="220" cy="71" rx="63" ry="18" fill={ref('lid')} stroke="#b8c9d4" />
        <ellipse cx="220" cy="70" rx="50" ry="12" fill="none" stroke="#c9d6de" />
        {/* Sensor puck, with a tiny blue status light. */}
        <rect x="200" y="49" width="40" height="17" rx="7" fill="#c1d1dc" />
        <rect x="200" y="46" width="40" height="15" rx="7" fill="#f8fbfd" stroke="#b9cbd7" />
        <rect x="214" y="51" width="12" height="3" rx="1.5" fill="var(--series-level)" />

        <g aria-hidden="true" fill="#6c7c88" fontSize="10" fontFamily="inherit">
          {[0, 50, 100].map((mark) => {
            const y = 286 - mark * 1.74;
            return (
              <g key={mark}>
                <path d={`M76 ${y}H85`} stroke="#b8c7d0" />
                <text x="68" y={y + 3} textAnchor="end">
                  {mark}
                </text>
              </g>
            );
          })}
          <path d="M84 112V286" stroke="#dce4e9" />
        </g>
      </svg>
      <div className="landing-tank__reading" aria-live="polite" aria-atomic="true">
        <p className="tnum text-ink-1">
          <span className="text-[2rem] font-medium tracking-tight">{Math.round(percent)}</span>
          <span className="ml-0.5 text-body text-ink-3">%</span>
        </p>
        <p className="text-caption text-ink-3">of tank capacity</p>
      </div>
    </div>
  );
}
