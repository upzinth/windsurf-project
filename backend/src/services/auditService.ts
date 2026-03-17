import db from '@/config/database';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { AuditTrail, AuthRequest } from '@/types';

export class AuditService {
  static async logAction(
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    ipAddress: string,
    userAgent?: string,
    details?: Record<string, any>,
    status: 'success' | 'failure' = 'success'
  ): Promise<AuditTrail> {
    const [auditTrail] = await db('audit_trails')
      .insert({
        id: uuidv4(),
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        ip_address: ipAddress,
        user_agent: userAgent || null,
        details: details ? JSON.stringify(details) : null,
        status,
        timestamp: new Date(),
      })
      .returning('*');

    return auditTrail;
  }

  static async getAuditTrails(
    userId?: string,
    filters: {
      action?: string;
      resourceType?: string;
      resourceId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      status?: 'success' | 'failure';
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ trails: AuditTrail[]; pagination: any }> {
    let query = db('audit_trails')
      .select('*')
      .leftJoin('users', 'audit_trails.user_id', 'users.id')
      .select(
        'audit_trails.*',
        'users.first_name',
        'users.last_name',
        'users.email'
      );

    // Apply filters
    if (userId) {
      query = query.where('audit_trails.user_id', userId);
    }

    if (filters.action) {
      query = query.where('audit_trails.action', filters.action);
    }

    if (filters.resourceType) {
      query = query.where('audit_trails.resource_type', filters.resourceType);
    }

    if (filters.resourceId) {
      query = query.where('audit_trails.resource_id', filters.resourceId);
    }

    if (filters.status) {
      query = query.where('audit_trails.status', filters.status);
    }

    if (filters.dateFrom) {
      query = query.where('audit_trails.timestamp', '>=', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.where('audit_trails.timestamp', '<=', filters.dateTo);
    }

    // Count total
    const totalQuery = query.clone().clearSelect().count('* as total');
    const [{ total }] = await totalQuery;

    // Apply pagination
    const page = parseInt(filters.page?.toString()) || 1;
    const limit = parseInt(filters.limit?.toString()) || 20;
    const offset = (page - 1) * limit;

    const trails = await query
      .orderBy('audit_trails.timestamp', 'desc')
      .limit(limit)
      .offset(offset);

    return {
      trails,
      pagination: {
        page,
        limit,
        total: parseInt(total),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getAuditStatistics(
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<{
    totalActions: number;
    actionsByType: Record<string, number>;
    actionsByDate: Array<{ date: string; count: number }>;
    actionsByUser: Array<{
      userId: string;
      userName: string;
      actionCount: number;
    }>;
    actionsByResource: Record<string, number>;
    successRate: number;
    topActions: Array<{ action: string; count: number }>;
  }> {
    let query = db('audit_trails');

    if (dateFrom) {
      query = query.where('timestamp', '>=', dateFrom);
    }

    if (dateTo) {
      query = query.where('timestamp', '<=', dateTo);
    }

    // Total actions
    const [{ totalActions }] = await query.clone().count('* as total');

    // Actions by type
    const actionsByTypeResult = await query.clone()
      .select('action')
      .count('* as count')
      .groupBy('action');

    const actionsByType: Record<string, number> = {};
    actionsByTypeResult.forEach((row: any) => {
      actionsByType[row.action] = parseInt(row.count);
    });

    // Actions by date (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const actionsByDateResult = await db('audit_trails')
      .where('timestamp', '>=', dateFrom || thirtyDaysAgo)
      .where('timestamp', '<=', dateTo || new Date())
      .select(db.raw('DATE(timestamp) as date'))
      .count('* as count')
      .groupBy(db.raw('DATE(timestamp)'))
      .orderBy('date', 'desc');

    const actionsByDate = actionsByDateResult.map((row: any) => ({
      date: row.date,
      count: parseInt(row.count),
    }));

    // Actions by user
    const actionsByUserResult = await query.clone()
      .leftJoin('users', 'audit_trails.user_id', 'users.id')
      .select(
        'audit_trails.user_id as userId',
        db.raw('users.first_name || \' \' || users.last_name as userName'),
        db.raw('COUNT(*) as actionCount')
      )
      .groupBy('audit_trails.user_id', 'users.first_name', 'users.last_name')
      .orderBy('actionCount', 'desc')
      .limit(10);

    const actionsByUser = actionsByUserResult.map((row: any) => ({
      userId: row.userId,
      userName: row.userName,
      actionCount: parseInt(row.actionCount),
    }));

    // Actions by resource type
    const actionsByResourceResult = await query.clone()
      .select('resource_type')
      .count('* as count')
      .groupBy('resource_type');

    const actionsByResource: Record<string, number> = {};
    actionsByResourceResult.forEach((row: any) => {
      actionsByResource[row.resource_type] = parseInt(row.count);
    });

    // Success rate
    const successCountResult = await query.clone()
      .where('status', 'success')
      .count('* as count')
      .first();

    const successCount = parseInt(successCountResult?.count || '0');
    const successRate = totalActions > 0 ? (successCount / totalActions) * 100 : 0;

    // Top actions
    const topActionsResult = await query.clone()
      .select('action')
      .count('* as count')
      .groupBy('action')
      .orderBy('count', 'desc')
      .limit(10);

    const topActions = topActionsResult.map((row: any) => ({
      action: row.action,
      count: parseInt(row.count),
    }));

    return {
      totalActions,
      actionsByType,
      actionsByDate,
      actionsByUser,
      actionsByResource,
      successRate,
      topActions,
    };
  }

  static async getUserActivitySummary(
    userId: string,
    days: number = 7
  ): Promise<{
    totalActions: number;
    actionsByType: Record<string, number>;
    recentActivity: AuditTrail[];
    topResources: Array<{ resourceType: string; resourceId: string; count: number }>;
  }> {
    const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let query = db('audit_trails')
      .where('user_id', userId)
      .where('timestamp', '>=', daysAgo);

    // Total actions
    const [{ totalActions }] = await query.clone().count('* as total');

    // Actions by type
    const actionsByTypeResult = await query.clone()
      .select('action')
      .count('* as count')
      .groupBy('action');

    const actionsByType: Record<string, number> = {};
    actionsByTypeResult.forEach((row: any) => {
      actionsByType[row.action] = parseInt(row.count);
    });

    // Recent activity (last 20 actions)
    const recentActivity = await query
      .orderBy('timestamp', 'desc')
      .limit(20);

    // Top resources accessed
    const topResourcesResult = await query.clone()
      .select('resource_type', 'resource_id')
      .count('* as count')
      .groupBy('resource_type', 'resource_id')
      .orderBy('count', 'desc')
      .limit(10);

    const topResources = topResourcesResult.map((row: any) => ({
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      count: parseInt(row.count),
    }));

    return {
      totalActions,
      actionsByType,
      recentActivity,
      topResources,
    };
  }

  static async logLoginAttempt(
    userId: string,
    ipAddress: string,
    userAgent?: string,
    success: boolean,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logAction(
      userId,
      'login',
      'user',
      userId,
      ipAddress,
      userAgent,
      {
        ...details,
        success,
      },
      success ? 'success' : 'failure'
    );
  }

  static async logDocumentAction(
    userId: string,
    action: 'upload' | 'download' | 'view' | 'edit' | 'delete' | 'move',
    documentId: string,
    ipAddress: string,
    userAgent?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logAction(
      userId,
      action,
      'document',
      documentId,
      ipAddress,
      userAgent,
      details
    );
  }

  static async logFolderAction(
    userId: string,
    action: 'create' | 'edit' | 'delete' | 'move',
    folderId: string,
    ipAddress: string,
    userAgent?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logAction(
      userId,
      action,
      'folder',
      folderId,
      ipAddress,
      userAgent,
      details
    );
  }

  static async logUserAction(
    userId: string,
    action: 'create' | 'edit' | 'delete' | 'enable_2fa' | 'disable_2fa' | 'change_password',
    targetUserId: string,
    ipAddress: string,
    userAgent?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logAction(
      userId,
      action,
      'user',
      targetUserId,
      ipAddress,
      userAgent,
      details
    );
  }

  static async logSystemAction(
    userId: string,
    action: 'backup' | 'restore' | 'system_config' | 'cleanup',
    ipAddress: string,
    userAgent?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logAction(
      userId,
      action,
      'system',
      'system',
      ipAddress,
      userAgent,
      details
    );
  }

  static async exportAuditTrails(
    filters: {
      dateFrom?: Date;
      dateTo?: Date;
      action?: string;
      resourceType?: string;
      userId?: string;
      format?: 'csv' | 'json';
    } = {}
  ): Promise<string> {
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

    if (filters.action) {
      query = query.where('audit_trails.action', filters.action);
    }

    if (filters.resourceType) {
      query = query.where('audit_trails.resource_type', filters.resourceType);
    }

    if (filters.userId) {
      query = query.where('audit_trails.user_id', filters.userId);
    }

    const trails = await query.orderBy('audit_trails.timestamp', 'desc');

    if (filters.format === 'csv') {
      return this.generateCSVExport(trails);
    } else {
      return JSON.stringify(trails, null, 2);
    }
  }

  private static generateCSVExport(trails: any[]): string {
    const headers = [
      'Timestamp',
      'User Email',
      'User Name',
      'Action',
      'Resource Type',
      'Resource ID',
      'Status',
      'IP Address',
      'User Agent',
      'Details'
    ];

    const csvRows = [headers.join(',')];

    trails.forEach(trail => {
      const row = [
        `"${trail.timestamp}"`,
        `"${trail.email || ''}"`,
        `"${trail.first_name || ''} ${trail.last_name || ''}"`,
        `"${trail.action}"`,
        `"${trail.resource_type}"`,
        `"${trail.resource_id}"`,
        `"${trail.status}"`,
        `"${trail.ip_address}"`,
        `"${trail.user_agent || ''}"`,
        `"${trail.details || ''}"`
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  static async cleanupOldAuditLogs(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    const result = await db('audit_trails')
      .where('timestamp', '<', cutoffDate)
      .del();

    return result;
  }

  static async getSecurityEvents(
    filters: {
      dateFrom?: Date;
      dateTo?: Date;
      eventTypes?: string[];
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    events: any[];
    pagination: any;
    summary: {
      totalEvents: number;
      failedLogins: number;
      suspiciousActivity: number;
      blockedAttempts: number;
    };
  }> {
    // Define security event types
    const securityActions = [
      'login_failure',
      'unauthorized_access',
      'permission_denied',
      'account_locked',
      'multiple_failed_attempts',
      'suspicious_activity',
      'data_breach_attempt',
      'privilege_escalation',
    ];

    let query = db('audit_trails')
      .whereIn('action', securityActions);

    // Apply date filters
    if (filters.dateFrom) {
      query = query.where('timestamp', '>=', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.where('timestamp', '<=', filters.dateTo);
    }

    // Apply event type filters
    if (filters.eventTypes && filters.eventTypes.length > 0) {
      query = query.whereIn('action', filters.eventTypes);
    }

    // Count total
    const totalQuery = query.clone().clearSelect().count('* as total');
    const [{ total }] = await totalQuery;

    // Apply pagination
    const page = parseInt(filters.page?.toString()) || 1;
    const limit = parseInt(filters.limit?.toString()) || 20;
    const offset = (page - 1) * limit;

    const events = await query
      .leftJoin('users', 'audit_trails.user_id', 'users.id')
      .select(
        'audit_trails.*',
        'users.first_name',
        'users.last_name',
        'users.email'
      )
      .orderBy('audit_trails.timestamp', 'desc')
      .limit(limit)
      .offset(offset);

    // Calculate summary
    const summaryQuery = db('audit_trails')
      .whereIn('action', securityActions);

    if (filters.dateFrom) {
      summaryQuery.where('timestamp', '>=', filters.dateFrom);
    }

    if (filters.dateTo) {
      summaryQuery.where('timestamp', '<=', filters.dateTo);
    }

    const totalEventsResult = await summaryQuery.clone().count('* as total').first();
    const failedLoginsResult = await summaryQuery.clone()
      .where('action', 'login_failure')
      .count('* as total').first();
    const suspiciousActivityResult = await summaryQuery.clone()
      .where('action', 'suspicious_activity')
      .count('* as total').first();
    const blockedAttemptsResult = await summaryQuery.clone()
      .where('action', 'account_locked')
      .count('* as total').first();

    const summary = {
      totalEvents: parseInt(totalEventsResult?.total || '0'),
      failedLogins: parseInt(failedLoginsResult?.total || '0'),
      suspiciousActivity: parseInt(suspiciousActivityResult?.total || '0'),
      blockedAttempts: parseInt(blockedAttemptsResult?.total || '0'),
    };

    return {
      events,
      pagination: {
        page,
        limit,
        total: parseInt(total),
        totalPages: Math.ceil(total / limit),
      },
      summary,
    };
  }
}
