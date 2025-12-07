import { query } from '../config/database';

interface MeasurementRow {
  volume_l: number;
  timestamp: Date;
}

export async function aggregateDailySummaries(): Promise<void> {
  console.log('Starting daily aggregation...');

  // Get all devices
  const devicesResult = await query('SELECT id, device_id FROM devices');
  const devices = devicesResult.rows;

  for (const device of devices) {
    await aggregateDeviceDailySummary(device.id, device.device_id);
  }

  console.log('Daily aggregation completed');
}

async function aggregateDeviceDailySummary(deviceId: string, deviceIdString: string): Promise<void> {
  // Get yesterday's date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterday);
  yesterdayEnd.setHours(23, 59, 59, 999);

  // Get all measurements for yesterday
  const measurementsResult = await query(
    `SELECT volume_l, timestamp 
     FROM measurements 
     WHERE device_id = $1 
     AND timestamp >= $2 
     AND timestamp <= $3
     ORDER BY timestamp ASC`,
    [deviceId, yesterday, yesterdayEnd]
  );

  const measurements: MeasurementRow[] = measurementsResult.rows;

  if (measurements.length === 0) {
    console.log(`No measurements for device ${deviceIdString} on ${yesterday.toISOString().split('T')[0]}`);
    return;
  }

  // Calculate statistics
  const volumes = measurements.map(m => parseFloat(m.volume_l.toString()));
  const minVolume = Math.min(...volumes);
  const maxVolume = Math.max(...volumes);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  // Detect refill events (sudden volume increases)
  let refillEvents = 0;
  const REFILL_THRESHOLD = 100; // Liters - sudden increase of this much indicates refill

  for (let i = 1; i < measurements.length; i++) {
    const prevVolume = parseFloat(measurements[i - 1].volume_l.toString());
    const currVolume = parseFloat(measurements[i].volume_l.toString());
    const increase = currVolume - prevVolume;

    if (increase >= REFILL_THRESHOLD) {
      refillEvents++;
    }
  }

  // Detect leaks (unexpected volume drops)
  let leakSuspected = false;
  const LEAK_THRESHOLD_PER_HOUR = parseFloat(process.env.LEAK_DETECTION_THRESHOLD_L_PER_HOUR || '50');
  
  // Calculate average hourly consumption
  if (measurements.length >= 2) {
    const firstVolume = parseFloat(measurements[0].volume_l.toString());
    const lastVolume = parseFloat(measurements[measurements.length - 1].volume_l.toString());
    const timeDiffHours = (measurements[measurements.length - 1].timestamp.getTime() - measurements[0].timestamp.getTime()) / (1000 * 60 * 60);
    
    if (timeDiffHours > 0) {
      const totalConsumption = firstVolume - lastVolume + (refillEvents * REFILL_THRESHOLD); // Approximate
      const hourlyConsumption = totalConsumption / timeDiffHours;
      
      // If consumption is unusually high, suspect leak
      if (hourlyConsumption > LEAK_THRESHOLD_PER_HOUR && refillEvents === 0) {
        leakSuspected = true;
      }
    }
  }

  // Calculate total usage (accounting for refills)
  let totalUsage = 0;
  let currentVolume = parseFloat(measurements[0].volume_l.toString());
  
  for (let i = 1; i < measurements.length; i++) {
    const nextVolume = parseFloat(measurements[i].volume_l.toString());
    const change = currentVolume - nextVolume;
    
    if (change > 0) {
      // Normal consumption
      totalUsage += change;
    } else if (change < -REFILL_THRESHOLD) {
      // Refill detected, don't count as usage
      // Just update current volume
    }
    
    currentVolume = nextVolume;
  }

  // Insert or update daily summary
  const dateStr = yesterday.toISOString().split('T')[0];
  
  await query(
    `INSERT INTO daily_summaries 
     (device_id, date, total_usage_l, min_volume_l, max_volume_l, avg_volume_l, refill_events, leak_suspected)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (device_id, date) 
     DO UPDATE SET
       total_usage_l = EXCLUDED.total_usage_l,
       min_volume_l = EXCLUDED.min_volume_l,
       max_volume_l = EXCLUDED.max_volume_l,
       avg_volume_l = EXCLUDED.avg_volume_l,
       refill_events = EXCLUDED.refill_events,
       leak_suspected = EXCLUDED.leak_suspected,
       updated_at = NOW()`,
    [
      deviceId,
      dateStr,
      totalUsage,
      minVolume,
      maxVolume,
      avgVolume,
      refillEvents,
      leakSuspected,
    ]
  );

  console.log(`Aggregated summary for device ${deviceIdString} on ${dateStr}: ${totalUsage.toFixed(2)}L usage, ${refillEvents} refills, leak: ${leakSuspected}`);
}







