import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsageHistory } from './useDevice';
import { UsageHistoryBody } from './UsageHistoryBody';

type Preset = '7d' | '30d' | '3m' | '12m' | 'custom';
type GroupChoice = 'auto' | 'day' | 'week' | 'month';

const PRESETS: Array<{ value: Exclude<Preset, 'custom'>; label: string; days: number }> = [
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '3m', label: '3 months', days: 91 },
  { value: '12m', label: '12 months', days: 365 },
];
/** Local date as YYYY-MM-DD, `offset` days from today. */
const isoDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/**
 * Water used over any range: by day, week or month, with the numbers people
 * actually ask - how much, what's normal, which day was heaviest, when in the
 * day and week the water goes. All of it from the server's rollups.
 */
export function UsageHistory() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [params, setParams] = useSearchParams();
  const preset = ((params.get('urange') as Preset | null) ?? '30d') as Preset;
  const group = ((params.get('group') as GroupChoice | null) ?? 'auto') as GroupChoice;
  const range = useMemo(() => {
    if (preset === 'custom' && params.get('ufrom') && params.get('uto')) {
      return { from: params.get('ufrom')!, to: params.get('uto')! };
    }
    const days = PRESETS.find((p) => p.value === preset)?.days ?? 30;
    return { from: isoDay(-(days - 1)), to: isoDay() };
  }, [preset, params]);
  const history = useUsageHistory(deviceId, { ...range, group: group === 'auto' ? undefined : group });
  const data = history.data;

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="history-controls">
        <SegmentedControl
          aria-label="Range"
          value={preset}
          onChange={(v) => update({ urange: v, ufrom: null, uto: null })}
          options={[...PRESETS.map((p) => ({ value: p.value, label: p.label })), { value: 'custom' as const, label: 'Dates' }]}
        />
        <SegmentedControl
          aria-label="Group by"
          value={group}
          onChange={(v) => update({ group: v === 'auto' ? null : v })}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
      </div>
      {preset === 'custom' && (
        <form
          key={`${range.from}:${range.to}`}
          className="history-date-range"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            update({ urange: 'custom', ufrom: String(form.get('from')), uto: String(form.get('to')) });
          }}
        >
          <label>
            From
            <input name="from" type="date" defaultValue={range.from} max={isoDay()} required />
          </label>
          <label>
            To
            <input name="to" type="date" defaultValue={range.to} max={isoDay()} required />
          </label>
          <Button size="sm" variant="secondary" type="submit">
            Show
          </Button>
        </form>
      )}

      {history.isError ? (
        <Alert variant="critical">
          <AlertDescription>
            Couldn’t load usage for these dates. Ranges can be up to 400 days.{' '}
            <button type="button" className="underline" onClick={() => history.refetch()}>
              Try again
            </button>
          </AlertDescription>
        </Alert>
      ) : !data ? (
        <Skeleton className="h-[420px] w-full" />
      ) : (
        <UsageHistoryBody data={data} fetching={history.isFetching} />
      )}
    </div>
  );
}
