import { useMemo } from 'react';
import type { UsageHour } from '@/app/app/devices/[deviceId]/useDevice';
import { formatClock, hourSlots } from '@/lib/usage-format';

/**
 * Litres used per local hour, as bars. Same reasoning as UsageBars: each hour
 * is a discrete total, so bars compare magnitudes better than a line.
 *
 * Every hour in the window gets a slot. An hour the server has no row for had
 * no readings, and is drawn dashed - "no data" must not look like "no use".
 * Hours where water came in carry a dot, so refills read without a second
 * chart.
 */
export function HourlyUsageBars({
  hours,
  from,
  to,
  timeZone,
  height = 120,
}: {
  hours: UsageHour[];
  from: string;
  to: string;
  timeZone: string;
  height?: number;
}) {
  const slots = useMemo(() => {
    const byStart = new Map(hours.map((h) => [Date.parse(h.hour_start), h]));
    const max = Math.max(1, ...hours.map((h) => h.used_l ?? 0));
    return hourSlots(Date.parse(from), Date.parse(to)).map((start) => {
      const hour = byStart.get(start) ?? null;
      return { start, hour, fraction: hour ? (hour.used_l ?? 0) / max : null };
    });
  }, [hours, from, to]);

  if (slots.length === 0) return null;
  // About four labels across, whatever the window.
  const labelEvery = Math.max(1, Math.ceil(slots.length / 4));

  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }} role="list" aria-label="Water used per hour">
        {slots.map(({ start, hour, fraction }) => {
          const when = formatClock(start, timeZone);
          const label = hour
            ? `${when}: ${hour.used_l ?? 0} L used${hour.filled_l ? `, ${hour.filled_l} L filled` : ''}`
            : `${when}: no readings`;
          return (
            <div key={start} role="listitem" title={label} aria-label={label} className="relative flex h-full flex-1 items-end">
              {fraction == null ? (
                <div className="h-full w-full rounded-sm border border-dashed border-hairline" />
              ) : (
                <div
                  className="w-full rounded-sm bg-series-volume transition-[height] duration-smooth ease-emphasized"
                  style={{ height: `${Math.max(2, fraction * 100)}%` }}
                />
              )}
              {hour?.filled_l ? (
                <span aria-hidden className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-brand" />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px] text-caption text-ink-3" aria-hidden>
        {slots.map(({ start }, i) => (
          <span key={start} className="flex-1 overflow-visible whitespace-nowrap">
            {i % labelEvery === 0 ? formatClock(start, timeZone, { hourOnly: true }) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
