import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { AlertCircle, PlusCircle, Droplets, Settings2 } from 'lucide-react';
import DeviceCardTankPreview from '@/components/DeviceCardTankPreview';

interface Device {
  id: string;
  name: string;
  status: string;
  firmware_version: string;
  last_seen: string;
  current_volume: number | null;
  level_percent: number | null;
  has_tank_profile: boolean;
  last_measurement: string | null;
  active_alert: 'leak' | 'low' | null;
}

export default function TenantDevicesPage() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/v1/user/devices')
      .then(({ data }) => setDevices(data.devices))
      .catch((err) => setError(err.response?.data?.error || err.message || 'Failed to fetch devices'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-500" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
            Tank fleet
          </span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">My Devices</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Track live tank readings and pair new sensors without leaving the dashboard.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/app/onboarding')}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Device
        </button>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
          <div>
            <p className="font-semibold">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {devices.length === 0 ? (
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <div className="rounded-3xl bg-sky-100 p-4 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200">
              <Droplets className="h-10 w-10" />
            </div>
            <div>
              <p className="font-medium text-slate-900 dark:text-white">No devices yet</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Pair your first AquaMind sensor to start seeing live data.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/app/onboarding')}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:border-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 dark:focus:ring-offset-slate-950"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Pair your first device
            </button>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {devices.map((device) => (
            <article
              key={device.id}
              onClick={() => navigate(`/app/devices/${device.id}`)}
              className="cursor-pointer rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`mt-1 h-3 w-3 rounded-full ${
                      device.status === 'online' ? 'bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.16)]' : 'bg-rose-500 shadow-[0_0_0_6px_rgba(244,63,94,0.12)]'
                    }`}
                  />
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-white">{device.name}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      Firmware {device.firmware_version || 'Unknown'}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {device.last_measurement ? `Last reading ${new Date(device.last_measurement).toLocaleString()}` : 'No data yet'}
                    </div>
                  </div>
                </div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                    device.status === 'online'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                  }`}
                >
                  {device.status}
                </span>
              </div>

              {device.has_tank_profile && device.level_percent != null ? (
                <DeviceCardTankPreview level={device.level_percent} alert={device.active_alert} />
              ) : (
                <div
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/app/onboarding/tank-setup/${device.id}`);
                  }}
                  className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-4 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:border-slate-700 dark:text-sky-300 dark:hover:bg-sky-500/10"
                >
                  <Settings2 className="h-4 w-4" />
                  Set up your tank
                </div>
              )}

              <div className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
                {device.current_volume !== null && device.current_volume !== undefined
                  ? `${Number(device.current_volume).toFixed(1)}L`
                  : 'No data yet'}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
