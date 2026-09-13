import type { TankAlert } from './TankLevel';
import './landing-tank.css';

/** Fixed product artwork with a separate gauge for the interactive demo reading. */
export default function LandingTank({ level, alert }: { level: number; alert: TankAlert }) {
  const percent = Math.max(0, Math.min(100, level));
  const tone = alert === 'leak' ? 'bg-critical' : alert === 'low' ? 'bg-warning' : 'bg-brand';

  return (
    <div className="landing-tank">
      <img
        src="/images/landing-tank.webp"
        alt="Illustration of a white rooftop tank with a sensor on its lid and a cutaway revealing blue water"
        width={960}
        height={960}
        className="landing-tank__image"
        fetchPriority="high"
      />
      <div className="landing-tank__reading" aria-live="polite" aria-atomic="true">
        <p className="tnum text-ink-1">
          <span className="text-[2rem] font-medium tracking-tight">{Math.round(percent)}</span>
          <span className="ml-0.5 text-body text-ink-3">%</span>
        </p>
        <p className="text-caption text-ink-3">of tank capacity</p>
      </div>
      <div
        role="meter"
        aria-label="Tank level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mx-auto mt-3 h-1.5 w-32 overflow-hidden rounded-full bg-surface-sunk"
      >
        <div
          className={`landing-tank__gauge h-full rounded-full ${tone}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
