import { usageObservationNote } from '@aquamind/contracts';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ArrowRight, Drop } from '@phosphor-icons/react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { UsageBarChart, type UsageSlot } from '@/components/charts/UsageBarChart';
import { viewerTimeZone } from '@/lib/metrics';
import {
  describeEvent,
  formatClock,
  formatLitres,
  formatTimeRange,
  hourSlots,
  zoneDiffers,
} from '@/lib/usage-format';
import type { HourlyUsageResponse } from './useDevice';
import { useHourlyUsage, useTankEvents } from './useDevice';
import './water-story.css';

type Range = 'today' | '24h';

export function UsagePanel({ deviceId }: { deviceId?: string }) {
  const [range, setRange] = useState<Range>('today');
  const hourly = useHourlyUsage(deviceId, range);
  const events = useTankEvents(deviceId, range);
  const data = hourly.data;
  const hours = data?.hours.filter((h) => h.used_l != null) ?? [];
  const peak = hours.reduce<(typeof hours)[number] | null>(
    (a, h) => ((h.used_l ?? 0) > (a?.used_l ?? 0) ? h : a),
    null
  );
  const base = `/app/devices/${encodeURIComponent(deviceId ?? '')}`;
  return (
    <div className="water-usage-layout">
      <Card className="water-usage-card">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Your water use</CardTitle>
            <p className="water-chart-heading-note">
              {range === 'today' ? 'Today, since midnight' : 'The past 24 hours'} · updates every 5
              min
            </p>
          </div>
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
              Couldn’t load usage.{' '}
              <button className="underline" onClick={() => hourly.refetch()}>
                Try again
              </button>
            </p>
          ) : !data || hourly.isPlaceholderData ? (
            <p className="py-8 text-caption text-ink-3">Loading your water use…</p>
          ) : (
            <>
              <p className="water-period-total tnum">
                {formatLitres(data.totals.used_l)}{' '}
                <span className="text-caption font-normal tracking-normal text-ink-3">
                  used {range === 'today' ? 'today' : 'in 24 hours'}
                </span>
              </p>
              <p className="water-chart-heading-note mb-5">
                {peak
                  ? `Most recorded use at ${formatClock(Date.parse(peak.hour_start), data.timezone, { hourOnly: true })} · ${formatLitres(peak.used_l)}.`
                  : hours.length
                    ? 'No measurable draw in the recorded stretches.'
                    : 'Your first readings will start building this picture.'}
              </p>
              <UsageBarChart slots={toSlots(data)} ariaLabel="Hourly water use" height={180} />
              <p className="water-chart-heading-note mt-3">{usageObservationNote(data)}</p>
              <ZoneNote deviceId={deviceId} tankZone={data.timezone} />
            </>
          )}
          <Link className="water-history-link" to={`${base}/history`}>
            Explore days, weeks &amp; months <ArrowRight size={14} aria-hidden />
          </Link>
        </CardContent>
      </Card>
      <Card className="water-activity-card">
        <CardHeader>
          <CardTitle>What happened</CardTitle>
          <p className="water-chart-heading-note">
            Latest changes · {range === 'today' ? 'today' : 'last 24 hours'}
          </p>
        </CardHeader>
        <CardContent>
          {events.isError ? (
            <p className="py-8 text-caption text-critical-text">
              Couldn’t load activity.{' '}
              <button className="underline" onClick={() => events.refetch()}>
                Try again
              </button>
            </p>
          ) : !events.data || events.isPlaceholderData ? (
            <p className="py-8 text-caption text-ink-3">Loading activity…</p>
          ) : events.data.events.length === 0 ? (
            <div className="water-chart-empty">
              <Drop size={26} weight="duotone" aria-hidden />
              <strong>No activity recorded yet</strong>
              <span>Refills and noticeable water use will appear here as they happen.</span>
            </div>
          ) : (
            <>
              <ul className="water-activity-list">
                {events.data.events.slice(0, 3).map((event) => {
                  const fill = event.kind === 'fill';
                  const Icon = fill ? ArrowDown : ArrowUp;
                  return (
                    <li key={event.id}>
                      <span className={`water-activity-icon ${fill ? 'is-fill' : ''}`}>
                        <Icon size={16} aria-hidden />
                      </span>
                      <div>
                        <p className="water-activity-title">
                          {describeEvent(event)}
                          {event.ongoing && (
                            <span className="ml-2 text-brand">· At last reading</span>
                          )}
                        </p>
                        <p className="water-activity-time">
                          {formatTimeRange(event.started_at, event.ended_at, events.data!.timezone)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {events.data.events.length > 3 && (
                <p className="water-chart-heading-note">
                  {events.data.events.length - 3} earlier changes. Showing the latest 3.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Every hour in the window, including ones with no readings. */
function toSlots(data: HourlyUsageResponse): UsageSlot[] {
  const byStart = new Map(data.hours.map((h) => [Date.parse(h.hour_start), h]));
  return hourSlots(Date.parse(data.from), Date.parse(data.to)).map((start) => {
    const hour = byStart.get(start);
    const label = formatClock(start, data.timezone, { hourOnly: true });
    return {
      key: String(start),
      tick: label,
      title: `${label} – ${formatClock(start + 3_600_000, data.timezone, { hourOnly: true })}`,
      usedL: hour?.used_l ?? null,
      filledL: hour?.filled_l ?? 0,
    };
  });
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
      toast.success(`Times now use ${viewer}`, {
        description: 'Past usage is being recalculated; it can take a minute.',
      });
      void queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
    },
    onError: () => toast.error('Couldn’t change the timezone. Please try again.'),
  });

  if (!zoneDiffers(tankZone, viewer)) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-2 text-caption text-ink-3">
      Times shown in {tankZone}.
      <Button
        size="sm"
        variant="ghost"
        loading={setZone.isPending}
        onClick={() => setZone.mutate()}
      >
        Use {viewer}
      </Button>
    </p>
  );
}
