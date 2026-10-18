import { NextFunction, Request, Response } from 'express';
import { User } from '@prisma/client';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAuth } from '../config/firebase';
import { prisma } from '../lib/prisma';
import { extractBearer } from '../lib/bearer';
import { HttpError } from '../lib/http-error';
import { provisionPersonalTenantAndUser } from '../services/onboarding.service';

export interface AuthRequest extends Request {
  user?: User;
  firebaseUid?: string;
}

// firebase-admin codes that mean "this ID token is not acceptable". Anything
// else verifyIdToken throws (credentials or project ID not configured, an
// internal error) is the server's problem, not the caller's.
const REJECTED_TOKEN_CODES = new Set([
  'auth/argument-error', // malformed, bad signature, wrong project, unknown key id
  'auth/id-token-expired',
  'auth/invalid-id-token',
  'auth/id-token-revoked',
  'auth/user-disabled',
]);

function isRejectedToken(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || !REJECTED_TOKEN_CODES.has(code)) return false;
  // firebase-admin also files a failed fetch of Google's signing keys under
  // auth/argument-error. When Google answered with an error status the message
  // says so; a bare network failure does not, and still reads as a bad token.
  return !(typeof message === 'string' && message.includes('Error fetching public keys'));
}

// 401 means only "this ID token is not valid". A server-side failure answers
// 503, which the mobile client retries with backoff instead of force-refreshing
// a token that was fine.
export async function firebaseAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const token = extractBearer(req);
  if (!token) {
    next(new HttpError(401, 'Missing or invalid authorization header'));
    return;
  }

  let decoded: DecodedIdToken;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch (error) {
    if (isRejectedToken(error)) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    console.error('Firebase token verification error:', error);
    next(new HttpError(503, 'Authentication temporarily unavailable'));
    return;
  }

  try {
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

    // An archived account keeps its Firebase credentials, so without this an
    // "deleted" user would still authenticate and reach every tenant route.
    if (user.archivedAt) {
      next(new HttpError(403, 'This account has been deactivated'));
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    // The token was valid; the user lookup or first-sign-in provisioning
    // failed (database down, Firebase user fetch failed).
    console.error('Firebase authentication error:', error);
    next(new HttpError(503, 'Authentication temporarily unavailable'));
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
