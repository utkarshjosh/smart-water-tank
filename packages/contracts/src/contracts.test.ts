import { describe, expect, it } from 'vitest';
import {
  adminDeviceDetailSchema,
  adminDeviceSchema,
  alertFeedResponseSchema,
  claimStatusSchema,
  configDtoSchema,
  currentReadingSchema,
  deviceConfigPayloadSchema,
  deviceSummarySchema,
  historySeriesSchema,
  isoDateTime,
  meSchema,
  otaCheckSchema,
  syncFirebaseUsersResponseSchema,
  usageResponseSchema,
} from './index';

// Each fixture is what the backend puts on the wire for that endpoint, dates
// already serialised. The tests pin the contract's intent rather than every
// field: null-means-unknown readings, the fields whose absence has already
// bitten us, and the loose objects that carry configJson through.

const T = '2026-09-14T10:00:00.000Z';

describe('primitives', () => {
  it('isoDateTime accepts what Date#toISOString produces and rejects Date objects', () => {
    expect(isoDateTime.safeParse(new Date(T).toISOString()).success).toBe(true);
    expect(isoDateTime.safeParse(new Date(T)).success).toBe(false);
    expect(isoDateTime.safeParse('2026-09-14').success).toBe(false);
  });
});

describe('user: device summary', () => {
  const row = {
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
    last_measurement: T,
    active_alert: null,
  };

  it('parses a live row', () => {
    expect(deviceSummarySchema.parse(row)).toEqual(row);
  });

  it('a never-reported device is all nulls, never zeros', () => {
    const fresh = { ...row, last_seen: null, current_volume: null, level_percent: null, level_percent_as_of: null, last_measurement: null, has_tank_profile: false };
    expect(deviceSummarySchema.safeParse(fresh).success).toBe(true);
  });

  it('rejects an unknown status or alert kind', () => {
    expect(deviceSummarySchema.safeParse({ ...row, status: 'sleeping' }).success).toBe(false);
    expect(deviceSummarySchema.safeParse({ ...row, active_alert: 'full' }).success).toBe(false);
  });
});

describe('user: current reading', () => {
  it('null readings pass; a missing field does not', () => {
    const reading = {
      device_id: 'AQM-0042',
      timestamp: T,
      level_cm: null,
      volume_l: null,
      temperature_c: null,
      battery_v: null,
      rssi: null,
      level_percent: null,
      level_percent_stale: true,
      level_percent_as_of: T,
    };
    expect(currentReadingSchema.safeParse(reading).success).toBe(true);
    const { rssi: _dropped, ...withoutRssi } = reading;
    expect(currentReadingSchema.safeParse(withoutRssi).success).toBe(false);
  });
});

describe('user: me and claim status', () => {
  it('role is the closed Prisma enum', () => {
    const me = { id: 'u', email: 'a@b.c', name: null, role: 'tenant_owner', tenant_id: 't', tenant_name: 'Home' };
    expect(meSchema.safeParse(me).success).toBe(true);
    expect(meSchema.safeParse({ ...me, role: 'owner' }).success).toBe(false);
  });

  it('a claimed code carries the device; pending and expired carry null', () => {
    expect(claimStatusSchema.parse({ status: 'pending', device: null })).toEqual({ status: 'pending', device: null });
    expect(
      claimStatusSchema.safeParse({ status: 'claimed', device: { id: 'AQM-1', name: 'AQM-1', status: 'offline' } }).success
    ).toBe(true);
  });
});

describe('user: alert feed', () => {
  it('feed rows name their device; next_cursor is null on the last page', () => {
    const feed = {
      alerts: [
        {
          id: 'a1',
          type: 'tank_low',
          severity: 'high',
          message: null,
          payload: { level_percent: 9 },
          acknowledged: false,
          dismissed: false,
          created_at: T,
          device_id: 'AQM-0042',
          device_name: 'Roof tank',
        },
      ],
      unacknowledged: 1,
      next_cursor: null,
    };
    expect(alertFeedResponseSchema.parse(feed)).toEqual(feed);
  });
});

describe('user: usage', () => {
  it('days are calendar dates, the window is ISO datetimes', () => {
    const usage = {
      device_id: 'AQM-0042',
      from: T,
      to: T,
      has_tank_profile: true,
      capacity_l: 1000,
      days: [{ date: '2026-09-13', used_l: 120.5, min_l: 500, avg_l: 560, max_l: 620, refill_events: 1, leak_suspected: false, readings: 288 }],
      totals: { used_l: 120.5, daily_average_l: 120.5, refill_events: 1, leak_days: 0, days_with_data: 1, days_aggregated: 1 },
    };
    expect(usageResponseSchema.safeParse(usage).success).toBe(true);
    expect(usageResponseSchema.safeParse({ ...usage, days: [{ ...usage.days[0], date: T }] }).success).toBe(false);
  });
});

describe('history series', () => {
  it('points are [t, min, avg, max] tuples and an all-null triple is a gap', () => {
    const series = {
      device_id: 'AQM-0042',
      from: T,
      to: T,
      requested_from: T,
      bucket: '1h',
      requested_bucket: 'auto',
      bucket_seconds: 3600,
      point_count: 2,
      truncated: false,
      has_tank_profile: true,
      columns: ['t', 'min', 'avg', 'max'],
      series: { level_percent: { unit: '%', points: [[1, 10, 12, 14], [2, null, null, null]] } },
      samples: [[1, 12], [2, 0]],
    };
    expect(historySeriesSchema.safeParse(series).success).toBe(true);
    expect(historySeriesSchema.safeParse({ ...series, bucket: 'auto' }).success).toBe(false);
    expect(historySeriesSchema.safeParse({ ...series, columns: ['t', 'min', 'max'] }).success).toBe(false);
  });
});

describe('config objects carry configJson extras through', () => {
  it('ConfigDto keeps unknown keys', () => {
    const dto = {
      measurement_interval_ms: 60000,
      report_interval_ms: 300000,
      tank_full_threshold_l: null,
      tank_low_threshold_l: null,
      tank_full_threshold_pct: 95,
      tank_low_threshold_pct: 20,
      battery_low_threshold_v: 3.3,
      level_empty_cm: null,
      level_full_cm: null,
      custom_flag: true,
    };
    expect(configDtoSchema.parse(dto)).toEqual(dto);
  });

  it('DeviceConfigPayload works with and without the geometry block', () => {
    const operational = {
      measurement_interval_ms: 60000,
      report_interval_ms: 300000,
      tank_full_threshold_l: null,
      tank_low_threshold_l: null,
      tank_full_threshold_pct: null,
      tank_low_threshold_pct: null,
      battery_low_threshold_v: 3.3,
      sync_mode: 'piggyback',
      config_version: 4,
    };
    expect(deviceConfigPayloadSchema.safeParse(operational).success).toBe(true);
    const withGeometry = {
      ...operational,
      shape: 'cylindrical',
      diameter_cm: 100,
      length_cm: null,
      width_cm: null,
      height_cm: 120,
      sensor_offset_cm: 5,
      dead_zone_cm: 20,
      parallel_unit_count: 1,
      level_empty_cm: 125,
      level_full_cm: 20,
      total_capacity_l: 942.5,
    };
    expect(deviceConfigPayloadSchema.safeParse(withGeometry).success).toBe(true);
  });
});

describe('device: OTA check', () => {
  it('discriminates on update_available', () => {
    expect(otaCheckSchema.safeParse({ update_available: false, current_version: '1.2.0' }).success).toBe(true);
    expect(
      otaCheckSchema.safeParse({
        update_available: true,
        current_version: '1.2.0',
        latest_version: '1.3.0',
        download_url: 'https://api/x',
        file_size: 512000,
        checksum: 'abc',
      }).success
    ).toBe(true);
    expect(otaCheckSchema.safeParse({ update_available: true, current_version: '1.2.0' }).success).toBe(false);
  });
});

describe('admin: devices', () => {
  const row = {
    id: 'uuid',
    device_id: 'AQM-0042',
    name: null,
    tenant_id: null,
    tenant_name: null,
    status: 'offline',
    firmware_version: null,
    last_seen: null,
    current_volume: null,
    last_measurement: null,
    created_at: T,
    archived_at: null,
  };

  it('an unpaired, never-seen device is mostly null', () => {
    expect(adminDeviceSchema.safeParse(row).success).toBe(true);
  });

  it('archived_at is required — its absence is the #5 Restore-button bug', () => {
    const { archived_at: _dropped, ...withoutArchived } = row;
    expect(adminDeviceSchema.safeParse(withoutArchived).success).toBe(false);
  });

  it('detail: recent alerts are DTOs, not Prisma rows', () => {
    const detail = {
      ...row,
      config: null,
      latest_measurement: null,
      recent_alerts: [
        { id: 'a', type: 'leak_detected', severity: 'critical', message: 'x', acknowledged: false, acknowledged_at: null, dismissed: false, created_at: T },
      ],
    };
    expect(adminDeviceDetailSchema.safeParse(detail).success).toBe(true);
    const prismaRow = { ...detail, recent_alerts: [{ id: 'a', type: 'leak_detected', severity: 'critical', message: 'x', acknowledged: false, createdAt: T }] };
    expect(adminDeviceDetailSchema.safeParse(prismaRow).success).toBe(false);
  });
});

describe('admin: firebase sync', () => {
  it('a dry run lists what it would create; a real run does not', () => {
    const stats = { total_firebase_users: 3, existing_in_db: 2, to_create: 1, created: 0, errors: 0, error_details: [] };
    expect(
      syncFirebaseUsersResponseSchema.safeParse({ dry_run: true, stats, users_to_create: [{ uid: 'u', email: 'e@x.y' }] }).success
    ).toBe(true);
    expect(syncFirebaseUsersResponseSchema.safeParse({ dry_run: false, stats }).success).toBe(true);
    expect(syncFirebaseUsersResponseSchema.safeParse({ dry_run: true, stats }).success).toBe(false);
  });
});
