import { Request, Response, NextFunction } from 'express';
import { getAuth } from '../config/firebase';
import { query } from '../config/database';
import { User } from '../database/models';
import { provisionPersonalTenantAndUser } from '../services/onboarding.service';

export interface AuthRequest extends Request {
  user?: User;
  firebaseUid?: string;
}

export async function authenticateFirebase(
  req: AuthRequest,
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
    const auth = getAuth();
    
    const decodedToken = await auth.verifyIdToken(token);
    req.firebaseUid = decodedToken.uid;

    // Fetch user from database
    let userResult = await query(
      'SELECT * FROM users WHERE firebase_uid = $1',
      [decodedToken.uid]
    );

    if (userResult.rows.length === 0) {
      // User doesn't exist in DB yet - auto-provision their own personal
      // tenant so they land in a usable, tenant-scoped account immediately.
      try {
        const firebaseUser = await auth.getUser(decodedToken.uid);
        const userName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
        const userEmail = firebaseUser.email || '';

        const newUser = await provisionPersonalTenantAndUser({
          firebaseUid: decodedToken.uid,
          email: userEmail,
          name: userName,
        });

        console.log(`[Auth] Auto-provisioned user + tenant: ${decodedToken.uid} (${userEmail})`);
        userResult = { rows: [newUser] };
      } catch (createError: any) {
        console.error('Error auto-provisioning user in database:', createError);
        res.status(500).json({
          error: 'Failed to create user account',
          details: 'User authenticated with Firebase but could not be created in database'
        });
        return;
      }
    }

    req.user = userResult.rows[0] as User;
    next();
  } catch (error: any) {
    console.error('Firebase authentication error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}








