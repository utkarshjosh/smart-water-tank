import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Activity, AlertCircle, ArrowLeft, Battery, Building2, Clock, Cpu, Droplets, Radio, Thermometer } from 'lucide-react';

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
  config: any;
  latest_measurement: {
    volume_l: number | null;
    level_cm: number | null;
    temperature_c?: number | null;
    battery_v?: number | null;
    rssi?: number | null;
    timestamp: string;
  } | null;
  recent_alerts: any[];
}

const DeviceHistoryChart = lazy(() => import('./DeviceHistoryChart'));

export default function DeviceDetailClient() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (deviceId) {
      fetchDevice();
      fetchHistory();
    }
  }, [deviceId]);

  const fetchDevice = async () => {
    try {
      const response = await api.get(`/api/v1/admin/devices/${deviceId}`);
      setDevice(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch device');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await api.get(`/api/v1/user/devices/${deviceId}/history?days=7&limit=100`);
      setHistory(response.data.measurements || []);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const formatNumber = (value: number | string | null | undefined, digits = 1) => {
    if (value === null || value === undefined) return 'N/A';
    const parsed = Number.parseFloat(value.toString());
    return Number.isNaN(parsed) ? 'N/A' : parsed.toFixed(digits);
  };

  const formatTimestamp = (value: string | null | undefined) => {
    if (!value) return 'Never';
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return 'Unknown';
    return new Date(value).toLocaleString();
  };

  const formatRelativeTime = (value: string | null | undefined) => {
    if (!value) return 'Never seen';
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return 'Unknown';

    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;

    return new Date(value).toLocaleDateString();
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex h-full items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (error || !device) {
    return (
      <Layout>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error || 'Device not found'}</AlertDescription>
        </Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Button variant="ghost" onClick={() => navigate('/admin/devices')} className="mb-2 h-8 px-2 text-slate-600 dark:text-slate-300">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Devices
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {device.name || device.device_id}
              </h1>
              <Badge
                variant={device.status === 'online' ? 'default' : 'destructive'}
                className={device.status === 'online' ? 'bg-emerald-600 hover:bg-emerald-600' : ''}
              >
                {device.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {device.device_id} · {device.tenant_name || 'Unassigned tenant'}
            </p>
          </div>
          <div className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
            <Radio className={`h-4 w-4 ${device.status === 'online' ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`} />
            {formatRelativeTime(device.last_seen)}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Volume', value: `${formatNumber(device.latest_measurement?.volume_l)}L`, detail: 'Latest stored water', icon: Droplets, color: 'text-sky-600 dark:text-sky-300' },
            { label: 'Level', value: `${formatNumber(device.latest_measurement?.level_cm)}cm`, detail: 'Current sensor level', icon: Activity, color: 'text-emerald-600 dark:text-emerald-300' },
            { label: 'Battery', value: device.latest_measurement?.battery_v ? `${formatNumber(device.latest_measurement.battery_v, 2)}V` : 'N/A', detail: 'Last reported voltage', icon: Battery, color: 'text-amber-600 dark:text-amber-300' },
            { label: 'Alerts', value: device.recent_alerts?.length || 0, detail: 'Recent device events', icon: AlertCircle, color: 'text-rose-600 dark:text-rose-300' },
          ].map((metric) => {
            const Icon = metric.icon;
            return (
              <Card key={metric.label} className="border-slate-200 shadow-sm dark:border-slate-800">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{metric.label}</p>
                    <p className={`mt-1 truncate text-2xl font-semibold ${metric.color}`}>{metric.value}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{metric.detail}</p>
                  </div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    <Icon className={`h-4 w-4 ${metric.color}`} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[0.85fr_1.15fr]">
          <Card className="border-slate-200 shadow-sm dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
              <CardTitle className="text-base font-semibold tracking-normal">Device profile</CardTitle>
              <CardDescription>Provisioning, tenant ownership, and reporting metadata.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                {[
                  { label: 'Device ID', value: device.device_id, icon: Cpu },
                  { label: 'Tenant', value: device.tenant_name || 'Unassigned', icon: Building2 },
                  { label: 'Firmware', value: device.firmware_version || 'N/A', icon: Cpu },
                  { label: 'Last seen', value: formatTimestamp(device.last_seen), icon: Clock },
                  { label: 'Created', value: formatTimestamp(device.created_at), icon: Clock },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="grid grid-cols-[140px_1fr] gap-3 px-4 py-3 text-sm">
                      <dt className="flex items-center gap-2 font-medium text-slate-500 dark:text-slate-400">
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </dt>
                      <dd className="min-w-0 truncate font-medium text-slate-900 dark:text-slate-100">{item.value}</dd>
                    </div>
                  );
                })}
              </dl>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
              <CardTitle className="text-base font-semibold tracking-normal">Volume history</CardTitle>
              <CardDescription>Last 7 days, loaded on demand for faster detail views.</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <Suspense fallback={<HistoryChartSkeleton />}>
                <DeviceHistoryChart history={history} />
              </Suspense>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-slate-200 shadow-sm dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
              <CardTitle className="text-base font-semibold tracking-normal">Latest measurement</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Volume', value: `${formatNumber(device.latest_measurement?.volume_l)}L`, icon: Droplets },
                { label: 'Level', value: `${formatNumber(device.latest_measurement?.level_cm)}cm`, icon: Activity },
                { label: 'Temperature', value: device.latest_measurement?.temperature_c ? `${formatNumber(device.latest_measurement.temperature_c)}°C` : 'N/A', icon: Thermometer },
                { label: 'RSSI', value: device.latest_measurement?.rssi ?? 'N/A', icon: Radio },
              ].map((reading) => {
                const Icon = reading.icon;
                return (
                  <div key={reading.label} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <Icon className="h-3.5 w-3.5" />
                      {reading.label}
                    </div>
                    <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{reading.value}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
              <CardTitle className="text-base font-semibold tracking-normal">Recent alerts</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {device.recent_alerts && device.recent_alerts.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {device.recent_alerts.map((alert) => (
                    <div key={alert.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-950 dark:text-white">{alert.message}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{formatTimestamp(alert.created_at)}</p>
                      </div>
                      <Badge
                        variant={alert.severity === 'critical' ? 'destructive' : 'outline'}
                        className={
                          alert.severity === 'critical'
                            ? 'shrink-0'
                            : alert.severity === 'high'
                            ? 'shrink-0 border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400'
                            : alert.severity === 'medium'
                            ? 'shrink-0 border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                            : 'shrink-0 border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                        }
                      >
                        {alert.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">No recent alerts for this device.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function HistoryChartSkeleton() {
  return (
    <div className="h-[280px] animate-pulse rounded-md border border-dashed border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50" />
  );
}

