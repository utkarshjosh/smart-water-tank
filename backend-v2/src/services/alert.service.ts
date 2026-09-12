import { AlertSeverity, AlertType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { PushData, sendNotificationToTenant } from './fcm.service';
import { computeLevelPercent } from './tank-profile.service';

// Android notification channels are created by the app at first launch and
// their sound is immutable afterwards, so the id carries a version. The server
// picks the channel per severity; anything unknown stays quiet.
const CHANNEL_BY_SEVERITY: Record<AlertSeverity, string> = {
  critical: 'aquamind_critical_v1',
  high: 'aquamind_high_v1',
  medium: 'aquamind_info_v1',
  low: 'aquamind_info_v1',
};

// Human titles, so a lock screen says "Tank low" rather than "tank_low".
const TITLE_BY_TYPE: Record<AlertType, string> = {
  tank_full: 'Tank full',
  tank_low: 'Tank low',
  battery_low: 'Battery low',
  device_offline: 'Device offline',
  leak_detected: 'Possible leak',
};

export async function processAlertsForMeasurement(
  deviceId: string,
  measurement: { levelCm: number | null; volumeL: number | null; batteryV: number | null }
): Promise<void> {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { config: true, tankProfile: true },
  });
  if (!device || !device.tenantId) return;

  const config = device.config;
  const profile = device.tankProfile;
  const { levelCm, volumeL, batteryV } = measurement;

  // A null reading means the sensor couldn't be read this cycle - there's
  // nothing to alert on, and it must not be treated as "tank is empty".
  if (levelCm != null && volumeL != null) {
    // With a tank profile, thresholds are percentage-based (device-agnostic,
    // works for parallel-plumbed tanks). Without one yet, fall back to the
    // legacy liter thresholds so existing devices keep alerting unchanged.
    if (profile && (config?.tankFullThresholdPct != null || config?.tankLowThresholdPct != null)) {
      const levelPercent = computeLevelPercent(levelCm, {
        heightCm: profile.heightCm.toNumber(),
        sensorOffsetCm: profile.sensorOffsetCm.toNumber(),
        deadZoneCm: profile.deadZoneCm.toNumber(),
      });

      if (
        levelPercent != null &&
        config?.tankFullThresholdPct != null &&
        levelPercent >= config.tankFullThresholdPct.toNumber()
      ) {
        await createAndSendAlert(
          device.id,
          device.tenantId,
          'tank_full',
          'high',
          `Tank is full (${levelPercent.toFixed(0)}%)`,
          { level_percent: levelPercent, threshold_pct: config.tankFullThresholdPct.toNumber() },
          { level_percent: levelPercent.toFixed(1) }
        );
      }

      if (
        levelPercent != null &&
        config?.tankLowThresholdPct != null &&
        levelPercent <= config.tankLowThresholdPct.toNumber()
      ) {
        await createAndSendAlert(
          device.id,
          device.tenantId,
          'tank_low',
          'critical',
          `Tank is low (${levelPercent.toFixed(0)}%)`,
          { level_percent: levelPercent, threshold_pct: config.tankLowThresholdPct.toNumber() },
          { level_percent: levelPercent.toFixed(1) }
        );
      }
    } else {
      if (config?.tankFullThresholdL && volumeL >= config.tankFullThresholdL.toNumber()) {
        await createAndSendAlert(
          device.id,
          device.tenantId,
          'tank_full',
          'high',
          `Tank is full (${volumeL.toFixed(1)}L)`,
          { volume_l: volumeL, threshold: config.tankFullThresholdL.toNumber() }
        );
      }

      if (config?.tankLowThresholdL && volumeL <= config.tankLowThresholdL.toNumber()) {
        await createAndSendAlert(
          device.id,
          device.tenantId,
          'tank_low',
          'critical',
          `Tank is low (${volumeL.toFixed(1)}L)`,
          { volume_l: volumeL, threshold: config.tankLowThresholdL.toNumber() }
        );
      }
    }
  }

  if (batteryV !== null && config?.batteryLowThresholdV && batteryV < config.batteryLowThresholdV.toNumber()) {
    await createAndSendAlert(
      device.id,
      device.tenantId,
      'battery_low',
      'medium',
      `Battery is low (${batteryV.toFixed(2)}V)`,
      { battery_v: batteryV, threshold: config.batteryLowThresholdV.toNumber() }
    );
  }
}

export async function checkDeviceOfflineAlerts(): Promise<void> {
  console.log('Checking for offline devices...');

  const thresholdTime = new Date(Date.now() - env.alertOfflineThresholdMinutes * 60 * 1000);

  const offlineDevices = await prisma.device.findMany({
    where: { status: 'online', lastSeen: { lt: thresholdTime } },
  });

  for (const device of offlineDevices) {
    await prisma.device.update({ where: { id: device.id }, data: { status: 'offline' } });

    if (!device.tenantId) continue;

    await createAndSendAlert(
      device.id,
      device.tenantId,
      'device_offline',
      'high',
      `Device ${device.deviceId} has been offline for ${env.alertOfflineThresholdMinutes} minutes`,
      { device_id: device.deviceId, last_seen: device.lastSeen }
    );
  }

  console.log(`Found ${offlineDevices.length} offline devices`);
}

export async function createLeakAlert(deviceId: string, tenantId: string, details: unknown): Promise<void> {
  await createAndSendAlert(
    deviceId,
    tenantId,
    'leak_detected',
    'critical',
    'Possible leak detected based on unusual consumption pattern',
    details
  );
}

async function createAndSendAlert(
  deviceId: string,
  tenantId: string,
  type: AlertType,
  severity: AlertSeverity,
  message: string,
  payload: unknown,
  // Extras the app reads straight off the push: enough to update the
  // home-screen widget without opening a connection.
  extras: PushData = {}
): Promise<void> {
  // Don't create duplicate alerts of the same type for the same device
  // within an hour.
  const existing = await prisma.alert.findFirst({
    where: {
      deviceId,
      type,
      acknowledged: false,
      createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (existing) return;

  const alert = await prisma.alert.create({
    data: { deviceId, tenantId, type, severity, message, payload: payload as any },
  });

  await sendAlertNotification(tenantId, alert.id, deviceId, type, severity, message, extras);
}

/**
 * Shapes one alert into its push envelope. Pure and exported so the contract
 * the app depends on - a lock-screen title, and enough data to repaint the
 * home-screen widget without a request - is covered by tests.
 */
export function buildAlertNotification(input: {
  alertId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  deviceName: string;
  hardwareDeviceId: string;
  online?: boolean;
  asOf: Date;
  extras?: PushData;
}): { title: string; body: string; data: PushData } {
  return {
    title: `${TITLE_BY_TYPE[input.type]} · ${input.deviceName}`,
    body: input.message,
    data: {
      alert_id: input.alertId,
      // Hardware id: what /api/v1/user/devices/:deviceId takes. The internal
      // UUID is meaningless to the app.
      device_id: input.hardwareDeviceId,
      device_name: input.deviceName,
      type: input.type,
      severity: input.severity,
      channel_id: CHANNEL_BY_SEVERITY[input.severity],
      online: input.online,
      as_of: input.asOf.toISOString(),
      ...input.extras,
    },
  };
}

async function sendAlertNotification(
  tenantId: string,
  alertId: string,
  deviceId: string,
  type: AlertType,
  severity: AlertSeverity,
  message: string,
  extras: PushData
): Promise<void> {
  // The hardware id is what the app addresses devices by; the internal UUID is
  // meaningless to it, and the name is what the notification should say.
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { deviceId: true, name: true, status: true },
  });

  const deviceName = device?.name || device?.deviceId || 'Your tank';

  const envelope = buildAlertNotification({
    alertId,
    type,
    severity,
    message,
    deviceName,
    hardwareDeviceId: device?.deviceId ?? '',
    online: device ? device.status === 'online' : undefined,
    asOf: new Date(),
    extras,
  });

  const sent = await sendNotificationToTenant(tenantId, envelope.title, envelope.body, envelope.data);

  if (sent > 0) {
    await prisma.alert.update({ where: { id: alertId }, data: { deliveredToFirebase: true } });
  }
  console.log(`[alerts] ${type} for ${deviceName}: ${sent} notification(s) sent`);
}
