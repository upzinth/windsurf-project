import { Router, Response } from 'express';
import { body, validationResult, query } from 'express-validator';
import { DocumentService } from '@/services/documentService';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthRequest } from '@/middleware/auth';
import db from '@/config/database';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

// GET /api/documents - Get documents with filtering
router.get('/', [
  query('folderId').optional().isUUID(),
  query('search').optional().isString(),
  query('documentType').optional().isString(),
  query('tags').optional().isString(),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sortBy').optional().isIn(['created_at', 'filename', 'file_size', 'download_count']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
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
    folderId: req.query.folderId as string,
    search: req.query.search as string,
    documentType: req.query.documentType as string,
    tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
    dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
    dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
    page: req.query.page as string,
    limit: req.query.limit as string,
    sortBy: req.query.sortBy as string,
    sortOrder: req.query.sortOrder as string,
  };

  const result = await DocumentService.getDocuments(req.user!.id, req.user!.role, filters);

  res.json({
    success: true,
    data: result,
  });
}));

// POST /api/documents/upload - Upload document
router.post('/upload', DocumentService.getUploadMiddleware(), asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  try {
    const options = {
      folder_id: req.body.folder_id,
      description: req.body.description,
      tags: req.body.tags ? (req.body.tags as string).split(',') : undefined,
      category: req.body.category,
      document_type: req.body.document_type,
      document_date: req.body.document_date ? new Date(req.body.document_date) : undefined,
      expiry_date: req.body.expiry_date ? new Date(req.body.expiry_date) : undefined,
      is_public: req.body.is_public === 'true',
      allowed_users: req.body.allowed_users ? (req.body.allowed_users as string).split(',') : undefined,
      allowed_roles: req.body.allowed_roles ? (req.body.allowed_roles as string).split(',') : undefined,
    };

    const document = await DocumentService.uploadDocument(req, options);

    res.status(201).json({
      success: true,
      data: document,
      message: 'Document uploaded successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}));

// POST /api/documents/upload/initiate - Initiate chunked upload
router.post('/upload/initiate', [
  body('folderId').isUUID(),
  body('originalFilename').isString(),
  body('fileSize').isInt({ min: 1 }),
  body('mimeType').isString(),
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
    const options = {
      folder_id: req.body.folderId,
      description: req.body.description,
      tags: req.body.tags ? (req.body.tags as string).split(',') : undefined,
      category: req.body.category,
      document_type: req.body.document_type,
      document_date: req.body.document_date ? new Date(req.body.document_date) : undefined,
      expiry_date: req.body.expiry_date ? new Date(req.body.expiry_date) : undefined,
      is_public: req.body.is_public === 'true',
      allowed_users: req.body.allowed_users ? (req.body.allowed_users as string).split(',') : undefined,
      allowed_roles: req.body.allowed_roles ? (req.body.allowed_roles as string).split(',') : undefined,
    };

    const result = await DocumentService.initiateChunkedUpload(req, options);

    res.json({
      success: true,
      data: result,
      message: 'Chunked upload initiated',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}));

// POST /api/documents/upload/chunk - Upload chunk
router.post('/upload/chunk', [
  body('uploadId').isUUID(),
  body('chunkIndex').isInt({ min: 0 }),
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
    const { uploadId, chunkIndex } = req.body;
    const chunkData = req.body.chunk; // This would be sent as binary data

    await DocumentService.uploadChunk(uploadId, chunkIndex, chunkData);

    res.json({
      success: true,
      message: 'Chunk uploaded successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}));

// POST /api/documents/upload/complete - Complete chunked upload
router.post('/upload/complete', [
  body('uploadId').isUUID(),
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
    const { uploadId } = req.body;
    const document = await DocumentService.completeChunkedUpload(uploadId);

    res.status(201).json({
      success: true,
      data: document,
      message: 'Document uploaded successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}));

// POST /api/documents/search - Advanced search
router.post('/search', [
  body('query').optional().isString(),
  body('filters').optional().isObject(),
  body('pagination').optional().isObject(),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const { query, filters, pagination } = req.body;
  const searchFilters = {
    ...filters,
    ...pagination,
    search: query,
  };

  const result = await DocumentService.getDocuments(req.user!.id, req.user!.role, searchFilters);

  res.json({
    success: true,
    data: result,
  });
}));

// GET /api/documents/:id - Get document by ID
router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const document = await DocumentService.getDocumentById(id, req.user!.id, req.user!.role);

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    res.status(403).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/documents/:id/download - Download document
router.get('/:id/download', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const { filePath, filename, mimeType } = await DocumentService.downloadDocument(
      id,
      req.user!.id,
      req.user!.role
    );

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }

    // Set headers for download
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', (await fs.stat(filePath)).size);

    // Stream file
    const fileStream = await fs.open(filePath, 'r');
    fileStream.createReadStream().pipe(res);
  } catch (error) {
    res.status(403).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/documents/:id/preview - Preview document (PDF only)
router.get('/:id/preview', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const document = await DocumentService.getDocumentById(id, req.user!.id, req.user!.role);

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    // Only PDF preview is supported for now
    if (document.mime_type !== 'application/pdf' && !document.pdf_converted) {
      return res.status(400).json({
        success: false,
        error: 'Preview not available for this file type',
      });
    }

    const previewPath = document.pdf_path || document.file_path;

    // Check if file exists
    try {
      await fs.access(previewPath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'Preview file not found',
      });
    }

    // Set headers for inline display
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Content-Length', (await fs.stat(previewPath)).size);

    // Stream file
    const fileStream = await fs.open(previewPath, 'r');
    fileStream.createReadStream().pipe(res);
  } catch (error) {
    res.status(403).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/documents/:id/thumbnail - Get document thumbnail
router.get('/:id/thumbnail', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const document = await DocumentService.getDocumentById(id, req.user!.id, req.user!.role);

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    if (!document.thumbnail_path) {
      return res.status(404).json({
        success: false,
        error: 'Thumbnail not available',
      });
    }

    // Check if thumbnail exists
    try {
      await fs.access(document.thumbnail_path);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'Thumbnail file not found',
      });
    }

    // Set headers for image
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.setHeader('Content-Length', (await fs.stat(document.thumbnail_path)).size);

    // Stream image
    const fileStream = await fs.open(document.thumbnail_path, 'r');
    fileStream.createReadStream().pipe(res);
  } catch (error) {
    res.status(403).json({
      success: false,
      error: error.message,
    });
  }
}));

// PUT /api/documents/:id - Update document metadata
router.put('/:id', [
  body('description').optional().isString(),
  body('tags').optional().isString(),
  body('category').optional().isString(),
  body('document_type').optional().isString(),
  body('document_date').optional().isISO8601(),
  body('expiry_date').optional().isISO8601(),
  body('is_public').optional().isBoolean(),
  body('allowed_users').optional().isString(),
  body('allowed_roles').optional().isString(),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const { id } = req.params;

  try {
    const updates = {
      description: req.body.description,
      tags: req.body.tags ? (req.body.tags as string).split(',') : undefined,
      category: req.body.category,
      document_type: req.body.document_type,
      document_date: req.body.document_date ? new Date(req.body.document_date) : undefined,
      expiry_date: req.body.expiry_date ? new Date(req.body.expiry_date) : undefined,
      is_public: req.body.is_public,
      allowed_users: req.body.allowed_users ? (req.body.allowed_users as string).split(',') : undefined,
      allowed_roles: req.body.allowed_roles ? (req.body.allowed_roles as string).split(',') : undefined,
    };

    const document = await DocumentService.updateDocument(id, req.user!.id, req.user!.role, updates);

    res.json({
      success: true,
      data: document,
      message: 'Document updated successfully',
    });
  } catch (error) {
    res.status(403).json({
      success: false,
      error: error.message,
    });
  }
}));

// DELETE /api/documents/:id - Delete document
router.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    await DocumentService.deleteDocument(id, req.user!.id, req.user!.role);

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    res.status(403).json({
      success: false,
      error: error.message,
    });
  }
}));

export default router;
