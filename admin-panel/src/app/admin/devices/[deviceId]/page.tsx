'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import api from '@/lib/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

export default function DeviceDetailPage() {
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
        <div className="text-center">Loading...</div>
      </Layout>
    );
  }

  if (error || !device) {
    return (
      <Layout>
        <div className="text-red-600">Error: {error || 'Device not found'}</div>
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
        <button
          onClick={() => router.push('/admin/devices')}
          className="mb-4 text-blue-600 hover:text-blue-800"
        >
          ← Back to Devices
        </button>

        <h1 className="text-3xl font-bold mb-6">
          {device.name || device.device_id}
        </h1>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Device Information</h2>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">Device ID</dt>
                <dd className="mt-1 text-sm text-gray-900">{device.device_id}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Status</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      device.status === 'online'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {device.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Firmware Version</dt>
                <dd className="mt-1 text-sm text-gray-900">{device.firmware_version || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Tenant</dt>
                <dd className="mt-1 text-sm text-gray-900">{device.tenant_name}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Seen</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {device.last_seen
                    ? new Date(device.last_seen).toLocaleString()
                    : 'Never'}
                </dd>
              </div>
            </dl>
          </div>

          {device.latest_measurement && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Latest Measurement</h2>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Volume</dt>
                  <dd className="mt-1 text-2xl font-bold text-gray-900">
                    {parseFloat(device.latest_measurement.volume_l.toString()).toFixed(1)}L
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Level</dt>
                  <dd className="mt-1 text-2xl font-bold text-gray-900">
                    {parseFloat(device.latest_measurement.level_cm.toString()).toFixed(1)}cm
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Temperature</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {device.latest_measurement.temperature_c
                      ? `${parseFloat(device.latest_measurement.temperature_c.toString()).toFixed(1)}°C`
                      : 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Battery</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {device.latest_measurement.battery_v
                      ? `${parseFloat(device.latest_measurement.battery_v.toString()).toFixed(2)}V`
                      : 'N/A'}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          <div className="bg-white shadow rounded-lg p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Volume History (7 days)</h2>
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
              <p className="text-gray-500">No history data available</p>
            )}
          </div>

          {device.recent_alerts && device.recent_alerts.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6 lg:col-span-2">
              <h2 className="text-xl font-semibold mb-4">Recent Alerts</h2>
              <ul className="divide-y divide-gray-200">
                {device.recent_alerts.map((alert) => (
                  <li key={alert.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(alert.created_at).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          alert.severity === 'critical'
                            ? 'bg-red-100 text-red-800'
                            : alert.severity === 'high'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {alert.severity}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}




