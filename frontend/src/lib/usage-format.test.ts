import { describe, expect, it } from 'vitest';
import { describeEvent, formatTimeRange, hourSlots, zoneDiffers } from './usage-format';

describe('usage formatting', () => {
  it('lays out one slot per hour, the window end excluded', () => {
    const from = Date.parse('2026-10-18T00:30:00Z');
    const slots = hourSlots(from, from + 3 * 3_600_000);
    expect(slots).toHaveLength(3);
    expect(new Date(slots[2]).toISOString()).toBe('2026-10-18T02:30:00.000Z');
  });

  it('shows times in the tank zone, not the browser one', () => {
    // 00:40 UTC is 06:10 in India.
    const range = formatTimeRange('2026-10-18T00:40:00Z', '2026-10-18T01:12:00Z', 'Asia/Kolkata');
    expect(range).toMatch(/6:10/);
    expect(range).toMatch(/6:42/);
  });

  it('collapses a sub-minute episode to one time', () => {
    expect(formatTimeRange('2026-10-18T00:40:00Z', '2026-10-18T00:40:20Z', 'UTC')).not.toContain('–');
  });

  it('describes episodes in plain words', () => {
    expect(describeEvent({ kind: 'fill', volume_l: 480.4, ongoing: false })).toBe('Filled 480 L');
    expect(describeEvent({ kind: 'draw', volume_l: 60, ongoing: true })).toBe('Using 60 L');
  });

  it('treats two names for the same offset as the same zone', () => {
    expect(zoneDiffers('Asia/Kolkata', 'Asia/Calcutta')).toBe(false);
    expect(zoneDiffers('Asia/Kolkata', 'Europe/London')).toBe(true);
  });
});
