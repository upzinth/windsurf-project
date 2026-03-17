import nodemailer from 'nodemailer';
import db from '@/config/database';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class NotificationService {
  private static transporter: nodemailer.Transporter;

  // Initialize email transporter
  static initializeEmailTransporter(): void {
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Send email notification
  static async sendEmail(options: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    attachments?: any[];
  }): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    try {
      if (!this.transporter) {
        this.initializeEmailTransporter();
      }

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME || '9Tools System'}" <${process.env.EMAIL_FROM}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully:', {
        to: options.to,
        subject: options.subject,
        messageId: info.messageId,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      logger.error('Failed to send email:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Create in-app notification
  static async createNotification(data: {
    userId: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    category: 'system' | 'document' | 'user' | 'security';
    resourceId?: string;
    resourceType?: string;
    actionUrl?: string;
    isRead?: boolean;
    isEmailSent?: boolean;
  }): Promise<string> {
    const [notification] = await db('notifications')
      .insert({
        id: uuidv4(),
        user_id: data.userId,
        title: data.title,
        message: data.message,
        type: data.type,
        category: data.category,
        resource_id: data.resourceId || null,
        resource_type: data.resourceType || null,
        action_url: data.actionUrl || null,
        is_read: data.isRead || false,
        is_email_sent: data.isEmailSent || false,
        created_at: new Date(),
      })
      .returning('*');

    return notification.id;
  }

  // Send document upload notification
  static async notifyDocumentUpload(
    userId: string,
    documentData: {
      filename: string;
      folderName?: string;
      size: number;
    }
  ): Promise<void> {
    try {
      // Get user details
      const user = await db('users').where({ id: userId }).first();
      if (!user) return;

      // Create in-app notification
      await this.createNotification({
        userId,
        title: 'เอกสารอัปโหลดสำเร็จ',
        message: `เอกสาร "${documentData.filename}" ถูกอัปโหลดสู่ระบบเรียบร้อยแล้ว${documentData.folderName ? ` ในโฟลเดอร์ "${documentData.folderName}"` : ''} (ขนาด: ${this.formatFileSize(documentData.size)})`,
        type: 'success',
        category: 'document',
        actionUrl: '/documents',
      });

      // Send email notification if user has email notifications enabled
      if (user.email_notifications) {
        await this.sendEmail({
          to: user.email,
          subject: '9Tools - การอัปโหลดเอกสารสำเร็จ',
          html: this.getDocumentUploadTemplate(user, documentData),
        });
      }
    } catch (error) {
      logger.error('Failed to send document upload notification:', error);
    }
  }

  // Send document shared notification
  static async notifyDocumentShared(
    userId: string,
    shareData: {
      documentName: string;
      sharedBy: string;
      permissions: string[];
      expiresAt?: Date;
    }
  ): Promise<void> {
    try {
      const user = await db('users').where({ id: userId }).first();
      if (!user) return;

      await this.createNotification({
        userId,
        title: 'เอกสารถูกแชร์',
        message: `เอกสาร "${shareData.documentName}" ถูกแชร์ให้คุณโดย ${shareData.sharedBy} พร้อมสิทธิ์: ${shareData.permissions.join(', ')}${shareData.expiresAt ? ` (หมดอายุ: ${shareData.expiresAt.toLocaleDateString('th-TH')})` : ''}`,
        type: 'info',
        category: 'document',
        actionUrl: '/shared-documents',
      });

      if (user.email_notifications) {
        await this.sendEmail({
          to: user.email,
          subject: '9Tools - เอกสารถูกแชร์',
          html: this.getDocumentSharedTemplate(user, shareData),
        });
      }
    } catch (error) {
      logger.error('Failed to send document shared notification:', error);
    }
  }

  // Send security alert notification
  static async notifySecurityAlert(
    userId: string,
    alertData: {
      type: 'login_attempt' | 'password_change' | '2fa_enabled' | '2fa_disabled' | 'suspicious_activity';
      details: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    try {
      const user = await db('users').where({ id: userId }).first();
      if (!user) return;

      let title = '';
      let message = '';

      switch (alertData.type) {
        case 'login_attempt':
          title = 'พยายานล็อกอิน';
          message = `มีการพยายานล็อกอินเข้าสู่บัญชีของคุณ${alertData.ipAddress ? ` จาก IP: ${alertData.ipAddress}` : ''}`;
          break;
        case 'password_change':
          title = 'รหัสผ่านถูกเปลี่ยน';
          message = 'รหัสผ่านของคุณถูกเปลี่ยนเรียบร้อยแล้ว';
          break;
        case '2fa_enabled':
          title = 'เปิดใช้งาน 2FA';
          message = 'ระบบยืนยันตัวตนสองชั้น (2FA) ถูกเปิดใช้งานสำหรับบัญชีของคุณแล้ว';
          break;
        case '2fa_disabled':
          title = 'ปิดใช้งาน 2FA';
          message = 'ระบบยืนยันตัวตนสองชั้น (2FA) ถูกปิดใช้งานสำหรับบัญชีของคุณแล้ว';
          break;
        case 'suspicious_activity':
          title = 'ตรวจพบกิจกรรมแปลกปลอย';
          message = `ตรวจพบกิจกรรมแปลกปลอยในบัญชีของคุณ: ${alertData.details}`;
          break;
      }

      await this.createNotification({
        userId,
        title,
        message,
        type: alertData.type === 'suspicious_activity' ? 'warning' : 'info',
        category: 'security',
        actionUrl: '/security',
      });

      // Always send security alerts via email
      await this.sendEmail({
        to: user.email,
        subject: `9Tools - ${title}`,
        html: this.getSecurityAlertTemplate(user, alertData),
      });
    } catch (error) {
      logger.error('Failed to send security alert notification:', error);
    }
  }

  // Send system maintenance notification
  static async notifySystemMaintenance(
    maintenanceData: {
      type: 'scheduled' | 'emergency';
      startTime: Date;
      endTime?: Date;
      description: string;
    }
  ): Promise<void> {
    try {
      // Get all active users
      const users = await db('users').where({ is_active: true }).select('*');

      for (const user of users) {
        await this.createNotification({
          userId: user.id,
          title: maintenanceData.type === 'emergency' ? 'ซ่อมแจ้งฉุกเฉียง' : 'กำหนดการบำรุงรักษา',
          message: `ระบบจะ${maintenanceData.type === 'emergency' ? 'ปิดปรับปรับปรับ' : 'อยู่ในระหว่างการบำรุงรักษา'} ตั้งแต่ ${maintenanceData.startTime.toLocaleString('th-TH')}${maintenanceData.endTime ? ` ถึง ${maintenanceData.endTime.toLocaleString('th-TH')}` : ''} - ${maintenanceData.description}`,
          type: maintenanceData.type === 'emergency' ? 'error' : 'warning',
          category: 'system',
        });

        // Send email for system notifications
        if (user.email_notifications) {
          await this.sendEmail({
            to: user.email,
            subject: `9Tools - ${maintenanceData.type === 'emergency' ? 'ซ่อมแจ้งฉุกเฉียง' : 'กำหนดการบำรุงรักษา'}`,
            html: this.getMaintenanceTemplate(user, maintenanceData),
          });
        }
      }
    } catch (error) {
      logger.error('Failed to send maintenance notification:', error);
    }
  }

  // Get user notifications
  static async getUserNotifications(
    userId: string,
    filters: {
      unreadOnly?: boolean;
      category?: string;
      type?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    notifications: any[];
    pagination: any;
    unreadCount: number;
  }> {
    let query = db('notifications')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc');

    // Apply filters
    if (filters.unreadOnly) {
      query = query.where({ is_read: false });
    }

    if (filters.category) {
      query = query.where({ category: filters.category });
    }

    if (filters.type) {
      query = query.where({ type: filters.type });
    }

    // Count total and unread
    const totalQuery = query.clone().clearSelect().count('* as total');
    const unreadQuery = db('notifications')
      .where({ user_id: userId, is_read: false })
      .count('* as total')
      .first();

    const [{ total }] = await totalQuery;
    const [{ total: unreadCount }] = await unreadQuery;

    // Apply pagination
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const notifications = await query
      .limit(limit)
      .offset(offset);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total: parseInt(total),
        totalPages: Math.ceil(total / limit),
      },
      unreadCount,
    };
  }

  // Mark notification as read
  static async markAsRead(notificationId: string, userId: string): Promise<void> {
    await db('notifications')
      .where({ id: notificationId, user_id: userId })
      .update({
        is_read: true,
        read_at: new Date(),
      });
  }

  // Mark all notifications as read
  static async markAllAsRead(userId: string): Promise<void> {
    await db('notifications')
      .where({ user_id: userId, is_read: false })
      .update({
        is_read: true,
        read_at: new Date(),
      });
  }

  // Delete notification
  static async deleteNotification(notificationId: string, userId: string): Promise<void> {
    await db('notifications')
      .where({ id: notificationId, user_id: userId })
      .del();
  }

  // Get notification settings
  static async getNotificationSettings(userId: string): Promise<{
    emailNotifications: boolean;
    pushNotifications: boolean;
    categories: {
      system: boolean;
      document: boolean;
      user: boolean;
      security: boolean;
    };
  }> {
    const user = await db('users')
      .where({ id: userId })
      .select('email_notifications', 'push_notifications')
      .first();

    // Default settings if not set
    const settings = {
      emailNotifications: user?.email_notifications ?? true,
      pushNotifications: user?.push_notifications ?? true,
      categories: {
        system: true,
        document: true,
        user: true,
        security: true,
      },
    };

    return settings;
  }

  // Update notification settings
  static async updateNotificationSettings(
    userId: string,
    settings: {
      emailNotifications?: boolean;
      pushNotifications?: boolean;
      categories?: {
        system?: boolean;
        document?: boolean;
        user?: boolean;
        security?: boolean;
      };
    }
  ): Promise<void> {
    const updateData: any = {};

    if (settings.emailNotifications !== undefined) {
      updateData.email_notifications = settings.emailNotifications;
    }

    if (settings.pushNotifications !== undefined) {
      updateData.push_notifications = settings.pushNotifications;
    }

    await db('users')
      .where({ id: userId })
      .update(updateData);
  }

  // Email templates
  private static getDocumentUploadTemplate(user: any, documentData: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>การอัปโหลดเอกสารสำเร็จ</title>
        <style>
          body { font-family: 'Sarabun', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .content { background: white; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef; }
          .footer { text-align: center; margin-top: 20px; color: #6c757d; font-size: 14px; }
          .btn { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🎉 การอัปโหลดเอกสารสำเร็จ!</h2>
            <p>สวัสดีครับ/คุณ ${user.first_name} ${user.last_name}</p>
          </div>
          <div class="content">
            <p>เอกสาร <strong>"${documentData.filename}"</strong> ถูกอัปโหลดสู่ระบบ 9Tools เรียบร้อยแล้ว</p>
            ${documentData.folderName ? `<p>📁 โฟลเดอร์: ${documentData.folderName}</p>` : ''}
            <p>📊 ขนาดไฟล์: ${this.formatFileSize(documentData.size)}</p>
            <p>⏰ เวลา: ${new Date().toLocaleString('th-TH')}</p>
            <a href="${process.env.FRONTEND_URL}/documents" class="btn">ดูเอกสาร</a>
          </div>
          <div class="footer">
            <p>9Tools Document Management System</p>
            <p>ระบบจัดการเอกสารสำหรับองค์กร</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getDocumentSharedTemplate(user: any, shareData: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>เอกสารถูกแชร์</title>
        <style>
          body { font-family: 'Sarabun', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #e3f2fd; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .content { background: white; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef; }
          .footer { text-align: center; margin-top: 20px; color: #6c757d; font-size: 14px; }
          .btn { display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>📤 เอกสารถูกแชร์</h2>
            <p>สวัสดีครับ/คุณ ${user.first_name} ${user.last_name}</p>
          </div>
          <div class="content">
            <p>เอกสาร <strong>"${shareData.documentName}"</strong> ถูกแชร์ให้คุณโดย <strong>${shareData.sharedBy}</strong></p>
            <p>🔐 สิทธิ์ที่ได้รับ: ${shareData.permissions.join(', ')}</p>
            ${shareData.expiresAt ? `<p>⏰ หมดอายุ: ${shareData.expiresAt.toLocaleDateString('th-TH')}</p>` : ''}
            <a href="${process.env.FRONTEND_URL}/shared-documents" class="btn">ดูเอกสารที่แชร์</a>
          </div>
          <div class="footer">
            <p>9Tools Document Management System</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getSecurityAlertTemplate(user: any, alertData: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>การแจ้งเตือนความปลอดภัย</title>
        <style>
          body { font-family: 'Sarabun', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f8d7da; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .content { background: white; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef; }
          .footer { text-align: center; margin-top: 20px; color: #6c757d; font-size: 14px; }
          .btn { display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🔒 การแจ้งเตือนความปลอดภัย</h2>
            <p>สวัสดีครับ/คุณ ${user.first_name} ${user.last_name}</p>
          </div>
          <div class="content">
            <p>${alertData.details}</p>
            ${alertData.ipAddress ? `<p>🌐 IP Address: ${alertData.ipAddress}</p>` : ''}
            <p>⏰ เวลา: ${new Date().toLocaleString('th-TH')}</p>
            <a href="${process.env.FRONTEND_URL}/security" class="btn">ตรวจสอบความปลอดภัย</a>
          </div>
          <div class="footer">
            <p>9Tools Document Management System</p>
            <p>หากคุณไม่ได้ดำเนินการกระทำใด้ๆ กรุณาติดต่อผู้ดูแลและทันที</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getMaintenanceTemplate(user: any, maintenanceData: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>การแจ้งเตือนการบำรุงรักษา</title>
        <style>
          body { font-family: 'Sarabun', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${maintenanceData.type === 'emergency' ? '#f8d7da' : '#fff3cd'}; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .content { background: white; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef; }
          .footer { text-align: center; margin-top: 20px; color: #6c757d; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>${maintenanceData.type === 'emergency' ? '🚨 ซ่อมแจ้งฉุกเฉียง' : '🔧 กำหนดการบำรุงรักษา'}</h2>
            <p>สวัสดีครับ/คุณ ${user.first_name} ${user.last_name}</p>
          </div>
          <div class="content">
            <p>${maintenanceData.description}</p>
            <p>📅 เริ่มตั้ง: ${maintenanceData.startTime.toLocaleString('th-TH')}</p>
            ${maintenanceData.endTime ? `<p>📅 สิ้นสุด: ${maintenanceData.endTime.toLocaleString('th-TH')}</p>` : ''}
          </div>
          <div class="footer">
            <p>9Tools Document Management System</p>
            <p>ขออภัยในความไม่สะดวกสระ</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Utility function to format file size
  private static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Clean up old notifications
  static async cleanupOldNotifications(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const result = await db('notifications')
      .where('created_at', '<', cutoffDate)
      .where('is_read', true)
      .del();

    logger.info(`Cleaned up ${result} old notifications`);
    return result;
  }

  // Send bulk notifications
  static async sendBulkNotifications(notifications: Array<{
    userId: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    category: 'system' | 'document' | 'user' | 'security';
  }>): Promise<void> {
    try {
      const notificationData = notifications.map(notif => ({
        id: uuidv4(),
        user_id: notif.userId,
        title: notif.title,
        message: notif.message,
        type: notif.type,
        category: notif.category,
        is_read: false,
        created_at: new Date(),
      }));

      await db('notifications').insert(notificationData);
      logger.info(`Sent ${notifications.length} bulk notifications`);
    } catch (error) {
      logger.error('Failed to send bulk notifications:', error);
    }
  }
}
