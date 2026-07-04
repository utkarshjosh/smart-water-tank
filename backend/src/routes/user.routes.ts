import express from 'express';
import * as crypto from 'crypto';
import { authenticateFirebase, AuthRequest, requireRole } from '../middleware/auth.middleware';
import { enforceTenantAccess, validateDeviceAccess } from '../middleware/tenant.middleware';
import { query } from '../config/database';
import { getAuth } from '../config/firebase';
import { provisionPersonalTenantAndUser } from '../services/onboarding.service';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// POST /api/v1/user/register - Self-registration (requires Firebase auth).
// A brand-new user auto-provisions their own personal tenant (see
// onboarding.service.ts) rather than staying tenant-less - an explicit
// tenant_id is still accepted for the ops-driven admin-linking flow.
const registerSchema = z.object({
  name: z.string().min(1).max(255),
  tenant_id: z.string().uuid().optional(), // Optional - admin can assign later
});

router.post('/register', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    if (!req.firebaseUid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate request body
    const validationResult = registerSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { name, tenant_id } = validationResult.data;

    // Get Firebase user info
    const auth = getAuth();
    const firebaseUser = await auth.getUser(req.firebaseUid);

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE firebase_uid = $1',
      [req.firebaseUid]
    );

    if (existingUser.rows.length > 0) {
      // User already exists - update profile and return (idempotent)
      await query(
        `UPDATE users
         SET name = $1, email = $2, updated_at = NOW()
         WHERE firebase_uid = $3`,
        [name, firebaseUser.email || '', req.firebaseUid]
      );

      const updatedUser = await query(
        `SELECT u.*, t.name as tenant_name
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         WHERE u.firebase_uid = $1`,
        [req.firebaseUid]
      );

      return res.json({
        user: updatedUser.rows[0],
        message: 'User already registered. Profile updated.',
      });
    }

    // If tenant_id explicitly provided, verify it exists and link to it
    // instead of auto-provisioning a personal tenant (ops-driven flow).
    if (tenant_id) {
      const tenantResult = await query(
        'SELECT id FROM tenants WHERE id = $1',
        [tenant_id]
      );

      if (tenantResult.rows.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const result = await query(
        `INSERT INTO users (firebase_uid, email, name, tenant_id, role)
         VALUES ($1, $2, $3, $4, 'user')
         RETURNING *`,
        [req.firebaseUid, firebaseUser.email || '', name, tenant_id]
      );

      return res.status(201).json({
        user: result.rows[0],
        message: 'User registered successfully',
      });
    }

    // Self-serve signup: auto-provision a personal tenant.
    const newUser = await provisionPersonalTenantAndUser({
      firebaseUid: req.firebaseUid,
      email: firebaseUser.email || '',
      name,
    });

    res.status(201).json({
      user: newUser,
      message: 'User registered successfully',
    });
  } catch (error: any) {
    console.error('Error registering user:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({ error: 'User already exists' });
    }

    res.status(500).json({ error: 'Failed to register user' });
  }
});

// POST /api/v1/user/sync - Sync Firebase user with PostgreSQL (manual sync)
router.post('/sync', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    if (!req.firebaseUid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get Firebase user info
    const auth = getAuth();
    const firebaseUser = await auth.getUser(req.firebaseUid);

    // Check if user exists in database
    const existingUser = await query(
      'SELECT * FROM users WHERE firebase_uid = $1',
      [req.firebaseUid]
    );

    if (existingUser.rows.length > 0) {
      // User exists - update with latest Firebase info
      await query(
        `UPDATE users 
         SET email = $1, 
             name = COALESCE($2, name, $1),
             updated_at = NOW()
         WHERE firebase_uid = $3`,
        [
          firebaseUser.email || '',
          firebaseUser.displayName || null,
          req.firebaseUid
        ]
      );

      const updatedUser = await query(
        `SELECT u.*, t.name as tenant_name
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         WHERE u.firebase_uid = $1`,
        [req.firebaseUid]
      );

      return res.json({
        user: updatedUser.rows[0],
        message: 'User synced successfully',
        synced: true,
      });
    } else {
      // User doesn't exist - create them with their own personal tenant
      const userName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';

      const newUser = await provisionPersonalTenantAndUser({
        firebaseUid: req.firebaseUid,
        email: firebaseUser.email || '',
        name: userName,
      });

      return res.status(201).json({
        user: newUser,
        message: 'User created and synced successfully',
        synced: true,
      });
    }
  } catch (error: any) {
    console.error('Error syncing user:', error);
    
    // Handle unique constraint violation
    if (error.code === '23505') {
      // User was created between check and insert, fetch and return
      const userResult = await query(
        `SELECT u.*, t.name as tenant_name
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         WHERE u.firebase_uid = $1`,
        [req.firebaseUid]
      );
      
      if (userResult.rows.length > 0) {
        return res.json({
          user: userResult.rows[0],
          message: 'User already exists',
          synced: true,
        });
      }
    }
    
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

// GET /api/v1/user/me - Who am I / what's my tenant (Firebase auth only, no
// tenant requirement, so a freshly-registered user can always call this).
router.get('/me', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.name, u.role, u.tenant_id, t.name as tenant_name
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ error: 'Failed to fetch current user' });
  }
});

// All other user routes require Firebase authentication and tenant
router.use(authenticateFirebase);
router.use(enforceTenantAccess);

// Rate limiter for claim-code minting: per-account, not per-IP, since the
// caller is already authenticated - stops a compromised account from
// farming codes rather than a shared NAT/IP.
const claimCodeMintLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: AuthRequest) => req.user!.id,
});

const CLAIM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // excludes 0/O/1/I/L
const CLAIM_CODE_LENGTH = 8;
const CLAIM_CODE_TTL_MS = 10 * 60 * 1000;

function generateClaimCode(): string {
  let code = '';
  const bytes = crypto.randomBytes(CLAIM_CODE_LENGTH);
  for (let i = 0; i < CLAIM_CODE_LENGTH; i++) {
    code += CLAIM_CODE_ALPHABET[bytes[i] % CLAIM_CODE_ALPHABET.length];
  }
  return code;
}

function hashClaimCode(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
}

// POST /api/v1/user/devices/claim-code - Mint a short-lived claim code the
// user types into their device's setup portal (see plans/first-launch-plan.md).
router.post('/devices/claim-code', claimCodeMintLimiter, async (req: AuthRequest, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const code = generateClaimCode();
    const codeHash = hashClaimCode(code);
    const expiresAt = new Date(Date.now() + CLAIM_CODE_TTL_MS);

    // Only one live code per tenant at a time - simplifies "regenerate".
    await query(
      `UPDATE device_claim_codes
       SET expires_at = NOW()
       WHERE tenant_id = $1 AND consumed_at IS NULL AND expires_at > NOW()`,
      [tenantId]
    );

    await query(
      `INSERT INTO device_claim_codes (code_hash, tenant_id, created_by_user_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [codeHash, tenantId, req.user!.id, expiresAt]
    );

    res.status(201).json({
      claim_code: code,
      expires_at: expiresAt.toISOString(),
      expires_in_seconds: CLAIM_CODE_TTL_MS / 1000,
    });
  } catch (error: any) {
    console.error('Error minting claim code:', error);
    res.status(500).json({ error: 'Failed to generate claim code' });
  }
});

// GET /api/v1/user/devices/claim-code/:code/status - Poll target for the
// Add Device wizard while waiting for the physical device to pair.
router.get('/devices/claim-code/:code/status', async (req: AuthRequest, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const codeHash = hashClaimCode(req.params.code);

    const result = await query(
      `SELECT dcc.*, d.device_id, d.name as device_name, d.status as device_status
       FROM device_claim_codes dcc
       LEFT JOIN devices d ON d.id = dcc.device_id
       WHERE dcc.code_hash = $1 AND dcc.tenant_id = $2`,
      [codeHash, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Claim code not found' });
    }

    const row = result.rows[0];

    if (row.consumed_at) {
      return res.json({
        status: 'claimed',
        device: {
          id: row.device_id,
          name: row.device_name || row.device_id,
          status: row.device_status,
        },
      });
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return res.json({ status: 'expired', device: null });
    }

    res.json({ status: 'pending', device: null });
  } catch (error: any) {
    console.error('Error checking claim code status:', error);
    res.status(500).json({ error: 'Failed to check claim code status' });
  }
});

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

