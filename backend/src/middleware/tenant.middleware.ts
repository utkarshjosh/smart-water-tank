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
  try {
    // First, get the device to check if it exists
    const deviceResult = await query(
      `SELECT d.id, d.tenant_id, d.device_id
       FROM devices d
       WHERE d.device_id = $1`,
      [deviceId]
    );

    if (deviceResult.rows.length === 0) {
      console.log(`[validateDeviceAccess] Device not found: ${deviceId}`);
      return false;
    }

    const device = deviceResult.rows[0];

    // Normalize UUIDs to strings for comparison (handle both UUID and string types)
    const deviceTenantId = device.tenant_id ? String(device.tenant_id) : null;
    const userTenantId = tenantId ? String(tenantId) : null;

    // Check if device belongs to user's tenant
    if (deviceTenantId && userTenantId && deviceTenantId === userTenantId) {
      console.log(`[validateDeviceAccess] Device ${deviceId} accessible via tenant ${tenantId}`);
      return true;
    }

    // Check if user has direct mapping to this device
    const mappingResult = await query(
      `SELECT id FROM user_device_mappings 
       WHERE device_id = $1 AND user_id = $2`,
      [device.id, userId]
    );

    if (mappingResult.rows.length > 0) {
      console.log(`[validateDeviceAccess] Device ${deviceId} accessible via user mapping for user ${userId}`);
      return true;
    }

    console.log(`[validateDeviceAccess] Device ${deviceId} NOT accessible - device.tenant_id: ${deviceTenantId}, user.tenant_id: ${userTenantId}, user_id: ${userId}, device.id: ${device.id}`);
    return false;
  } catch (error: any) {
    console.error('[validateDeviceAccess] Error checking device access:', error);
    return false;
  }
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
  const userRole = req.user?.role;

  if (!deviceId) {
    res.status(400).json({ error: 'Missing device ID' });
    return;
  }

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  // Admins and super_admins can access any device
  if (userRole === 'admin' || userRole === 'super_admin') {
    // Just verify device exists
    const deviceResult = await query(
      'SELECT id FROM devices WHERE device_id = $1',
      [deviceId]
    );
    
    if (deviceResult.rows.length === 0) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    
    next();
    return;
  }

  // Regular users need tenant access
  if (!tenantId) {
    res.status(403).json({ error: 'User tenant not found' });
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







