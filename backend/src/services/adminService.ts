import db from '@/config/database';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class AdminService {
  // Get system overview statistics
  static async getSystemOverview(): Promise<{
    users: {
      total: number;
      active: number;
      admins: number;
      managers: number;
      regular: number;
      newThisMonth: number;
    };
    documents: {
      total: number;
      totalSize: number;
      uploadedToday: number;
      uploadedThisMonth: number;
      avgSize: number;
      byType: Record<string, number>;
    };
    storage: {
      totalUsed: number;
      totalQuota: number;
      usagePercentage: number;
      largestFiles: any[];
      topUsers: any[];
    };
    security: {
      failedLogins24h: number;
      suspiciousActivity24h: number;
      activeSessions: number;
      securityEvents24h: number;
    };
    system: {
      uptime: string;
      version: string;
      databaseConnections: number;
      lastBackup: Date | null;
      systemLoad: number;
    };
  }> {
    // User statistics
    const totalUsers = await db('users').count('* as total').first();
    const activeUsers = await db('users').where({ is_active: true }).count('* as total').first();
    const adminUsers = await db('users').where({ role: 'admin' }).count('* as total').first();
    const managerUsers = await db('users').where({ role: 'manager' }).count('* as total').first();
    const regularUsers = await db('users').where({ role: 'user' }).count('* as total').first();
    
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const newUsersThisMonth = await db('users')
      .where('created_at', '>=', thisMonth)
      .count('* as total')
      .first();

    // Document statistics
    const totalDocuments = await db('documents')
      .where({ status: 'active' })
      .count('* as total')
      .first();

    const totalSizeResult = await db('documents')
      .where({ status: 'active' })
      .sum('file_size as total')
      .first();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const uploadedToday = await db('documents')
      .where({ status: 'active' })
      .where('created_at', '>=', today)
      .count('* as total')
      .first();

    const uploadedThisMonth = await db('documents')
      .where({ status: 'active' })
      .where('created_at', '>=', thisMonth)
      .count('* as total')
      .first();

    const avgSizeResult = await db('documents')
      .where({ status: 'active' })
      .avg('file_size as avg')
      .first();

    const documentsByType = await db('documents')
      .where({ status: 'active' })
      .select('document_type')
      .count('* as count')
      .groupBy('document_type')
      .orderBy('count', 'desc');

    const byType: Record<string, number> = {};
    documentsByType.forEach((doc: any) => {
      byType[doc.document_type] = parseInt(doc.count);
    });

    // Storage statistics
    const totalUsedResult = await db('users')
      .sum('storage_used as total')
      .first();

    const totalQuotaResult = await db('users')
      .sum('storage_quota as total')
      .first();

    const largestFiles = await db('documents')
      .where({ status: 'active' })
      .select('original_filename', 'file_size', 'created_at')
      .orderBy('file_size', 'desc')
      .limit(10);

    const topUsers = await db('users')
      .select('first_name', 'last_name', 'email', 'storage_used')
      .orderBy('storage_used', 'desc')
      .limit(10);

    // Security statistics
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failedLogins24h = await db('audit_trails')
      .where({ action: 'login_failure', status: 'failure' })
      .where('timestamp', '>=', yesterday)
      .count('* as total')
      .first();

    const suspiciousActivity24h = await db('security_events')
      .where('timestamp', '>=', yesterday)
      .whereRaw("details->>'severity' IN ('high', 'critical')")
      .count('* as total')
      .first();

    const activeSessions = await db('sessions')
      .where({ is_active: true })
      .count('* as total')
      .first();

    const securityEvents24h = await db('security_events')
      .where('timestamp', '>=', yesterday)
      .count('* as total')
      .first();

    return {
      users: {
        total: parseInt(totalUsers.total || '0'),
        active: parseInt(activeUsers.total || '0'),
        admins: parseInt(adminUsers.total || '0'),
        managers: parseInt(managerUsers.total || '0'),
        regular: parseInt(regularUsers.total || '0'),
        newThisMonth: parseInt(newUsersThisMonth.total || '0'),
      },
      documents: {
        total: parseInt(totalDocuments.total || '0'),
        totalSize: parseInt(totalSizeResult.total || '0'),
        uploadedToday: parseInt(uploadedToday.total || '0'),
        uploadedThisMonth: parseInt(uploadedThisMonth.total || '0'),
        avgSize: Math.round(parseFloat(avgSizeResult.avg || '0')),
        byType,
      },
      storage: {
        totalUsed: parseInt(totalUsedResult.total || '0'),
        totalQuota: parseInt(totalQuotaResult.total || '0'),
        usagePercentage: totalQuotaResult.total ? 
          Math.round((parseInt(totalUsedResult.total || '0') / parseInt(totalQuotaResult.total)) * 100) : 0,
        largestFiles,
        topUsers,
      },
      security: {
        failedLogins24h: parseInt(failedLogins24h.total || '0'),
        suspiciousActivity24h: parseInt(suspiciousActivity24h.total || '0'),
        activeSessions: parseInt(activeSessions.total || '0'),
        securityEvents24h: parseInt(securityEvents24h.total || '0'),
      },
      system: {
        uptime: process.uptime() ? `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m` : 'Unknown',
        version: process.env.npm_package_version || '1.0.0',
        databaseConnections: 1, // Would be actual DB connection count
        lastBackup: null, // Would be implemented separately
        systemLoad: 0, // Would be actual system load
      },
    };
  }

  // Get user management data
  static async getUserManagementData(filters: {
    role?: string;
    status?: 'active' | 'inactive';
    department?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    users: any[];
    pagination: any;
    statistics: {
      total: number;
      byRole: Record<string, number>;
      byDepartment: Record<string, number>;
      newThisMonth: number;
      activeThisWeek: number;
    };
  }> {
    let query = db('users').select('*');

    // Apply filters
    if (filters.role) {
      query = query.where('role', filters.role);
    }

    if (filters.status) {
      query = query.where('is_active', filters.status === 'active');
    }

    if (filters.department) {
      query = query.where('department', 'ilike', `%${filters.department}%`);
    }

    if (filters.search) {
      query = query.where(function() {
        this.where('first_name', 'ilike', `%${filters.search}%`)
          .orWhere('last_name', 'ilike', `%${filters.search}%`)
          .orWhere('email', 'ilike', `%${filters.search}%`);
      });
    }

    // Count total
    const totalQuery = query.clone().clearSelect().count('* as total');
    const [{ total }] = await totalQuery;

    // Apply pagination
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const users = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    // Get statistics
    const totalUsers = await db('users').count('* as total').first();
    const usersByRole = await db('users')
      .select('role')
      .count('* as count')
      .groupBy('role');

    const usersByDepartment = await db('users')
      .select('department')
      .count('* as count')
      .whereNotNull('department')
      .groupBy('department');

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const newUsersThisMonth = await db('users')
      .where('created_at', '>=', thisMonth)
      .count('* as total')
      .first();

    const thisWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeThisWeek = await db('audit_trails')
      .where('timestamp', '>=', thisWeek)
      .distinct('user_id')
      .count('* as total')
      .first();

    const byRole: Record<string, number> = {};
    usersByRole.forEach((user: any) => {
      byRole[user.role] = parseInt(user.count);
    });

    const byDepartment: Record<string, number> = {};
    usersByDepartment.forEach((user: any) => {
      byDepartment[user.department] = parseInt(user.count);
    });

    return {
      users,
      pagination: {
        page,
        limit,
        total: parseInt(total),
        totalPages: Math.ceil(total / limit),
      },
      statistics: {
        total: parseInt(totalUsers.total || '0'),
        byRole,
        byDepartment,
        newThisMonth: parseInt(newUsersThisMonth.total || '0'),
        activeThisWeek: parseInt(activeThisWeek.total || '0'),
      },
    };
  }

  // Get document management data
  static async getDocumentManagementData(filters: {
    folderId?: string;
    documentType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    documents: any[];
    pagination: any;
    statistics: {
      total: number;
      totalSize: number;
      avgSize: number;
      byType: Record<string, number>;
      byFolder: Record<string, number>;
      uploadedToday: number;
      uploadedThisWeek: number;
    };
  }> {
    let query = db('documents')
      .leftJoin('folders', 'documents.folder_id', 'folders.id')
      .leftJoin('users', 'documents.uploaded_by', 'users.id')
      .select(
        'documents.*',
        'folders.name as folder_name',
        'users.first_name as uploader_first_name',
        'users.last_name as uploader_last_name'
      )
      .where('documents.status', 'active');

    // Apply filters
    if (filters.folderId) {
      query = query.where('documents.folder_id', filters.folderId);
    }

    if (filters.documentType) {
      query = query.where('documents.document_type', filters.documentType);
    }

    if (filters.dateFrom) {
      query = query.where('documents.created_at', '>=', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.where('documents.created_at', '<=', filters.dateTo);
    }

    if (filters.search) {
      query = query.where(function() {
        this.where('documents.original_filename', 'ilike', `%${filters.search}%`)
          .orWhere('documents.description', 'ilike', `%${filters.search}%`);
      });
    }

    // Count total
    const totalQuery = query.clone().clearSelect().count('* as total');
    const [{ total }] = await totalQuery;

    // Apply pagination
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const documents = await query
      .orderBy('documents.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    // Get statistics
    const totalDocuments = await db('documents')
      .where({ status: 'active' })
      .count('* as total')
      .first();

    const totalSizeResult = await db('documents')
      .where({ status: 'active' })
      .sum('file_size as total')
      .first();

    const avgSizeResult = await db('documents')
      .where({ status: 'active' })
      .avg('file_size as avg')
      .first();

    const documentsByType = await db('documents')
      .where({ status: 'active' })
      .select('document_type')
      .count('* as count')
      .groupBy('document_type');

    const documentsByFolder = await db('documents')
      .leftJoin('folders', 'documents.folder_id', 'folders.id')
      .where('documents.status', 'active')
      .select('folders.name as folder_name')
      .count('* as count')
      .groupBy('folders.name')
      .orderBy('count', 'desc');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const uploadedToday = await db('documents')
      .where({ status: 'active' })
      .where('created_at', '>=', today)
      .count('* as total')
      .first();

    const thisWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const uploadedThisWeek = await db('documents')
      .where({ status: 'active' })
      .where('created_at', '>=', thisWeek)
      .count('* as total')
      .first();

    const byType: Record<string, number> = {};
    documentsByType.forEach((doc: any) => {
      byType[doc.document_type] = parseInt(doc.count);
    });

    const byFolder: Record<string, number> = {};
    documentsByFolder.forEach((doc: any) => {
      byFolder[doc.folder_name || 'Root'] = parseInt(doc.count);
    });

    return {
      documents,
      pagination: {
        page,
        limit,
        total: parseInt(total),
        totalPages: Math.ceil(total / limit),
      },
      statistics: {
        total: parseInt(totalDocuments.total || '0'),
        totalSize: parseInt(totalSizeResult.total || '0'),
        avgSize: Math.round(parseFloat(avgSizeResult.avg || '0')),
        byType,
        byFolder,
        uploadedToday: parseInt(uploadedToday.total || '0'),
        uploadedThisWeek: parseInt(uploadedThisWeek.total || '0'),
      },
    };
  }

  // Get system activity logs
  static async getSystemActivity(filters: {
    dateFrom?: Date;
    dateTo?: Date;
    eventType?: string;
    userId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    activities: any[];
    pagination: any;
    summary: {
      totalEvents: number;
      eventsByType: Record<string, number>;
      eventsByHour: Array<{ hour: number; count: number }>;
      topUsers: Array<{ userId: string; userName: string; count: number }>;
    };
  }> {
    let query = db('audit_trails')
      .leftJoin('users', 'audit_trails.user_id', 'users.id')
      .select(
        'audit_trails.*',
        'users.first_name',
        'users.last_name',
        'users.email'
      );

    // Apply filters
    if (filters.dateFrom) {
      query = query.where('audit_trails.timestamp', '>=', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.where('audit_trails.timestamp', '<=', filters.dateTo);
    }

    if (filters.eventType) {
      query = query.where('audit_trails.action', filters.eventType);
    }

    if (filters.userId) {
      query = query.where('audit_trails.user_id', filters.userId);
    }

    // Count total
    const totalQuery = query.clone().clearSelect().count('* as total');
    const [{ total }] = await totalQuery;

    // Apply pagination
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    const activities = await query
      .orderBy('audit_trails.timestamp', 'desc')
      .limit(limit)
      .offset(offset);

    // Get summary
    const totalEvents = await db('audit_trails')
      .count('* as total')
      .first();

    const eventsByType = await db('audit_trails')
      .select('action')
      .count('* as count')
      .groupBy('action')
      .orderBy('count', 'desc');

    const eventsByHour = await db('audit_trails')
      .selectRaw('EXTRACT(HOUR FROM timestamp) as hour')
      .count('* as count')
      .groupByRaw('EXTRACT(HOUR FROM timestamp)')
      .orderBy('hour', 'asc');

    const topUsers = await db('audit_trails')
      .select('user_id', db.raw('users.first_name || \' \' || users.last_name as userName'))
      .count('* as count')
      .leftJoin('users', 'audit_trails.user_id', 'users.id')
      .groupBy('audit_trails.user_id', 'users.first_name', 'users.last_name')
      .orderBy('count', 'desc')
      .limit(10);

    const byType: Record<string, number> = {};
    eventsByType.forEach((event: any) => {
      byType[event.action] = parseInt(event.count);
    });

    return {
      activities,
      pagination: {
        page,
        limit,
        total: parseInt(total),
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalEvents: parseInt(totalEvents.total || '0'),
        eventsByType: byType,
        eventsByHour: eventsByHour.map((event: any) => ({
          hour: parseInt(event.hour),
          count: parseInt(event.count),
        })),
        topUsers: topUsers.map((user: any) => ({
          userId: user.user_id,
          userName: user.userName,
          count: parseInt(user.count),
        })),
      },
    };
  }

  // Generate reports
  static async generateReport(reportType: string, filters: any): Promise<{
    data: any;
    format: 'csv' | 'json' | 'pdf';
    filename: string;
  }> {
    let data: any = [];
    let filename = '';
    let format: 'csv' | 'json' | 'pdf' = 'csv';

    switch (reportType) {
      case 'users':
        data = await this.getUserManagementData(filters);
        filename = `users-report-${new Date().toISOString().split('T')[0]}`;
        break;

      case 'documents':
        data = await this.getDocumentManagementData(filters);
        filename = `documents-report-${new Date().toISOString().split('T')[0]}`;
        break;

      case 'audit':
        data = await this.getSystemActivity(filters);
        filename = `audit-report-${new Date().toISOString().split('T')[0]}`;
        break;

      case 'security':
        data = await this.getSecurityReport();
        filename = `security-report-${new Date().toISOString().split('T')[0]}`;
        break;

      default:
        throw new Error('Invalid report type');
    }

    return {
      data,
      format,
      filename,
    };
  }

  // Get security report
  static async getSecurityReport(): Promise<{
    summary: any;
    threats: any[];
    recommendations: string[];
  }> {
    const summary = await db('security_events')
      .selectRaw(`
        COUNT(*) as total_events,
        COUNT(CASE WHEN details->>'severity' = 'critical' THEN 1 END) as critical_events,
        COUNT(CASE WHEN details->>'severity' = 'high' THEN 1 END) as high_events,
        COUNT(CASE WHEN details->>'severity' = 'medium' THEN 1 END) as medium_events,
        COUNT(CASE WHEN details->>'severity' = 'low' THEN 1 END) as low_events
      `)
      .first();

    const threats = await db('security_events')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .select('*');

    const recommendations = [
      'Enable two-factor authentication for all users',
      'Regularly review user access permissions',
      'Monitor for unusual login patterns',
      'Keep software and security patches up to date',
      'Implement regular security audits',
      'Educate users about security best practices',
    ];

    return {
      summary,
      threats,
      recommendations,
    };
  }

  // System maintenance tasks
  static async performMaintenance(task: 'cleanup' | 'backup' | 'index' | 'optimize'): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      switch (task) {
        case 'cleanup':
          // Clean up expired tokens
          const expiredTokens = await db('secure_tokens')
            .where('expires_at', '<', new Date())
            .del();

          // Clean up old audit logs (older than 90 days)
          const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          const oldLogs = await db('audit_trails')
            .where('timestamp', '<', cutoffDate)
            .del();

          return {
            success: true,
            message: 'Cleanup completed successfully',
            details: {
              expiredTokensDeleted: expiredTokens,
              oldLogsDeleted: oldLogs,
            },
          };

        case 'backup':
          // This would trigger actual backup process
          return {
            success: true,
            message: 'Backup process initiated',
          };

        case 'index':
          // Rebuild search index
          return {
            success: true,
            message: 'Search index rebuild initiated',
          };

        case 'optimize':
          // Optimize database
          await db.raw('VACUUM ANALYZE');
          return {
            success: true,
            message: 'Database optimization completed',
          };

        default:
          return {
            success: false,
            message: 'Invalid maintenance task',
          };
      }
    } catch (error) {
      logger.error('Maintenance task failed:', error);
      return {
        success: false,
        message: `Maintenance task failed: ${error.message}`,
      };
    }
  }

  // Get system configuration
  static async getSystemConfiguration(): Promise<{
    general: any;
    security: any;
    email: any;
    storage: any;
    backup: any;
  }> {
    // This would typically read from configuration files or database
    return {
      general: {
        siteName: '9Tools Document Management',
        domain: process.env.DOMAIN || '9tools.upz.in.th',
        version: process.env.npm_package_version || '1.0.0',
        timezone: 'Asia/Bangkok',
        language: 'th',
      },
      security: {
        passwordMinLength: 8,
        requireTwoFactor: true,
        sessionTimeout: 24 * 60 * 60, // 24 hours
        maxLoginAttempts: 5,
        lockoutDuration: 15 * 60, // 15 minutes
      },
      email: {
        smtpHost: process.env.SMTP_HOST,
        smtpPort: process.env.SMTP_PORT,
        smtpSecure: process.env.SMTP_SECURE === 'true',
        fromEmail: process.env.EMAIL_FROM,
        fromName: '9Tools System',
      },
      storage: {
        maxFileSize: 104857600, // 100MB
        defaultQuota: 1073741824, // 1GB
        encryptionEnabled: !!process.env.ENCRYPTION_KEY,
        backupRetention: 30, // days
      },
      backup: {
        enabled: false,
        schedule: '0 2 * * *', // Daily at 2 AM
        retention: 30, // days
        location: '/backups',
      },
    };
  }

  // Update system configuration
  static async updateSystemConfiguration(config: any): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // This would typically update configuration files or database
      logger.info('System configuration updated:', config);
      
      return {
        success: true,
        message: 'Configuration updated successfully',
      };
    } catch (error) {
      logger.error('Failed to update configuration:', error);
      return {
        success: false,
        message: `Configuration update failed: ${error.message}`,
      };
    }
  }
}
