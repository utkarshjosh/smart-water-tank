import { usePageHeading } from '@/components/shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { cn } from '@/lib/utils';
import { errorMessage, useAdminSummary } from '../_shared/useAdminData';

interface SignalRow {
  label: string;
  value: number;
  rate: number;
  detail: string;
  bar: string;
}

export default function AnalyticsPage() {
  usePageHeading('Analytics');
  const summary = useAdminSummary();
  const data = summary.data;

  const total = data?.total_devices ?? 0;
  const online = data?.online_devices ?? 0;
  const offline = data?.offline_devices ?? 0;
  const alerts = data?.recent_alerts_24h ?? 0;
  const readings = data?.measurements_today ?? 0;

  const rate = (n: number) => (total > 0 ? Math.min(100, Math.round((n / total) * 100)) : 0);
  const perDevice = total > 0 ? Math.round(readings / total) : 0;

  const signals: SignalRow[] = [
    {
      label: 'Reporting',
      value: online,
      rate: rate(online),
      detail: 'Devices seen recently',
      bar: 'bg-good',
    },
    {
      label: 'Silent',
      value: offline,
      rate: rate(offline),
      detail: 'No contact inside the offline window',
      bar: 'bg-critical',
    },
    {
      label: 'Alerting',
      value: alerts,
      rate: rate(alerts),
      detail: 'Alerts raised in the last 24 hours',
      bar: 'bg-warning',
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics"
        description="Signal quality, collection volume and current alert pressure."
      />

      {summary.isError && (
        <Alert variant="critical">
          <AlertTitle>Couldn&apos;t load analytics</AlertTitle>
          <AlertDescription>{errorMessage(summary.error, 'Please try again.')}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile
          label="Devices"
          value={total}
          hint={`${online} reporting`}
          loading={summary.isLoading}
        />
        <StatTile label="Tenants" value={data?.total_tenants ?? 0} loading={summary.isLoading} />
        <StatTile
          label="Readings today"
          value={readings}
          hint={total > 0 ? `~${perDevice} per device` : undefined}
          loading={summary.isLoading}
        />
        <StatTile
          label="Alerts 24h"
          value={alerts}
          tone={alerts > 0 ? 'warning' : 'default'}
          loading={summary.isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-label text-ink-2">Fleet signal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {summary.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : total === 0 ? (
            <p className="py-6 text-center text-body text-ink-3">No devices registered yet.</p>
          ) : (
            signals.map((signal) => (
              <div key={signal.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-label text-ink-2">{signal.label}</span>
                  <span className="text-label tnum text-ink-1">
                    {signal.value}
                    <span className="ml-1.5 text-caption font-normal text-ink-3">
                      {signal.rate}%
                    </span>
                  </span>
                </div>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunk"
                  role="meter"
                  aria-label={signal.label}
                  aria-valuenow={signal.rate}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-smooth ease-emphasized',
                      signal.bar
                    )}
                    style={{ width: `${signal.rate}%` }}
                  />
                </div>
                <p className="mt-1.5 text-caption text-ink-3">{signal.detail}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
