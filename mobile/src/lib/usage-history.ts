import type { UsageHistory } from '@/api/schemas';
import type { UsageSlot } from '@/lib/usage-chart';
import { formatDay, spanDays } from '@/lib/usage-format';

/**
 * Turning a /usage/history response into chart slots and labels, as the
 * webapp's UsageHistoryBody does. Pure, so the wording rules are tested.
 */

export type Preset = '7d' | '30d' | '3m' | '12m';
export const PRESETS: { value: Preset; label: string; days: number }[] = [
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '3m', label: '3 months', days: 91 },
  { value: '12m', label: '12 months', days: 365 },
];

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_LONG = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

/** Patterns need a few full days, or one odd day becomes "your Tuesdays". */
export const MIN_FULL_DAYS_FOR_PATTERNS = 3;

type Bucket = UsageHistory['buckets'][number];

export function bucketTitle(b: Bucket, group: UsageHistory['group']): string {
  if (group === 'day') return formatDay(b.start, { weekday: 'short', day: 'numeric', month: 'short' });
  if (group === 'month') return formatDay(b.start, { month: 'long', year: 'numeric' });
  return `${formatDay(b.start, { day: 'numeric', month: 'short' })} – ${formatDay(b.end, { day: 'numeric', month: 'short' })}`;
}

export function bucketSlots(data: UsageHistory): UsageSlot[] {
  return data.buckets.map((b) => {
    const days = spanDays(b.start, b.end);
    const notes = [
      b.refills ? `filled ${b.refills}×` : null,
      b.leak_days ? 'possible leak' : null,
      b.days_with_data && b.days_with_data < days ? `readings on ${b.days_with_data} of ${days} days` : null,
      days === 1 && b.days_with_data === 1 && (b.full_days === 0 || b.estimated_days > 0)
        ? 'sensor off part of the day'
        : null,
      data.group === 'day' && b.start === data.today ? 'so far today' : null,
    ].filter(Boolean);
    return {
      key: b.key,
      tick:
        data.group === 'month'
          ? formatDay(b.start, { month: 'short' })
          : data.group === 'day' && data.buckets.length <= 7
            ? formatDay(b.start, { weekday: 'short' })
            : formatDay(b.start, { day: 'numeric', month: 'short' }),
      title: bucketTitle(b, data.group),
      usedL: b.used_l,
      filledL: b.filled_l,
      note: notes.join(' · ') || undefined,
      alert: b.leak_days > 0,
    };
  });
}

function hourLabel(hour: number): string {
  return new Date(2026, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });
}

export function hourOfDaySlots(data: UsageHistory): UsageSlot[] {
  return data.by_hour.map((h) => ({
    key: String(h.hour),
    tick: hourLabel(h.hour),
    title: `${hourLabel(h.hour)} – ${hourLabel((h.hour + 1) % 24)}, on average`,
    usedL: h.average_l,
  }));
}

export function weekdaySlots(data: UsageHistory): UsageSlot[] {
  return data.by_weekday.map((w) => ({
    key: String(w.weekday),
    tick: WEEKDAYS[w.weekday],
    title: `${WEEKDAYS_LONG[w.weekday]}, on average`,
    usedL: w.average_l,
    note: w.days ? `${w.days} day${w.days === 1 ? '' : 's'}` : undefined,
  }));
}

/** The sentence under the chart when some days were missing or partial. */
export function coverageNote(data: UsageHistory): string | null {
  const t = data.totals;
  if (t.days_with_data === 0) return null;
  if (t.days_with_data === t.days && t.full_days - t.estimated_days === t.days_with_data) return null;
  return (
    `Readings on ${t.days_with_data} of ${t.days} days. Days with under ${data.full_day_hours} hours of readings ` +
    '(the sensor was off part of the day) count in totals but not in “normal day” or the patterns. ' +
    'Shorter gaps are filled in from your usual use at those hours.'
  );
}
