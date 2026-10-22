// A separate development entry. Not included in the production build.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import api from '@/lib/api';
import OverviewTab from '@/app/app/devices/[deviceId]/OverviewTab';
import { waterPreviewData, type WaterScenario } from './water-preview-data';
import '@/app/globals.css';
import '@/app/app/devices/[deviceId]/device.css';

if (!import.meta.env.DEV) throw new Error('The water preview is only available in development.');
api.interceptors.request.clear();
export function Preview() {
  const [scenario, setScenario] = useState<WaterScenario>('first-day');
  const [client, setClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  const data = waterPreviewData(scenario);
  api.defaults.adapter = async (config) => {
    const url = new URL(config.url!, 'http://preview.invalid');
    if (scenario === 'error') throw new Error('Preview: unavailable connection');
    const path = url.pathname;
    const body = path.endsWith('/current')
      ? data.current
      : path.endsWith('/tank-profile')
        ? { profile: data.profile }
        : path.endsWith('/alerts')
          ? { device_id: data.device.id, alerts: [] }
          : path.endsWith('/usage/hourly')
            ? data.hourly(url.searchParams.get('range') ?? 'today')
            : path.endsWith('/events')
              ? data.events(url.searchParams.get('range') ?? 'today')
              : path.endsWith('/usage/history')
                ? data.history
                : data.device;
    return { data: body, status: 200, statusText: 'OK', headers: {}, config };
  };
  return (
    <main className="mx-auto max-w-[1180px] space-y-6 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-label text-brand">AQUAMIND</p>
          <h1 className="mt-1 text-[24px] font-medium tracking-tight">Your water, made clear.</h1>
          <p className="mt-1 text-caption text-ink-3">
            Design preview · sample readings · no device changes
          </p>
        </div>
        <label className="text-caption text-ink-2">
          Scenario{' '}
          <select
            aria-label="Preview scenario"
            className="ml-2 rounded-lg border border-hairline bg-surface p-2"
            value={scenario}
            onChange={(e) => {
              setScenario(e.target.value as WaterScenario);
              client.clear();
              setClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
            }}
          >
            <option value="first-day">Sensor just installed</option>
            <option value="steady">A usual day</option>
            <option value="empty">No readings yet</option>
            <option value="offline">Sensor offline</option>
            <option value="error">Connection error</option>
          </select>
        </label>
      </header>
      <QueryClientProvider client={client}>
        <MemoryRouter key={scenario} initialEntries={['/app/devices/preview-tank']}>
          <Routes>
            <Route path="/app/devices/:deviceId" element={<OverviewTab />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
