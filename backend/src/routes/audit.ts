import { Router, Response } from 'express';
import { body, validationResult, query } from 'express-validator';
import { AuditService } from '@/services/auditService';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthRequest } from '@/middleware/auth';

const router = Router();

// GET /api/audit - Get audit trails
router.get('/', [
  query('userId').optional().isUUID(),
  query('action').optional().isString(),
  query('resourceType').optional().isString(),
  query('resourceId').optional().isUUID(),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('status').optional().isIn(['success', 'failure']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const filters = {
    userId: req.query.userId as string,
    action: req.query.action as string,
    resourceType: req.query.resourceType as string,
    resourceId: req.query.resourceId as string,
    dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
    dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
    status: req.query.status as 'success' | 'failure',
    page: req.query.page as string,
    limit: req.query.limit as string,
  };

  const result = await AuditService.getAuditTrails(req.user!.id, filters);

  res.json({
    success: true,
    data: result,
  });
}));

// GET /api/audit/stats - Get audit statistics
router.get('/stats', [
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

  const stats = await AuditService.getAuditStatistics(dateFrom, dateTo);

  res.json({
    success: true,
    data: stats,
  });
}));

// GET /api/audit/user/:userId/activity - Get user activity summary
router.get('/user/:userId/activity', [
  query('days').optional().isInt({ min: 1, max: 365 }),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const { userId } = req.params;
  const days = parseInt(req.query.days as string) || 7;

  // Users can only view their own activity unless admin
  if (req.user!.role !== 'admin' && req.user!.id !== userId) {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  }

  const activity = await AuditService.getUserActivitySummary(userId, days);

  res.json({
    success: true,
    data: activity,
  });
}));

// GET /api/audit/security - Get security events
router.get('/security', [
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('eventTypes').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  // Only admins can view security events
  if (req.user!.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  }

  const filters = {
    dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
    dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
    eventTypes: req.query.eventTypes ? (req.query.eventTypes as string).split(',') : undefined,
    page: req.query.page as string,
    limit: req.query.limit as string,
  };

  const securityEvents = await AuditService.getSecurityEvents(filters);

  res.json({
    success: true,
    data: securityEvents,
  });
}));

// POST /api/audit/export - Export audit trails
router.post('/export', [
  body('dateFrom').optional().isISO8601(),
  body('dateTo').optional().isISO8601(),
  body('action').optional().isString(),
  body('resourceType').optional().isString(),
  body('userId').optional().isUUID(),
  body('format').optional().isIn(['csv', 'json']),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  // Only admins can export audit trails
  if (req.user!.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  }

  const filters = {
    dateFrom: req.body.dateFrom ? new Date(req.body.dateFrom) : undefined,
    dateTo: req.body.dateTo ? new Date(req.body.dateTo) : undefined,
    action: req.body.action,
    resourceType: req.body.resourceType,
    userId: req.body.userId,
    format: req.body.format || 'json',
  };

  try {
    const exportData = await AuditService.exportAuditTrails(filters);

    const filename = `audit-trails-${new Date().toISOString().split('T')[0]}.${filters.format}`;
    const contentType = filters.format === 'csv' ? 'text/csv' : 'application/json';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(exportData);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// POST /api/audit/cleanup - Clean up old audit logs
router.post('/cleanup', [
  body('daysToKeep').optional().isInt({ min: 7, max: 365 }),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  // Only admins can clean up audit logs
  if (req.user!.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  }

  const daysToKeep = req.body.daysToKeep || 90;

  try {
    const deletedCount = await AuditService.cleanupOldAuditLogs(daysToKeep);

    res.json({
      success: true,
      data: {
        deletedCount,
        message: `Successfully deleted ${deletedCount} old audit log entries`,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

export default router;
