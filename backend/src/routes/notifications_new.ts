import { Router, Response } from 'express';
import { body, validationResult, query } from 'express-validator';
import { NotificationService } from '@/services/notificationService';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthRequest } from '@/middleware/auth';

const router = Router();

// GET /api/notifications - Get user notifications
router.get('/', [
  query('unreadOnly').optional().isBoolean(),
  query('category').optional().isIn(['system', 'document', 'user', 'security']),
  query('type').optional().isIn(['info', 'success', 'warning', 'error']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  try {
    const filters = {
      unreadOnly: req.query.unreadOnly === 'true',
      category: req.query.category as string,
      type: req.query.type as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
    };

    const notifications = await NotificationService.getUserNotifications(req.user!.id, filters);

    res.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// PUT /api/notifications/:id/read - Mark notification as read
router.put('/:id/read', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    await NotificationService.markAsRead(id, req.user!.id);

    res.json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// PUT /api/notifications/read-all - Mark all notifications as read
router.put('/read-all', asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    await NotificationService.markAllAsRead(req.user!.id);

    res.json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    await NotificationService.deleteNotification(id, req.user!.id);

    res.json({
      success: true,
      message: 'Notification deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/notifications/settings - Get notification settings
router.get('/settings', asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const settings = await NotificationService.getNotificationSettings(req.user!.id);

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// PUT /api/notifications/settings - Update notification settings
router.put('/settings', [
  body('emailNotifications').optional().isBoolean(),
  body('pushNotifications').optional().isBoolean(),
  body('categories').optional().isObject(),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  try {
    const settings = {
      emailNotifications: req.body.emailNotifications,
      pushNotifications: req.body.pushNotifications,
      categories: req.body.categories,
    };

    await NotificationService.updateNotificationSettings(req.user!.id, settings);

    res.json({
      success: true,
      message: 'Notification settings updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// POST /api/notifications/test - Send test notification (Admin only)
router.post('/test', [
  body('userId').isUUID(),
  body('title').trim().isLength({ min: 1, max: 100 }),
  body('message').trim().isLength({ min: 1, max: 500 }),
  body('type').isIn(['info', 'success', 'warning', 'error']),
  body('category').isIn(['system', 'document', 'user', 'security']),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  // Only admins can send test notifications
  if (req.user!.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Admin privileges required.',
    });
  }

  try {
    const { userId, title, message, type, category } = req.body;

    await NotificationService.createNotification({
      userId,
      title,
      message,
      type,
      category,
    });

    res.json({
      success: true,
      message: 'Test notification sent successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

export default router;
