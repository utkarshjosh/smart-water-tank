import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import api from '@/lib/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertCircle, AlertTriangle, BarChart3, Database, RadioTower, Server, Users } from 'lucide-react';

interface Analytics {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  total_tenants: number;
  recent_alerts_24h: number;
  measurements_today: number;
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setError('');
      const response = await api.get('/api/v1/admin/analytics/summary');
      setAnalytics(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </Layout>
    );
  }

  const totalDevices = analytics?.total_devices || 0;
  const onlineDevices = analytics?.online_devices || 0;
  const offlineDevices = analytics?.offline_devices || 0;
  const totalTenants = analytics?.total_tenants || 0;
  const recentAlerts = analytics?.recent_alerts_24h || 0;
  const measurementsToday = analytics?.measurements_today || 0;
  const onlineRate = totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 0;
  const offlineRate = totalDevices > 0 ? Math.round((offlineDevices / totalDevices) * 100) : 0;
  const alertRate = totalDevices > 0 ? Math.min(100, Math.round((recentAlerts / totalDevices) * 100)) : 0;
  const measurementDensity = totalDevices > 0 ? Math.round(measurementsToday / totalDevices) : 0;

  const signalRows = [
    { label: 'Online devices', value: onlineDevices, rate: onlineRate, tone: 'bg-emerald-500' },
    { label: 'Offline devices', value: offlineDevices, rate: offlineRate, tone: 'bg-rose-500' },
    { label: 'Alert load', value: recentAlerts, rate: alertRate, tone: 'bg-amber-500' },
  ];

  const metricCards = [
    {
      label: 'Devices',
      value: totalDevices,
      detail: `${onlineDevices} online`,
      icon: Server,
      color: 'text-slate-700 dark:text-slate-200',
    },
    {
      label: 'Tenants',
      value: totalTenants,
      detail: 'Connected orgs',
      icon: Users,
      color: 'text-sky-700 dark:text-sky-300',
    },
    {
      label: 'Measurements',
      value: measurementsToday,
      detail: 'Collected today',
      icon: Database,
      color: 'text-emerald-700 dark:text-emerald-300',
    },
    {
      label: 'Alerts',
      value: recentAlerts,
      detail: 'Last 24 hours',
      icon: AlertTriangle,
      color: 'text-amber-700 dark:text-amber-300',
    },
  ];

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Analytics</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Fleet signal quality, collection volume, and current alert pressure.
            </p>
          </div>
          <div className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
            <RadioTower className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            {onlineRate}% online
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((metric) => {
            const Icon = metric.icon;
            return (
              <Card key={metric.label} className="border-slate-200 shadow-sm dark:border-slate-800">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{metric.label}</p>
                    <p className={`mt-1 text-2xl font-semibold ${metric.color}`}>{metric.value}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{metric.detail}</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    <Icon className={`h-4 w-4 ${metric.color}`} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-slate-200 shadow-sm dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
              <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-normal">
                <BarChart3 className="h-4 w-4 text-slate-500" />
                Signal breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              {signalRows.map((row) => (
                <div key={row.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{row.label}</span>
                    <span className="font-semibold text-slate-950 dark:text-white">
                      {row.value}
                      <span className="ml-2 text-xs font-medium text-slate-500 dark:text-slate-400">{row.rate}%</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${row.tone}`} style={{ width: `${row.rate}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
              <CardTitle className="text-base font-semibold tracking-normal">Collection density</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex items-center justify-between rounded-lg bg-sky-50 px-4 py-3 dark:bg-sky-500/10">
                <div>
                  <p className="text-sm font-medium text-sky-950 dark:text-sky-100">Measurements per device</p>
                  <p className="text-xs text-sky-700 dark:text-sky-200/80">Today&apos;s average across registered tanks</p>
                </div>
                <span className="text-2xl font-semibold text-sky-700 dark:text-sky-200">{measurementDensity}</span>
              </div>
              <div className="mt-3 grid grid-cols-7 items-end gap-1.5">
                {[35, 52, 48, 66, 58, 78, Math.min(100, Math.max(16, measurementDensity * 8))].map((height, index) => (
                  <div key={`${height}-${index}`} className="flex h-24 items-end rounded-md bg-slate-100 p-1 dark:bg-slate-800">
                    <div
                      className="w-full rounded-sm bg-sky-500"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 shadow-sm dark:border-slate-800">
          <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
            <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-normal">
              <Activity className="h-4 w-4 text-slate-500" />
              Analytics pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Ingest</p>
              <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{measurementsToday} readings today</p>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Monitor</p>
              <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{recentAlerts} alerts in 24h</p>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Coverage</p>
              <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{totalTenants} tenants tracked</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
