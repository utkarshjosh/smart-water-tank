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

// Middleware to validate device access for a specific tenant
export async function validateDeviceAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const deviceId = req.params.deviceId;
  const tenantId = (req as any).tenantId;

  if (!deviceId || !tenantId) {
    res.status(400).json({ error: 'Missing device ID or tenant ID' });
    return;
  }

  const hasAccess = await deviceBelongsToTenant(deviceId, tenantId);
  
  if (!hasAccess) {
    res.status(403).json({ error: 'Device not accessible' });
    return;
  }

  next();
}



