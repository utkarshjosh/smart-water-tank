import { Suspense, lazy } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Buildings } from '@phosphor-icons/react';
import api from '@/lib/api';
import { usePageHeading } from '@/components/shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusDot } from '@/components/ui/status-dot';
import { relativeTime } from '@/lib/time';
import { errorMessage } from '../../_shared/useAdminData';

const AdminHistoryChart = lazy(() => import('./AdminHistoryChart'));

interface AdminAlert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string | null;
  created_at: string;
}

interface DeviceDetail {
  id: string;
  device_id: string;
  name: string;
  tenant_id: string;
  tenant_name: string;
  status: string;
  firmware_version: string;
  last_seen: string;
  created_at: string;
  config: Record<string, unknown> | null;
  latest_measurement: {
    volume_l: number | null;
    level_cm: number | null;
    temperature_c?: number | null;
    battery_v?: number | null;
    rssi?: number | null;
    timestamp: string;
  } | null;
  recent_alerts: AdminAlert[];
}

const SEVERITY: Record<AdminAlert['severity'], 'critical' | 'serious' | 'warning' | 'brand'> = {
  critical: 'critical',
  high: 'serious',
  medium: 'warning',
  low: 'brand',
};

const num = (value: number | string | null | undefined, digits = 1) => {
  if (value == null) return null;
  const parsed = Number.parseFloat(value.toString());
  return Number.isNaN(parsed) ? null : parsed.toFixed(digits);
};

export default function DeviceDetailClient() {
  const { deviceId } = useParams<{ deviceId: string }>();

  const device = useQuery({
    queryKey: ['admin', 'device', deviceId],
    enabled: Boolean(deviceId),
    queryFn: () => api.get<DeviceDetail>(`/api/v1/admin/devices/${deviceId}`).then((r) => r.data),
  });

  const data = device.data;
  const reading = data?.latest_measurement;

  usePageHeading(data?.name || data?.device_id || deviceId);

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/admin/devices">
          <ArrowLeft size={16} />
          All devices
        </Link>
      </Button>

      {device.isError && (
        <Alert variant="critical">
          <AlertTitle>Couldn&apos;t load this device</AlertTitle>
          <AlertDescription>{errorMessage(device.error, 'Device not found.')}</AlertDescription>
        </Alert>
      )}

      {device.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        data && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h1 className="truncate text-display">{data.name || data.device_id}</h1>
              <p className="mt-1 font-mono text-caption text-ink-3">{data.device_id}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusDot
                status={data.status === 'online' ? 'online' : 'offline'}
                label={data.status === 'online' ? 'Online' : 'Offline'}
              />
              {data.firmware_version && (
                <Badge variant="neutral" className="font-mono">
                  {data.firmware_version}
                </Badge>
              )}
              <Badge variant="brand">
                <Buildings size={13} weight="fill" aria-hidden />
                {data.tenant_name}
              </Badge>
            </div>
          </div>
        )
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <StatTile
          label="Volume"
          value={num(reading?.volume_l, 0)}
          unit="L"
          loading={device.isLoading}
        />
        <StatTile
          label="Level"
          value={num(reading?.level_cm, 1)}
          unit="cm"
          loading={device.isLoading}
        />
        <StatTile
          label="Temp"
          value={num(reading?.temperature_c, 1)}
          unit="°C"
          loading={device.isLoading}
        />
        <StatTile
          label="Battery"
          value={num(reading?.battery_v, 2)}
          unit="V"
          loading={device.isLoading}
        />
        <StatTile
          label="Signal"
          value={num(reading?.rssi, 0)}
          unit="dBm"
          loading={device.isLoading}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-label text-ink-2">Volume history</CardTitle>
            <CardDescription>Last 7 days, loaded on demand.</CardDescription>
          </CardHeader>
          <CardContent className="px-1">
            <Suspense fallback={<Skeleton className="h-[280px] w-full" />}>
              <AdminHistoryChart deviceId={deviceId} />
            </Suspense>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-label text-ink-2">Device</CardTitle>
            </CardHeader>
            <CardContent>
              {device.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                data && (
                  <dl className="space-y-3">
                    <Row label="Last seen" value={relativeTime(data.last_seen, 'Never seen')} />
                    <Row
                      label="Last reading"
                      value={
                        reading?.timestamp
                          ? new Date(reading.timestamp).toLocaleString()
                          : 'No readings yet'
                      }
                    />
                    <Row
                      label="Registered"
                      value={new Date(data.created_at).toLocaleDateString()}
                    />
                    <Row
                      label="Report interval"
                      value={
                        typeof data.config?.report_interval_ms === 'number'
                          ? `${Math.round((data.config.report_interval_ms as number) / 1000)}s`
                          : 'Default'
                      }
                    />
                  </dl>
                )
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-label text-ink-2">Recent alerts</CardTitle>
            </CardHeader>
            <CardContent>
              {device.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : !data?.recent_alerts?.length ? (
                <p className="py-2 text-body text-ink-3">No alerts recorded.</p>
              ) : (
                <ul className="divide-y divide-hairline">
                  {data.recent_alerts.slice(0, 6).map((alert) => (
                    <li key={alert.id} className="flex items-start gap-3 py-2.5 first:pt-0">
                      <Badge variant={SEVERITY[alert.severity] ?? 'neutral'}>
                        {alert.severity}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body text-ink-1">
                          {alert.message ?? alert.type}
                        </p>
                        <p className="text-caption text-ink-3">{relativeTime(alert.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-caption text-ink-3">{label}</dt>
      <dd className="truncate text-right text-body text-ink-1">{value}</dd>
    </div>
  );
}
