import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Server, Wifi, WifiOff, Users, AlertTriangle, Activity, AlertCircle, Gauge } from "lucide-react";

interface Analytics {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  total_tenants: number;
  recent_alerts_24h: number;
  measurements_today: number;
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await api.get('/api/v1/admin/analytics/summary');
      setAnalytics(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
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
  const alertLoad = totalDevices > 0 ? Math.min(100, Math.round((recentAlerts / totalDevices) * 100)) : 0;

  const metrics = [
    {
      label: 'Total devices',
      value: totalDevices,
      detail: 'Registered sensors',
      icon: Server,
      color: 'text-slate-600 dark:text-slate-300',
    },
    {
      label: 'Online',
      value: onlineDevices,
      detail: `${onlineRate}% of fleet`,
      icon: Wifi,
      color: 'text-emerald-600 dark:text-emerald-300',
    },
    {
      label: 'Offline',
      value: offlineDevices,
      detail: 'Lost contact',
      icon: WifiOff,
      color: 'text-rose-600 dark:text-rose-300',
    },
    {
      label: 'Tenants',
      value: totalTenants,
      detail: 'Active orgs',
      icon: Users,
      color: 'text-slate-600 dark:text-slate-300',
    },
    {
      label: 'Alerts',
      value: recentAlerts,
      detail: 'Last 24 hours',
      icon: AlertTriangle,
      color: 'text-amber-600 dark:text-amber-300',
    },
    {
      label: 'Measurements',
      value: measurementsToday,
      detail: 'Collected today',
      icon: Activity,
      color: 'text-sky-600 dark:text-sky-300',
    },
  ];

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Admin dashboard</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Fleet health, tenant coverage, and ingestion activity.
            </p>
          </div>
          <div className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
            <Gauge className="h-4 w-4 text-sky-600 dark:text-sky-300" />
            {onlineRate}% online
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
              <CardTitle className="text-base font-semibold tracking-normal">Operations snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-4">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Fleet connectivity</span>
                  <span className="font-semibold text-slate-950 dark:text-white">{onlineDevices}/{totalDevices}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${onlineRate}%` }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Alert pressure</span>
                  <span className="font-semibold text-slate-950 dark:text-white">{recentAlerts} in 24h</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${alertLoad}%` }} />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Tenants</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{totalTenants}</p>
                </div>
                <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Offline</p>
                  <p className="mt-1 text-lg font-semibold text-rose-600 dark:text-rose-300">{offlineDevices}</p>
                </div>
                <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Today</p>
                  <p className="mt-1 text-lg font-semibold text-sky-600 dark:text-sky-300">{measurementsToday}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
              <CardTitle className="text-base font-semibold tracking-normal">Attention</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
                <div>
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Recent alerts</p>
                  <p className="text-xs text-amber-700 dark:text-amber-200/80">Warnings in the last day</p>
                </div>
                <span className="text-xl font-semibold text-amber-700 dark:text-amber-200">{recentAlerts}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 dark:bg-rose-500/10">
                <div>
                  <p className="text-sm font-medium text-rose-900 dark:text-rose-100">Disconnected</p>
                  <p className="text-xs text-rose-700 dark:text-rose-200/80">Devices not reporting</p>
                </div>
                <span className="text-xl font-semibold text-rose-700 dark:text-rose-200">{offlineDevices}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => {
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
      </div>
    </Layout>
  );
}
