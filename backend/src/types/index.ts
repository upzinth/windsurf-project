export interface User {
  id: string;
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'manager' | 'user';
  is_active: boolean;
  email_verified: boolean;
  google_id?: string;
  avatar_url?: string;
  phone?: string;
  department?: string;
  position?: string;
  two_factor_enabled: boolean;
  two_factor_secret?: string;
  backup_codes?: string[];
  failed_login_attempts: number;
  locked_until?: Date;
  last_login?: Date;
  last_login_ip?: string;
  password_reset_token?: string;
  password_reset_expires?: Date;
  storage_quota: number;
  storage_used: number;
  created_at: Date;
  updated_at: Date;
}

export interface Folder {
  id: string;
  name: string;
  description?: string;
  parent_id?: string;
  created_by: string;
  updated_by?: string;
  path: string;
  level: number;
  permissions?: Record<string, any>;
  is_public: boolean;
  is_system: boolean;
  max_file_size: number;
  allowed_file_types?: string[];
  created_at: Date;
  updated_at: Date;
}

export interface Document {
  id: string;
  filename: string;
  original_filename: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  file_hash: string;
  description?: string;
  folder_id: string;
  uploaded_by: string;
  updated_by?: string;
  document_number?: string;
  document_type?: string;
  document_date?: Date;
  expiry_date?: Date;
  pdf_path?: string;
  pdf_converted: boolean;
  thumbnail_path?: string;
  is_encrypted: boolean;
  encryption_key?: string;
  is_public: boolean;
  allowed_users?: string[];
  allowed_roles?: string[];
  download_count: number;
  last_downloaded?: Date;
  version: string;
  parent_document_id?: string;
  is_latest_version: boolean;
  tags?: string[];
  category?: string;
  status: 'active' | 'archived' | 'deleted';
  archive_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AuditTrail {
  id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  resource_name?: string;
  description?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  ip_address: string;
  user_agent?: string;
  session_id?: string;
  status: 'success' | 'failure' | 'warning';
  error_message?: string;
  metadata?: Record<string, any>;
  department?: string;
  location?: string;
  created_at: Date;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'system';
  category: 'upload' | 'download' | 'share' | 'system' | 'security' | 'expiry';
  resource_type?: string;
  resource_id?: string;
  resource_url?: string;
  email_sent: boolean;
  email_sent_at?: Date;
  in_app_read: boolean;
  read_at?: Date;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  is_active: boolean;
  expires_at?: Date;
  metadata?: Record<string, any>;
  action_url?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Session {
  id: string;
  user_id: string;
  session_token: string;
  refresh_token?: string;
  device_type?: string;
  browser?: string;
  browser_version?: string;
  operating_system?: string;
  ip_address: string;
  user_agent?: string;
  is_active: boolean;
  last_activity: Date;
  expires_at: Date;
  created_at: Date;
  remember_me: boolean;
  fingerprint?: string;
  security_flags?: Record<string, any>;
}

import { Request } from 'express';

export interface AuthRequest extends Request {
  user?: User;
  session?: Session;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UploadProgress {
  id: string;
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

export interface SearchFilters {
  query?: string;
  folder_id?: string;
  document_type?: string;
  category?: string;
  tags?: string[];
  date_from?: Date;
  date_to?: Date;
  document_date_from?: Date;
  document_date_to?: Date;
  expiry_date_from?: Date;
  expiry_date_to?: Date;
  uploaded_by?: string;
  file_size_min?: number;
  file_size_max?: number;
  mime_type?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface FileUploadOptions {
  folder_id: string;
  description?: string;
  tags?: string[];
  category?: string;
  document_type?: string;
  document_date?: Date;
  expiry_date?: Date;
  is_public?: boolean;
  allowed_users?: string[];
  allowed_roles?: string[];
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  template: string;
  data?: Record<string, any>;
  attachments?: Array<{
    filename: string;
    path: string;
  }>;
}

export interface SystemSettings {
  max_file_size: number;
  allowed_file_types: string[];
  enable_virus_scan: boolean;
  enable_pdf_conversion: boolean;
  enable_email_notifications: boolean;
  session_timeout: number;
  max_login_attempts: number;
  lockout_duration: number;
  password_min_length: number;
  require_2fa: boolean;
  backup_schedule: string;
  retention_days: number;
}
