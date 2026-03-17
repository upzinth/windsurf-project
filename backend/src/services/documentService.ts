import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import db from '@/config/database';
import { logger } from '@/utils/logger';
import { Document, FileUploadOptions, AuthRequest } from '@/types';

export class DocumentService {
  private static readonly UPLOAD_DIR = process.env.UPLOAD_PATH || './uploads';
  private static readonly MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '104857600'); // 100MB
  private static readonly CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '5242880'); // 5MB
  private static readonly ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/tiff',
  ];

  // Multer configuration for file uploads
  private static storage = multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadDir = path.join(this.UPLOAD_DIR, 'temp');
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${uuidv4()}-${file.originalname}`;
      cb(null, uniqueName);
    },
  });

  private static upload = multer({
    storage: this.storage,
    limits: {
      fileSize: this.MAX_FILE_SIZE,
    },
    fileFilter: (req, file, cb) => {
      if (this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} is not allowed`));
      }
    },
  });

  static getUploadMiddleware() {
    return this.upload.single('file');
  }

  static async uploadDocument(req: AuthRequest, options: FileUploadOptions): Promise<Document> {
    const file = req.file;
    if (!file) {
      throw new Error('No file uploaded');
    }

    const user = req.user!;
    const folderId = options.folder_id;

    // Check folder permissions
    const folder = await db('folders').where({ id: folderId }).first();
    if (!folder) {
      throw new Error('Folder not found');
    }

    // Check user permissions
    if (!this.checkFolderPermissions(user, folder)) {
      throw new Error('Insufficient permissions to upload to this folder');
    }

    // Check user storage quota
    const userStorageUsed = user.storage_used + file.size;
    if (userStorageUsed > user.storage_quota) {
      throw new Error('Storage quota exceeded');
    }

    try {
      // Generate document number
      const documentNumber = await this.generateDocumentNumber();

      // Calculate file hash
      const fileBuffer = await fs.readFile(file.path);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // Create final file path
      const finalPath = path.join(this.UPLOAD_DIR, 'documents', folderId);
      await fs.mkdir(finalPath, { recursive: true });
      
      const filename = `${uuidv4()}-${file.originalname}`;
      const finalFilePath = path.join(finalPath, filename);
      
      // Move file from temp to final location
      await fs.rename(file.path, finalFilePath);

      // Process file (convert to PDF, create thumbnail)
      const { pdfPath, thumbnailPath, pdfConverted } = await this.processFile(
        finalFilePath,
        filename,
        file.mimetype
      );

      // Create document record
      const [document] = await db('documents')
        .insert({
          id: uuidv4(),
          filename,
          original_filename: file.originalname,
          file_path: finalFilePath,
          mime_type: file.mimetype,
          file_size: file.size,
          file_hash: fileHash,
          description: options.description,
          folder_id: folderId,
          uploaded_by: user.id,
          document_number: documentNumber,
          document_type: options.document_type,
          document_date: options.document_date,
          expiry_date: options.expiry_date,
          pdf_path: pdfPath,
          thumbnail_path: thumbnailPath,
          pdf_converted: pdfConverted,
          is_encrypted: false,
          encryption_key: null,
          is_public: options.is_public || false,
          allowed_users: options.allowed_users ? JSON.stringify(options.allowed_users) : null,
          allowed_roles: options.allowed_roles ? JSON.stringify(options.allowed_roles) : null,
          download_count: 0,
          version: '1.0',
          is_latest_version: true,
          tags: options.tags ? JSON.stringify(options.tags) : null,
          category: options.category,
          status: 'active',
        })
        .returning('*');

      // Update user storage usage
      await db('users')
        .where({ id: user.id })
        .update({ storage_used: userStorageUsed });

      // Clean up temp file if it still exists
      try {
        await fs.unlink(file.path);
      } catch (error) {
        // Temp file might already be moved
      }

      return document;
    } catch (error) {
      logger.error('Document upload failed:', error);
      
      // Clean up temp file on error
      try {
        await fs.unlink(file.path);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      throw error;
    }
  }

  static async initiateChunkedUpload(req: AuthRequest, options: FileUploadOptions): Promise<{ uploadId: string; chunkSize: number }> {
    const user = req.user!;
    const folderId = options.folder_id;

    // Check folder permissions
    const folder = await db('folders').where({ id: folderId }).first();
    if (!folder) {
      throw new Error('Folder not found');
    }

    // Check user permissions
    if (!this.checkFolderPermissions(user, folder)) {
      throw new Error('Insufficient permissions to upload to this folder');
    }

    const uploadId = uuidv4();
    
    // Store upload metadata in Redis or database
    await db('chunked_uploads').insert({
      id: uploadId,
      user_id: user.id,
      folder_id: folderId,
      original_filename: req.body.originalFilename,
      file_size: parseInt(req.body.fileSize),
      mime_type: req.body.mimeType,
      description: options.description,
      tags: options.tags ? JSON.stringify(options.tags) : null,
      category: options.category,
      document_type: options.document_type,
      document_date: options.document_date,
      expiry_date: options.expiry_date,
      is_public: options.is_public || false,
      allowed_users: options.allowed_users ? JSON.stringify(options.allowed_users) : null,
      allowed_roles: options.allowed_roles ? JSON.stringify(options.allowed_roles) : null,
      chunks_uploaded: 0,
      total_chunks: Math.ceil(req.body.fileSize / this.CHUNK_SIZE),
      status: 'initiated',
      created_at: new Date(),
    });

    return {
      uploadId,
      chunkSize: this.CHUNK_SIZE,
    };
  }

  static async uploadChunk(uploadId: string, chunkIndex: number, chunkData: Buffer): Promise<void> {
    const upload = await db('chunked_uploads')
      .where({ id: uploadId })
      .first();

    if (!upload) {
      throw new Error('Upload session not found');
    }

    if (upload.status !== 'initiated' && upload.status !== 'uploading') {
      throw new Error('Upload session is not active');
    }

    const chunkDir = path.join(this.UPLOAD_DIR, 'chunks', uploadId);
    await fs.mkdir(chunkDir, { recursive: true });

    const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}`);
    await fs.writeFile(chunkPath, chunkData);

    // Update upload progress
    await db('chunked_uploads')
      .where({ id: uploadId })
      .update({
        chunks_uploaded: upload.chunks_uploaded + 1,
        status: 'uploading',
        updated_at: new Date(),
      });
  }

  static async completeChunkedUpload(uploadId: string): Promise<Document> {
    const upload = await db('chunked_uploads')
      .where({ id: uploadId })
      .first();

    if (!upload) {
      throw new Error('Upload session not found');
    }

    if (upload.chunks_uploaded !== upload.total_chunks) {
      throw new Error('Not all chunks uploaded');
    }

    try {
      // Combine chunks into final file
      const chunkDir = path.join(this.UPLOAD_DIR, 'chunks', uploadId);
      const finalDir = path.join(this.UPLOAD_DIR, 'documents', upload.folder_id);
      await fs.mkdir(finalDir, { recursive: true });

      const filename = `${uuidv4()}-${upload.original_filename}`;
      const finalFilePath = path.join(finalDir, filename);

      // Combine chunks
      const writeStream = await fs.open(finalFilePath, 'w');
      for (let i = 0; i < upload.total_chunks; i++) {
        const chunkPath = path.join(chunkDir, `chunk-${i}`);
        const chunkData = await fs.readFile(chunkPath);
        await writeStream.write(chunkData);
        await fs.unlink(chunkPath);
      }
      await writeStream.close();

      // Clean up chunk directory
      await fs.rmdir(chunkDir);

      // Calculate file hash
      const fileBuffer = await fs.readFile(finalFilePath);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // Generate document number
      const documentNumber = await this.generateDocumentNumber();

      // Process file (convert to PDF, create thumbnail)
      const { pdfPath, thumbnailPath, pdfConverted } = await this.processFile(
        finalFilePath,
        filename,
        upload.mime_type
      );

      // Create document record
      const [document] = await db('documents')
        .insert({
          id: uuidv4(),
          filename,
          original_filename: upload.original_filename,
          file_path: finalFilePath,
          mime_type: upload.mime_type,
          file_size: upload.file_size,
          file_hash: fileHash,
          description: upload.description,
          folder_id: upload.folder_id,
          uploaded_by: upload.user_id,
          document_number: documentNumber,
          document_type: upload.document_type,
          document_date: upload.document_date,
          expiry_date: upload.expiry_date,
          pdf_path: pdfPath,
          thumbnail_path: thumbnailPath,
          pdf_converted: pdfConverted,
          is_encrypted: false,
          encryption_key: null,
          is_public: upload.is_public,
          allowed_users: upload.allowed_users,
          allowed_roles: upload.allowed_roles,
          download_count: 0,
          version: '1.0',
          is_latest_version: true,
          tags: upload.tags,
          category: upload.category,
          status: 'active',
        })
        .returning('*');

      // Update user storage usage
      await db('users')
        .where({ id: upload.user_id })
        .increment('storage_used', upload.file_size);

      // Mark upload as completed
      await db('chunked_uploads')
        .where({ id: uploadId })
        .update({
          status: 'completed',
          completed_at: new Date(),
        });

      return document;
    } catch (error) {
      logger.error('Chunked upload completion failed:', error);
      
      // Mark upload as failed
      await db('chunked_uploads')
        .where({ id: uploadId })
        .update({
          status: 'failed',
          error_message: error.message,
          updated_at: new Date(),
        });
      
      throw error;
    }
  }

  static async processFile(filePath: string, filename: string, mimeType: string): Promise<{
    pdfPath: string | null;
    thumbnailPath: string | null;
    pdfConverted: boolean;
  }> {
    const pdfPath = path.join(path.dirname(filePath), `${path.parse(filename).name}.pdf`);
    const thumbnailPath = path.join(path.dirname(filePath), `${path.parse(filename).name}_thumb.jpg`);
    
    let pdfConverted = false;

    try {
      // Convert to PDF if it's not already a PDF
      if (mimeType !== 'application/pdf') {
        pdfConverted = await this.convertToPDF(filePath, pdfPath);
      }

      // Create thumbnail
      if (mimeType.startsWith('image/') || pdfConverted) {
        await this.createThumbnail(
          mimeType === 'application/pdf' ? pdfPath : filePath,
          thumbnailPath,
          mimeType === 'application/pdf'
        );
      }

      return {
        pdfPath: pdfConverted ? pdfPath : null,
        thumbnailPath,
        pdfConverted,
      };
    } catch (error) {
      logger.error('File processing failed:', error);
      return {
        pdfPath: null,
        thumbnailPath: null,
        pdfConverted: false,
      };
    }
  }

  private static async convertToPDF(inputPath: string, outputPath: string): Promise<boolean> {
    try {
      // This would use a library like pdf-poppler or similar
      // For now, return false (implementation depends on available tools)
      logger.info(`PDF conversion requested for ${inputPath} -> ${outputPath}`);
      return false;
    } catch (error) {
      logger.error('PDF conversion failed:', error);
      return false;
    }
  }

  private static async createThumbnail(
    inputPath: string,
    outputPath: string,
    isPDF: boolean = false
  ): Promise<void> {
    try {
      let image: sharp.Sharp;

      if (isPDF) {
        // For PDF, we'd use pdf-poppler to extract first page as image
        // For now, skip PDF thumbnail generation
        return;
      } else {
        image = sharp(inputPath);
      }

      await image
        .resize(200, 200, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(outputPath);
    } catch (error) {
      logger.error('Thumbnail creation failed:', error);
    }
  }

  private static async generateDocumentNumber(): Promise<string> {
    const prefix = 'DOC';
    const year = new Date().getFullYear();
    
    const [result] = await db.raw(`
      SELECT '${prefix}${year}' || LPAD((COALESCE(MAX(CAST(SUBSTRING(document_number, 9) AS INTEGER)), 0) + 1)::text, 4, '0') as doc_number
      FROM documents
      WHERE document_number LIKE '${prefix}${year}%'
    `);

    return result.doc_number;
  }

  private static checkFolderPermissions(user: any, folder: any): boolean {
    // Admin can upload anywhere
    if (user.role === 'admin') {
      return true;
    }

    // Manager can upload to non-system folders
    if (user.role === 'manager' && !folder.is_system) {
      return true;
    }

    // Users can only upload to folders where they have write permissions
    if (user.role === 'user') {
      if (folder.is_public) {
        return true;
      }
      
      if (folder.permissions) {
        const permissions = JSON.parse(folder.permissions);
        return permissions[user.role] && permissions[user.role].includes('write');
      }
    }

    return false;
  }

  static async getDocuments(
    userId: string,
    userRole: string,
    filters: any = {}
  ): Promise<{ documents: Document[]; pagination: any }> {
    let query = db('documents')
      .select('*')
      .where('status', 'active');

    // Apply filters
    if (filters.folderId) {
      query = query.where('folder_id', filters.folderId);
    }

    if (filters.search) {
      query = query.where(function() {
        this.where('filename', 'ilike', `%${filters.search}%`)
          .orWhere('original_filename', 'ilike', `%${filters.search}%`)
          .orWhere('description', 'ilike', `%${filters.search}%`);
      });
    }

    if (filters.documentType) {
      query = query.where('document_type', filters.documentType);
    }

    if (filters.tags && filters.tags.length > 0) {
      query = query.whereRaw('tags ?| ?', [JSON.stringify(filters.tags)]);
    }

    if (filters.dateFrom) {
      query = query.where('created_at', '>=', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.where('created_at', '<=', filters.dateTo);
    }

    // Apply access control
    if (userRole !== 'admin') {
      query = query.where(function() {
        this.where('is_public', true)
          .orWhere('uploaded_by', userId)
          .orWhereRaw('allowed_users ?| ?', [userId])
          .orWhereRaw('allowed_roles ?| ?', [userRole]);
      });
    }

    // Count total
    const totalQuery = query.clone().clearSelect().count('* as total');
    const [{ total }] = await totalQuery;

    // Apply pagination
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;
    const offset = (page - 1) * limit;

    const documents = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return {
      documents,
      pagination: {
        page,
        limit,
        total: parseInt(total),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getDocumentById(
    documentId: string,
    userId: string,
    userRole: string
  ): Promise<Document | null> {
    const document = await db('documents')
      .where({ id: documentId, status: 'active' })
      .first();

    if (!document) {
      return null;
    }

    // Check access permissions
    if (userRole !== 'admin') {
      const hasAccess = 
        document.is_public ||
        document.uploaded_by === userId ||
        (document.allowed_users && JSON.parse(document.allowed_users).includes(userId)) ||
        (document.allowed_roles && JSON.parse(document.allowed_roles).includes(userRole));

      if (!hasAccess) {
        throw new Error('Access denied');
      }
    }

    return document;
  }

  static async updateDocument(
    documentId: string,
    userId: string,
    userRole: string,
    updates: any
  ): Promise<Document> {
    const document = await this.getDocumentById(documentId, userId, userRole);
    
    if (!document) {
      throw new Error('Document not found');
    }

    // Check edit permissions
    if (userRole !== 'admin' && document.uploaded_by !== userId) {
      throw new Error('Insufficient permissions to edit this document');
    }

    const [updatedDocument] = await db('documents')
      .where({ id: documentId })
      .update(updates)
      .returning('*');

    return updatedDocument;
  }

  static async deleteDocument(
    documentId: string,
    userId: string,
    userRole: string
  ): Promise<void> {
    const document = await this.getDocumentById(documentId, userId, userRole);
    
    if (!document) {
      throw new Error('Document not found');
    }

    // Check delete permissions
    if (userRole !== 'admin' && document.uploaded_by !== userId) {
      throw new Error('Insufficient permissions to delete this document');
    }

    // Soft delete
    await db('documents')
      .where({ id: documentId })
      .update({
        status: 'deleted',
        archive_reason: 'Deleted by user',
        updated_at: new Date(),
      });

    // Update user storage usage
    await db('users')
      .where({ id: document.uploaded_by })
      .decrement('storage_used', document.file_size);
  }

  static async downloadDocument(
    documentId: string,
    userId: string,
    userRole: string
  ): Promise<{ filePath: string; filename: string; mimeType: string }> {
    const document = await this.getDocumentById(documentId, userId, userRole);
    
    if (!document) {
      throw new Error('Document not found');
    }

    // Increment download count
    await db('documents')
      .where({ id: documentId })
      .update({
        download_count: document.download_count + 1,
        last_downloaded: new Date(),
      });

    return {
      filePath: document.file_path,
      filename: document.original_filename,
      mimeType: document.mime_type,
    };
  }
}
