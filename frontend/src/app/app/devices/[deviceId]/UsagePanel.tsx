import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Drop } from '@phosphor-icons/react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { HourlyUsageBars } from '@/components/charts/HourlyUsageBars';
import { viewerTimeZone } from '@/lib/metrics';
import { describeEvent, formatLitres, formatTimeRange, zoneDiffers } from '@/lib/usage-format';
import { useHourlyUsage, useTankEvents } from './useDevice';

type Range = 'today' | '24h';

/**
 * Hourly usage and the fill/draw timeline. Both come from the server's
 * rollups (refreshed every 5 minutes), cut in the tank's own timezone.
 */
export function UsagePanel({ deviceId }: { deviceId?: string }) {
  // Last 24 hours first: at 7 AM, "today" is seven bars and says little.
  const [range, setRange] = useState<Range>('24h');
  const hourly = useHourlyUsage(deviceId, range);
  const events = useTankEvents(deviceId, range);
  const data = hourly.data;

  return (
    <div className="device-chart-grid">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Water used per hour</CardTitle>
          <SegmentedControl
            aria-label="Usage window"
            value={range}
            onChange={setRange}
            options={[
              { value: 'today', label: 'Today' },
              { value: '24h', label: 'Last 24h' },
            ]}
          />
        </CardHeader>
        <CardContent>
          {hourly.isError ? (
            <p className="py-8 text-caption text-critical-text">
              Couldn’t load hourly usage.{' '}
              <button type="button" className="underline" onClick={() => hourly.refetch()}>
                Retry
              </button>
            </p>
          ) : !data ? (
            <p className="py-8 text-caption text-ink-3">Loading hourly usage…</p>
          ) : (
            <>
              <p className="mb-3 text-body text-ink-2">
                <strong className="tnum text-ink-1">{formatLitres(data.totals.used_l)}</strong> used
                {range === '24h' ? ' in the last 24 hours' : ' today'}
                {data.totals.filled_l ? (
                  <>
                    {' · '}
                    <strong className="tnum text-ink-1">{formatLitres(data.totals.filled_l)}</strong> filled
                  </>
                ) : null}
              </p>
              {data.hours.length ? (
                <HourlyUsageBars hours={data.hours} from={data.from} to={data.to} timeZone={data.timezone} />
              ) : (
                <p className="py-6 text-caption text-ink-3">No readings in this window yet.</p>
              )}
              <ZoneNote deviceId={deviceId} tankZone={data.timezone} />
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Activity</CardTitle>
          {events.data && (
            <span className="text-caption text-ink-3">
              {events.data.totals.fills} fill{events.data.totals.fills === 1 ? '' : 's'} · {events.data.totals.draws} draw
              {events.data.totals.draws === 1 ? '' : 's'}
            </span>
          )}
        </CardHeader>
        <CardContent>
          {events.isError ? (
            <p className="py-8 text-caption text-critical-text">
              Couldn’t load activity.{' '}
              <button type="button" className="underline" onClick={() => events.refetch()}>
                Retry
              </button>
            </p>
          ) : !events.data ? (
            <p className="py-8 text-caption text-ink-3">Loading activity…</p>
          ) : events.data.events.length === 0 ? (
            <p className="flex items-center gap-2 py-8 text-caption text-ink-3">
              <Drop size={16} aria-hidden /> No fills or noticeable draws in this window.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {events.data.events.map((event) => {
                const Icon = event.kind === 'fill' ? ArrowUp : ArrowDown;
                return (
                  <li key={event.id} className="flex items-center gap-3 py-2.5">
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                        event.kind === 'fill' ? 'bg-brand-wash text-brand' : 'bg-surface-sunk text-ink-2'
                      }`}
                      aria-hidden
                    >
                      <Icon size={16} weight="bold" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-label text-ink-1">{describeEvent(event)}</p>
                      <p className="text-caption text-ink-3 tnum">
                        {formatTimeRange(event.started_at, event.ended_at, events.data.timezone)}
                        {event.rate_l_per_min ? ` · ${event.rate_l_per_min.toFixed(1)} L/min` : ''}
                      </p>
                    </div>
                    {event.ongoing && <span className="text-caption text-brand">Now</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Hours and "today" are cut in the tank's zone. When that isn't the viewer's,
 * say so, and offer to switch - the usual case is a tank still on the server
 * default.
 */
function ZoneNote({ deviceId, tankZone }: { deviceId?: string; tankZone: string }) {
  const queryClient = useQueryClient();
  const viewer = viewerTimeZone();
  const setZone = useMutation({
    mutationFn: () => api.put(`/api/v1/user/devices/${deviceId}/timezone`, { timezone: viewer }),
    onSuccess: () => {
      toast.success(`Times now use ${viewer}`, { description: 'Past usage is being recalculated; it can take a minute.' });
      void queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
    },
    onError: () => toast.error('Couldn’t change the timezone. Please try again.'),
  });

  if (!zoneDiffers(tankZone, viewer)) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-2 text-caption text-ink-3">
      Times shown in {tankZone}.
      <Button size="sm" variant="ghost" loading={setZone.isPending} onClick={() => setZone.mutate()}>
        Use {viewer}
      </Button>
    </p>
  );
}
