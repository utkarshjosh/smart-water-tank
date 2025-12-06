import { query } from '../config/database';
import { getMessaging } from '../config/firebase';
import { Alert } from '../database/models';

const OFFLINE_THRESHOLD_MINUTES = parseInt(process.env.ALERT_OFFLINE_THRESHOLD_MINUTES || '15', 10);

export async function processAlertsForMeasurement(deviceId: string, measurement: any): Promise<void> {
  // Get device and config
  const deviceResult = await query(
    `SELECT d.*, dc.*, t.id as tenant_id 
     FROM devices d
     LEFT JOIN device_configs dc ON dc.device_id = d.id
     LEFT JOIN tenants t ON t.id = d.tenant_id
     WHERE d.id = $1`,
    [deviceId]
  );

  if (deviceResult.rows.length === 0) {
    return;
  }

  const device = deviceResult.rows[0];
  const volumeL = parseFloat(measurement.volume_l.toString());
  const batteryV = measurement.battery_v ? parseFloat(measurement.battery_v.toString()) : null;

  // Check tank full
  if (device.tank_full_threshold_l && volumeL >= device.tank_full_threshold_l) {
    await createAndSendAlert(
      deviceId,
      device.tenant_id,
      'tank_full',
      'high',
      `Tank is full (${volumeL.toFixed(1)}L)`,
      { volume_l: volumeL, threshold: device.tank_full_threshold_l }
    );
  }

  // Check tank low
  if (device.tank_low_threshold_l && volumeL <= device.tank_low_threshold_l) {
    await createAndSendAlert(
      deviceId,
      device.tenant_id,
      'tank_low',
      'critical',
      `Tank is low (${volumeL.toFixed(1)}L)`,
      { volume_l: volumeL, threshold: device.tank_low_threshold_l }
    );
  }

  // Check battery low
  if (batteryV && device.battery_low_threshold_v && batteryV < device.battery_low_threshold_v) {
    await createAndSendAlert(
      deviceId,
      device.tenant_id,
      'battery_low',
      'medium',
      `Battery is low (${batteryV.toFixed(2)}V)`,
      { battery_v: batteryV, threshold: device.battery_low_threshold_v }
    );
  }
}

export async function checkDeviceOfflineAlerts(): Promise<void> {
  console.log('Checking for offline devices...');

  const thresholdTime = new Date();
  thresholdTime.setMinutes(thresholdTime.getMinutes() - OFFLINE_THRESHOLD_MINUTES);

  // Find devices that haven't been seen recently
  const offlineDevicesResult = await query(
    `SELECT d.*, t.id as tenant_id 
     FROM devices d
     LEFT JOIN tenants t ON t.id = d.tenant_id
     WHERE d.last_seen < $1 
     AND d.status = 'online'`,
    [thresholdTime]
  );

  for (const device of offlineDevicesResult.rows) {
    // Update device status
    await query(
      'UPDATE devices SET status = $1 WHERE id = $2',
      ['offline', device.id]
    );

    // Create alert
    await createAndSendAlert(
      device.id,
      device.tenant_id,
      'device_offline',
      'high',
      `Device ${device.device_id} has been offline for ${OFFLINE_THRESHOLD_MINUTES} minutes`,
      { device_id: device.device_id, last_seen: device.last_seen }
    );
  }

  console.log(`Found ${offlineDevicesResult.rows.length} offline devices`);
}

export async function createLeakAlert(deviceId: string, tenantId: string, details: any): Promise<void> {
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
  type: Alert['type'],
  severity: Alert['severity'],
  message: string,
  payload: any
): Promise<void> {
  // Check if similar alert already exists and is not acknowledged
  const existingAlertResult = await query(
    `SELECT id FROM alerts 
     WHERE device_id = $1 
     AND type = $2 
     AND acknowledged = false
     AND created_at > NOW() - INTERVAL '1 hour'`,
    [deviceId, type]
  );

  // Don't create duplicate alerts within 1 hour
  if (existingAlertResult.rows.length > 0) {
    return;
  }

  // Create alert
  const alertResult = await query(
    `INSERT INTO alerts 
     (device_id, tenant_id, type, severity, message, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [deviceId, tenantId, type, severity, message, JSON.stringify(payload)]
  );

  const alert = alertResult.rows[0];

  // Send FCM notifications to users in the tenant
  await sendFCMNotifications(tenantId, alert, message);
}

async function sendFCMNotifications(tenantId: string, alert: any, message: string): Promise<void> {
  // Get all users in tenant with FCM tokens
  const usersResult = await query(
    'SELECT fcm_token FROM users WHERE tenant_id = $1 AND fcm_token IS NOT NULL',
    [tenantId]
  );

  if (usersResult.rows.length === 0) {
    console.log(`No users with FCM tokens for tenant ${tenantId}`);
    return;
  }

  const messaging = getMessaging();
  const tokens = usersResult.rows.map((row: any) => row.fcm_token).filter(Boolean);

  if (tokens.length === 0) {
    return;
  }

  const notification = {
    title: 'Water Tank Alert',
    body: message,
    data: {
      alert_id: alert.id,
      device_id: alert.device_id,
      type: alert.type,
      severity: alert.severity,
    },
  };

  try {
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification,
      android: {
        priority: 'high' as const,
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
      },
    });

    // Update alert as delivered
    await query(
      'UPDATE alerts SET delivered_to_firebase = true WHERE id = $1',
      [alert.id]
    );

    console.log(`Sent ${response.successCount} FCM notifications for alert ${alert.id}`);
  } catch (error) {
    console.error('Error sending FCM notifications:', error);
  }
}







