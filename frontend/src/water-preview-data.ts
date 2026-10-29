/** Development-only examples. No writes to a device or production API. */
export type WaterScenario = 'steady' | 'first-day' | 'empty' | 'offline' | 'error';
export function waterPreviewData(scenario: WaterScenario) {
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const start = Date.parse(`${today}T00:00:00+05:30`);
  const to = now.toISOString();
  const iso = (ms: number) => new Date(ms).toISOString();
  const shift = (days: number) =>
    iso(Date.parse(`${today}T12:00:00Z`) + days * 86400000).slice(0, 10);
  const id = 'preview-tank';
  const empty = scenario === 'empty' || scenario === 'offline';
  const first = scenario === 'first-day';
  const lastSeen = scenario === 'offline' ? iso(start - 3 * 86400000) : to;
  const device = {
    id,
    name: 'Roof tank',
    status: scenario === 'offline' ? 'offline' : 'online',
    firmware_version: '1.1.7-display',
    last_seen: lastSeen,
    created_at: '2026-07-05T16:06:48.609Z',
  };
  const profile = {
    shape: 'cylindrical',
    parallel_unit_count: 1,
    height_cm: 140,
    diameter_cm: 102,
    length_cm: null,
    width_cm: null,
    nominal_unit_volume_l: null,
    sensor_offset_cm: 0,
    dead_zone_cm: 20,
    unit_capacity_l: 1145,
    total_capacity_l: 1145,
  };
  const current = {
    device_id: id,
    timestamp: lastSeen,
    level_cm: 30,
    volume_l: scenario === 'empty' ? null : first ? 1145 : 824,
    temperature_c: 26,
    battery_v: 3.9,
    rssi: -67,
    level_percent: scenario === 'empty' ? null : first ? 100 : 72,
    level_percent_stale: scenario === 'offline',
    level_percent_as_of: lastSeen,
  };
  const makeHours = (from: number) =>
    Array.from({ length: Math.ceil((now.getTime() - from) / 3600000) }, (_, i) => {
      const ms = from + i * 3600000;
      const h = Number(
        new Date(ms).toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          hourCycle: 'h23',
        })
      );
      if (empty || (first && (h < 16 || h > 18))) return null;
      const used = first
        ? 0
        : [0, 0, 0, 0, 0, 4, 38, 92, 61, 24, 18, 12, 30, 22, 8, 6, 10, 28, 64, 55, 31, 12, 4, 0][h];
      return {
        hour_start: iso(ms),
        used_l: used,
        filled_l: first ? (h === 17 ? 409 : 0) : h === 7 ? 380 : h === 17 ? 260 : 0,
        min_l: 600,
        max_l: 1000,
        avg_l: 800,
        readings: 60,
        observed_seconds: first
          ? Math.min(
              h === 16 ? 1351 : h === 17 ? 2354 : 1946,
              Math.max(0, (now.getTime() - ms) / 1000)
            )
          : Math.min(3600, Math.max(0, (now.getTime() - ms) / 1000)),
      };
    }).filter((h): h is NonNullable<typeof h> => h !== null);
  const totals = (hours: ReturnType<typeof makeHours>) => ({
    observed_seconds: hours.reduce((s, h) => s + h.observed_seconds, 0),
    used_l: hours.length ? hours.reduce((s, h) => s + h.used_l, 0) : null,
    filled_l: hours.length ? hours.reduce((s, h) => s + h.filled_l, 0) : null,
  });
  const todayHours = makeHours(start);
  const hourly = (range: string) => {
    const from =
      range === '24h'
        ? Math.floor((now.getTime() - 86400000 - 1800000) / 3600000) * 3600000 + 1800000
        : start;
    const hours = makeHours(from);
    return {
      device_id: id,
      timezone: 'Asia/Kolkata',
      range,
      from: iso(from),
      to,
      hours,
      totals: totals(hours),
      today: { date: today, ...totals(todayHours) },
    };
  };
  const events = (range: string) => {
    const fill = {
      id: 'fill-1',
      kind: 'fill',
      started_at: iso(start + 17.47 * 3600000),
      ended_at: iso(start + 17.73 * 3600000),
      start_l: first ? 736 : 885,
      end_l: 1145,
      volume_l: first ? 409 : 260,
      rate_l_per_min: null,
      readings: 47,
      ongoing: false,
    };
    const demo = empty
      ? []
      : first
        ? [fill]
        : [
            fill,
            ...Array.from({ length: 8 }, (_, i) => ({
              id: `draw-${i}`,
              kind: 'draw',
              started_at: iso(start + (16 - i) * 3600000),
              ended_at: iso(start + (16.2 - i) * 3600000),
              start_l: 800,
              end_l: 760,
              volume_l: 40,
              rate_l_per_min: null,
              readings: 12,
              ongoing: false,
            })),
            {
              ...fill,
              id: 'fill-morning',
              started_at: iso(start + 7 * 3600000),
              ended_at: iso(start + 7.4 * 3600000),
              start_l: 500,
              end_l: 880,
              volume_l: 380,
            },
          ];
    return {
      device_id: id,
      timezone: 'Asia/Kolkata',
      range,
      from: iso(start),
      to,
      events: demo,
      totals: {
        fills: demo.filter((e) => e.kind === 'fill').length,
        draws: empty || first ? 0 : 8,
        filled_l: empty
          ? null
          : demo.filter((e) => e.kind === 'fill').reduce((s, e) => s + e.volume_l, 0),
        drawn_l: empty ? null : first ? 0 : 320,
      },
    };
  };
  const history = {
    device_id: id,
    timezone: 'Asia/Kolkata',
    from: shift(-14),
    to: shift(-1),
    group: 'day',
    today,
    capacity_l: 1145,
    full_day_hours: 20,
    buckets: Array.from({ length: 14 }, (_, i) => ({
      key: shift(i - 14),
      start: shift(i - 14),
      end: shift(i - 14),
      used_l: first || empty ? null : 380 + i * 10,
      filled_l: first || empty ? null : 500,
      refills: first || empty ? 0 : 1,
      leak_days: 0,
      days_with_data: first || empty ? 0 : 1,
      full_days: first || empty ? 0 : 1,
      estimated_days: 0,
    })),
    totals: {
      used_l: first || empty ? null : 6230,
      filled_l: first || empty ? null : 7000,
      refills: first || empty ? 0 : 14,
      days: 14,
      days_with_data: first || empty ? 0 : 14,
      full_days: first || empty ? 0 : 14,
      estimated_days: 0,
      daily_average_l: first || empty ? null : 445,
      busiest_day: null,
      quietest_day: null,
    },
    by_hour: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      average_l: empty ? null : hour === 7 ? 92 : 15,
      samples: empty ? 0 : 14,
    })),
    by_weekday: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      average_l: empty ? null : 445,
      days: empty ? 0 : 2,
    })),
  };
  return { device, profile, current, hourly, events, history };
}
