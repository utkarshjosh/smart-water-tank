// Verification harness for the bucketed history endpoint. Seeds a realistic
// draining/refilling tank into the configured database, exercises the SQL
// through the real service, and cross-checks the aggregates against the raw
// rows they came from. Needs a database, so it lives here rather than in the
// node:test suite:  npm run verify:history
import { prisma } from '../src/lib/prisma';
import { getDeviceHistorySeries } from '../src/services/history.service';

const DEVICE_ID = 'verify-tank-001';
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// Tank under test: sensor flush at the full line, 90 cm column, 20 cm dead
// zone, 100x100 cm footprint => levelEmpty 90, fullEff 20, span 70, 900 L.
const EMPTY_CM = 90;
const FULL_EFF_CM = 20;
const SPAN_CM = EMPTY_CM - FULL_EFF_CM;

const pct = (distanceCm: number) =>
  (100 * (EMPTY_CM - Math.min(EMPTY_CM, Math.max(FULL_EFF_CM, distanceCm)))) / SPAN_CM;

async function seed() {
  await prisma.device.deleteMany({ where: { deviceId: DEVICE_ID } });

  const device = await prisma.device.create({
    data: { deviceId: DEVICE_ID, name: 'Verify tank', status: 'online' },
  });
  await prisma.tankProfile.create({
    data: {
      deviceId: device.id,
      shape: 'cuboidal',
      parallelUnitCount: 1,
      heightCm: 90,
      lengthCm: 100,
      widthCm: 100,
      sensorOffsetCm: 0,
      deadZoneCm: 20,
    },
  });
  await prisma.deviceConfig.create({
    data: { deviceId: device.id, measurementIntervalMs: 60_000, reportIntervalMs: 300_000 },
  });

  const now = Date.now();
  const start = now - 40 * DAY_MS;
  // A deliberate 3-day outage 12 days back, to exercise the gap break.
  const outageStart = now - 12 * DAY_MS;
  const outageEnd = now - 9 * DAY_MS;

  const rows = [];
  for (let t = start; t < now; t += 300_000) {
    if (t >= outageStart && t < outageEnd) continue;

    // Distance grows as the tank drains through the day; the modulo reset is
    // the nightly refill.
    const dayFraction = ((t - start) % DAY_MS) / DAY_MS;
    const distance = 20 + dayFraction * 55 + Math.sin(t / 5_000_000) * 2;
    const unreadable = Math.floor(t / 300_000) % 200 === 0;

    rows.push({
      deviceId: device.id,
      timestamp: new Date(t),
      levelCm: unreadable ? null : Math.round(distance * 100) / 100,
      volumeL: unreadable ? null : Math.round(pct(distance) * 9 * 100) / 100,
      temperatureC: Math.round((24 + Math.sin(t / 43_200_000) * 6) * 100) / 100,
      batteryV: Math.round((4.1 - ((now - t) / DAY_MS) * 0.004) * 100) / 100,
    });
  }

  for (let i = 0; i < rows.length; i += 2000) {
    await prisma.measurement.createMany({ data: rows.slice(i, i + 2000) });
  }
  console.log(`seeded ${rows.length} readings over 40 days, including a 3-day outage\n`);
  return device;
}

type Series = Awaited<ReturnType<typeof getDeviceHistorySeries>>;

function describe(label: string, result: Series) {
  const points = result.series.level_percent.points;
  const real = points.filter((p) => p[2] != null);
  const totalSamples = result.samples.reduce((sum, [, n]) => sum + n, 0);
  const ordered = real.every((p) => p[1]! <= p[2]! + 1e-9 && p[2]! <= p[3]! + 1e-9);
  const inRange = real.every((p) => p[1]! >= 0 && p[3]! <= 100);

  console.log(label);
  console.log(`  bucket=${result.bucket} (asked ${result.requested_bucket})  seconds=${result.bucket_seconds}`);
  console.log(`  buckets=${result.point_count}  emitted=${points.length}  nulls=${points.length - real.length}  truncated=${result.truncated}`);
  console.log(`  readings covered=${totalSamples}`);
  if (real.length > 0) {
    const first = real[0];
    const last = real[real.length - 1];
    console.log(`  first ${new Date(first[0]).toISOString()}  min=${first[1]} avg=${first[2]} max=${first[3]}`);
    console.log(`  last  ${new Date(last[0]).toISOString()}  min=${last[1]} avg=${last[2]} max=${last[3]}`);
  }
  console.log(`  min<=avg<=max: ${ordered ? 'OK' : 'BROKEN'}   0..100 bounded: ${inRange ? 'OK' : 'BROKEN'}\n`);
}

async function crossCheck(deviceRowId: string, hourly: Series) {
  const points = hourly.series.level_percent.points;
  // Probe an interior bucket: the first and last are clipped by the from/to
  // filter, so recomputing over their full hour would cover rows the bucketed
  // query deliberately excluded.
  const interior = points.filter((p, i) => p[2] != null && i > 2 && i < points.length - 3);
  const probe = interior[Math.floor(interior.length / 2)];

  const raws = await prisma.measurement.findMany({
    where: {
      deviceId: deviceRowId,
      timestamp: { gte: new Date(probe[0]), lt: new Date(probe[0] + HOUR_MS) },
      levelCm: { not: null },
    },
    select: { levelCm: true, timestamp: true },
    orderBy: { timestamp: 'asc' },
  });

  const distances = raws.map((r) => r.levelCm!.toNumber());
  const clamped = distances.map((d) => Math.min(EMPTY_CM, Math.max(FULL_EFF_CM, d)));
  const expected = {
    // The inversion: the largest distance is the emptiest moment.
    min: pct(Math.max(...distances)),
    avg: (100 * (EMPTY_CM - clamped.reduce((a, b) => a + b, 0) / clamped.length)) / SPAN_CM,
    max: pct(Math.min(...distances)),
  };
  const agree = (a: number | null, b: number) => a != null && Math.abs(a - b) < 0.02;

  console.log(`[cross-check] bucket ${new Date(probe[0]).toISOString()} over ${raws.length} raw readings`);
  console.log(`  min  sql=${probe[1]}  recomputed=${expected.min.toFixed(2)}`);
  console.log(`  avg  sql=${probe[2]}  recomputed=${expected.avg.toFixed(2)}`);
  console.log(`  max  sql=${probe[3]}  recomputed=${expected.max.toFixed(2)}`);
  const match = agree(probe[1], expected.min) && agree(probe[2], expected.avg) && agree(probe[3], expected.max);
  console.log(`  => ${match ? 'MATCH' : 'MISMATCH'}`);

  // Catches a whole-timezone shift in bucket_start: every raw row the bucket
  // aggregated must fall inside that bucket's own hour.
  const firstRow = raws[0].timestamp.getTime();
  const lastRow = raws[raws.length - 1].timestamp.getTime();
  const aligned = firstRow >= probe[0] && lastRow < probe[0] + HOUR_MS;
  console.log(`[utc alignment] ${new Date(firstRow).toISOString()}..${new Date(lastRow).toISOString()} inside bucket: ${aligned ? 'OK' : 'SHIFTED'}`);

  const misaligned = points.filter((p) => p[2] != null && p[0] % HOUR_MS !== 0);
  console.log(`[boundaries] hourly buckets land on the hour: ${misaligned.length === 0 ? 'OK' : `BROKEN on ${misaligned.length}`}`);
}

async function main() {
  const device = await seed();
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  const to = now.toISOString();

  describe('[24h -> auto]', await getDeviceHistorySeries(device, { from: ago(1), to }));
  describe('[7d -> auto]', await getDeviceHistorySeries(device, { from: ago(7), to }));
  describe('[40d -> auto]', await getDeviceHistorySeries(device, { from: ago(40), to }));
  describe('[40d -> explicit 1d]', await getDeviceHistorySeries(device, { from: ago(40), to, bucket: '1d' }));
  describe('[spanning the outage, 1h]', await getDeviceHistorySeries(device, { from: ago(14), to: ago(8), bucket: '1h' }));
  describe('[legacy days=7 shorthand]', await getDeviceHistorySeries(device, { days: 7 }));

  // Explicit raw over a span holding more readings than one response can carry.
  describe('[25d -> explicit raw, expect truncation]', await getDeviceHistorySeries(device, { from: ago(25), to, bucket: 'raw' }));

  const one = await getDeviceHistorySeries(device, { from: ago(2), to, metrics: 'battery_v', bucket: '6h' });
  console.log('[metrics=battery_v]');
  console.log(`  series: ${Object.keys(one.series).join(', ')}  unit=${one.series.battery_v.unit}`);
  console.log(`  first point: ${JSON.stringify(one.series.battery_v.points[0])}\n`);

  await crossCheck(device.id, await getDeviceHistorySeries(device, { from: ago(3), to, bucket: '1h' }));

  await prisma.device.delete({ where: { id: device.id } });
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
