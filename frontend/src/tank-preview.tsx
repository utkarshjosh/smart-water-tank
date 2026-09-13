// Development-only visual harness; Vite's production entry remains index.html.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TankLevel, { type TankAlert } from '@/components/TankLevel';
import TankDiagram from '@/components/tank-setup/TankDiagram';
import { Button } from '@/components/ui/button';
import '@/app/globals.css';

export function TankPreview() {
  const [level, setLevel] = useState<number | null>(97);
  const [alert, setAlert] = useState<TankAlert>(null);
  const [stale, setStale] = useState(false);
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <p className="text-caption text-brand">AquaMind · design preview</p>
        <h1 className="mt-2 text-display">Reservoir · your water, at a glance.</h1>
        <p className="mt-2 text-body text-ink-2">
          Interactive sample readings. No device settings are changed.
        </p>
      </div>
      <div className="grid items-start gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-hairline bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-label">Roof tank</h2>
            <span className="text-caption text-ink-3">
              {stale ? 'Last known' : 'Sample reading'}
            </span>
          </div>
          <div className="mx-auto w-64 max-w-full">
            <TankLevel level={level} alert={alert} stale={stale} />
          </div>
          <label className="mt-6 block text-caption text-ink-2">
            Water level
            <input
              aria-label="Water level"
              type="range"
              min="0"
              max="100"
              value={level ?? 0}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="mt-2 w-full accent-blue-600"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { name: 'Refill', level: 100, alert: null },
              { name: 'Low', level: 12, alert: 'low' as const },
              { name: 'Leak', level: 38, alert: 'leak' as const },
              { name: 'Empty', level: 0, alert: null },
              { name: 'No reading', level: null, alert: null },
            ].map((s) => (
              <Button
                size="sm"
                variant="secondary"
                key={s.name}
                onClick={() => {
                  setLevel(s.level);
                  setAlert(s.alert);
                }}
              >
                {s.name}
              </Button>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-2 text-caption text-ink-2">
            <input type="checkbox" checked={stale} onChange={(e) => setStale(e.target.checked)} />
            Last known reading · pause motion
          </label>
        </section>
        <section className="space-y-3">
          {[
            { name: 'Roof tank', level: 97, stale: false },
            { name: 'Garden tank', level: 24, stale: true },
            { name: 'New tank', level: null, stale: false },
          ].map((t) => (
            <div
              key={t.name}
              className="flex items-center gap-4 rounded-lg border border-hairline bg-surface p-4"
            >
              <div className="w-24 shrink-0">
                <TankLevel level={t.level} showLabel={false} stale={t.stale} animated={false} />
              </div>
              <div>
                <p className="text-label">{t.name}</p>
                <p className="mt-1 text-caption text-ink-3">
                  {t.level == null
                    ? 'Awaiting a reading'
                    : t.stale
                      ? 'Offline · last known'
                      : 'Online'}
                </p>
                <p className="mt-2 text-metric-sm">{t.level == null ? '—' : `${t.level}%`}</p>
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-hairline bg-surface p-5">
            <h2 className="text-label">Cuboidal / sump tank</h2>
            <div className="mx-auto w-48">
              <TankLevel level={level} shape="cuboidal" alert={alert} stale={stale} />
            </div>
          </div>
        </section>
      </div>
      <section className="rounded-xl border border-hairline bg-surface p-5">
        <h2 className="text-title">Connected tanks</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <TankDiagram shape="cylindrical" unitCount={2} fillPercent={62} className="h-40 w-full" />
          <TankDiagram shape="cuboidal" unitCount={3} className="h-40 w-full" />
          <TankDiagram shape="cylindrical" unitCount={6} className="h-40 w-full" />
        </div>
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TankPreview />
  </React.StrictMode>
);
