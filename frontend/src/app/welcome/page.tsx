import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  ChartLine,
  DeviceMobile,
  Drop,
  ShieldCheck,
  WarningCircle,
} from '@phosphor-icons/react';
import TankLevel, { type TankAlert } from '@/components/TankLevel';
import { Sparkline } from '@/components/charts/Sparkline';
import { Button } from '@/components/ui/button';
import type { SeriesPoint } from '@/lib/metrics';

// A week of levels for the preview: drains through the day, refills at night.
const DEMO_SERIES: SeriesPoint[] = Array.from({ length: 168 }, (_, i) => {
  const t = Date.now() - (167 - i) * 3_600_000;
  const day = (i % 24) / 24;
  const v = Math.round((94 - day * 62 + Math.sin(i / 5) * 3) * 10) / 10;
  return [t, v - 1.5, v, v + 1.5];
});

const FEATURES = [
  {
    icon: Drop,
    title: 'Know the level, not a guess',
    body: 'An ultrasonic sensor reads the water line and the server turns it into litres using your tank’s real dimensions — so percent and volume never disagree.',
  },
  {
    icon: WarningCircle,
    title: 'Catch a leak by its drain rate',
    body: 'An overnight drop with no tap running is a leak. AquaMind watches the rate between readings and tells you when it looks wrong.',
  },
  {
    icon: Bell,
    title: 'Alerts you set yourself',
    body: 'Pick the low and full marks that matter for your tank. You get a push when the level crosses them, not a generic threshold.',
  },
];

const STATS = [
  { label: 'Weekly average', value: '840 L', note: '12% below last week' },
  { label: 'Peak usage', value: '8:00 AM', note: 'Consistent for 3 weeks' },
  { label: 'Refills this week', value: '6', note: 'Every night, ~11 PM' },
];

export default function LandingPage() {
  const [level, setLevel] = useState(84);
  const [alert, setAlert] = useState<TankAlert>(null);

  const demos: { label: string; onClick: () => void }[] = [
    {
      label: 'Leak',
      onClick: () => {
        setAlert('leak');
        setLevel((v) => Math.max(0, v - 18));
      },
    },
    {
      label: 'Refill',
      onClick: () => {
        setAlert(null);
        setLevel(96);
      },
    },
    {
      label: 'Low',
      onClick: () => {
        setAlert('low');
        setLevel(12);
      },
    },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="safe-top sticky top-0 z-40 border-b border-hairline bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-header max-w-content items-center gap-3 px-4 sm:px-6">
          <img src="/logo.png" alt="AquaMind" className="h-7 w-7 shrink-0 object-contain" />
          {/* Below 400px the wordmark yields to the two actions; the logo
              still carries the alt text, so nothing is lost to a reader. */}
          <span className="hidden text-title xs:inline">AquaMind</span>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero. One column on a phone; the preview only sits beside the copy
            once there is room for both. */}
        <section className="mx-auto max-w-content px-4 pb-12 pt-10 sm:px-6 sm:pt-16 lg:pb-20 lg:pt-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-wash px-3 py-1 text-caption font-medium text-brand">
                <DeviceMobile size={14} weight="fill" aria-hidden />
                Works on the phone in your pocket
              </span>
              <h1 className="mt-5 text-[2rem] leading-[1.1] tracking-tight sm:text-[2.75rem] lg:text-[3.25rem]">
                Know exactly how much water you have left.
              </h1>
              <p className="mt-4 max-w-lg text-body text-ink-2 sm:text-[1.0625rem]">
                AquaMind reads your tank every few minutes, turns it into litres, and tells you when
                the level drops faster than it should. No climbing up to look.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/signup">
                    Get started
                    <ArrowRight size={18} weight="bold" />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link to="/login">I already have a device</Link>
                </Button>
              </div>
            </div>

            {/* Live preview - a real component, not a picture of one. */}
            <div className="rounded-xl border border-hairline bg-surface p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-caption font-medium uppercase tracking-wide text-ink-3">
                    Roof tank
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-label text-ink-1">
                    <span
                      aria-hidden
                      className={`h-2 w-2 rounded-full ${alert === 'leak' ? 'bg-critical' : alert === 'low' ? 'bg-warning' : 'bg-good'}`}
                    />
                    {alert === 'leak'
                      ? 'Possible leak'
                      : alert === 'low'
                        ? 'Level low'
                        : 'All normal'}
                  </p>
                </div>
                <span className="rounded-md bg-surface-sunk px-2 py-1 text-caption text-ink-2">
                  Live
                </span>
              </div>

              <div className="mx-auto my-5 w-36 sm:w-40">
                <TankLevel level={level} alert={alert} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-surface-sunk px-3 py-2">
                  <p className="text-caption text-ink-3">Volume</p>
                  <p className="mt-0.5 text-metric-sm tnum text-ink-1">
                    {Math.round(level * 9)}
                    <span className="text-label text-ink-3"> L</span>
                  </p>
                </div>
                <div className="rounded-lg bg-surface-sunk px-3 py-2">
                  <p className="text-caption text-ink-3">Used today</p>
                  <p className="mt-0.5 text-metric-sm tnum text-ink-1">
                    212<span className="text-label text-ink-3"> L</span>
                  </p>
                </div>
              </div>

              <div className="mt-5 border-t border-hairline pt-4">
                <p className="text-caption uppercase tracking-wide text-ink-3">Try it</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {demos.map((demo) => (
                    <Button key={demo.label} variant="secondary" size="sm" onClick={demo.onClick}>
                      {demo.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-hairline bg-surface">
          <div className="mx-auto max-w-content px-4 py-14 sm:px-6 lg:py-20">
            <h2 className="max-w-xl text-[1.5rem] leading-tight tracking-tight sm:text-[2rem]">
              Three things a tank sensor should actually do
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="rounded-lg border border-hairline p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-wash text-brand">
                    <feature.icon size={20} weight="fill" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-label text-ink-1">{feature.title}</h3>
                  <p className="mt-2 text-body text-ink-2">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-content px-4 py-14 sm:px-6 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <h2 className="text-[1.5rem] leading-tight tracking-tight sm:text-[2rem]">
                Every reading, kept and browsable
              </h2>
              <p className="mt-4 max-w-lg text-body text-ink-2">
                Pan and pinch through a week or a year. Readings are averaged into buckets as you
                zoom out, with the high and low of each bucket kept — so an overnight draw or a
                refill spike never gets smoothed away.
              </p>
              <dl className="mt-7 space-y-2">
                {STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="flex items-center justify-between gap-4 rounded-lg border border-hairline bg-surface px-4 py-3"
                  >
                    <dt className="text-body text-ink-2">{stat.label}</dt>
                    <dd className="text-right">
                      <div className="text-metric-sm tnum text-ink-1">{stat.value}</div>
                      <div className="text-caption text-ink-3">{stat.note}</div>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-xl border border-hairline bg-surface p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-label text-ink-1">Level, last 7 days</p>
                <span className="inline-flex items-center gap-1.5 text-caption text-ink-3">
                  <ChartLine size={14} aria-hidden />
                  168 readings
                </span>
              </div>
              <div className="mt-3">
                <Sparkline points={DEMO_SERIES} min={0} max={100} height={180} />
              </div>
              <div className="mt-2 flex justify-between text-caption tnum text-ink-3">
                <span>0%</span>
                <span>refills nightly</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-hairline bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:py-24">
            <ShieldCheck size={32} weight="fill" className="mx-auto text-brand" aria-hidden />
            <h2 className="mt-5 text-[1.75rem] leading-tight tracking-tight sm:text-[2.25rem]">
              Set it up once, stop thinking about it
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-body text-ink-2">
              Pair the sensor, enter your tank’s height and shape, and AquaMind handles the rest —
              including firmware updates, which install overnight on their own.
            </p>
            <Button asChild size="lg" className="mt-7">
              <Link to="/signup">
                Get started
                <ArrowRight size={18} weight="bold" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-content flex-col gap-3 px-4 py-8 text-caption text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} AquaMind</span>
          <span>
            Designed by{' '}
            <a
              href="https://UtkarshJoshi.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline"
            >
              UtkarshJoshi
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
