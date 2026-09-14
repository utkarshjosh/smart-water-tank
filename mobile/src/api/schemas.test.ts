import { describe, expect, it } from 'vitest';
import { alertFeedSchema, claimCodeSchema, currentReadingSchema, deviceSummarySchema, historySeriesSchema } from './schemas';

// The wire, as the backend sends it (and as @aquamind/contracts describes it).
const T = '2026-09-14T10:00:00.000Z';

const summaryWire = {
  id: 'AQM-0042',
  name: 'Roof tank',
  status: 'online',
  firmware_version: null,
  last_seen: T,
  current_volume: 812.5,
  level_percent: 64,
  level_percent_stale: false,
  level_percent_as_of: T,
  has_tank_profile: true,
  last_measurement: null,
  active_alert: null,
};

describe('the app view of the contract', () => {
  it('turns ISO timestamps into Date and leaves nulls as null', () => {
    const parsed = deviceSummarySchema.parse(summaryWire);
    expect(parsed.last_seen).toBeInstanceOf(Date);
    expect(parsed.last_seen?.toISOString()).toBe(T);
    expect(parsed.last_measurement).toBeNull();
    // Everything else passes through with the contract's type.
    expect(parsed.current_volume).toBe(812.5);
    expect(parsed.status).toBe('online');
  });

  it('a null timestamp stays null — not 1970 (new Date(null) is the epoch)', () => {
    const parsed = deviceSummarySchema.parse({ ...summaryWire, last_seen: null, level_percent_as_of: null });
    expect(parsed.last_seen).toBeNull();
    expect(parsed.level_percent_as_of).toBeNull();
  });

  it('a garbage timestamp reads as unknown rather than failing the whole row', () => {
    const parsed = deviceSummarySchema.parse({ ...summaryWire, last_seen: 'yesterday-ish' });
    expect(parsed.last_seen).toBeNull();
  });

  it('a field the contract requires is still required here', () => {
    const { has_tank_profile: _dropped, ...rest } = summaryWire;
    expect(deviceSummarySchema.safeParse(rest).success).toBe(false);
  });

  it('current reading: timestamp is a Date, readings may be null', () => {
    const parsed = currentReadingSchema.parse({
      device_id: 'AQM-0042',
      timestamp: T,
      level_cm: null,
      volume_l: null,
      temperature_c: null,
      battery_v: null,
      rssi: null,
      level_percent: null,
      level_percent_stale: false,
      level_percent_as_of: null,
    });
    expect(parsed.timestamp.getTime()).toBe(Date.parse(T));
    expect(parsed.level_cm).toBeNull();
  });

  it('feed alerts carry a Date created_at and the device they are about', () => {
    const parsed = alertFeedSchema.parse({
      alerts: [
        { id: 'a', type: 'tank_low', severity: 'high', message: null, payload: null, acknowledged: false, dismissed: false, created_at: T, device_id: 'AQM-0042', device_name: 'Roof tank' },
      ],
      unacknowledged: 1,
      next_cursor: null,
    });
    expect(parsed.alerts[0].created_at).toBeInstanceOf(Date);
    expect(parsed.alerts[0].device_name).toBe('Roof tank');
  });

  it('history series window is Date-typed; points stay tuples', () => {
    const parsed = historySeriesSchema.parse({
      device_id: 'AQM-0042',
      from: T,
      to: T,
      requested_from: T,
      bucket: '1h',
      requested_bucket: 'auto',
      bucket_seconds: 3600,
      point_count: 1,
      truncated: false,
      has_tank_profile: true,
      columns: ['t', 'min', 'avg', 'max'],
      series: { level_percent: { unit: '%', points: [[1, 10, 12, 14]] } },
      samples: [[1, 3]],
    });
    expect(parsed.from).toBeInstanceOf(Date);
    expect(parsed.series.level_percent.points[0]).toEqual([1, 10, 12, 14]);
  });

  it('claim code expiry is a Date', () => {
    expect(claimCodeSchema.parse({ claim_code: 'ABCD1234', expires_at: T, expires_in_seconds: 600 }).expires_at).toBeInstanceOf(Date);
  });
});
