import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoGroup, bucketKey, byHourOfDay, byWeekday, groupDays, summarize, weekdayOf, type DayInput } from '../lib/usage-history';

const day = (date: string, usedL: number, hoursWithData = 24, extra: Partial<DayInput> = {}): DayInput => ({
  date,
  usedL,
  filledL: usedL,
  refills: 1,
  leak: false,
  hoursWithData,
  ...extra,
});

test('weeks start on Monday and months on the 1st', () => {
  assert.equal(weekdayOf('2026-10-19'), 0); // a Monday
  assert.equal(weekdayOf('2026-10-18'), 6); // a Sunday
  assert.equal(bucketKey('2026-10-18', 'week'), '2026-10-12');
  assert.equal(bucketKey('2026-10-18', 'month'), '2026-10');
});

test('range length picks the grouping', () => {
  assert.equal(autoGroup(30), 'day');
  assert.equal(autoGroup(90), 'week');
  assert.equal(autoGroup(365), 'month');
});

test('every bucket in the range is returned, and an empty one says "no data", not zero', () => {
  const buckets = groupDays([day('2026-10-14', 800), day('2026-10-16', 400)], '2026-10-14', '2026-10-16', 'day');
  assert.deepEqual(
    buckets.map((b) => [b.key, b.usedL]),
    [
      ['2026-10-14', 800],
      ['2026-10-15', null],
      ['2026-10-16', 400],
    ]
  );
});

test('weekly buckets add up their days and are clipped to the range', () => {
  const days = [day('2026-10-14', 800), day('2026-10-15', 540), day('2026-10-19', 600)];
  const weeks = groupDays(days, '2026-10-14', '2026-10-20', 'week');
  assert.deepEqual(
    weeks.map((w) => [w.key, w.start, w.end, w.usedL, w.daysWithData]),
    [
      ['2026-10-12', '2026-10-14', '2026-10-18', 1340, 2],
      ['2026-10-19', '2026-10-19', '2026-10-20', 600, 1],
    ]
  );
});

test('a day the device was off for most of is not counted as a low-use day', () => {
  // 18 Oct: the device went silent at 19:29, so 20 h at most - here 19.
  const days = [day('2026-10-16', 425), day('2026-10-17', 638), day('2026-10-18', 300, 19)];
  const s = summarize(days);
  assert.equal(s.usedL, 1363); // the total still counts what was seen
  assert.equal(s.fullDays, 2);
  assert.equal(s.dailyAverageL, 531.5); // but the average doesn't
  assert.deepEqual(s.quietestDay, { date: '2026-10-16', usedL: 425 });
  assert.deepEqual(s.busiestDay, { date: '2026-10-17', usedL: 638 });
});

test('weekday averages use full days, Monday first', () => {
  const w = byWeekday([day('2026-10-12', 500), day('2026-10-19', 700), day('2026-10-18', 100, 5)]);
  assert.deepEqual(w[0], { weekday: 0, averageL: 600, days: 2 });
  assert.deepEqual(w[6], { weekday: 6, averageL: null, days: 0 });
});

test('hour-of-day profile averages over hours that had readings', () => {
  const h = byHourOfDay([
    { hour: 7, usedL: 90 },
    { hour: 7, usedL: 110 },
    { hour: 3, usedL: 0 },
  ]);
  assert.equal(h[7].averageL, 100);
  assert.equal(h[3].averageL, 0);
  assert.equal(h[12].averageL, null);
});
