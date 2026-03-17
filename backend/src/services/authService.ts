import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import db from '@/config/database';
import { getRedisClient } from '@/config/redis';
import { User, Session } from '@/types';
import { logger } from '@/utils/logger';

export class AuthService {
  private static readonly JWT_EXPIRES_IN = '1h';
  private static readonly REFRESH_TOKEN_EXPIRES_IN = '7d';
  private static readonly OTP_EXPIRES_IN = 10 * 60 * 1000; // 10 minutes

  // Email configuration
  private static emailTransporter = nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  static async hashPassword(password: string): Promise<string> {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    return bcrypt.hash(password, saltRounds);
  }

  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateTokens(userId: string, sessionId: string): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign(
      { userId, sessionId },
      process.env.JWT_SECRET!,
      { expiresIn: this.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId, sessionId, type: 'refresh' },
      process.env.JWT_SECRET!,
      { expiresIn: this.REFRESH_TOKEN_EXPIRES_IN }
    );

    return { accessToken, refreshToken };
  }

  static async createUser(userData: {
    email: string;
    password?: string;
    first_name: string;
    last_name: string;
    google_id?: string;
    department?: string;
    position?: string;
  }): Promise<User> {
    const hashedPassword = userData.password ? await this.hashPassword(userData.password) : null;

    const [user] = await db('users')
      .insert({
        id: uuidv4(),
        email: userData.email,
        password: hashedPassword,
        first_name: userData.first_name,
        last_name: userData.last_name,
        google_id: userData.google_id,
        department: userData.department,
        position: userData.position,
        role: 'user',
        is_active: true,
        email_verified: !!userData.google_id,
        storage_quota: 1073741824, // 1GB
        storage_used: 0,
      })
      .returning('*');

    return user;
  }

  static async findUserByEmail(email: string): Promise<User | null> {
    return await db('users').where({ email }).first();
  }

  static async findUserByGoogleId(googleId: string): Promise<User | null> {
    return await db('users').where({ google_id: googleId }).first();
  }

  static async createSession(userId: string, deviceInfo: any): Promise<Session> {
    const session = {
      id: uuidv4(),
      user_id: userId,
      session_token: uuidv4(),
      refresh_token: uuidv4(),
      device_type: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      browser_version: deviceInfo.browserVersion,
      operating_system: deviceInfo.os,
      ip_address: deviceInfo.ipAddress,
      user_agent: deviceInfo.userAgent,
      is_active: true,
      last_activity: new Date(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      created_at: new Date(),
      remember_me: deviceInfo.rememberMe || false,
    };

    await db('sessions').insert(session);
    return session;
  }

  static async invalidateSession(sessionId: string): Promise<void> {
    await db('sessions').where({ id: sessionId }).update({ is_active: false });
  }

  static async invalidateAllUserSessions(userId: string): Promise<void> {
    await db('sessions').where({ user_id: userId }).update({ is_active: false });
  }

  static async generate2FASecret(userId: string): Promise<{ secret: string; qrCode: string; backupCodes: string[] }> {
    const secret = speakeasy.generateSecret({
      name: `9Tools (${userId})`,
      issuer: '9Tools Document Management',
    });

    const backupCodes = Array.from({ length: 10 }, () => 
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );

    await db('users')
      .where({ id: userId })
      .update({
        two_factor_secret: secret.base32,
        backup_codes: JSON.stringify(backupCodes),
      });

    const qrCode = speakeasy.otpauthURL({
      secret: secret.base32,
      label: `9Tools (${userId})`,
      issuer: '9Tools Document Management',
    });

    return {
      secret: secret.base32,
      qrCode,
      backupCodes,
    };
  }

  static async enable2FA(userId: string, token: string): Promise<boolean> {
    const user = await db('users').where({ id: userId }).first();
    if (!user || !user.two_factor_secret) {
      return false;
    }

    const verified = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 steps before/after
    });

    if (verified) {
      await db('users').where({ id: userId }).update({ two_factor_enabled: true });
    }

    return verified;
  }

  static async disable2FA(userId: string): Promise<void> {
    await db('users')
      .where({ id: userId })
      .update({
        two_factor_enabled: false,
        two_factor_secret: null,
        backup_codes: null,
      });
  }

  static verify2FAToken(userId: string, token: string): Promise<boolean> {
    return db('users')
      .where({ id: userId })
      .first()
      .then(user => {
        if (!user || !user.two_factor_secret) {
          return false;
        }

        // Try TOTP first
        let verified = speakeasy.totp.verify({
          secret: user.two_factor_secret,
          encoding: 'base32',
          token,
          window: 2,
        });

        // If TOTP fails, try backup codes
        if (!verified && user.backup_codes) {
          const backupCodes = JSON.parse(user.backup_codes);
          const codeIndex = backupCodes.indexOf(token);
          
          if (codeIndex !== -1) {
            // Remove used backup code
            backupCodes.splice(codeIndex, 1);
            db('users')
              .where({ id: userId })
              .update({ backup_codes: JSON.stringify(backupCodes) });
            verified = true;
          }
        }

        return verified;
      });
  }

  static async generatePasswordResetToken(email: string): Promise<string | null> {
    const user = await this.findUserByEmail(email);
    if (!user) {
      return null;
    }

    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db('users')
      .where({ id: user.id })
      .update({
        password_reset_token: resetToken,
        password_reset_expires: expiresAt,
      });

    return resetToken;
  }

  static async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const user = await db('users')
      .where({ password_reset_token: token })
      .andWhere('password_reset_expires', '>', new Date())
      .first();

    if (!user) {
      return false;
    }

    const hashedPassword = await this.hashPassword(newPassword);

    await db('users')
      .where({ id: user.id })
      .update({
        password: hashedPassword,
        password_reset_token: null,
        password_reset_expires: null,
      });

    // Invalidate all sessions for security
    await this.invalidateAllUserSessions(user.id);

    return true;
  }

  static async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        html,
      });
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }

  static async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
    
    const html = `
      <h2>รีเซ็ตรหัสผ่าน 9Tools</h2>
      <p>คุณได้รับอีเมลนี้เนื่องจากมีคำขอรีเซ็ตรหัสผ่านสำหรับบัญชีของคุณ</p>
      <p>คลิกที่ลิงก์ด้านล่างเพื่อรีเซ็ตรหัสผ่าน:</p>
      <a href="${resetUrl}" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
        รีเซ็ตรหัสผ่าน
      </a>
      <p>ลิงก์นี้จะหมดอายุใน 1 ชั่วโมง</p>
      <p>หากคุณไม่ได้ร้องขอรีเซ็ตรหัสผ่าน กรุณาละเว้นอีเมลนี้</p>
    `;

    await this.sendEmail(email, 'รีเซ็ตรหัสผ่าน 9Tools', html);
  }

  static async send2FASetupEmail(email: string, backupCodes: string[]): Promise<void> {
    const html = `
      <h2>ตั้งค่า Two-Factor Authentication</h2>
      <p>คุณได้เปิดใช้งาน Two-Factor Authentication สำหรับบัญชี 9Tools ของคุณ</p>
      <p>กรุณาบันทึกรหัสสำรอง (Backup Codes) เหล่านี้ไว้ในที่ปลอดภัย:</p>
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; font-family: monospace;">
        ${backupCodes.join('<br>')}
      </div>
      <p>แต่ละรหัสสามารถใช้ได้ครั้งเดียวเท่านั้น</p>
      <p>เก็บรหัสเหล่านี้ไว้ในที่ปลอดภัยและไม่แชร์กับผู้อื่น</p>
    `;

    await this.sendEmail(email, 'Two-Factor Authentication ถูกเปิดใช้งาน', html);
  }

  static async incrementFailedLoginAttempts(email: string): Promise<void> {
    await db('users')
      .where({ email })
      .increment('failed_login_attempts', 1);

    const user = await this.findUserByEmail(email);
    if (user && user.failed_login_attempts >= 5) {
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      await db('users')
        .where({ email })
        .update({ locked_until: lockUntil });
    }
  }

  static async resetFailedLoginAttempts(email: string): Promise<void> {
    await db('users')
      .where({ email })
      .update({
        failed_login_attempts: 0,
        locked_until: null,
        last_login: new Date(),
      });
  }

  static async isAccountLocked(email: string): Promise<boolean> {
    const user = await this.findUserByEmail(email);
    return user ? user.locked_until && new Date(user.locked_until) > new Date() : false;
  }

  static async updateLastActivity(sessionId: string): Promise<void> {
    await db('sessions')
      .where({ id: sessionId })
      .update({ last_activity: new Date() });
  }

  static async cleanupExpiredSessions(): Promise<void> {
    await db('sessions')
      .where('expires_at', '<', new Date())
      .del();
  }
}
