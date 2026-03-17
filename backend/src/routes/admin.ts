import { Router, Response } from 'express';
import { body, validationResult, query } from 'express-validator';
import { AdminService } from '@/services/adminService';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthRequest } from '@/middleware/auth';

const router = Router();

// All admin routes require admin role
router.use((req: AuthRequest, res: Response, next) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Admin privileges required.',
    });
  }
  next();
});

// GET /api/admin/overview - Get system overview
router.get('/overview', asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const overview = await AdminService.getSystemOverview();

    res.json({
      success: true,
      data: overview,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/admin/users - Get user management data
router.get('/users', [
  query('role').optional().isIn(['admin', 'manager', 'user']),
  query('status').optional().isIn(['active', 'inactive']),
  query('department').optional().isString(),
  query('search').optional().isString(),
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

  try {
    const filters = {
      role: req.query.role as string,
      status: req.query.status as 'active' | 'inactive',
      department: req.query.department as string,
      search: req.query.search as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
    };

    const userData = await AdminService.getUserManagementData(filters);

    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/admin/documents - Get document management data
router.get('/documents', [
  query('folderId').optional().isUUID(),
  query('documentType').optional().isString(),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('search').optional().isString(),
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

  try {
    const filters = {
      folderId: req.query.folderId as string,
      documentType: req.query.documentType as string,
      dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
      dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
      search: req.query.search as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
    };

    const documentData = await AdminService.getDocumentManagementData(filters);

    res.json({
      success: true,
      data: documentData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/admin/activity - Get system activity logs
router.get('/activity', [
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('eventType').optional().isString(),
  query('userId').optional().isUUID(),
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

  try {
    const filters = {
      dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
      dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
      eventType: req.query.eventType as string,
      userId: req.query.userId as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
    };

    const activityData = await AdminService.getSystemActivity(filters);

    res.json({
      success: true,
      data: activityData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/admin/security - Get security report
router.get('/security', asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const securityData = await AdminService.getSecurityReport();

    res.json({
      success: true,
      data: securityData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// POST /api/admin/reports/generate - Generate system reports
router.post('/reports/generate', [
  body('reportType').isIn(['users', 'documents', 'audit', 'security']),
  body('format').optional().isIn(['csv', 'json', 'pdf']),
  body('filters').optional().isObject(),
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
    const { reportType, format, filters } = req.body;
    
    const report = await AdminService.generateReport(reportType, filters);

    // Set response headers based on format
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}.csv"`);
    } else if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}.json"`);
    } else if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}.pdf"`);
    }

    res.send(report.data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// POST /api/admin/maintenance - Perform system maintenance
router.post('/maintenance', [
  body('task').isIn(['cleanup', 'backup', 'index', 'optimize']),
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
    const { task } = req.body;
    const result = await AdminService.performMaintenance(task);

    res.json({
      success: result.success,
      message: result.message,
      data: result.details,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/admin/configuration - Get system configuration
router.get('/configuration', asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const config = await AdminService.getSystemConfiguration();

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// PUT /api/admin/configuration - Update system configuration
router.put('/configuration', [
  body('general').optional().isObject(),
  body('security').optional().isObject(),
  body('email').optional().isObject(),
  body('storage').optional().isObject(),
  body('backup').optional().isObject(),
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
    const config = req.body;
    const result = await AdminService.updateSystemConfiguration(config);

    res.json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/admin/metrics - Get system metrics
router.get('/metrics', [
  query('period').optional().isIn(['1h', '24h', '7d', '30d']),
  query('metric').optional().isIn(['cpu', 'memory', 'disk', 'network', 'requests']),
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
    const period = req.query.period as string || '24h';
    const metric = req.query.metric as string;

    // This would typically connect to monitoring systems
    // For now, return mock data
    const metrics = {
      cpu: {
        current: 45.2,
        average: 38.7,
        peak: 78.9,
      },
      memory: {
        used: 6.2, // GB
        total: 16, // GB
        percentage: 38.75,
      },
      disk: {
        used: 125.6, // GB
        total: 500, // GB
        percentage: 25.12,
      },
      network: {
        requests: 15420,
        bandwidth: 2.3, // GB
        errors: 12,
      },
      requests: {
        total: 15420,
        successful: 15408,
        errors: 12,
        averageResponseTime: 245, // ms
      },
    };

    const data = metric ? metrics[metric] : metrics;

    res.json({
      success: true,
      data: {
        period,
        timestamp: new Date(),
        metrics: data,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/admin/health - System health check
router.get('/health', asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date(),
      services: {
        database: 'healthy',
        redis: 'healthy',
        storage: 'healthy',
        email: 'healthy',
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0',
      },
      checks: {
        database: await checkDatabaseHealth(),
        redis: await checkRedisHealth(),
        storage: await checkStorageHealth(),
      },
    };

    const isHealthy = Object.values(health.services).every(service => service === 'healthy');
    health.status = isHealthy ? 'healthy' : 'degraded';

    res.status(isHealthy ? 200 : 503).json({
      success: true,
      data: health,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// Helper functions for health checks
async function checkDatabaseHealth(): Promise<string> {
  try {
    await db.raw('SELECT 1');
    return 'healthy';
  } catch (error) {
    return 'unhealthy';
  }
}

async function checkRedisHealth(): Promise<string> {
  try {
    // This would check Redis connection
    // For now, return mock status
    return 'healthy';
  } catch (error) {
    return 'unhealthy';
  }
}

async function checkStorageHealth(): Promise<string> {
  try {
    // This would check storage availability and permissions
    // For now, return mock status
    return 'healthy';
  } catch (error) {
    return 'unhealthy';
  }
}

export default router;
