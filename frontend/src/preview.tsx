// Temporary visual harness - renders the design system and the chart against
// generated data so the result can be looked at without a backend or auth.
import React, { Suspense, lazy, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusDot } from '@/components/ui/status-dot';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState } from '@/components/ui/empty-state';
import { Sparkline } from '@/components/charts/Sparkline';
import TankLevel from '@/components/TankLevel';
import { METRICS, type Metric, type SeriesPoint } from '@/lib/metrics';
import { Drop, CaretRight, Warning } from '@phosphor-icons/react';
import '@/app/globals.css';

const TimeSeriesChart = lazy(() => import('@/components/charts/TimeSeriesChart'));

// 40 days at 5-minute buckets (~11.5k points), draining through each day with
// a nightly refill, a 14-hour outage, and a min/max spread per bucket.
function makeSeries(): SeriesPoint[] {
  const now = Date.now();
  const start = now - 40 * 86_400_000;
  const out: SeriesPoint[] = [];
  for (let t = start; t < now; t += 300_000) {
    const outage = t > now - 3 * 86_400_000 && t < now - 3 * 86_400_000 + 14 * 3_600_000;
    if (outage) continue;
    const day = ((t - start) % 86_400_000) / 86_400_000;
    const pct = Math.max(6, 96 - day * 74 + Math.sin(t / 4e6) * 3);
    const spread = 1.2 + Math.abs(Math.sin(t / 9e6)) * 2.4;
    out.push([t, +(pct - spread).toFixed(2), +pct.toFixed(2), +(pct + spread).toFixed(2)]);
  }
  // Insert the explicit gap marker the backend emits across an outage.
  const cut = out.findIndex((p, i) => out[i + 1] && out[i + 1][0] - p[0] > 600_000);
  if (cut > 0) out.splice(cut + 1, 0, [out[cut][0] + 300_000, null, null, null]);
  return out;
}

const SERIES = makeSeries();

// Range chips slice the series, mirroring how the real app refetches a
// different window - so the harness exercises a genuine bounds change.
const RANGE_HOURS: Record<string, number> = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30, '90d': 24 * 90 };
const sliceFor = (range: string) => {
  const hours = RANGE_HOURS[range] ?? 24 * 7;
  const cutoff = SERIES[SERIES.length - 1][0] - hours * 3_600_000;
  const sliced = SERIES.filter((p) => p[0] >= cutoff);
  return sliced.length > 1 ? sliced : SERIES;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-title">{title}</h2>
      {children}
    </section>
  );
}

function Preview() {
  const [metric, setMetric] = useState<Metric>('level_percent');
  const [range, setRange] = useState('7d');

  return (
    <div className="mx-auto max-w-content space-y-8 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-display">AquaMind</h1>
        <p className="mt-1 text-body text-ink-2">Design system and chart preview</p>
      </header>

      <Section title="Browsable history">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            aria-label="Metric"
            value={metric}
            onChange={setMetric}
            options={METRICS.map((m) => ({ value: m.value, label: m.label, swatch: m.color }))}
          />
          <SegmentedControl
            aria-label="Range"
            className="ml-auto"
            value={range}
            onChange={setRange}
            options={[
              { value: '24h', label: '24h' },
              { value: '7d', label: '7d' },
              { value: '30d', label: '30d' },
              { value: '90d', label: '90d' },
            ]}
          />
        </div>
        <Card className="overflow-hidden">
          <div className="h-0.5 bg-brand opacity-0" />
          <CardContent className="px-1 pb-2 pt-2">
            <Suspense fallback={<Skeleton className="h-[360px] w-full" />}>
              <TimeSeriesChart
                points={sliceFor(range)}
                metric={metric}
                unit={METRICS.find((m) => m.value === metric)!.unit}
                height={360}
                thresholds={[
                  { value: 20, label: 'Low' },
                  { value: 90, label: 'Full' },
                ]}
              />
            </Suspense>
          </CardContent>
        </Card>
        <p className="text-caption text-ink-3">
          2,016 points · 5-minute averages · drag to pan, pinch or scroll to zoom
        </p>
      </Section>

      <Section title="Readings">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Level" value="42" unit="%" />
          <StatTile label="Volume" value="378" unit="L" />
          <StatTile label="Temp" value="24.6" unit="°C" />
          <StatTile label="Battery" value="4.09" unit="V" tone="good" />
        </div>
      </Section>

      <Section title="Tank levels">
        <Card>
          <CardContent className="flex flex-wrap items-end justify-around gap-6 pt-5">
            <div className="w-36">
              <TankLevel level={82} />
            </div>
            <div className="w-36">
              <TankLevel level={14} alert="low" />
            </div>
            <div className="w-36">
              <TankLevel level={38} alert="leak" />
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Device card (mobile width)">
        <div className="max-w-sm">
          <a className="group flex items-center gap-4 rounded-lg border border-hairline bg-surface p-4 transition-[border-color,transform] duration-instant ease-out hover:border-line-strong">
            <div className="w-14 shrink-0">
              <TankLevel level={42} showLabel={false} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-label text-ink-1">Roof tank</p>
              <StatusDot className="mt-1" status="online" label="Online" />
              <p className="mt-2 text-metric-sm tnum text-ink-1">
                42<span className="text-label text-ink-3">%</span>
                <span className="ml-2 text-caption text-ink-3">378L</span>
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-caption text-warning-text">
                <Warning size={13} weight="fill" /> Level low
              </p>
            </div>
            <CaretRight size={16} className="shrink-0 text-ink-3" />
          </a>
        </div>
      </Section>

      <Section title="24h sparkline (no chart bundle)">
        <Card>
          <CardHeader>
            <CardTitle className="text-label text-ink-2">Last 24 hours</CardTitle>
          </CardHeader>
          <CardContent className="px-2">
            <Sparkline points={SERIES.slice(-288)} min={0} max={100} height={120} />
          </CardContent>
        </Card>
      </Section>

      <Section title="Controls">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="brand">Brand</Badge>
          <Badge variant="good">Online</Badge>
          <Badge variant="warning">Medium</Badge>
          <Badge variant="serious">High</Badge>
          <Badge variant="critical">Critical</Badge>
        </div>
        <div className="grid max-w-md gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="a">Low level (%)</Label>
            <Input id="a" defaultValue="20" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b">Full level (%)</Label>
            <Input id="b" placeholder="90" />
          </div>
        </div>
      </Section>

      <Section title="Feedback">
        <div className="space-y-2">
          <Alert variant="info">
            <AlertTitle>Firmware 1.1.3 available</AlertTitle>
            <AlertDescription>Updates install automatically overnight.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTitle>Level is low</AlertTitle>
            <AlertDescription>Roof tank dropped below 20%.</AlertDescription>
          </Alert>
          <Alert variant="critical">
            <AlertTitle>Possible leak</AlertTitle>
            <AlertDescription>Unusual drain rate overnight.</AlertDescription>
          </Alert>
        </div>
        <EmptyState
          icon={Drop}
          title="No devices yet"
          description="Pair your first AquaMind sensor to start seeing live data."
          action={<Button>Pair your first device</Button>}
        />
      </Section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>
);
