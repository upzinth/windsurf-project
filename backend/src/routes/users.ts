import { Router, Response } from 'express';
import { body, validationResult, query } from 'express-validator';
import { AuthService } from '@/services/authService';
import { asyncHandler } from '@/middleware/errorHandler';
import { requireRole, AuthRequest } from '@/middleware/auth';
import db from '@/config/database';

const router = Router();

// GET /api/users - Get all users (Admin only)
router.get('/', requireRole(['admin']), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString(),
  query('role').optional().isIn(['admin', 'manager', 'user']),
  query('isActive').optional().isBoolean(),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search as string;
  const role = req.query.role as string;
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

  let query = db('users').select('*');

  if (search) {
    query = query.where(function () {
      this.where('email', 'ilike', `%${search}%`)
        .orWhere('first_name', 'ilike', `%${search}%`)
        .orWhere('last_name', 'ilike', `%${search}%`);
    });
  }

  if (role) {
    query = query.where('role', role);
  }

  if (isActive !== undefined) {
    query = query.where('is_active', isActive);
  }

  const total = await query.clone().count('* as total').first();
  const users = await query
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset);

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page,
        limit,
        total: parseInt(total.total),
        totalPages: Math.ceil(total.total / limit),
      },
    },
  });
}));

// GET /api/users/:id - Get user by ID
router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Users can only view their own profile, admins can view all
  if (req.user!.role !== 'admin' && req.user!.id !== id) {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  }

  const user = await db('users').where({ id }).first();
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
    });
  }

  // Remove sensitive information
  const { password, two_factor_secret, backup_codes, password_reset_token, ...userWithoutSensitive } = user;

  res.json({
    success: true,
    data: userWithoutSensitive,
  });
}));

// PUT /api/users/:id - Update user (Admin or self)
router.put('/:id', [
  body('first_name').optional().trim().isLength({ min: 1 }),
  body('last_name').optional().trim().isLength({ min: 1 }),
  body('department').optional().trim(),
  body('position').optional().trim(),
  body('role').optional().isIn(['admin', 'manager', 'user']),
  body('is_active').optional().isBoolean(),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const { id } = req.params;
  const updates = req.body;

  // Check permissions
  if (req.user!.role !== 'admin' && req.user!.id !== id) {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  }

  // Non-admins cannot change role or active status
  if (req.user!.role !== 'admin') {
    delete updates.role;
    delete updates.is_active;
  }

  const user = await db('users').where({ id }).first();
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
    });
  }

  const [updatedUser] = await db('users')
    .where({ id })
    .update(updates)
    .returning('*');

  // Remove sensitive information
  const { password, two_factor_secret, backup_codes, password_reset_token, ...userWithoutSensitive } = updatedUser;

  res.json({
    success: true,
    data: userWithoutSensitive,
    message: 'User updated successfully',
  });
}));

// DELETE /api/users/:id - Delete user (Admin only)
router.delete('/:id', requireRole(['admin']), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const user = await db('users').where({ id }).first();
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
    });
  }

  // Prevent self-deletion
  if (req.user!.id === id) {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete your own account',
    });
  }

  await db('users').where({ id }).del();

  res.json({
    success: true,
    message: 'User deleted successfully',
  });
}));

// POST /api/users/:id/enable-2fa - Enable 2FA
router.post('/:id/enable-2fa', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Users can only enable 2FA for themselves
  if (req.user!.role !== 'admin' && req.user!.id !== id) {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  }

  const user = await db('users').where({ id }).first();
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
    });
  }

  if (user.two_factor_enabled) {
    return res.status(400).json({
      success: false,
      error: '2FA is already enabled',
    });
  }

  const { secret, qrCode, backupCodes } = await AuthService.generate2FASecret(id);

  res.json({
    success: true,
    data: {
      secret,
      qrCode,
      backupCodes,
    },
    message: '2FA setup initiated. Please verify with your authenticator app.',
  });
}));

// POST /api/users/:id/verify-2fa - Verify and enable 2FA
router.post('/:id/verify-2fa', [
  body('token').isLength({ min: 6, max: 6 }),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const { id } = req.params;
  const { token } = req.body;

  // Users can only enable 2FA for themselves
  if (req.user!.role !== 'admin' && req.user!.id !== id) {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  }

  const isValid = await AuthService.enable2FA(id, token);
  if (!isValid) {
    return res.status(400).json({
      success: false,
      error: 'Invalid 2FA token',
    });
  }

  const user = await db('users').where({ id }).first();
  await AuthService.send2FASetupEmail(user.email, JSON.parse(user.backup_codes!));

  res.json({
    success: true,
    message: '2FA enabled successfully',
  });
}));

// POST /api/users/:id/disable-2fa - Disable 2FA
router.post('/:id/disable-2fa', [
  body('password').isLength({ min: 6 }),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const { id } = req.params;
  const { password } = req.body;

  // Users can only disable 2FA for themselves
  if (req.user!.role !== 'admin' && req.user!.id !== id) {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  }

  const user = await db('users').where({ id }).first();
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
    });
  }

  if (!user.two_factor_enabled) {
    return res.status(400).json({
      success: false,
      error: '2FA is not enabled',
    });
  }

  // Verify password for security
  const isPasswordValid = await AuthService.comparePassword(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid password',
    });
  }

  await AuthService.disable2FA(id);

  res.json({
    success: true,
    message: '2FA disabled successfully',
  });
}));

// GET /api/users/:id/sessions - Get user sessions
router.get('/:id/sessions', requireRole(['admin']), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const sessions = await db('sessions')
    .where({ user_id: id })
    .orderBy('last_activity', 'desc')
    .select('*');

  res.json({
    success: true,
    data: sessions,
  });
}));

// DELETE /api/users/:id/sessions/:sessionId - Revoke session
router.delete('/:id/sessions/:sessionId', requireRole(['admin']), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sessionId } = req.params;

  await db('sessions')
    .where({ id: sessionId })
    .update({ is_active: false });

  res.json({
    success: true,
    message: 'Session revoked successfully',
  });
}));

export default router;
