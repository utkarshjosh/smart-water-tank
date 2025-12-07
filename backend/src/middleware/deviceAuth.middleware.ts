import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { query } from '../config/database';
import { Device } from '../database/models';

export interface DeviceAuthRequest extends Request {
  device?: Device;
  deviceId?: string;
}

export async function authenticateDevice(
  req: DeviceAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Hash the token to compare with stored hash
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    // Find device by token hash
    const tokenResult = await query(
      `SELECT d.* FROM devices d
       INNER JOIN device_tokens dt ON dt.device_id = d.id
       WHERE dt.token_hash = $1
       AND (dt.expires_at IS NULL OR dt.expires_at > NOW())`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      res.status(401).json({ error: 'Invalid device token' });
      return;
    }

    req.device = tokenResult.rows[0] as Device;
    req.deviceId = req.device.device_id; // The device_id string from firmware
    
    next();
  } catch (error: any) {
    console.error('Device authentication error:', error);
    res.status(401).json({ error: 'Device authentication failed' });
  }
}

// Helper function to create device token (for admin use)
export async function createDeviceToken(deviceId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  // Get device UUID
  const deviceResult = await query(
    'SELECT id FROM devices WHERE device_id = $1',
    [deviceId]
  );

  if (deviceResult.rows.length === 0) {
    throw new Error('Device not found');
  }

  const deviceUuid = deviceResult.rows[0].id;

  // Store token hash
  await query(
    `INSERT INTO device_tokens (device_id, token_hash)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [deviceUuid, tokenHash]
  );

  return token;
}







