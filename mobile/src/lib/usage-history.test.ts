import { describe, expect, it } from 'vitest';
import type { UsageHistory } from '@/api/schemas';
import { bucketSlots, coverageNote } from './usage-history';
import { describeEvent, formatTimeRange, hourSlots } from './usage-format';

const bucket = (
  date: string,
  used: number | null,
  extra: Partial<UsageHistory['buckets'][number]> = {},
) => ({
  key: date,
  start: date,
  end: date,
  used_l: used,
  filled_l: used,
  refills: used == null ? 0 : 1,
  leak_days: 0,
  days_with_data: used == null ? 0 : 1,
  full_days: used == null ? 0 : 1,
  ...extra,
});

const history = (
  buckets: UsageHistory['buckets'],
  totals: Partial<UsageHistory['totals']> = {},
): UsageHistory => ({
  device_id: 'esp8266-e3f7f7',
  timezone: 'Asia/Kolkata',
  from: buckets[0].start,
  to: buckets[buckets.length - 1].end,
  group: 'day',
  today: '2026-10-20',
  capacity_l: 1145,
  full_day_hours: 20,
  buckets,
  totals: {
    used_l: 0,
    filled_l: 0,
    refills: 0,
    days: buckets.length,
    days_with_data: buckets.filter((b) => b.used_l != null).length,
    full_days: buckets.filter((b) => b.full_days).length,
    daily_average_l: null,
    busiest_day: null,
    quietest_day: null,
    ...totals,
  },
  by_weekday: [],
  by_hour: [],
});

describe('usage history wording', () => {
  it('a day with no readings stays null (dashed), a partial day says so', () => {
    const slots = bucketSlots(
      history([
        bucket('2026-10-17', 638),
        bucket('2026-10-18', 720, { full_days: 0 }),
        bucket('2026-10-19', null),
      ]),
    );
    expect(slots.map((s) => s.usedL)).toEqual([638, 720, null]);
    expect(slots[1].note).toContain('sensor off part of the day');
    expect(slots[0].note).toBe('filled 1×');
  });

  it('a leak day is drawn in the alert colour', () => {
    const [s] = bucketSlots(history([bucket('2026-10-14', 802, { leak_days: 1 })]));
    expect(s.alert).toBe(true);
    expect(s.note).toContain('possible leak');
  });

  it('explains missing days only when some are missing or partial', () => {
    expect(
      coverageNote(history([bucket('2026-10-15', 540), bucket('2026-10-16', 425)])),
    ).toBeNull();
    expect(coverageNote(history([bucket('2026-10-15', 540), bucket('2026-10-16', null)]))).toMatch(
      /Readings on 1 of 2 days/,
    );
  });
});

describe('usage formatting', () => {
  it('one slot per hour, the window end excluded', () => {
    const from = Date.parse('2026-10-18T00:30:00Z');
    expect(hourSlots(from, from + 3 * 3_600_000)).toHaveLength(3);
  });

  it('times are shown in the tank zone, not the phone zone', () => {
    // 00:40 UTC is 6:10 in India.
    const range = formatTimeRange('2026-10-18T00:40:00Z', '2026-10-18T01:12:00Z', 'Asia/Kolkata');
    expect(range).toMatch(/6:10/);
    expect(range).toMatch(/6:42/);
  });

  it('describes episodes in plain words', () => {
    expect(describeEvent({ kind: 'fill', volume_l: 480.4, ongoing: false })).toBe(
      'Refill · about 480 L',
    );
    expect(describeEvent({ kind: 'draw', volume_l: 60, ongoing: true })).toBe(
      'Water drawn · about 60 L',
    );
  });
});
