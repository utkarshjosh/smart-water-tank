import { NextFunction, Request, Response } from 'express';
import { User } from '@prisma/client';
import { getAuth } from '../config/firebase';
import { prisma } from '../lib/prisma';
import { extractBearer } from '../lib/bearer';
import { HttpError } from '../lib/http-error';
import { provisionPersonalTenantAndUser } from '../services/onboarding.service';

export interface AuthRequest extends Request {
  user?: User;
  firebaseUid?: string;
}

export async function firebaseAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearer(req);
    if (!token) {
      next(new HttpError(401, 'Missing or invalid authorization header'));
      return;
    }

    const decoded = await getAuth().verifyIdToken(token);
    req.firebaseUid = decoded.uid;

    let user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });

    if (!user) {
      // First time this Firebase account has been seen - auto-provision a
      // personal tenant so the caller lands in a usable, tenant-scoped
      // account immediately (no separate register call required).
      const firebaseUser = await getAuth().getUser(decoded.uid);
      const name = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
      user = await provisionPersonalTenantAndUser({
        firebaseUid: decoded.uid,
        email: firebaseUser.email || '',
        name,
      });
      console.log(`[Auth] Auto-provisioned user + tenant: ${decoded.uid} (${user.email})`);
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Firebase authentication error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new HttpError(401, 'Unauthorized'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new HttpError(403, 'Insufficient permissions'));
      return;
    }
    next();
  };
}

export function requireTenant(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user?.tenantId) {
    next(new HttpError(403, 'User tenant not found'));
    return;
  }
  next();
}
