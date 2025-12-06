import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { query } from '../config/database';

// Middleware to ensure user can only access resources from their tenant
export async function enforceTenantAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user || !req.user.tenant_id) {
    res.status(403).json({ error: 'User tenant not found' });
    return;
  }

  // Attach tenant_id to request for use in routes
  (req as any).tenantId = req.user.tenant_id;
  next();
}

// Helper function to check if device belongs to tenant
export async function deviceBelongsToTenant(
  deviceId: string,
  tenantId: string
): Promise<boolean> {
  const result = await query(
    'SELECT tenant_id FROM devices WHERE device_id = $1',
    [deviceId]
  );

  if (result.rows.length === 0) {
    return false;
  }

  return result.rows[0].tenant_id === tenantId;
}

// Helper function to check if user has access to device (through tenant or direct mapping)
export async function userHasDeviceAccess(
  deviceId: string,
  userId: string,
  tenantId: string
): Promise<boolean> {
  const result = await query(
    `SELECT d.id, d.tenant_id
     FROM devices d
     LEFT JOIN user_device_mappings udm ON udm.device_id = d.id
     WHERE d.device_id = $1
     AND (d.tenant_id = $2 OR udm.user_id = $3)`,
    [deviceId, tenantId, userId]
  );

  return result.rows.length > 0;
}

// Middleware to validate device access for a specific tenant
export async function validateDeviceAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const deviceId = req.params.deviceId;
  const tenantId = (req as any).tenantId;
  const userId = req.user?.id;

  if (!deviceId || !tenantId) {
    res.status(400).json({ error: 'Missing device ID or tenant ID' });
    return;
  }

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  // Check access through tenant OR user_device_mappings
  const hasAccess = await userHasDeviceAccess(deviceId, userId, tenantId);
  
  if (!hasAccess) {
    res.status(403).json({ error: 'Device not accessible' });
    return;
  }

  next();
}







