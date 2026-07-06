import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { createLeakAlert } from './alert.service';

const REFILL_THRESHOLD_L = 100; // sudden increase of this much indicates a refill

export async function aggregateDailySummaries(): Promise<void> {
  console.log('Starting daily aggregation...');

  const devices = await prisma.device.findMany({ select: { id: true, deviceId: true, tenantId: true } });

  for (const device of devices) {
    await aggregateDeviceDailySummary(device.id, device.deviceId, device.tenantId);
  }

  console.log('Daily aggregation completed');
}

async function aggregateDeviceDailySummary(deviceId: string, deviceIdString: string, tenantId: string | null): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterday);
  yesterdayEnd.setHours(23, 59, 59, 999);

  // Exclude readings where the sensor couldn't be read (volumeL null) -
  // they're not real data points and must not drag down min/avg or be
  // read as sudden drains/refills.
  const measurements = await prisma.measurement.findMany({
    where: { deviceId, timestamp: { gte: yesterday, lte: yesterdayEnd }, volumeL: { not: null } },
    orderBy: { timestamp: 'asc' },
    select: { volumeL: true, timestamp: true },
  });

  if (measurements.length === 0) {
    console.log(`No measurements for device ${deviceIdString} on ${yesterday.toISOString().split('T')[0]}`);
    return;
  }

  // Safe: the query above filtered to volumeL not null.
  const volumes = measurements.map((m) => m.volumeL!.toNumber());
  const minVolume = Math.min(...volumes);
  const maxVolume = Math.max(...volumes);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  // Detect refill events (sudden volume increases).
  let refillEvents = 0;
  for (let i = 1; i < volumes.length; i++) {
    if (volumes[i] - volumes[i - 1] >= REFILL_THRESHOLD_L) {
      refillEvents++;
    }
  }

  // Detect leaks (unusually high consumption with no refills that day).
  let leakSuspected = false;
  let hourlyConsumption = 0;
  if (measurements.length >= 2) {
    const firstVolume = volumes[0];
    const lastVolume = volumes[volumes.length - 1];
    const timeDiffHours =
      (measurements[measurements.length - 1].timestamp.getTime() - measurements[0].timestamp.getTime()) / (1000 * 60 * 60);

    if (timeDiffHours > 0) {
      const totalConsumption = firstVolume - lastVolume + refillEvents * REFILL_THRESHOLD_L; // approximate
      hourlyConsumption = totalConsumption / timeDiffHours;

      if (hourlyConsumption > env.leakThresholdLPerHour && refillEvents === 0) {
        leakSuspected = true;
      }
    }
  }

  // Total usage, accounting for refills (only decreasing deltas count as usage).
  let totalUsage = 0;
  let currentVolume = volumes[0];
  for (let i = 1; i < volumes.length; i++) {
    const nextVolume = volumes[i];
    const change = currentVolume - nextVolume;
    if (change > 0) {
      totalUsage += change;
    }
    currentVolume = nextVolume;
  }

  const date = new Date(yesterday.toISOString().split('T')[0]);

  await prisma.dailySummary.upsert({
    where: { deviceId_date: { deviceId, date } },
    create: {
      deviceId,
      date,
      totalUsageL: totalUsage,
      minVolumeL: minVolume,
      maxVolumeL: maxVolume,
      avgVolumeL: avgVolume,
      refillEvents,
      leakSuspected,
    },
    update: {
      totalUsageL: totalUsage,
      minVolumeL: minVolume,
      maxVolumeL: maxVolume,
      avgVolumeL: avgVolume,
      refillEvents,
      leakSuspected,
    },
  });

  console.log(
    `Aggregated summary for device ${deviceIdString} on ${date.toISOString().split('T')[0]}: ${totalUsage.toFixed(2)}L usage, ${refillEvents} refills, leak: ${leakSuspected}`
  );

  if (leakSuspected && tenantId) {
    await createLeakAlert(deviceId, tenantId, {
      hourly_consumption_l: hourlyConsumption,
      threshold_l_per_hour: env.leakThresholdLPerHour,
      date: date.toISOString().split('T')[0],
    });
  }
}
