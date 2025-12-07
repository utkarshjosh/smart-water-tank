import express from 'express';
import { authenticateFirebase, AuthRequest, requireRole } from '../middleware/auth.middleware';
import { query } from '../config/database';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createDeviceToken } from '../middleware/deviceAuth.middleware';
import { z } from 'zod';
import { Device, FirmwareBinary } from '../database/models';
import { getAuth } from '../config/firebase';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateFirebase);
router.use(requireRole('admin', 'super_admin'));

// Configure multer for firmware uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.FIRMWARE_STORAGE_PATH || './storage/firmware';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `firmware-${uniqueSuffix}.bin`);
  },
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// GET /api/v1/admin/devices - List all devices
router.get('/devices', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.query.tenant_id as string | undefined;
    const status = req.query.status as string | undefined;

    let queryStr = `
      SELECT d.*, t.name as tenant_name,
             (SELECT volume_l FROM measurements WHERE device_id = d.id ORDER BY timestamp DESC LIMIT 1) as current_volume,
             (SELECT timestamp FROM measurements WHERE device_id = d.id ORDER BY timestamp DESC LIMIT 1) as last_measurement
      FROM devices d
      LEFT JOIN tenants t ON t.id = d.tenant_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (tenantId) {
      paramCount++;
      queryStr += ` AND d.tenant_id = $${paramCount}`;
      params.push(tenantId);
    }

    if (status) {
      paramCount++;
      queryStr += ` AND d.status = $${paramCount}`;
      params.push(status);
    }

    queryStr += ' ORDER BY d.created_at DESC';

    const result = await query(queryStr, params);

    res.json({
      devices: result.rows.map((device: any) => ({
        id: device.id,
        device_id: device.device_id,
        name: device.name,
        tenant_id: device.tenant_id,
        tenant_name: device.tenant_name,
        status: device.status,
        firmware_version: device.firmware_version,
        last_seen: device.last_seen,
        current_volume: device.current_volume,
        last_measurement: device.last_measurement,
        created_at: device.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// POST /api/v1/admin/devices - Create new device
const createDeviceSchema = z.object({
  device_id: z.string().min(1).max(255),
  tenant_id: z.string().uuid(),
  name: z.string().max(255).optional(),
});

router.post('/devices', async (req: AuthRequest, res) => {
  try {
    // Validate request body
    const validationResult = createDeviceSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.errors 
      });
    }

    const { device_id, tenant_id, name } = validationResult.data;

    // Check if device_id already exists
    const existingDevice = await query(
      'SELECT id FROM devices WHERE device_id = $1',
      [device_id]
    );

    if (existingDevice.rows.length > 0) {
      return res.status(409).json({ error: 'Device ID already exists' });
    }

    // Verify tenant exists
    const tenantResult = await query(
      'SELECT id FROM tenants WHERE id = $1',
      [tenant_id]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Insert device record
    const deviceResult = await query(
      `INSERT INTO devices (device_id, tenant_id, name, status)
       VALUES ($1, $2, $3, 'offline')
       RETURNING id, device_id, tenant_id, name, status, created_at`,
      [device_id, tenant_id, name || null]
    );

    const device = deviceResult.rows[0];

    // Generate device token
    const token = await createDeviceToken(device_id);

    res.status(201).json({
      device: {
        id: device.id,
        device_id: device.device_id,
        tenant_id: device.tenant_id,
        name: device.name,
        status: device.status,
        created_at: device.created_at,
      },
      token,
    });
  } catch (error: any) {
    console.error('Error creating device:', error);
    
    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Device ID already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create device' });
  }
});

// GET /api/v1/admin/devices/:deviceId - Device details
router.get('/devices/:deviceId', async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;

    // Explicitly select columns to avoid conflicts between devices and device_configs tables
    const deviceResult = await query(
      `SELECT 
         d.id,
         d.device_id,
         d.tenant_id,
         d.name,
         d.firmware_version,
         d.last_seen,
         d.status,
         d.created_at,
         d.updated_at,
         t.name as tenant_name,
         dc.measurement_interval_ms,
         dc.report_interval_ms,
         dc.tank_full_threshold_l,
         dc.tank_low_threshold_l,
         dc.battery_low_threshold_v,
         dc.level_empty_cm,
         dc.level_full_cm,
         dc.config_json
       FROM devices d
       LEFT JOIN tenants t ON t.id = d.tenant_id
       LEFT JOIN device_configs dc ON dc.device_id = d.id
       WHERE d.device_id = $1`,
      [deviceId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const device = deviceResult.rows[0];

    // Get latest measurement
    const measurementResult = await query(
      `SELECT * FROM measurements 
       WHERE device_id = $1 
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [device.id]
    );

    // Get recent alerts
    const alertsResult = await query(
      `SELECT * FROM alerts 
       WHERE device_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [device.id]
    );

    res.json({
      id: device.id,
      device_id: device.device_id,
      name: device.name,
      tenant_id: device.tenant_id,
      tenant_name: device.tenant_name,
      status: device.status,
      firmware_version: device.firmware_version,
      last_seen: device.last_seen,
      created_at: device.created_at,
      config: device.measurement_interval_ms ? {
        measurement_interval_ms: device.measurement_interval_ms,
        report_interval_ms: device.report_interval_ms,
        tank_full_threshold_l: device.tank_full_threshold_l,
        tank_low_threshold_l: device.tank_low_threshold_l,
        battery_low_threshold_v: device.battery_low_threshold_v,
        level_empty_cm: device.level_empty_cm,
        level_full_cm: device.level_full_cm,
        config_json: device.config_json,
      } : null,
      latest_measurement: measurementResult.rows[0] || null,
      recent_alerts: alertsResult.rows,
    });
  } catch (error: any) {
    console.error('Error fetching device details:', error);
    res.status(500).json({ error: 'Failed to fetch device details' });
  }
});

// POST /api/v1/admin/devices/:deviceId/config - Update device config
router.post('/devices/:deviceId/config', async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;
    const config = req.body;

    // Get device UUID
    const deviceResult = await query(
      'SELECT id FROM devices WHERE device_id = $1',
      [deviceId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceUuid = deviceResult.rows[0].id;

    // Upsert config
    await query(
      `INSERT INTO device_configs 
       (device_id, measurement_interval_ms, report_interval_ms, tank_full_threshold_l, 
        tank_low_threshold_l, battery_low_threshold_v, level_empty_cm, level_full_cm, config_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (device_id) 
       DO UPDATE SET
         measurement_interval_ms = EXCLUDED.measurement_interval_ms,
         report_interval_ms = EXCLUDED.report_interval_ms,
         tank_full_threshold_l = EXCLUDED.tank_full_threshold_l,
         tank_low_threshold_l = EXCLUDED.tank_low_threshold_l,
         battery_low_threshold_v = EXCLUDED.battery_low_threshold_v,
         level_empty_cm = EXCLUDED.level_empty_cm,
         level_full_cm = EXCLUDED.level_full_cm,
         config_json = EXCLUDED.config_json,
         updated_at = NOW()`,
      [
        deviceUuid,
        config.measurement_interval_ms || 60000,
        config.report_interval_ms || 300000,
        config.tank_full_threshold_l || null,
        config.tank_low_threshold_l || null,
        config.battery_low_threshold_v || null,
        config.level_empty_cm || null,
        config.level_full_cm || null,
        config.config_json ? JSON.stringify(config.config_json) : null,
      ]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating device config:', error);
    res.status(500).json({ error: 'Failed to update device config' });
  }
});

// POST /api/v1/admin/firmware/upload - Upload firmware
router.post('/firmware/upload', upload.single('firmware'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { version, description } = req.body;

    if (!version) {
      // Delete uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Version is required' });
    }

    // Calculate file checksum
    const fileBuffer = fs.readFileSync(req.file.path);
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Insert firmware record
    const result = await query(
      `INSERT INTO firmware_binaries 
       (version, file_path, file_size, checksum, description, is_active)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING *`,
      [
        version,
        req.file.path,
        req.file.size,
        checksum,
        description || null,
      ]
    );

    res.json({
      success: true,
      firmware: {
        id: result.rows[0].id,
        version: result.rows[0].version,
        file_size: result.rows[0].file_size,
        checksum: result.rows[0].checksum,
        description: result.rows[0].description,
      },
    });
  } catch (error: any) {
    console.error('Error uploading firmware:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload firmware' });
  }
});

// GET /api/v1/admin/firmware - List firmware versions
router.get('/firmware', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT * FROM firmware_binaries 
       ORDER BY created_at DESC`
    );

    res.json({
      firmware: result.rows.map((fw: any) => ({
        id: fw.id,
        version: fw.version,
        file_size: fw.file_size,
        checksum: fw.checksum,
        description: fw.description,
        is_active: fw.is_active,
        rollout_percentage: fw.rollout_percentage,
        created_at: fw.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching firmware:', error);
    res.status(500).json({ error: 'Failed to fetch firmware' });
  }
});

// GET /api/v1/admin/firmware/:firmwareId/download - Download firmware
router.get('/firmware/:firmwareId/download', async (req: AuthRequest, res) => {
  try {
    const firmwareId = req.params.firmwareId;

    const result = await query(
      'SELECT * FROM firmware_binaries WHERE id = $1',
      [firmwareId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Firmware not found' });
    }

    const firmware = result.rows[0];
    const filePath = firmware.file_path;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Firmware file not found' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="firmware-${firmware.version}.bin"`);
    res.setHeader('Content-Length', firmware.file_size);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error: any) {
    console.error('Error downloading firmware:', error);
    res.status(500).json({ error: 'Failed to download firmware' });
  }
});

// POST /api/v1/admin/firmware/:version/rollout - Rollout firmware
router.post('/firmware/:version/rollout', async (req: AuthRequest, res) => {
  try {
    const version = req.params.version;
    const { device_ids, tenant_ids, rollout_percentage } = req.body;

    // Get firmware
    const firmwareResult = await query(
      'SELECT * FROM firmware_binaries WHERE version = $1',
      [version]
    );

    if (firmwareResult.rows.length === 0) {
      return res.status(404).json({ error: 'Firmware version not found' });
    }

    const firmware = firmwareResult.rows[0];

    // Build device query
    let deviceQuery = 'SELECT id FROM devices WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (device_ids && device_ids.length > 0) {
      paramCount++;
      deviceQuery += ` AND device_id = ANY($${paramCount})`;
      params.push(device_ids);
    } else if (tenant_ids && tenant_ids.length > 0) {
      paramCount++;
      deviceQuery += ` AND tenant_id = ANY($${paramCount})`;
      params.push(tenant_ids);
    } else if (rollout_percentage) {
      // Percentage-based rollout
      const totalDevicesResult = await query('SELECT COUNT(*) as count FROM devices');
      const totalDevices = parseInt(totalDevicesResult.rows[0].count);
      const targetCount = Math.ceil((rollout_percentage / 100) * totalDevices);

      deviceQuery += ` ORDER BY RANDOM() LIMIT $${++paramCount}`;
      params.push(targetCount);
    } else {
      return res.status(400).json({ error: 'Must specify device_ids, tenant_ids, or rollout_percentage' });
    }

    const devicesResult = await query(deviceQuery, params);
    const deviceIds = devicesResult.rows.map((row: any) => row.id);

    // Create assignments
    for (const deviceId of deviceIds) {
      await query(
        `INSERT INTO device_firmware_assignments (device_id, firmware_id, status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (device_id, firmware_id) 
         DO UPDATE SET status = 'pending', assigned_at = NOW()`,
        [deviceId, firmware.id]
      );
    }

    // Update firmware rollout percentage
    await query(
      'UPDATE firmware_binaries SET rollout_percentage = $1, is_active = true WHERE id = $2',
      [rollout_percentage || 0, firmware.id]
    );

    res.json({
      success: true,
      assigned_devices: deviceIds.length,
    });
  } catch (error: any) {
    console.error('Error rolling out firmware:', error);
    res.status(500).json({ error: 'Failed to rollout firmware' });
  }
});

// GET /api/v1/admin/analytics/summary - System-wide analytics
router.get('/analytics/summary', async (req: AuthRequest, res) => {
  try {
    // Get total devices
    const devicesResult = await query('SELECT COUNT(*) as count FROM devices');
    const totalDevices = parseInt(devicesResult.rows[0].count);

    // Get online devices
    const onlineResult = await query("SELECT COUNT(*) as count FROM devices WHERE status = 'online'");
    const onlineDevices = parseInt(onlineResult.rows[0].count);

    // Get total tenants
    const tenantsResult = await query('SELECT COUNT(*) as count FROM tenants');
    const totalTenants = parseInt(tenantsResult.rows[0].count);

    // Get recent alerts
    const alertsResult = await query(
      `SELECT COUNT(*) as count FROM alerts 
       WHERE created_at > NOW() - INTERVAL '24 hours'`
    );
    const recentAlerts = parseInt(alertsResult.rows[0].count);

    // Get total measurements today
    const measurementsResult = await query(
      `SELECT COUNT(*) as count FROM measurements 
       WHERE timestamp > CURRENT_DATE`
    );
    const todayMeasurements = parseInt(measurementsResult.rows[0].count);

    res.json({
      total_devices: totalDevices,
      online_devices: onlineDevices,
      offline_devices: totalDevices - onlineDevices,
      total_tenants: totalTenants,
      recent_alerts_24h: recentAlerts,
      measurements_today: todayMeasurements,
    });
  } catch (error: any) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /api/v1/admin/tenants - List tenants
router.get('/tenants', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT t.*, 
              COUNT(DISTINCT d.id) as device_count,
              COUNT(DISTINCT u.id) as user_count
       FROM tenants t
       LEFT JOIN devices d ON d.tenant_id = t.id
       LEFT JOIN users u ON u.tenant_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at DESC`
    );

    res.json({
      tenants: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

// POST /api/v1/admin/tenants - Create new tenant
const createTenantSchema = z.object({
  name: z.string().min(1).max(255),
});

router.post('/tenants', async (req: AuthRequest, res) => {
  try {
    // Validate request body
    const validationResult = createTenantSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.errors 
      });
    }

    const { name } = validationResult.data;

    // Check if tenant name already exists
    const existingTenant = await query(
      'SELECT id FROM tenants WHERE name = $1',
      [name]
    );

    if (existingTenant.rows.length > 0) {
      return res.status(409).json({ error: 'Tenant name already exists' });
    }

    // Insert tenant
    const result = await query(
      `INSERT INTO tenants (name)
       VALUES ($1)
       RETURNING id, name, created_at, updated_at`,
      [name]
    );

    const tenant = result.rows[0];

    res.status(201).json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        created_at: tenant.created_at,
        updated_at: tenant.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Error creating tenant:', error);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

// PUT /api/v1/admin/tenants/:tenantId - Update tenant
const updateTenantSchema = z.object({
  name: z.string().min(1).max(255),
});

router.put('/tenants/:tenantId', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.params.tenantId;
    
    // Validate request body
    const validationResult = updateTenantSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.errors 
      });
    }

    const { name } = validationResult.data;

    // Check if tenant exists
    const existingTenant = await query(
      'SELECT id FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (existingTenant.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if name is already taken by another tenant
    const nameCheck = await query(
      'SELECT id FROM tenants WHERE name = $1 AND id != $2',
      [name, tenantId]
    );

    if (nameCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Tenant name already exists' });
    }

    // Update tenant
    const result = await query(
      `UPDATE tenants 
       SET name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, created_at, updated_at`,
      [name, tenantId]
    );

    res.json({
      tenant: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error updating tenant:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// POST /api/v1/admin/users - Create or link user to tenant
const createUserSchema = z.object({
  firebase_uid: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
  tenant_id: z.string().uuid(),
  role: z.enum(['user', 'admin', 'super_admin']).default('user'),
});

router.post('/users', async (req: AuthRequest, res) => {
  try {
    // Validate request body
    const validationResult = createUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.errors 
      });
    }

    const { firebase_uid, email, name, tenant_id, role } = validationResult.data;

    // Verify tenant exists
    const tenantResult = await query(
      'SELECT id FROM tenants WHERE id = $1',
      [tenant_id]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if user already exists
    const existingUser = await query(
      'SELECT id, tenant_id FROM users WHERE firebase_uid = $1',
      [firebase_uid]
    );

    if (existingUser.rows.length > 0) {
      // Update existing user
      const user = existingUser.rows[0];
      await query(
        `UPDATE users 
         SET email = $1, name = $2, tenant_id = $3, role = $4, updated_at = NOW()
         WHERE id = $5`,
        [email, name || null, tenant_id, role, user.id]
      );

      const updatedUser = await query(
        'SELECT * FROM users WHERE id = $1',
        [user.id]
      );

      return res.json({
        user: updatedUser.rows[0],
        message: 'User updated and linked to tenant',
      });
    }

    // Create new user
    const result = await query(
      `INSERT INTO users (firebase_uid, email, name, tenant_id, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [firebase_uid, email, name || null, tenant_id, role]
    );

    res.status(201).json({
      user: result.rows[0],
      message: 'User created and linked to tenant',
    });
  } catch (error: any) {
    console.error('Error creating/linking user:', error);
    
    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create/link user' });
  }
});

// POST /api/v1/admin/devices/:deviceId/token - Generate device token
router.post('/devices/:deviceId/token', async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;
    const token = await createDeviceToken(deviceId);

    res.json({
      success: true,
      token,
      device_id: deviceId,
    });
  } catch (error: any) {
    console.error('Error generating device token:', error);
    res.status(500).json({ error: 'Failed to generate device token' });
  }
});

// GET /api/v1/admin/users - List all users from database
router.get('/users', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.query.tenant_id as string | undefined;
    const search = req.query.search as string | undefined;

    let queryStr = `
      SELECT u.*, t.name as tenant_name
      FROM users u
      LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (tenantId) {
      paramCount++;
      queryStr += ` AND u.tenant_id = $${paramCount}`;
      params.push(tenantId);
    }

    if (search) {
      paramCount++;
      queryStr += ` AND (u.email ILIKE $${paramCount} OR u.name ILIKE $${paramCount} OR u.firebase_uid ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    queryStr += ' ORDER BY u.created_at DESC';

    const result = await query(queryStr, params);

    res.json({
      users: result.rows.map((user: any) => ({
        id: user.id,
        firebase_uid: user.firebase_uid,
        email: user.email,
        name: user.name,
        tenant_id: user.tenant_id,
        tenant_name: user.tenant_name,
        role: user.role,
        fcm_token: user.fcm_token ? '***' : null, // Don't expose full token
        created_at: user.created_at,
        updated_at: user.updated_at,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/v1/admin/users/firebase - Search/list users from Firebase
router.get('/users/firebase', async (req: AuthRequest, res) => {
  try {
    const search = req.query.search as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const maxResults = Math.min(limit, 100); // Cap at 100 for performance

    const auth = getAuth();
    let listUsersResult;

    if (search) {
      // Search by email (Firebase Admin SDK doesn't have direct search, so we list and filter)
      // Note: Firebase Admin SDK listUsers doesn't support search, so we'll list and filter client-side
      listUsersResult = await auth.listUsers(maxResults);
    } else {
      listUsersResult = await auth.listUsers(maxResults);
    }

    const firebaseUsers = listUsersResult.users;

    // Filter by search term if provided
    let filteredUsers = firebaseUsers;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredUsers = firebaseUsers.filter(
        (user) =>
          user.email?.toLowerCase().includes(searchLower) ||
          user.displayName?.toLowerCase().includes(searchLower) ||
          user.uid.toLowerCase().includes(searchLower)
      );
    }

    // Get existing users from database to check which are already linked
    const existingUsersResult = await query(
      'SELECT firebase_uid, tenant_id FROM users WHERE firebase_uid = ANY($1)',
      [filteredUsers.map((u) => u.uid)]
    );

    const existingUsersMap = new Map(
      existingUsersResult.rows.map((row: any) => [row.firebase_uid, row.tenant_id])
    );

    // Get tenant names for linked users
    const tenantIds = Array.from(new Set(existingUsersResult.rows.map((row: any) => row.tenant_id).filter(Boolean)));
    let tenantMap = new Map();
    if (tenantIds.length > 0) {
      const tenantsResult = await query(
        'SELECT id, name FROM tenants WHERE id = ANY($1)',
        [tenantIds]
      );
      tenantMap = new Map(tenantsResult.rows.map((row: any) => [row.id, row.name]));
    }

    res.json({
      users: filteredUsers.map((user) => {
        const tenantId = existingUsersMap.get(user.uid);
        return {
          uid: user.uid,
          email: user.email || null,
          displayName: user.displayName || null,
          photoURL: user.photoURL || null,
          emailVerified: user.emailVerified,
          disabled: user.disabled,
          metadata: {
            creationTime: user.metadata.creationTime,
            lastSignInTime: user.metadata.lastSignInTime,
          },
          tenant_id: tenantId || null,
          tenant_name: tenantId ? tenantMap.get(tenantId) : null,
          is_linked: !!tenantId,
        };
      }),
      total: filteredUsers.length,
    });
  } catch (error: any) {
    console.error('Error fetching Firebase users:', error);
    res.status(500).json({ error: 'Failed to fetch Firebase users' });
  }
});

// POST /api/v1/admin/users/sync-firebase - Sync all Firebase users to PostgreSQL
router.post('/users/sync-firebase', async (req: AuthRequest, res) => {
  try {
    const { limit, dry_run } = req.body;
    const maxResults = limit ? Math.min(parseInt(limit), 1000) : 100; // Default 100, max 1000
    const isDryRun = dry_run === true;

    const auth = getAuth();
    
    // List Firebase users
    let listUsersResult;
    let allUsers: any[] = [];
    let nextPageToken: string | undefined;

    do {
      listUsersResult = await auth.listUsers(maxResults, nextPageToken);
      allUsers = allUsers.concat(listUsersResult.users);
      nextPageToken = listUsersResult.pageToken;
      
      // Limit total users processed to prevent timeout
      if (allUsers.length >= maxResults) {
        break;
      }
    } while (nextPageToken);

    // Get existing users from database
    const existingUsersResult = await query(
      'SELECT firebase_uid FROM users WHERE firebase_uid = ANY($1)',
      [allUsers.map(u => u.uid)]
    );

    const existingUids = new Set(
      existingUsersResult.rows.map((row: any) => row.firebase_uid)
    );

    const usersToCreate = allUsers.filter(u => !existingUids.has(u.uid));
    const stats = {
      total_firebase_users: allUsers.length,
      existing_in_db: existingUids.size,
      to_create: usersToCreate.length,
      created: 0,
      errors: 0,
      error_details: [] as any[],
    };

    if (isDryRun) {
      return res.json({
        dry_run: true,
        stats,
        users_to_create: usersToCreate.map(u => ({
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
        })),
      });
    }

    // Create missing users
    for (const firebaseUser of usersToCreate) {
      try {
        const userName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
        const userEmail = firebaseUser.email || '';

        await query(
          `INSERT INTO users (firebase_uid, email, name, tenant_id, role)
           VALUES ($1, $2, $3, NULL, 'user')
           ON CONFLICT (firebase_uid) DO NOTHING`,
          [firebaseUser.uid, userEmail, userName]
        );

        stats.created++;
      } catch (error: any) {
        stats.errors++;
        stats.error_details.push({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          error: error.message,
        });
        console.error(`Error creating user ${firebaseUser.uid}:`, error);
      }
    }

    res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error('Error syncing Firebase users:', error);
    res.status(500).json({ error: 'Failed to sync Firebase users' });
  }
});

// PUT /api/v1/admin/users/:userId/tenant - Update user's tenant
const updateUserTenantSchema = z.object({
  tenant_id: z.string().uuid(),
});

router.put('/users/:userId/tenant', async (req: AuthRequest, res) => {
  try {
    const userId = req.params.userId;
    
    // Validate request body
    const validationResult = updateUserTenantSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.errors 
      });
    }

    const { tenant_id } = validationResult.data;

    // Verify tenant exists
    const tenantResult = await query(
      'SELECT id FROM tenants WHERE id = $1',
      [tenant_id]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if user exists (by database ID or Firebase UID)
    const userResult = await query(
      'SELECT id, firebase_uid FROM users WHERE id = $1 OR firebase_uid = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in database' });
    }

    const user = userResult.rows[0];

    // Update user's tenant
    await query(
      `UPDATE users 
       SET tenant_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [tenant_id, user.id]
    );

    const updatedUser = await query(
      `SELECT u.*, t.name as tenant_name
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [user.id]
    );

    res.json({
      user: updatedUser.rows[0],
      message: 'User tenant updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating user tenant:', error);
    res.status(500).json({ error: 'Failed to update user tenant' });
  }
});

export default router;

