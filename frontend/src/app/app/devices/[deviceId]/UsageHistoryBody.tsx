import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat-tile';
import { UsageBarChart, type UsageSlot } from '@/components/charts/UsageBarChart';
import { formatLitres } from '@/lib/usage-format';
import type { UsageHistoryResponse } from '@aquamind/contracts';

// The Usage view's display, kept free of data fetching so the component
// preview page can render it from fixed data.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_LONG = [
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
  'Sundays',
];

/** A YYYY-MM-DD read as a calendar date (noon, so no zone shifts it a day). */
const asDate = (iso: string) => new Date(`${iso}T12:00:00`);
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  asDate(iso).toLocaleDateString(undefined, opts);

export function UsageHistoryBody({
  data,
  fetching,
}: {
  data: UsageHistoryResponse;
  fetching: boolean;
}) {
  const t = data.totals;
  const partial = t.days_with_data > t.full_days || t.days_with_data < t.days;
  const hasPatterns = t.full_days >= 3;

  return (
    <div className={`space-y-4 transition-opacity ${fetching ? 'opacity-60' : ''}`}>
      <div className="device-reading-grid">
        <StatTile
          label="Water used"
          value={t.used_l == null ? null : Math.round(t.used_l)}
          unit="L"
          hint={`${fmt(data.from, { day: 'numeric', month: 'short' })} – ${fmt(data.to, { day: 'numeric', month: 'short' })}`}
        />
        <StatTile
          label="Normal day"
          value={t.daily_average_l == null ? null : Math.round(t.daily_average_l)}
          unit="L"
          hint={
            t.full_days
              ? `Average of ${t.full_days} full day${t.full_days === 1 ? '' : 's'}`
              : 'No full days of readings yet'
          }
        />
        <StatTile
          label="Busiest day"
          value={t.busiest_day ? Math.round(t.busiest_day.used_l) : null}
          unit="L"
          hint={
            t.busiest_day
              ? fmt(t.busiest_day.date, { weekday: 'long', day: 'numeric', month: 'short' })
              : '—'
          }
        />
        <StatTile
          label="Tank filled"
          value={t.refills}
          unit={t.refills === 1 ? 'time' : 'times'}
          hint={t.filled_l ? `${formatLitres(t.filled_l)} added` : 'No fills recorded'}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Water used per {data.group}</CardTitle>
          <span className="text-caption text-ink-3">
            {data.buckets.length} {data.group}s
          </span>
        </CardHeader>
        <CardContent>
          {t.days_with_data === 0 ? (
            <p className="py-10 text-center text-caption text-ink-3">No readings in these dates.</p>
          ) : (
            <UsageBarChart
              slots={bucketSlots(data)}
              ariaLabel={`Water used and added per ${data.group}`}
              height={180}
            />
          )}
          {partial && t.days_with_data > 0 && (
            <p className="mt-3 text-caption text-ink-3">
              Readings on {t.days_with_data} of {t.days} days. Daily averages exclude days missing
              more than 15 minutes of readings. Partial days still contribute their recorded amounts
              to totals.
            </p>
          )}
        </CardContent>
      </Card>

      {hasPatterns ? (
        <div className="device-chart-grid">
          <Card>
            <CardHeader>
              <CardTitle>An average day</CardTitle>
            </CardHeader>
            <CardContent>
              <UsageBarChart
                ariaLabel="Average water used per hour of the day"
                showFills={false}
                height={110}
                tickEvery={6}
                slots={data.by_hour.map((h) => {
                  const label = hourLabel(h.hour);
                  return {
                    key: String(h.hour),
                    tick: label,
                    title: `${label} – ${hourLabel((h.hour + 1) % 24)}, on average`,
                    usedL: h.average_l,
                  };
                })}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>By day of the week</CardTitle>
            </CardHeader>
            <CardContent>
              <UsageBarChart
                ariaLabel="Average water used per day of the week"
                showFills={false}
                height={110}
                tickEvery={1}
                slots={data.by_weekday.map((w) => ({
                  key: String(w.weekday),
                  tick: WEEKDAYS[w.weekday],
                  title: `${WEEKDAYS_LONG[w.weekday]}, on average`,
                  usedL: w.average_l,
                  note: w.days ? `${w.days} day${w.days === 1 ? '' : 's'}` : undefined,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="px-1 text-caption text-ink-3">
          Patterns by hour and weekday appear once there are 3 full days of readings in the range.
        </p>
      )}

      <details className="rounded-lg border border-hairline bg-surface px-4 py-3">
        <summary className="cursor-pointer text-label text-ink-2">Show as a table</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-caption tnum">
            <thead className="text-ink-3">
              <tr>
                <th className="py-1.5 pr-4 font-medium">
                  {data.group === 'day' ? 'Date' : data.group === 'week' ? 'Week' : 'Month'}
                </th>
                <th className="py-1.5 pr-4 text-right font-medium">Used</th>
                <th className="py-1.5 pr-4 text-right font-medium">Added</th>
                <th className="py-1.5 pr-4 text-right font-medium">Fills</th>
                <th className="py-1.5 text-right font-medium">Days with readings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-ink-1">
              {[...data.buckets].reverse().map((b) => (
                <tr key={b.key}>
                  <td className="py-1.5 pr-4">{bucketTitle(b, data.group)}</td>
                  <td className="py-1.5 pr-4 text-right">{formatLitres(b.used_l)}</td>
                  <td className="py-1.5 pr-4 text-right">{formatLitres(b.filled_l)}</td>
                  <td className="py-1.5 pr-4 text-right">{b.refills}</td>
                  <td className="py-1.5 text-right">
                    {b.days_with_data} / {spanDays(b)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

type Bucket = UsageHistoryResponse['buckets'][number];

const spanDays = (b: Bucket) =>
  Math.round((asDate(b.end).getTime() - asDate(b.start).getTime()) / 86_400_000) + 1;

function bucketTitle(b: Bucket, group: UsageHistoryResponse['group']): string {
  if (group === 'day') return fmt(b.start, { weekday: 'short', day: 'numeric', month: 'short' });
  if (group === 'month') return fmt(b.start, { month: 'long', year: 'numeric' });
  return `${fmt(b.start, { day: 'numeric', month: 'short' })} – ${fmt(b.end, { day: 'numeric', month: 'short' })}`;
}

function bucketSlots(data: UsageHistoryResponse): UsageSlot[] {
  return data.buckets.map((b) => {
    const days = spanDays(b);
    const notes = [
      b.refills ? `filled ${b.refills}×` : null,
      b.leak_days ? 'possible leak' : null,
      b.days_with_data && b.days_with_data < days
        ? `readings on ${b.days_with_data} of ${days} days`
        : null,
      days === 1 && b.days_with_data === 1 && b.full_days === 0
        ? 'sensor off part of the day'
        : null,
      data.group === 'day' && b.start === data.today ? 'so far today' : null,
    ].filter(Boolean);
    return {
      key: b.key,
      tick:
        data.group === 'month'
          ? fmt(b.start, { month: 'short' })
          : data.group === 'day' && data.buckets.length <= 7
            ? fmt(b.start, { weekday: 'short' })
            : fmt(b.start, { day: 'numeric', month: 'short' }),
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
