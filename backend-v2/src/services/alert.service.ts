import { AlertSeverity, AlertType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getMessaging } from '../config/firebase';
import { env } from '../config/env';

export async function processAlertsForMeasurement(
  deviceId: string,
  measurement: { volumeL: number; batteryV: number | null }
): Promise<void> {
  const device = await prisma.device.findUnique({ where: { id: deviceId }, include: { config: true } });
  if (!device || !device.tenantId) return;

  const config = device.config;
  const { volumeL, batteryV } = measurement;

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
  payload: unknown
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

  await sendFCMNotifications(tenantId, alert.id, alert.deviceId, alert.type, alert.severity, message);
}

async function sendFCMNotifications(
  tenantId: string,
  alertId: string,
  deviceId: string,
  type: AlertType,
  severity: AlertSeverity,
  message: string
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { tenantId, fcmToken: { not: null } },
    select: { fcmToken: true },
  });

  const tokens = users.map((u) => u.fcmToken).filter((t): t is string => !!t);
  if (tokens.length === 0) {
    console.log(`No users with FCM tokens for tenant ${tenantId}`);
    return;
  }

  const notification = {
    title: 'Water Tank Alert',
    body: message,
    data: { alert_id: alertId, device_id: deviceId, type, severity },
  };

  try {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: notification.title, body: notification.body },
      data: notification.data,
      android: { priority: 'high' as const },
      apns: { headers: { 'apns-priority': '10' } },
    });

    await prisma.alert.update({ where: { id: alertId }, data: { deliveredToFirebase: true } });

    console.log(`Sent ${response.successCount} FCM notifications for alert ${alertId}`);
  } catch (error) {
    console.error('Error sending FCM notifications:', error);
  }
}
