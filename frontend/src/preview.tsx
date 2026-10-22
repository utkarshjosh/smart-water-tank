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
import { Drop, CaretRight, Warning, Cpu } from '@phosphor-icons/react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { UsageBarChart } from '@/components/charts/UsageBarChart';
import { UsageHistoryBody } from '@/app/app/devices/[deviceId]/UsageHistoryBody';
import { PageHeader } from '@/components/ui/page-header';
import { relativeTime, timeSortValue } from '@/lib/time';
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

// 30 days of usage: a few refill days, one flagged day, two not yet aggregated.
// A plausible day: morning and evening draws, two fills from the main line.
const DEMO_HOURS = Array.from({ length: 24 }, (_, h) => {
  const used = [0, 0, 0, 0, 0, 4, 38, 92, 61, 24, 18, 12, 30, 22, 8, 6, 10, 28, 64, 55, 31, 12, 4, 0][h];
  const filled = h === 7 ? 380 : h === 19 ? 260 : 0;
  const label = new Date(2026, 9, 18, h).toLocaleTimeString(undefined, { hour: 'numeric' });
  const next = new Date(2026, 9, 18, h + 1).toLocaleTimeString(undefined, { hour: 'numeric' });
  return { key: String(h), tick: label, title: `${label} – ${next}`, usedL: h === 3 ? null : used, filledL: filled };
});

// The live tank's real week (14-18 Oct 2026), padded to 30 days with gaps.
const REAL = { '2026-10-14': [802, 834, 2, 22], '2026-10-15': [540, 540, 2, 24], '2026-10-16': [425, 425, 2, 24], '2026-10-17': [638, 605, 1, 24], '2026-10-18': [720, 622, 1, 19] } as Record<string, number[]>;
const DEMO_HISTORY = (() => {
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 8, 21 + i)).toISOString().slice(0, 10));
  const buckets = days.map((d) => {
    const r = REAL[d];
    return { key: d, start: d, end: d, used_l: r ? r[0] : null, filled_l: r ? r[1] : null, refills: r ? r[2] : 0, leak_days: 0, days_with_data: r ? 1 : 0, full_days: r && r[3] >= 20 ? 1 : 0 };
  });
  const hourShape = [0, 0, 0, 0, 0, 6, 22, 40, 18, 35, 42, 30, 20, 8, 4, 4, 6, 25, 30, 22, 12, 6, 2, 0];
  return {
    device_id: 'esp8266-e3f7f7', timezone: 'Asia/Kolkata', from: days[0], to: days[29], group: 'day' as const, today: '2026-10-20',
    capacity_l: 1145, full_day_hours: 20, buckets,
    totals: { used_l: 3125, filled_l: 3026, refills: 8, days: 30, days_with_data: 5, full_days: 4, daily_average_l: 601.3,
      busiest_day: { date: '2026-10-14', used_l: 802 }, quietest_day: { date: '2026-10-16', used_l: 425 } },
    by_weekday: [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, average_l: [null, null, 802, 540, 425, 638, null][w], days: [0, 0, 1, 1, 1, 1, 0][w] })),
    by_hour: hourShape.map((v, h) => ({ hour: h, average_l: v, samples: 4 })),
  };
})();

const DEMO_USAGE = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.now() - (29 - i) * 86_400_000);
  const pending = i >= 28;
  return {
    date: d.toISOString().slice(0, 10),
    used_l: pending ? null : Math.round(420 + Math.sin(i / 3) * 180 + (i % 7 === 0 ? 220 : 0)),
    min_l: 120,
    avg_l: 480,
    max_l: 900,
    refill_events: i % 4 === 0 ? 1 : 0,
    leak_suspected: i === 11,
    readings: 288,
  };
});

interface DemoRow {
  id: string;
  name: string;
  device_id: string;
  tenant: string;
  status: string;
  firmware: string;
  volume: number | null;
  last_seen: string | null;
}

const DEMO_ROWS: DemoRow[] = [
  {
    id: '1',
    name: 'Roof tank',
    device_id: 'tank-001',
    tenant: 'Joshi Home',
    status: 'online',
    firmware: '1.1.3',
    volume: 756,
    last_seen: new Date(Date.now() - 4 * 60_000).toISOString(),
  },
  {
    id: '2',
    name: 'Ground sump',
    device_id: 'tank-002',
    tenant: 'Joshi Home',
    status: 'online',
    firmware: '1.1.3',
    volume: 1240,
    last_seen: new Date(Date.now() - 12 * 60_000).toISOString(),
  },
  {
    id: '3',
    name: 'Terrace overhead',
    device_id: 'tank-014',
    tenant: 'Mehta Residency',
    status: 'offline',
    firmware: '1.0.9',
    volume: null,
    last_seen: new Date(Date.now() - 52 * 3_600_000).toISOString(),
  },
  {
    id: '4',
    name: 'Block B riser',
    device_id: 'tank-031',
    tenant: 'Mehta Residency',
    status: 'online',
    firmware: '1.1.3',
    volume: 430,
    last_seen: new Date(Date.now() - 90_000).toISOString(),
  },
  {
    id: '5',
    name: 'Unnamed',
    device_id: 'tank-077',
    tenant: 'Pilot fleet',
    status: 'offline',
    firmware: '',
    volume: null,
    last_seen: null,
  },
];

const DEMO_COLUMNS: Column<DemoRow>[] = [
  {
    key: 'name',
    header: 'Device',
    primary: true,
    sortValue: (r) => r.name,
    cell: (r) => (
      <div className="min-w-0">
        <div className="truncate text-label text-ink-1">{r.name}</div>
        <div className="truncate font-mono text-caption text-ink-3">{r.device_id}</div>
      </div>
    ),
  },
  {
    key: 'tenant',
    header: 'Tenant',
    sortValue: (r) => r.tenant,
    cell: (r) => <span className="text-ink-2">{r.tenant}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    sortValue: (r) => r.status,
    cell: (r) => (
      <StatusDot
        status={r.status === 'online' ? 'online' : 'offline'}
        label={r.status === 'online' ? 'Online' : 'Offline'}
      />
    ),
  },
  {
    key: 'firmware',
    header: 'Firmware',
    sortValue: (r) => r.firmware,
    cell: (r) =>
      r.firmware ? (
        <Badge variant="neutral" className="font-mono">
          {r.firmware}
        </Badge>
      ) : (
        <span className="text-ink-3">Unknown</span>
      ),
  },
  {
    key: 'volume',
    header: 'Volume',
    align: 'right',
    sortValue: (r) => r.volume,
    cell: (r) =>
      r.volume == null ? (
        <span className="text-ink-3">—</span>
      ) : (
        <span className="tnum">{r.volume} L</span>
      ),
  },
  {
    key: 'last_seen',
    header: 'Last seen',
    align: 'right',
    sortValue: (r) => timeSortValue(r.last_seen),
    cell: (r) => <span className="whitespace-nowrap text-ink-2">{relativeTime(r.last_seen)}</span>,
  },
];

// Range chips slice the series, mirroring how the real app refetches a
// different window - so the harness exercises a genuine bounds change.
const RANGE_HOURS: Record<string, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  '90d': 24 * 90,
};
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
            <div className="w-24 shrink-0">
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

      <Section title="Admin table (table on desktop, cards on mobile)">
        <PageHeader title="Devices" description="Provisioned sensors and reporting state." />
        <DataTable
          rows={DEMO_ROWS}
          columns={DEMO_COLUMNS}
          getRowKey={(r) => r.id}
          onRowClick={() => {}}
          initialSort={{ key: 'last_seen', direction: 'desc' }}
          caption="Devices"
          empty={<EmptyState icon={Cpu} title="No devices" />}
        />
      </Section>

      <Section title="Daily usage (no chart bundle)">
        <Card>
          <CardHeader>
            <CardTitle className="text-label text-ink-2">Daily usage</CardTitle>
          </CardHeader>
          <CardContent>
            <UsageBarChart
              ariaLabel="Water used per day"
              showFills={false}
              slots={DEMO_USAGE.map((d) => ({
                key: d.date,
                tick: d.date.slice(5),
                title: d.date,
                usedL: d.used_l,
                note: d.refill_events ? `filled ${d.refill_events}×` : undefined,
                alert: d.leak_suspected,
              }))}
            />
          </CardContent>
        </Card>
      </Section>

      <Section title="Usage history (History tab)">
        <UsageHistoryBody data={DEMO_HISTORY} fetching={false} />
      </Section>

      <Section title="Hourly usage">
        <Card>
          <CardHeader>
            <CardTitle className="text-label text-ink-2">Water used per hour</CardTitle>
          </CardHeader>
          <CardContent>
            <UsageBarChart slots={DEMO_HOURS} ariaLabel="Water used and added per hour" />
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
