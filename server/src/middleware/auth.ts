import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest, AuthUserPayload, UserRole } from '../types/index.js';
import { AppError } from './error.js';

const JWT_SECRET = process.env.JWT_SECRET || 'ruralcare_jwt_super_secret_key_change_in_production_2026';

import { prisma } from '../lib/prisma.js';

export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new AppError('Authentication required. Missing or malformed token.', 401));
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUserPayload;
    
    // Concurrency check: if token has a sessionId, verify it's the active one
    if (decoded.sessionId && decoded.id) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { activeSessionId: true },
      });
      if (user && user.activeSessionId && user.activeSessionId !== decoded.sessionId) {
        next(new AppError('SESSION_REVOKED: You have been logged out because your account was logged in from another device.', 401));
        return;
      }
    }

    req.user = decoded;
    next();
  } catch (err: any) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(new AppError('Invalid or expired authentication token.', 401));
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        `Access denied. Role '${req.user.role}' is not authorized to access this resource.`,
        403
      );
    }

    next();
  };
}

export function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthUserPayload;
      req.user = decoded;
    } catch {
      // Ignored for optional auth
    }
  }

  next();
}

