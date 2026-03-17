import { Router, Response } from 'express';
import { body, validationResult, query } from 'express-validator';
import { FolderService } from '@/services/folderService';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthRequest } from '@/middleware/auth';

const router = Router();

// GET /api/folders - Get folders with filtering
router.get('/', [
  query('parentId').optional().isUUID(),
  query('search').optional().isString(),
  query('includeSystem').optional().isBoolean(),
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
    parent_id: req.query.parentId as string,
    search: req.query.search as string,
    include_system: req.query.includeSystem === 'true',
  };

  const folders = await FolderService.getFolders(req.user!.id, req.user!.role, filters);

  res.json({
    success: true,
    data: folders,
  });
}));

// GET /api/folders/tree - Get folder tree structure
router.get('/tree', [
  query('rootFolderId').optional().isUUID(),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const tree = await FolderService.getFolderTree(
    req.user!.id,
    req.user!.role,
    req.query.rootFolderId as string
  );

  res.json({
    success: true,
    data: tree,
  });
}));

// POST /api/folders - Create new folder
router.post('/', [
  body('name').trim().isLength({ min: 1, max: 255 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('parentId').optional().isUUID(),
  body('permissions').optional().isObject(),
  body('isPublic').optional().isBoolean(),
  body('maxFileSize').optional().isInt({ min: 1024, max: 1073741824 }), // 1KB to 1GB
  body('allowedFileTypes').optional().isArray(),
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
    const folderData = {
      name: req.body.name,
      description: req.body.description,
      parent_id: req.body.parentId,
      permissions: req.body.permissions,
      is_public: req.body.isPublic,
      max_file_size: req.body.maxFileSize,
      allowed_file_types: req.body.allowedFileTypes,
    };

    const folder = await FolderService.createFolder(req.user!.id, req.user!.role, folderData);

    res.status(201).json({
      success: true,
      data: folder,
      message: 'Folder created successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/folders/:id - Get folder by ID
router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const folder = await FolderService.getFolderById(id, req.user!.id, req.user!.role);

    if (!folder) {
      return res.status(404).json({
        success: false,
        error: 'Folder not found',
      });
    }

    res.json({
      success: true,
      data: folder,
    });
  } catch (error) {
    res.status(403).json({
      success: false,
      error: error.message,
    });
  }
}));

// PUT /api/folders/:id - Update folder
router.put('/:id', [
  body('name').optional().trim().isLength({ min: 1, max: 255 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('permissions').optional().isObject(),
  body('isPublic').optional().isBoolean(),
  body('maxFileSize').optional().isInt({ min: 1024, max: 1073741824 }),
  body('allowedFileTypes').optional().isArray(),
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
      name: req.body.name,
      description: req.body.description,
      permissions: req.body.permissions,
      is_public: req.body.isPublic,
      max_file_size: req.body.maxFileSize,
      allowed_file_types: req.body.allowedFileTypes,
    };

    const folder = await FolderService.updateFolder(id, req.user!.id, req.user!.role, updates);

    res.json({
      success: true,
      data: folder,
      message: 'Folder updated successfully',
    });
  } catch (error) {
    res.status(403).json({
      success: false,
      error: error.message,
    });
  }
}));

// DELETE /api/folders/:id - Delete folder
router.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    await FolderService.deleteFolder(id, req.user!.id, req.user!.role);

    res.json({
      success: true,
      message: 'Folder deleted successfully',
    });
  } catch (error) {
    res.status(403).json({
      success: false,
      error: error.message,
    });
  }
}));

// POST /api/folders/:id/move - Move folder to new parent
router.post('/:id/move', [
  body('newParentId').isUUID(),
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
  const { newParentId } = req.body;

  try {
    const folder = await FolderService.moveFolder(id, newParentId, req.user!.id, req.user!.role);

    res.json({
      success: true,
      data: folder,
      message: 'Folder moved successfully',
    });
  } catch (error) {
    res.status(403).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/folders/:id/stats - Get folder statistics
router.get('/:id/stats', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const stats = await FolderService.getFolderStats(id, req.user!.id, req.user!.role);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(403).json({
      success: false,
      error: error.message,
    });
  }
}));

// POST /api/folders/init-system - Initialize system folders (Admin only)
router.post('/init-system', asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  }

  try {
    await FolderService.createSystemFolders();

    res.json({
      success: true,
      message: 'System folders initialized successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// POST /api/folders/trash/empty - Empty trash (Admin only)
router.post('/trash/empty', asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  }

  try {
    await FolderService.emptyTrash(req.user!.id, req.user!.role);

    res.json({
      success: true,
      message: 'Trash emptied successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// GET /api/folders/trash - Get trash contents
router.get('/trash', asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  }

  try {
    // Get trash folder
    const trashFolder = await db('folders')
      .where({ name: 'Trash', is_system: true })
      .first();

    if (!trashFolder) {
      return res.json({
        success: true,
        data: { folders: [], documents: [] },
      });
    }

    const trashPath = await FolderService.getFolderPath(trashFolder.id);

    // Get deleted folders
    const folders = await db('folders')
      .where('status', 'deleted')
      .whereRaw('path LIKE ?', [`${trashPath}%`])
      .select('*');

    // Get deleted documents
    const documents = await db('documents')
      .where('status', 'deleted')
      .whereRaw('file_path LIKE ?', [`${trashPath}%`])
      .select('*');

    res.json({
      success: true,
      data: { folders, documents },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

// POST /api/folders/trash/restore - Restore item from trash
router.post('/trash/restore', [
  body('itemId').isUUID(),
  body('itemType').isIn(['folder', 'document']),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  const { itemId, itemType } = req.body;

  try {
    await FolderService.restoreFromTrash(itemId, itemType, req.user!.id, req.user!.role);

    res.json({
      success: true,
      message: 'Item restored successfully',
    });
  } catch (error) {
    res.status(403).json({
      success: false,
      error: error.message,
    });
  }
}));

export default router;
