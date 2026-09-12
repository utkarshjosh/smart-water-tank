import { useMemo } from 'react';
import type { UsageDay } from '@/app/app/devices/[deviceId]/useDevice';

/**
 * Daily litres used. A bar chart, not a line: each day is a discrete total
 * rather than a sample of a continuous signal, and the eye should compare
 * magnitudes rather than follow a trend.
 *
 * Dependency-free SVG - this sits on the Overview tab, which deliberately
 * does not pull the chart bundle.
 */
export function UsageBars({ days, height = 140 }: { days: UsageDay[]; height?: number }) {
  const bars = useMemo(() => {
    const withUsage = days.filter((d) => d.used_l != null);
    const max = Math.max(1, ...withUsage.map((d) => d.used_l as number));
    return days.map((day) => ({
      ...day,
      // A day with no summary yet is drawn as an empty slot, not as zero use.
      fraction: day.used_l == null ? null : (day.used_l as number) / max,
    }));
  }, [days]);

  if (bars.length === 0) return null;

  return (
    <div className="flex items-end gap-[2px]" style={{ height }} role="list">
      {bars.map((bar) => {
        const label =
          bar.used_l == null
            ? `${bar.date}: not aggregated yet`
            : `${bar.date}: ${bar.used_l} litres used${bar.refill_events ? `, ${bar.refill_events} refill${bar.refill_events === 1 ? '' : 's'}` : ''}${bar.leak_suspected ? ', leak suspected' : ''}`;

        return (
          <div
            key={bar.date}
            role="listitem"
            title={label}
            aria-label={label}
            className="group relative flex h-full flex-1 items-end"
          >
            {bar.fraction == null ? (
              <div className="h-full w-full rounded-sm border border-dashed border-hairline" />
            ) : (
              <div
                className={`w-full rounded-sm transition-[height] duration-smooth ease-emphasized ${
                  bar.leak_suspected ? 'bg-critical' : 'bg-series-volume'
                }`}
                style={{ height: `${Math.max(2, bar.fraction * 100)}%` }}
              />
            )}
            {/* Refill marker: a dot above the bar, so refills read without
                needing a second chart. */}
            {bar.refill_events > 0 && (
              <span
                aria-hidden
                className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-brand"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
