import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import db from '@/config/database';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class SecurityService {
  private static readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  private static readonly ENCRYPTION_KEY_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;

  // Generate encryption key
  static generateEncryptionKey(): string {
    return crypto.randomBytes(this.ENCRYPTION_KEY_LENGTH).toString('hex');
  }

  // Encrypt file data
  static encryptFileData(data: Buffer, key: string): {
    encryptedData: Buffer;
    iv: Buffer;
    tag: Buffer;
  } {
    const keyBuffer = Buffer.from(key, 'hex');
    const iv = crypto.randomBytes(this.IV_LENGTH);
    
    const cipher = crypto.createCipher(this.ENCRYPTION_ALGORITHM, keyBuffer);
    cipher.setAAD(Buffer.from('9tools-document')); // Additional authenticated data
    
    let encryptedData = cipher.update(data);
    const final = cipher.final();
    encryptedData = Buffer.concat([encryptedData, final]);
    
    const tag = cipher.getAuthTag();
    
    return {
      encryptedData,
      iv,
      tag,
    };
  }

  // Decrypt file data
  static decryptFileData(
    encryptedData: Buffer,
    key: string,
    iv: Buffer,
    tag: Buffer
  ): Buffer {
    const keyBuffer = Buffer.from(key, 'hex');
    
    const decipher = crypto.createDecipher(this.ENCRYPTION_ALGORITHM, keyBuffer);
    decipher.setAAD(Buffer.from('9tools-document'));
    decipher.setAuthTag(tag);
    
    let decryptedData = decipher.update(encryptedData);
    const final = decipher.final();
    decryptedData = Buffer.concat([decryptedData, final]);
    
    return decryptedData;
  }

  // Encrypt file and save
  static async encryptFile(
    filePath: string,
    key: string
  ): Promise<{
    encryptedFilePath: string;
    iv: string;
    tag: string;
  }> {
    try {
      const fileData = await fs.readFile(filePath);
      const { encryptedData, iv, tag } = this.encryptFileData(fileData, key);
      
      const encryptedFilePath = `${filePath}.encrypted`;
      await fs.writeFile(encryptedFilePath, encryptedData);
      
      return {
        encryptedFilePath,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
      };
    } catch (error) {
      logger.error('Failed to encrypt file:', error);
      throw new Error('File encryption failed');
    }
  }

  // Decrypt file and save
  static async decryptFile(
    encryptedFilePath: string,
    key: string,
    iv: string,
    tag: string
  ): Promise<string> {
    try {
      const encryptedData = await fs.readFile(encryptedFilePath);
      const ivBuffer = Buffer.from(iv, 'hex');
      const tagBuffer = Buffer.from(tag, 'hex');
      
      const decryptedData = this.decryptFileData(encryptedData, key, ivBuffer, tagBuffer);
      
      const originalFilePath = encryptedFilePath.replace('.encrypted', '');
      await fs.writeFile(originalFilePath, decryptedData);
      
      return originalFilePath;
    } catch (error) {
      logger.error('Failed to decrypt file:', error);
      throw new Error('File decryption failed');
    }
  }

  // Generate file hash for integrity verification
  static generateFileHash(filePath: string): Promise<string> {
    const fileData = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileData).digest('hex');
  }

  // Verify file integrity
  static async verifyFileIntegrity(
    filePath: string,
    expectedHash: string
  ): Promise<boolean> {
    const actualHash = await this.generateFileHash(filePath);
    return actualHash === expectedHash;
  }

  // Check access permissions
  static async checkAccessPermissions(
    userId: string,
    userRole: string,
    resourceType: 'document' | 'folder',
    resourceId: string,
    action: 'read' | 'write' | 'delete' | 'share'
  ): Promise<{
    hasAccess: boolean;
    reason?: string;
  }> {
    try {
      if (userRole === 'admin') {
        return { hasAccess: true };
      }

      let resource;
      if (resourceType === 'document') {
        resource = await db('documents')
          .where({ id: resourceId, status: 'active' })
          .first();
      } else if (resourceType === 'folder') {
        resource = await db('folders')
          .where({ id: resourceId, status: 'active' })
          .first();
      } else {
        return { hasAccess: false, reason: 'Invalid resource type' };
      }

      if (!resource) {
        return { hasAccess: false, reason: 'Resource not found' };
      }

      // Check if user is the owner
      if (resource.uploaded_by === userId || resource.created_by === userId) {
        return { hasAccess: true };
      }

      // Check public access
      if (resource.is_public && action === 'read') {
        return { hasAccess: true };
      }

      // Check explicit permissions
      if (resource.allowed_users) {
        const allowedUsers = JSON.parse(resource.allowed_users);
        if (allowedUsers.includes(userId)) {
          return { hasAccess: true };
        }
      }

      // Check role-based permissions
      if (resource.allowed_roles) {
        const allowedRoles = JSON.parse(resource.allowed_roles);
        if (allowedRoles.includes(userRole)) {
          return { hasAccess: true };
        }
      }

      // Check folder permissions
      if (resourceType === 'folder' && resource.permissions) {
        const permissions = JSON.parse(resource.permissions);
        const userPermissions = permissions[userRole] || [];
        if (userPermissions.includes(action)) {
          return { hasAccess: true };
        }
      }

      // Default deny
      return { 
        hasAccess: false, 
        reason: 'Insufficient permissions' 
      };
    } catch (error) {
      logger.error('Error checking access permissions:', error);
      return { hasAccess: false, reason: 'Permission check failed' };
    }
  }

  // Log security event
  static async logSecurityEvent(
    userId: string,
    eventType: 'login_attempt' | 'permission_denied' | 'data_access' | 'suspicious_activity',
    details: {
      ipAddress: string;
      userAgent?: string;
      resourceType?: string;
      resourceId?: string;
      action?: string;
      reason?: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    await db('security_events')
      .insert({
        id: uuidv4(),
        user_id: userId,
        event_type: eventType,
        details: JSON.stringify(details),
        timestamp: new Date(),
      });
  }

  // Check for suspicious activity
  static async detectSuspiciousActivity(userId: string): Promise<{
    isSuspicious: boolean;
    reasons: string[];
    riskScore: number;
  }> {
    const reasons: string[] = [];
    let riskScore = 0;

    // Check for multiple failed logins
    const recentFailedLogins = await db('audit_trails')
      .where({
        user_id: userId,
        action: 'login_failure',
        status: 'failure'
      })
      .where('timestamp', '>=', new Date(Date.now() - 60 * 60 * 1000)) // Last hour
      .count('* as count')
      .first();

    if (parseInt(recentFailedLogins.count) > 5) {
      reasons.push('Multiple failed login attempts');
      riskScore += 30;
    }

    // Check for unusual access patterns
    const recentAccess = await db('audit_trails')
      .where({ user_id: userId })
      .where('timestamp', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000)) // Last 24 hours
      .distinct('ip_address')
      .select('ip_address', db.raw('COUNT(*) as access_count'))
      .groupBy('ip_address')
      .orderBy('access_count', 'desc');

    if (recentAccess.length > 3) {
      reasons.push('Access from multiple IP addresses');
      riskScore += 20;
    }

    // Check for unusual time patterns
    const recentNightAccess = await db('audit_trails')
      .where({ user_id: userId })
      .where('timestamp', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
      .whereRaw('EXTRACT(HOUR FROM timestamp) BETWEEN 22 AND 6') // Night hours (10 PM - 6 AM)
      .count('* as count')
      .first();

    if (parseInt(recentNightAccess.count) > 5) {
      reasons.push('Unusual night-time access');
      riskScore += 15;
    }

    return {
      isSuspicious: riskScore > 25,
      reasons,
      riskScore,
    };
  }

  // Generate secure download token
  static generateSecureDownloadToken(
    userId: string,
    documentId: string,
    expiresIn: number = 3600 // 1 hour
  ): Promise<{
    token: string;
    expiresAt: Date;
  }> {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const tokenData = {
      userId,
      documentId,
      expiresAt: expiresAt.toISOString(),
      purpose: 'download',
    };

    const token = crypto.createHash('sha256')
      .update(JSON.stringify(tokenData))
      .update(process.env.DOWNLOAD_TOKEN_SECRET!)
      .digest('hex');

    // Store token in database
    await db('secure_tokens')
      .insert({
        id: uuidv4(),
        user_id: userId,
        document_id: documentId,
        token,
        expires_at: expiresAt,
        purpose: 'download',
        created_at: new Date(),
      });

    return { token, expiresAt };
  }

  // Validate secure download token
  static async validateSecureDownloadToken(
    token: string,
    documentId: string
  ): Promise<{
      isValid: boolean;
      userId?: string;
    }> {
    const tokenRecord = await db('secure_tokens')
      .where({
        token,
        document_id: documentId,
        purpose: 'download'
      })
      .where('expires_at', '>', new Date())
      .first();

    if (!tokenRecord) {
      return { isValid: false };
    }

    // Clean up used token
    await db('secure_tokens')
      .where({ id: tokenRecord.id })
      .del();

    return {
      isValid: true,
      userId: tokenRecord.user_id,
    };
  }

  // Clean up expired tokens
  static async cleanupExpiredTokens(): Promise<number> {
    const result = await db('secure_tokens')
      .where('expires_at', '<', new Date())
      .del();

    return result;
  }

  // Generate password policy compliance check
  static checkPasswordCompliance(password: string): {
    isCompliant: boolean;
    issues: string[];
    score: number;
  } {
    const issues: string[] = [];
    let score = 0;

    // Length check
    if (password.length < 8) {
      issues.push('Password must be at least 8 characters long');
    } else {
      score += 20;
    }

    // Complexity checks
    if (/[A-Z]/.test(password)) {
      score += 20;
    } else {
      issues.push('Password must contain at least one uppercase letter');
    }

    if (/[a-z]/.test(password)) {
      score += 20;
    } else {
      issues.push('Password must contain at least one lowercase letter');
    }

    if (/\d/.test(password)) {
      score += 20;
    } else {
      issues.push('Password must contain at least one number');
    }

    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      score += 20;
    } else {
      issues.push('Password must contain at least one special character');
    }

    // Common password check
    const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein'];
    if (commonPasswords.includes(password.toLowerCase())) {
      issues.push('Password is too common');
      score -= 50;
    }

    return {
      isCompliant: issues.length === 0 && score >= 80,
      issues,
      score: Math.max(0, score),
    };
  }

  // Rate limiting helper
  static async checkRateLimit(
    identifier: string,
    windowMs: number = 60000, // 1 minute
    maxRequests: number = 100
  ): Promise<{
      allowed: boolean;
      remaining: number;
      resetTime: Date;
    }> {
      const key = `rate_limit:${identifier}`;
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowMs);

      // Clean up old entries
      await db('rate_limits')
        .where('timestamp', '<', windowStart)
        .del();

      // Count requests in window
      const countResult = await db('rate_limits')
        .where({ key, timestamp: '>=': windowStart })
        .count('* as count')
        .first();

      const count = parseInt(countResult?.count || '0');
      const remaining = Math.max(0, maxRequests - count);
      const resetTime = new Date(windowStart.getTime() + windowMs);

      return {
        allowed: count < maxRequests,
        remaining,
        resetTime,
      };
    }

  // Increment rate limit counter
  static async incrementRateLimit(identifier: string): Promise<void> {
    await db('rate_limits')
      .insert({
        key: `rate_limit:${identifier}`,
        timestamp: new Date(),
      });
  }

  // Generate secure session token
  static generateSecureSessionToken(userId: string): {
    token: string;
    expiresAt: Date;
  } {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const tokenData = {
      userId,
      expiresAt: expiresAt.toISOString(),
      purpose: 'session',
    };

    const token = crypto.createHash('sha256')
      .update(JSON.stringify(tokenData))
      .update(process.env.SESSION_SECRET!)
      .digest('hex');

    return { token, expiresAt };
  }

  // Validate session token
  static validateSessionToken(token: string): {
    isValid: boolean;
    userId?: string;
    expired?: boolean;
  } {
    try {
      // This is a simplified validation
      // In production, you'd decode the token and validate all claims
      const tokenData = JSON.parse(
        crypto.createHash('sha256')
          .update(token)
          .update(process.env.SESSION_SECRET!)
          .digest('hex')
      );

      const expiresAt = new Date(tokenData.expiresAt);
      const now = new Date();

      return {
        isValid: now <= expiresAt,
        userId: tokenData.userId,
        expired: now > expiresAt,
      };
    } catch (error) {
      return { isValid: false };
    }
  }

  // Audit file access
  static async auditFileAccess(
    userId: string,
    documentId: string,
    action: 'view' | 'download' | 'edit' | 'delete',
    ipAddress: string,
    userAgent?: string
  ): Promise<void> {
    await db('file_access_audit')
      .insert({
        id: uuidv4(),
        user_id: userId,
        document_id: documentId,
        action,
        ip_address: ipAddress,
        user_agent: userAgent,
        timestamp: new Date(),
      });
  }

  // Get security dashboard data
  static async getSecurityDashboard(): Promise<{
    totalEvents: number;
    criticalEvents: number;
    suspiciousUsers: any[];
    recentActivity: any[];
    systemHealth: {
      encryptionEnabled: boolean;
      lastBackup: Date | null;
      failedLogins24h: number;
      activeSessions: number;
    };
  }> {
    // Get total security events
    const totalEvents = await db('security_events')
      .count('* as total')
      .first();

    // Get critical events
    const criticalEvents = await db('security_events')
      .whereRaw("details->>'severity' = 'critical'")
      .count('* as total')
      .first();

    // Get suspicious users
    const suspiciousUsers = await db('security_events')
      .select('user_id', db.raw('COUNT(*) as event_count'))
      .where('timestamp', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .whereRaw("details->>'severity' IN ('high', 'critical')")
      .groupBy('user_id')
      .havingRaw('COUNT(*) > 5')
      .orderBy('event_count', 'desc')
      .limit(10);

    // Get recent activity
    const recentActivity = await db('security_events')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .select('*');

    // System health
    const failedLogins24h = await db('audit_trails')
      .where({
        action: 'login_failure',
        status: 'failure'
      })
      .where('timestamp', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .count('* as total')
      .first();

    const activeSessions = await db('sessions')
      .where({ is_active: true })
      .count('* as total')
      .first();

    return {
      totalEvents: parseInt(totalEvents.total || '0'),
      criticalEvents: parseInt(criticalEvents.total || '0'),
      suspiciousUsers,
      recentActivity,
      systemHealth: {
        encryptionEnabled: !!process.env.ENCRYPTION_KEY,
        lastBackup: null, // Would be implemented separately
        failedLogins24h: parseInt(failedLogins24h.total || '0'),
        activeSessions: parseInt(activeSessions.total || '0'),
      },
    };
  }
}
