import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import { AuthService } from '@/services/authService';
import { GoogleAuthService } from '@/services/googleAuthService';
import { asyncHandler } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import db from '@/config/database';

const router = Router();

// Validation rules
const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
];

const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('first_name').trim().isLength({ min: 1 }),
  body('last_name').trim().isLength({ min: 1 }),
];

const forgotPasswordValidation = [
  body('email').isEmail().normalizeEmail(),
];

const resetPasswordValidation = [
  body('token').isUUID(),
  body('newPassword').isLength({ min: 6 }),
];

// POST /api/auth/login
router.post('/login', loginValidation, asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const { email, password, rememberMe } = req.body;

  // Check if account is locked
  if (await AuthService.isAccountLocked(email)) {
    return res.status(423).json({
      success: false,
      error: 'Account is temporarily locked due to too many failed login attempts',
    });
  }

  const user = await AuthService.findUserByEmail(email);
  if (!user || !user.password) {
    await AuthService.incrementFailedLoginAttempts(email);
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password',
    });
  }

  const isPasswordValid = await AuthService.comparePassword(password, user.password);
  if (!isPasswordValid) {
    await AuthService.incrementFailedLoginAttempts(email);
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password',
    });
  }

  if (!user.is_active) {
    return res.status(401).json({
      success: false,
      error: 'Account is deactivated',
    });
  }

  // Reset failed login attempts
  await AuthService.resetFailedLoginAttempts(email);

  // Create session
  const session = await AuthService.createSession(user.id, {
    deviceType: req.get('User-Agent')?.includes('Mobile') ? 'mobile' : 'desktop',
    browser: req.get('User-Agent')?.split(' ')[0] || 'unknown',
    browserVersion: 'unknown',
    os: req.get('User-Agent') || 'unknown',
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
    rememberMe,
  });

  // Generate tokens
  const { accessToken, refreshToken } = AuthService.generateTokens(user.id, session.id);

  // Update session with refresh token
  await db('sessions')
    .where({ id: session.id })
    .update({ refresh_token: refreshToken });

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        is_active: user.is_active,
        email_verified: user.email_verified,
        two_factor_enabled: user.two_factor_enabled,
      },
      token: accessToken,
      refreshToken,
      expiresIn: 3600,
      requires2FA: user.two_factor_enabled,
    },
  });
}));

// POST /api/auth/verify-2fa
router.post('/verify-2fa', [
  body('token').isLength({ min: 6, max: 6 }),
  body('userId').isUUID(),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const { token, userId } = req.body;

  const isValid = await AuthService.verify2FAToken(userId, token);
  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid 2FA token',
    });
  }

  res.json({
    success: true,
    message: '2FA token verified successfully',
  });
}));

// POST /api/auth/register
router.post('/register', registerValidation, asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const { email, password, first_name, last_name, department, position } = req.body;

  // Check if user already exists
  const existingUser = await AuthService.findUserByEmail(email);
  if (existingUser) {
    return res.status(409).json({
      success: false,
      error: 'User with this email already exists',
    });
  }

  // Create user
  const user = await AuthService.createUser({
    email,
    password,
    first_name,
    last_name,
    department,
    position,
  });

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        is_active: user.is_active,
        email_verified: user.email_verified,
      },
    },
    message: 'User registered successfully',
  });
}));

// GET /api/auth/google
router.get('/google', (req: Request, res: Response) => {
  const authUrl = GoogleAuthService.getAuthUrl();
  res.redirect(authUrl);
});

// GET /api/auth/google/callback
router.get('/google/callback', asyncHandler(async (req: Request, res: Response) => {
  const { code, error } = req.query;

  if (error) {
    logger.error('Google OAuth error:', error);
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_auth_failed`);
  }

  if (!code) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_code`);
  }

  try {
    const deviceInfo = {
      deviceType: req.get('User-Agent')?.includes('Mobile') ? 'mobile' : 'desktop',
      browser: req.get('User-Agent')?.split(' ')[0] || 'unknown',
      browserVersion: 'unknown',
      os: req.get('User-Agent') || 'unknown',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      rememberMe: false,
    };

    const authResult = await GoogleAuthService.authenticateWithGoogle(code as string, deviceInfo);

    // Redirect to frontend with tokens
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${authResult.token}&refresh=${authResult.refreshToken}`;
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error('Google authentication failed:', error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=authentication_failed`);
  }
}));

// POST /api/auth/refresh
router.post('/refresh', [
  body('refreshToken').isUUID(),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const { refreshToken } = req.body;

  // Find session with refresh token
  const session = await db('sessions')
    .where({ refresh_token: refreshToken, is_active: true })
    .first();

  if (!session || new Date(session.expires_at) < new Date()) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired refresh token',
    });
  }

  // Get user
  const user = await db('users')
    .where({ id: session.user_id, is_active: true })
    .first();

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'User not found or inactive',
    });
  }

  // Generate new tokens
  const { accessToken, refreshToken: newRefreshToken } = AuthService.generateTokens(
    user.id,
    session.id
  );

  // Update session
  await db('sessions')
    .where({ id: session.id })
    .update({
      refresh_token: newRefreshToken,
      last_activity: new Date(),
    });

  res.json({
    success: true,
    data: {
      token: accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 3600,
    },
  });
}));

// POST /api/auth/logout
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { sessionId: string };
      await AuthService.invalidateSession(decoded.sessionId);
    } catch (error) {
      // Token is invalid, but we still want to logout
    }
  }

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
}));

// POST /api/auth/forgot-password
router.post('/forgot-password', forgotPasswordValidation, asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const { email } = req.body;

  const resetToken = await AuthService.generatePasswordResetToken(email);
  if (!resetToken) {
    // Don't reveal if email exists or not
    return res.json({
      success: true,
      message: 'If an account with this email exists, a password reset link has been sent',
    });
  }

  await AuthService.sendPasswordResetEmail(email, resetToken);

  res.json({
    success: true,
    message: 'If an account with this email exists, a password reset link has been sent',
  });
}));

// POST /api/auth/reset-password
router.post('/reset-password', resetPasswordValidation, asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const { token, newPassword } = req.body;

  const success = await AuthService.resetPassword(token, newPassword);
  if (!success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or expired reset token',
    });
  }

  res.json({
    success: true,
    message: 'Password reset successfully',
  });
}));

export default router;
