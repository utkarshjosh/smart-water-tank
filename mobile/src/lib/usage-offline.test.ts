import { describe, expect, it } from 'vitest';
import type { TankEvent, UsageHistory } from '@/api/schemas';
import { dayHourSlots, eventsOnDay, localDateIn, localHourIn } from './usage-offline';

const IST = 'Asia/Kolkata';

const event = (kind: 'fill' | 'draw', startedAt: string, volume: number): TankEvent => ({
  id: startedAt,
  kind,
  started_at: startedAt,
  ended_at: startedAt,
  start_l: 0,
  end_l: volume,
  volume_l: volume,
  rate_l_per_min: 10,
  readings: 3,
  ongoing: false,
});

describe('offline usage view', () => {
  it('finds the last day in the tank zone, not the phone zone', () => {
    // The live tank's last reading: 18 Oct 19:29 IST = 13:59 UTC.
    expect(localDateIn(new Date('2026-10-18T13:59:12Z'), IST)).toBe('2026-10-18');
    // 20:00 UTC on the 17th is already the 18th in India.
    expect(localDateIn(new Date('2026-10-17T20:00:00Z'), IST)).toBe('2026-10-18');
    expect(localHourIn(new Date('2026-10-18T07:21:00Z'), IST)).toBe(12);
  });

  it('keeps only that day’s episodes, oldest first', () => {
    const events = [
      event('draw', '2026-10-18T12:14:00Z', 115),
      event('fill', '2026-10-18T07:21:00Z', 622),
      event('draw', '2026-10-17T10:00:00Z', 50),
    ];
    expect(eventsOnDay(events, '2026-10-18', IST).map((e) => e.kind)).toEqual(['fill', 'draw']);
  });

  it('turns a single-day history into hourly bars, books fills to their hour, leaves silent hours dashed', () => {
    const day = {
      by_hour: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        average_l: hour === 7 ? 98 : hour >= 19 ? null : 10,
        samples: hour >= 19 ? 0 : 1,
      })),
    } as UsageHistory;
    // The 12:51 PM IST fill: 07:21 UTC.
    const slots = dayHourSlots(day, [event('fill', '2026-10-18T07:21:00Z', 622)], IST);
    expect(slots).toHaveLength(24);
    expect(slots[7].usedL).toBe(98);
    expect(slots[12].filledL).toBe(622);
    expect(slots[20].usedL).toBeNull();
  });
});
