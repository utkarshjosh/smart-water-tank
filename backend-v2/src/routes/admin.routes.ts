import express from 'express';
import multer from 'multer';
import * as fs from 'fs';
import { z } from 'zod';
import { AuthRequest, firebaseAuth, requireRole } from '../middleware/firebaseAuth.middleware';
import { asyncHandler } from '../lib/async-handler';
import { HttpError } from '../lib/http-error';
import { env } from '../config/env';
import * as adminService from '../services/admin.service';
import * as firmwareService from '../services/firmware.service';
import { exportAdminMeasurements } from '../services/measurement-export.service';

const router = express.Router();

// All admin routes require authentication and admin role.
router.use(firebaseAuth);
router.use(requireRole('admin', 'super_admin'));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(env.firmwareStoragePath)) {
      fs.mkdirSync(env.firmwareStoragePath, { recursive: true });
    }
    cb(null, env.firmwareStoragePath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `firmware-${uniqueSuffix}.bin`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/v1/admin/devices - List all devices
const listDevicesQuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  status: z.enum(['online', 'offline']).optional(),
});

router.get(
  '/devices',
  asyncHandler(async (req, res) => {
    const { tenant_id, status } = listDevicesQuerySchema.parse(req.query);
    res.json({
      devices: await adminService.listDevices({
        tenantId: tenant_id,
        status,
        includeArchived: req.query.include_archived === 'true',
      }),
    });
  })
);

const measurementExportBodySchema = z.object({
  device_ids: z.array(z.string().min(1)).min(1).max(100),
  from: z.coerce.date(),
  to: z.coerce.date(),
});

// POST /api/v1/admin/measurements/export - Fleet-wide multi-device CSV export.
router.post(
  '/measurements/export',
  asyncHandler(async (req, res) => {
    const { device_ids, from, to } = measurementExportBodySchema.parse(req.body);
    const result = await exportAdminMeasurements({ hardwareDeviceIds: device_ids, from, to });
    const dateSuffix = `${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="aquamind-measurements-${dateSuffix}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Export-Row-Count', result.rowCount.toString());
    res.send(result.csv);
  })
);

// POST /api/v1/admin/devices - Create new device
const createDeviceSchema = z.object({
  device_id: z.string().min(1).max(255),
  tenant_id: z.string().uuid(),
  name: z.string().max(255).optional(),
});

router.post(
  '/devices',
  asyncHandler(async (req, res) => {
    const { device_id, tenant_id, name } = createDeviceSchema.parse(req.body);
    const result = await adminService.createDevice({ deviceId: device_id, tenantId: tenant_id, name });
    res.status(201).json(result);
  })
);

// GET /api/v1/admin/devices/:deviceId - Device details
router.get(
  '/devices/:deviceId',
  asyncHandler(async (req, res) => {
    res.json(await adminService.getDeviceDetail(req.params.deviceId));
  })
);

const updateDeviceSchema = z
  .object({
    name: z.string().max(255).nullable().optional(),
    tenant_id: z.string().uuid().optional(),
  })
  .refine((body) => body.name !== undefined || body.tenant_id !== undefined, {
    message: 'Provide name or tenant_id',
  });

// PUT /api/v1/admin/devices/:deviceId - Rename a device, or move it to
// another tenant. Moving a device changes who can see its whole history, so
// it is its own explicit call rather than a side effect of another write.
router.put(
  '/devices/:deviceId',
  asyncHandler(async (req, res) => {
    const body = updateDeviceSchema.parse(req.body);
    res.json(
      await adminService.updateDevice(req.params.deviceId, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.tenant_id !== undefined ? { tenantId: body.tenant_id } : {}),
      })
    );
  })
);

// POST /api/v1/admin/devices/:deviceId/config - Update device config
router.post(
  '/devices/:deviceId/config',
  asyncHandler(async (req, res) => {
    await adminService.upsertDeviceConfig(req.params.deviceId, req.body);
    res.json({ success: true });
  })
);

// POST /api/v1/admin/firmware/upload - Upload firmware
router.post(
  '/firmware/upload',
  upload.single('firmware'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file uploaded');
    const firmware = await firmwareService.uploadFirmware(req.file, req.body.version, req.body.description);
    res.json({
      success: true,
      firmware: {
        id: firmware.id,
        version: firmware.version,
        file_size: firmware.fileSize,
        checksum: firmware.checksum,
        description: firmware.description,
      },
    });
  })
);

// GET /api/v1/admin/firmware - List firmware versions
router.get(
  '/firmware',
  asyncHandler(async (req, res) => {
    const firmware = await firmwareService.listFirmware();
    res.json({
      firmware: firmware.map((fw) => ({
        id: fw.id,
        version: fw.version,
        file_size: fw.fileSize,
        checksum: fw.checksum,
        description: fw.description,
        is_active: fw.isActive,
        rollout_percentage: fw.rolloutPercentage,
        created_at: fw.createdAt,
      })),
    });
  })
);

// GET /api/v1/admin/firmware/:firmwareId/download - Download firmware
router.get(
  '/firmware/:firmwareId/download',
  asyncHandler(async (req, res) => {
    const firmware = await firmwareService.getFirmwareBinaryOrThrow(req.params.firmwareId);

    if (!fs.existsSync(firmware.filePath)) {
      throw new HttpError(404, 'Firmware file not found');
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="firmware-${firmware.version}.bin"`);
    res.setHeader('Content-Length', firmware.fileSize ?? 0);
    fs.createReadStream(firmware.filePath).pipe(res);
  })
);

// POST /api/v1/admin/firmware/:version/rollout - Rollout firmware
const rolloutSchema = z.object({
  device_ids: z.array(z.string()).optional(),
  tenant_ids: z.array(z.string()).optional(),
  rollout_percentage: z.number().min(0).max(100).optional(),
});

router.post(
  '/firmware/:version/rollout',
  asyncHandler(async (req, res) => {
    const { device_ids, tenant_ids, rollout_percentage } = rolloutSchema.parse(req.body);
    const result = await firmwareService.rolloutFirmware(req.params.version, {
      deviceIds: device_ids,
      tenantIds: tenant_ids,
      rolloutPercentage: rollout_percentage,
    });
    res.json({ success: true, assigned_devices: result.assignedDevices });
  })
);

// POST /api/v1/admin/firmware/:firmwareId/unroll - Stop offering a release to devices
router.post(
  '/firmware/:firmwareId/unroll',
  asyncHandler(async (req, res) => {
    const result = await firmwareService.unrollFirmware(req.params.firmwareId);
    res.json({
      success: true,
      firmware_id: result.firmwareId,
      version: result.version,
      cancelled_assignments: result.cancelledAssignments,
    });
  })
);

// DELETE /api/v1/admin/firmware/:firmwareId - Delete an unrolled release and binary
router.delete(
  '/firmware/:firmwareId',
  asyncHandler(async (req, res) => {
    const result = await firmwareService.deleteFirmware(req.params.firmwareId);
    res.json({
      success: true,
      firmware_id: result.firmwareId,
      version: result.version,
      file_deleted: result.fileDeleted,
    });
  })
);

const adminAlertsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
  tenant_id: z.string().uuid().optional(),
  device_id: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  acknowledged: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  include_dismissed: z.coerce.boolean().default(false),
  hours: z.coerce.number().int().positive().max(24 * 365).optional(),
});

// GET /api/v1/admin/alerts - Fleet-wide alert feed. The dashboard's 24-hour
// alert count previously had nothing to drill into.
router.get(
  '/alerts',
  asyncHandler(async (req, res) => {
    const q = adminAlertsQuerySchema.parse(req.query);
    res.json(
      await adminService.listAlerts({
        limit: q.limit,
        tenantId: q.tenant_id,
        deviceId: q.device_id,
        severity: q.severity,
        acknowledged: q.acknowledged,
        includeDismissed: q.include_dismissed,
        since: q.hours ? new Date(Date.now() - q.hours * 3_600_000) : undefined,
      })
    );
  })
);

// GET /api/v1/admin/tenants/:tenantId/archive-preview - What an archive takes
// with it, so the UI can confirm with real numbers instead of a vague warning.
router.get(
  '/tenants/:tenantId/archive-preview',
  asyncHandler(async (req, res) => {
    res.json(await adminService.previewTenantArchive(req.params.tenantId));
  })
);

// DELETE /api/v1/admin/tenants/:tenantId - Archive a tenant and everything
// under it. Soft: the cascade rules make a real delete destructive, so this
// blocks access and keeps the history. `confirm=true` is required because the
// blast radius is a whole organisation.
router.delete(
  '/tenants/:tenantId',
  asyncHandler(async (req, res) => {
    if (req.query.confirm !== 'true') {
      throw new HttpError(
        400,
        'Archiving a tenant also archives its devices and users. Re-send with ?confirm=true.'
      );
    }
    res.json(await adminService.archiveTenant(req.params.tenantId));
  })
);

// POST /api/v1/admin/tenants/:tenantId/restore
router.post(
  '/tenants/:tenantId/restore',
  asyncHandler(async (req, res) => {
    res.json(await adminService.restoreTenant(req.params.tenantId));
  })
);

// DELETE /api/v1/admin/devices/:deviceId - Decommission a device. Readings are
// retained; the device stops being served and its hardware ID stays claimed so
// a retired sensor cannot silently re-pair.
router.delete(
  '/devices/:deviceId',
  asyncHandler(async (req, res) => {
    res.json(await adminService.archiveDevice(req.params.deviceId));
  })
);

// POST /api/v1/admin/devices/:deviceId/restore
router.post(
  '/devices/:deviceId/restore',
  asyncHandler(async (req, res) => {
    res.json(await adminService.restoreDevice(req.params.deviceId));
  })
);

// DELETE /api/v1/admin/users/:userId - Deactivate an account. Firebase
// credentials still exist, so firebaseAuth enforces the block; historic
// acknowledged-by references on alerts survive.
router.delete(
  '/users/:userId',
  asyncHandler(async (req: AuthRequest, res) => {
    res.json(await adminService.archiveUser(req.params.userId, req.user!.id));
  })
);

// POST /api/v1/admin/users/:userId/restore
router.post(
  '/users/:userId/restore',
  asyncHandler(async (req, res) => {
    res.json(await adminService.restoreUser(req.params.userId));
  })
);

// GET /api/v1/admin/analytics/summary - System-wide analytics
router.get(
  '/analytics/summary',
  asyncHandler(async (req, res) => {
    res.json(await adminService.analyticsSummary());
  })
);

// GET /api/v1/admin/tenants - List tenants
router.get(
  '/tenants',
  asyncHandler(async (req, res) => {
    res.json({
      tenants: await adminService.listTenants({ includeArchived: req.query.include_archived === 'true' }),
    });
  })
);

// POST /api/v1/admin/tenants - Create new tenant
const createTenantSchema = z.object({ name: z.string().min(1).max(255) });

router.post(
  '/tenants',
  asyncHandler(async (req, res) => {
    const { name } = createTenantSchema.parse(req.body);
    const tenant = await adminService.createTenant(name);
    res.status(201).json({ tenant });
  })
);

// PUT /api/v1/admin/tenants/:tenantId - Update tenant
const updateTenantSchema = z.object({ name: z.string().min(1).max(255) });

router.put(
  '/tenants/:tenantId',
  asyncHandler(async (req, res) => {
    const { name } = updateTenantSchema.parse(req.body);
    const tenant = await adminService.updateTenant(req.params.tenantId, name);
    res.json({ tenant });
  })
);

// POST /api/v1/admin/users - Create/link a Firebase user and assign access.
const createUserSchema = z.object({
  firebase_uid: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
  tenant_id: z.string().uuid().optional(),
  role: z.enum(['user', 'tenant_owner', 'admin', 'super_admin']).default('user'),
});

router.post(
  '/users',
  asyncHandler(async (req, res) => {
    const { firebase_uid, email, name, tenant_id, role } = createUserSchema.parse(req.body);
    if (role === 'super_admin' && (req as AuthRequest).user!.role !== 'super_admin') {
      throw new HttpError(403, 'Only a super admin can create another super admin');
    }
    const result = await adminService.createOrLinkUser({ firebaseUid: firebase_uid, email, name, tenantId: tenant_id, role });
    res.json(result);
  })
);

// POST /api/v1/admin/devices/:deviceId/token - Generate device token
router.post(
  '/devices/:deviceId/token',
  asyncHandler(async (req, res) => {
    const token = await adminService.reissueDeviceToken(req.params.deviceId);
    res.json({ success: true, token, device_id: req.params.deviceId });
  })
);

// GET /api/v1/admin/users - List all users from database
const listUsersQuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  search: z.string().optional(),
});

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { tenant_id, search } = listUsersQuerySchema.parse(req.query);
    res.json({
      users: await adminService.listUsers({
        tenantId: tenant_id,
        search,
        includeArchived: req.query.include_archived === 'true',
      }),
    });
  })
);

// GET /api/v1/admin/users/firebase - Search/list users from Firebase
const listFirebaseUsersQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().default(50),
});

router.get(
  '/users/firebase',
  asyncHandler(async (req, res) => {
    const { search, limit } = listFirebaseUsersQuerySchema.parse(req.query);
    res.json(await adminService.listFirebaseUsers(search, limit));
  })
);

// POST /api/v1/admin/users/sync-firebase - Sync all Firebase users to the DB
const syncFirebaseSchema = z.object({
  limit: z.number().int().positive().optional(),
  dry_run: z.boolean().optional(),
});

router.post(
  '/users/sync-firebase',
  asyncHandler(async (req, res) => {
    const { limit, dry_run } = syncFirebaseSchema.parse(req.body);
    res.json(await adminService.syncFirebaseUsers(limit, dry_run === true));
  })
);

// PUT /api/v1/admin/users/:userId/tenant - Update user's tenant
const updateUserTenantSchema = z.object({ tenant_id: z.string().uuid() });

router.put(
  '/users/:userId/tenant',
  asyncHandler(async (req, res) => {
    const { tenant_id } = updateUserTenantSchema.parse(req.body);
    const user = await adminService.updateUserTenant(req.params.userId, tenant_id);
    res.json({ user, message: 'User tenant updated successfully' });
  })
);

// PUT /api/v1/admin/users/:userId/role - Promote/demote a user. This is kept
// super-admin only because it can grant platform-wide access.
const updateUserRoleSchema = z.object({ role: z.enum(['user', 'tenant_owner', 'admin', 'super_admin']) });

router.put(
  '/users/:userId/role',
  requireRole('super_admin'),
  asyncHandler(async (req, res) => {
    const { role } = updateUserRoleSchema.parse(req.body);
    const user = await adminService.updateUserRole(req.params.userId, role);
    res.json({ user, message: 'User role updated successfully' });
  })
);

export default router;
