import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ArrowLeft, Settings2, CheckCircle2 } from 'lucide-react';
import TankDiagram from '@/components/tank-setup/TankDiagram';
import { TankSetupWizard, type TankProfileDto } from '@/components/tank-setup/TankSetupWizard';
import { METRIC_CONFIG, type Metric, type MeasurementPoint } from '@/components/charts/MeasurementHistoryChart';

const GlassTank = lazy(() => import('@/components/GlassTank'));
const MeasurementHistoryChart = lazy(() => import('@/components/charts/MeasurementHistoryChart'));

interface DeviceInfo {
  id: string;
  name: string;
  status: string;
  firmware_version: string | null;
  last_seen: string | null;
}

interface CurrentMeasurement {
  level_cm: number;
  volume_l: number;
  level_percent: number | null;
  temperature_c: number | null;
  battery_v: number | null;
  timestamp: string;
}

interface AlertItem {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string | null;
  acknowledged: boolean;
  created_at: string;
}

interface ConfigDto {
  measurement_interval_ms: number;
  report_interval_ms: number;
  tank_low_threshold_pct: number | null;
  tank_full_threshold_pct: number | null;
  battery_low_threshold_v: number | null;
}

interface FirmwareStatus {
  current_version: string | null;
  latest_known_version: string | null;
  last_checked_at: string | null;
}

const severityBadgeClass: Record<AlertItem['severity'], string> = {
  critical: '',
  high: 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  medium: 'border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  low: 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400',
};

export default function DeviceDetailClient() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [current, setCurrent] = useState<CurrentMeasurement | null>(null);
  const [profile, setProfile] = useState<TankProfileDto | null>(null);
  const [history, setHistory] = useState<MeasurementPoint[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [config, setConfig] = useState<ConfigDto | null>(null);
  const [firmwareStatus, setFirmwareStatus] = useState<FirmwareStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [metric, setMetric] = useState<Metric>('level_percent');
  const [editingTank, setEditingTank] = useState(false);
  const [lowPct, setLowPct] = useState('');
  const [fullPct, setFullPct] = useState('');
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [thresholdsSaved, setThresholdsSaved] = useState(false);

  const loadAll = () => {
    if (!deviceId) return;
    Promise.all([
      api.get(`/api/v1/user/devices/${deviceId}`).then((r) => setDevice(r.data)),
      api
        .get(`/api/v1/user/devices/${deviceId}/current`)
        .then((r) => setCurrent(r.data))
        .catch(() => setCurrent(null)),
      api.get(`/api/v1/user/devices/${deviceId}/tank-profile`).then((r) => setProfile(r.data.profile)),
      api
        .get(`/api/v1/user/devices/${deviceId}/history?days=7&limit=200`)
        .then((r) => setHistory(r.data.measurements || [])),
      api.get(`/api/v1/user/devices/${deviceId}/alerts`).then((r) => setAlerts(r.data.alerts || [])),
      api.get(`/api/v1/user/devices/${deviceId}/config`).then((r) => {
        setConfig(r.data);
        setLowPct(r.data.tank_low_threshold_pct != null ? String(r.data.tank_low_threshold_pct) : '');
        setFullPct(r.data.tank_full_threshold_pct != null ? String(r.data.tank_full_threshold_pct) : '');
      }),
      api.get(`/api/v1/user/devices/${deviceId}/firmware-status`).then((r) => setFirmwareStatus(r.data)),
    ])
      .catch((err) => setError(err.response?.data?.error || err.message || 'Failed to load device'))
      .finally(() => setLoading(false));
  };

  useEffect(loadAll, [deviceId]);

  const acknowledgeAlert = async (alertId: string) => {
    if (!deviceId) return;
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)));
    try {
      await api.post(`/api/v1/user/devices/${deviceId}/alerts/${alertId}/acknowledge`);
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const saveThresholds = async () => {
    if (!deviceId) return;
    setSavingThresholds(true);
    setThresholdsSaved(false);
    try {
      const { data } = await api.put(`/api/v1/user/devices/${deviceId}/alert-thresholds`, {
        ...(lowPct !== '' ? { tank_low_threshold_pct: Number(lowPct) } : {}),
        ...(fullPct !== '' ? { tank_full_threshold_pct: Number(fullPct) } : {}),
      });
      setConfig(data);
      setThresholdsSaved(true);
    } catch (err) {
      console.error('Failed to save thresholds:', err);
    } finally {
      setSavingThresholds(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-500" />
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
        {error || 'Device not found'}
      </div>
    );
  }

  const activeAlert = alerts.find((a) => !a.acknowledged && (a.type === 'leak_detected' || a.type === 'tank_low'));
  const glassAlert = activeAlert ? (activeAlert.type === 'leak_detected' ? 'leak' : 'low') : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate('/app/devices')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to devices
        </Button>
        <Button variant="outline" onClick={() => setEditingTank(true)}>
          <Settings2 className="mr-2 h-4 w-4" />
          Edit tank setup
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{device.name}</h1>
        <Badge variant={device.status === 'online' ? 'default' : 'destructive'} className="capitalize">
          {device.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Live tank level</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {profile && current?.level_percent != null ? (
              <div className="rounded-3xl bg-[#0f172a] p-6">
                <div className="scale-75 origin-top">
                  <Suspense fallback={<div className="h-60 w-48" />}>
                    <GlassTank level={current.level_percent} alert={glassAlert} />
                  </Suspense>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {profile ? 'No measurements yet' : 'Set up your tank to see accurate levels'}
                </p>
                {!profile && (
                  <Button size="sm" onClick={() => setEditingTank(true)}>
                    Set up your tank
                  </Button>
                )}
              </div>
            )}

            {profile && (
              <div className="w-full space-y-2 text-center">
                <div className="flex justify-center text-slate-500">
                  <TankDiagram shape={profile.shape} unitCount={profile.parallel_unit_count} className="h-24" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {profile.parallel_unit_count > 1 ? `${profile.parallel_unit_count} tanks, ` : ''}
                  {profile.height_cm}cm tall &middot; ~{profile.total_capacity_l.toFixed(0)}L total capacity
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Device &amp; firmware</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-6">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Device ID</dt>
                <dd className="mt-1 text-sm">{device.id}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Last seen</dt>
                <dd className="mt-1 text-sm">{device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Current firmware</dt>
                <dd className="mt-1 text-sm">{firmwareStatus?.current_version || device.firmware_version || 'Unknown'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Latest available</dt>
                <dd className="mt-1 text-sm">{firmwareStatus?.latest_known_version || 'Unknown'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-sm font-medium text-muted-foreground">Update status</dt>
                <dd className="mt-1 text-sm text-muted-foreground">
                  Updates are checked automatically in the background
                  {firmwareStatus?.last_checked_at
                    ? ` (last checked ${new Date(firmwareStatus.last_checked_at).toLocaleString()})`
                    : ''}
                  .
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
              <TabsList>
                {(Object.keys(METRIC_CONFIG) as Metric[]).map((m) => (
                  <TabsTrigger key={m} value={m}>
                    {METRIC_CONFIG[m].label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="mt-4">
              <Suspense fallback={<div className="h-[300px] animate-pulse rounded-md border border-dashed border-border bg-muted/40" />}>
                <MeasurementHistoryChart history={history} metric={metric} />
              </Suspense>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alerts yet</p>
            ) : (
              <div className="space-y-4">
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between gap-3 border-b py-3 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{alert.message}</p>
                      <p className="text-sm text-muted-foreground">{new Date(alert.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={alert.severity === 'critical' ? 'destructive' : 'outline'}
                        className={severityBadgeClass[alert.severity]}
                      >
                        {alert.severity}
                      </Badge>
                      {!alert.acknowledged ? (
                        <Button size="sm" variant="outline" onClick={() => acknowledgeAlert(alert.id)}>
                          Acknowledge
                        </Button>
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alert thresholds</CardTitle>
            <CardDescription>Get notified when your tank level crosses these bounds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="low-pct">Low level (%)</Label>
                <Input id="low-pct" type="number" min={0} max={100} value={lowPct} onChange={(e) => setLowPct(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="full-pct">Full level (%)</Label>
                <Input id="full-pct" type="number" min={0} max={100} value={fullPct} onChange={(e) => setFullPct(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={saveThresholds} disabled={savingThresholds}>
                {savingThresholds ? 'Saving...' : 'Save thresholds'}
              </Button>
              {thresholdsSaved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>}
            </div>
            {config && (
              <p className="text-xs text-muted-foreground">
                Measures every {Math.round(config.measurement_interval_ms / 1000)}s, reports every{' '}
                {Math.round(config.report_interval_ms / 1000)}s.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={editingTank} onOpenChange={setEditingTank}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="mb-4">
            <SheetTitle>Tank setup</SheetTitle>
          </SheetHeader>
          <TankSetupWizard
            deviceId={deviceId!}
            initialData={profile}
            onComplete={() => {
              setEditingTank(false);
              loadAll();
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
