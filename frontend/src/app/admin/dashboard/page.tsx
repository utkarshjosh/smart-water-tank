import { Link } from 'react-router-dom';
import { ArrowUpRight, Waves } from '@phosphor-icons/react';
import { usePageHeading } from '@/components/shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Warning, WifiHigh, WifiSlash } from '@phosphor-icons/react';
import { errorMessage, useAdminSummary } from '../_shared/useAdminData';

function Meter({
  label,
  value,
  detail,
  percent,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  percent: number;
  tone: 'good' | 'warning';
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label text-ink-2">{label}</span>
        <span className="text-label tnum text-ink-1">{value}</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunk"
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-smooth ease-emphasized ${tone === 'good' ? 'bg-good' : 'bg-warning'}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      {detail && <p className="mt-1.5 text-caption text-ink-3">{detail}</p>}
    </div>
  );
}

export default function DashboardPage() {
  usePageHeading('Dashboard');
  const summary = useAdminSummary();
  const data = summary.data;

  const total = data?.total_devices ?? 0;
  const online = data?.online_devices ?? 0;
  const offline = data?.offline_devices ?? 0;
  const alerts = data?.recent_alerts_24h ?? 0;
  const onlineRate = total > 0 ? Math.round((online / total) * 100) : 0;
  const alertLoad = total > 0 ? Math.min(100, Math.round((alerts / total) * 100)) : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="The big picture."
        description="Your entire water network. One clear view."
        actions={
          data && (
            <Badge variant={onlineRate >= 90 ? 'good' : onlineRate >= 60 ? 'warning' : 'critical'}>
              <WifiHigh size={13} weight="fill" aria-hidden />
              {onlineRate}% online
            </Badge>
          )
        }
      />

      <section className="workspace-overview-banner">
        <div><p className="workspace-eyebrow">Operations overview</p><h2>Stay ahead of<br />every drop.</h2><p>Monitor connectivity, spot alerts and keep your fleet moving.</p><Link to="/admin/devices">Explore your devices <ArrowUpRight size={17} /></Link></div>
        <div className="workspace-fleet-reading"><Waves size={38} weight="light" /><span className="tnum">{summary.isLoading || !data ? '—' : `${onlineRate}%`}</span><p>Fleet connectivity</p><small>{data ? `${online} of ${total} devices online` : 'Waiting for fleet data'}</small></div>
      </section>

      {summary.isError && (
        <Alert variant="critical">
          <AlertTitle>Couldn&apos;t load the summary</AlertTitle>
          <AlertDescription>{errorMessage(summary.error, 'Please try again.')}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-label text-ink-2">Operations snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {summary.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : (
              <>
                <Meter
                  label="Fleet connectivity"
                  value={`${online} / ${total}`}
                  detail={`${offline} device${offline === 1 ? '' : 's'} not reporting`}
                  percent={onlineRate}
                  tone="good"
                />
                <Meter
                  label="Alert pressure"
                  value={`${alerts} in 24h`}
                  detail="Alerts raised across the fleet in the last day"
                  percent={alertLoad}
                  tone="warning"
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-label text-ink-2">Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <>
                <AttentionRow
                  icon={<Warning size={18} weight="fill" aria-hidden />}
                  tone="warning"
                  title="Recent alerts"
                  detail="Raised in the last 24 hours"
                  value={alerts}
                />
                <AttentionRow
                  icon={<WifiSlash size={18} weight="fill" aria-hidden />}
                  tone="critical"
                  title="Disconnected"
                  detail="Devices not reporting"
                  value={offline}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Devices" value={total} loading={summary.isLoading} />
        <StatTile label="Online" value={online} tone="good" loading={summary.isLoading} />
        <StatTile
          label="Offline"
          value={offline}
          tone={offline > 0 ? 'critical' : 'default'}
          loading={summary.isLoading}
        />
        <StatTile label="Tenants" value={data?.total_tenants ?? 0} loading={summary.isLoading} />
        <StatTile
          label="Alerts 24h"
          value={alerts}
          tone={alerts > 0 ? 'warning' : 'default'}
          loading={summary.isLoading}
        />
        <StatTile
          label="Readings today"
          value={data?.measurements_today ?? 0}
          loading={summary.isLoading}
        />
      </div>
    </div>
  );
}

function AttentionRow({
  icon,
  tone,
  title,
  detail,
  value,
}: {
  icon: React.ReactNode;
  tone: 'warning' | 'critical';
  title: string;
  detail: string;
  value: number;
}) {
  const classes =
    tone === 'warning'
      ? 'bg-warning-wash text-warning-text'
      : 'bg-critical-wash text-critical-text';

  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${classes}`}>
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-label">{title}</p>
        <p className="text-caption opacity-80">{detail}</p>
      </div>
      <span className="text-metric-sm tnum">{value}</span>
    </div>
  );
}
