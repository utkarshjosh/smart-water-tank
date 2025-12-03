import express from 'express';
import { authenticateFirebase, AuthRequest, requireRole } from '../middleware/auth.middleware';
import { enforceTenantAccess, validateDeviceAccess } from '../middleware/tenant.middleware';
import { query } from '../config/database';
import { z } from 'zod';

const router = express.Router();

// All user routes require Firebase authentication
router.use(authenticateFirebase);
router.use(enforceTenantAccess);

// GET /api/v1/user/devices - List user's accessible devices
router.get('/devices', async (req: AuthRequest, res) => {
  try {
    const tenantId = (req as any).tenantId;

    // Get devices accessible to user (either through tenant or direct mapping)
    const devicesResult = await query(
      `SELECT DISTINCT d.*, 
              (SELECT volume_l FROM measurements WHERE device_id = d.id ORDER BY timestamp DESC LIMIT 1) as current_volume,
              (SELECT timestamp FROM measurements WHERE device_id = d.id ORDER BY timestamp DESC LIMIT 1) as last_measurement
       FROM devices d
       LEFT JOIN user_device_mappings udm ON udm.device_id = d.id
       WHERE (d.tenant_id = $1 OR udm.user_id = $2)
       ORDER BY d.name, d.device_id`,
      [tenantId, req.user!.id]
    );

    res.json({
      devices: devicesResult.rows.map((device: any) => ({
        id: device.device_id,
        name: device.name || device.device_id,
        status: device.status,
        firmware_version: device.firmware_version,
        last_seen: device.last_seen,
        current_volume: device.current_volume,
        last_measurement: device.last_measurement,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching user devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// GET /api/v1/user/devices/:deviceId/current - Latest measurement
router.get('/devices/:deviceId/current', validateDeviceAccess, async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;

    // Get device UUID
    const deviceResult = await query(
      'SELECT id FROM devices WHERE device_id = $1',
      [deviceId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceUuid = deviceResult.rows[0].id;

    // Get latest measurement
    const measurementResult = await query(
      `SELECT * FROM measurements 
       WHERE device_id = $1 
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [deviceUuid]
    );

    if (measurementResult.rows.length === 0) {
      return res.status(404).json({ error: 'No measurements found' });
    }

    const measurement = measurementResult.rows[0];
    res.json({
      device_id: deviceId,
      timestamp: measurement.timestamp,
      level_cm: parseFloat(measurement.level_cm.toString()),
      volume_l: parseFloat(measurement.volume_l.toString()),
      temperature_c: measurement.temperature_c ? parseFloat(measurement.temperature_c.toString()) : null,
      battery_v: measurement.battery_v ? parseFloat(measurement.battery_v.toString()) : null,
      rssi: measurement.rssi,
    });
  } catch (error: any) {
    console.error('Error fetching current measurement:', error);
    res.status(500).json({ error: 'Failed to fetch current measurement' });
  }
});

// GET /api/v1/user/devices/:deviceId/history - Historical data
router.get('/devices/:deviceId/history', validateDeviceAccess, async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;
    const days = parseInt(req.query.days as string) || 7;
    const limit = parseInt(req.query.limit as string) || 1000;

    // Get device UUID
    const deviceResult = await query(
      'SELECT id FROM devices WHERE device_id = $1',
      [deviceId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceUuid = deviceResult.rows[0].id;

    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get measurements
    const measurementsResult = await query(
      `SELECT timestamp, level_cm, volume_l, temperature_c, battery_v, rssi
       FROM measurements 
       WHERE device_id = $1 
       AND timestamp >= $2
       ORDER BY timestamp DESC 
       LIMIT $3`,
      [deviceUuid, startDate, limit]
    );

    res.json({
      device_id: deviceId,
      measurements: measurementsResult.rows.map((m: any) => ({
        timestamp: m.timestamp,
        level_cm: parseFloat(m.level_cm.toString()),
        volume_l: parseFloat(m.volume_l.toString()),
        temperature_c: m.temperature_c ? parseFloat(m.temperature_c.toString()) : null,
        battery_v: m.battery_v ? parseFloat(m.battery_v.toString()) : null,
        rssi: m.rssi,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/v1/user/devices/:deviceId/alerts - Alert history
router.get('/devices/:deviceId/alerts', validateDeviceAccess, async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;
    const limit = parseInt(req.query.limit as string) || 50;

    // Get device UUID
    const deviceResult = await query(
      'SELECT id FROM devices WHERE device_id = $1',
      [deviceId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceUuid = deviceResult.rows[0].id;

    // Get alerts
    const alertsResult = await query(
      `SELECT * FROM alerts 
       WHERE device_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [deviceUuid, limit]
    );

    res.json({
      device_id: deviceId,
      alerts: alertsResult.rows.map((alert: any) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        payload: alert.payload,
        acknowledged: alert.acknowledged,
        created_at: alert.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// POST /api/v1/user/devices/:deviceId/alerts/:alertId/acknowledge - Acknowledge alert
router.post('/devices/:deviceId/alerts/:alertId/acknowledge', validateDeviceAccess, async (req: AuthRequest, res) => {
  try {
    const alertId = req.params.alertId;

    // Verify alert belongs to user's tenant
    const alertResult = await query(
      `SELECT a.* FROM alerts a
       INNER JOIN devices d ON d.id = a.device_id
       WHERE a.id = $1 AND d.device_id = $2`,
      [alertId, req.params.deviceId]
    );

    if (alertResult.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Update alert
    await query(
      `UPDATE alerts 
       SET acknowledged = true, 
           acknowledged_by = $1, 
           acknowledged_at = NOW()
       WHERE id = $2`,
      [req.user!.id, alertId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// Update FCM token
router.post('/fcm-token', async (req: AuthRequest, res) => {
  try {
    const { fcm_token } = req.body;

    if (!fcm_token) {
      return res.status(400).json({ error: 'fcm_token is required' });
    }

    await query(
      'UPDATE users SET fcm_token = $1, updated_at = NOW() WHERE id = $2',
      [fcm_token, req.user!.id]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating FCM token:', error);
    res.status(500).json({ error: 'Failed to update FCM token' });
  }
});

export default router;

