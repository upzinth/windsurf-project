import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import { AuthService } from './authService';
import db from '@/config/database';
import { logger } from '@/utils/logger';

export class GoogleAuthService {
  private static oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/api/auth/google/callback`
  );

  static getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      prompt: 'consent',
    });
  }

  static async exchangeCodeForTokens(code: string) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      return tokens;
    } catch (error) {
      logger.error('Failed to exchange code for tokens:', error);
      throw new Error('Failed to exchange authorization code for tokens');
    }
  }

  static async getUserInfo(accessToken: string) {
    try {
      const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get user info from Google:', error);
      throw new Error('Failed to retrieve user information from Google');
    }
  }

  static async authenticateWithGoogle(code: string, deviceInfo: any) {
    try {
      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(code);
      
      // Get user info
      const userInfo = await this.getUserInfo(tokens.access_token!);
      
      // Check if user exists by Google ID
      let user = await AuthService.findUserByGoogleId(userInfo.id);
      
      if (!user) {
        // Check if user exists by email
        user = await AuthService.findUserByEmail(userInfo.email);
        
        if (user) {
          // Link Google account to existing user
          await db('users')
            .where({ id: user.id })
            .update({
              google_id: userInfo.id,
              email_verified: true,
            });
        } else {
          // Create new user
          user = await AuthService.createUser({
            email: userInfo.email,
            first_name: userInfo.given_name || 'User',
            last_name: userInfo.family_name || '',
            google_id: userInfo.id,
          });
        }
      } else {
        // Update existing Google user
        await db('users')
          .where({ id: user.id })
          .update({
            email_verified: true,
            last_login: new Date(),
            last_login_ip: deviceInfo.ipAddress,
          });
      }

      // Create session
      const session = await AuthService.createSession(user.id, deviceInfo);
      
      // Generate tokens
      const { accessToken, refreshToken } = AuthService.generateTokens(
        user.id,
        session.id
      );

      // Store refresh token in session
      await db('sessions')
        .where({ id: session.id })
        .update({ refresh_token: refreshToken });

      return {
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
      };
    } catch (error) {
      logger.error('Google authentication failed:', error);
      throw error;
    }
  }

  static async revokeToken(accessToken: string): Promise<void> {
    try {
      await this.oauth2Client.revokeToken(accessToken);
    } catch (error) {
      logger.error('Failed to revoke Google token:', error);
      // Don't throw error here as this is not critical
    }
  }
}
