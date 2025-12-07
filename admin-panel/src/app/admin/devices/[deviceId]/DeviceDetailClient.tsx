'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import api from '@/lib/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, AlertCircle } from 'lucide-react';

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
    volume_l: number;
    level_cm: number;
    temperature_c?: number | null;
    battery_v?: number | null;
    rssi?: number | null;
    timestamp: string;
  } | null;
  recent_alerts: any[];
}

export default function DeviceDetailClient() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.deviceId as string;
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

  const chartData = history.map((m) => ({
    time: new Date(m.timestamp).toLocaleString(),
    volume: parseFloat(m.volume_l.toString()),
  }));

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-0">
        <Button
          variant="ghost"
          onClick={() => router.push('/admin/devices')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Devices
        </Button>

        <h1 className="text-3xl font-bold mb-6">
          {device.name || device.device_id}
        </h1>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Device Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Device ID</dt>
                  <dd className="mt-1 text-sm">{device.device_id}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Status</dt>
                  <dd className="mt-1 text-sm">
                    <Badge variant={device.status === 'online' ? 'default' : 'destructive'}>
                      {device.status}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Firmware Version</dt>
                  <dd className="mt-1 text-sm">{device.firmware_version || 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Tenant</dt>
                  <dd className="mt-1 text-sm">{device.tenant_name}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Last Seen</dt>
                  <dd className="mt-1 text-sm">
                    {device.last_seen
                      ? new Date(device.last_seen).toLocaleString()
                      : 'Never'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {device.latest_measurement && (
            <Card>
              <CardHeader>
                <CardTitle>Latest Measurement</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Volume</dt>
                    <dd className="mt-1 text-2xl font-bold">
                      {parseFloat(device.latest_measurement.volume_l.toString()).toFixed(1)}L
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Level</dt>
                    <dd className="mt-1 text-2xl font-bold">
                      {parseFloat(device.latest_measurement.level_cm.toString()).toFixed(1)}cm
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Temperature</dt>
                    <dd className="mt-1 text-sm">
                      {device.latest_measurement.temperature_c
                        ? `${parseFloat(device.latest_measurement.temperature_c.toString()).toFixed(1)}°C`
                        : 'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Battery</dt>
                    <dd className="mt-1 text-sm">
                      {device.latest_measurement.battery_v
                        ? `${parseFloat(device.latest_measurement.battery_v.toString()).toFixed(2)}V`
                        : 'N/A'}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Volume History (7 days)</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="volume" stroke="#8884d8" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground">No history data available</p>
              )}
            </CardContent>
          </Card>

          {device.recent_alerts && device.recent_alerts.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Recent Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {device.recent_alerts.map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{alert.message}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(alert.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Badge
                        variant={
                          alert.severity === 'critical'
                            ? 'destructive'
                            : alert.severity === 'high'
                            ? 'outline'
                            : alert.severity === 'medium'
                            ? 'outline'
                            : 'outline'
                        }
                        className={
                          alert.severity === 'critical'
                            ? ''
                            : alert.severity === 'high'
                            ? 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400'
                            : alert.severity === 'medium'
                            ? 'border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                            : 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                        }
                      >
                        {alert.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}



