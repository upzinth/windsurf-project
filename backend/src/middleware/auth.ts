import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, User } from '@/types';
import { asyncHandler } from '@/middleware/errorHandler';
import db from '@/config/database';

export const authMiddleware = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access denied. No token provided.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; sessionId: string };
    
    // Get user from database
    const user = await db('users').where({ id: decoded.userId, is_active: true }).first();
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token. User not found.'
      });
    }

    // Check session
    const session = await db('sessions').where({
      id: decoded.sessionId,
      user_id: decoded.userId,
      is_active: true
    }).first();

    if (!session || new Date(session.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'Session expired. Please login again.'
      });
    }

    // Update last activity
    await db('sessions')
      .where({ id: decoded.sessionId })
      .update({ last_activity: new Date() });

    req.user = user;
    req.session = session;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid token.'
    });
  }
});

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. Authentication required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

export const requireAdmin = requireRole(['admin']);
export const requireManager = requireRole(['admin', 'manager']);
export const requireUser = requireRole(['admin', 'manager', 'user']);
