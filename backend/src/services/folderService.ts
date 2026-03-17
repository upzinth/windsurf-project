import db from '@/config/database';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { Folder, AuthRequest } from '@/types';

export class FolderService {
  static async createFolder(
    userId: string,
    userRole: string,
    folderData: {
      name: string;
      description?: string;
      parent_id?: string;
      permissions?: Record<string, string[]>;
      is_public?: boolean;
      max_file_size?: number;
      allowed_file_types?: string[];
    }
  ): Promise<Folder> {
    // Check parent folder permissions if specified
    if (folderData.parent_id) {
      const parentFolder = await this.getFolderById(folderData.parent_id, userId, userRole);
      if (!parentFolder) {
        throw new Error('Parent folder not found');
      }

      if (!this.checkFolderPermissions(userRole, parentFolder, 'create')) {
        throw new Error('Insufficient permissions to create folder in this location');
      }
    }

    // Generate unique path
    let path = '/';
    if (folderData.parent_id) {
      const parentPath = await this.getFolderPath(folderData.parent_id);
      path = `${parentPath}${folderData.name}/`;
    } else {
      path = `/${folderData.name}/`;
    }

    // Check for duplicate folder name in same parent
    const existingFolder = await db('folders')
      .where({ 
        parent_id: folderData.parent_id || null,
        name: folderData.name 
      })
      .first();

    if (existingFolder) {
      throw new Error('Folder with this name already exists in this location');
    }

    // Calculate folder level
    const level = folderData.parent_id 
      ? await this.getFolderLevel(folderData.parent_id) + 1 
      : 0;

    const [folder] = await db('folders')
      .insert({
        id: uuidv4(),
        name: folderData.name,
        description: folderData.description || null,
        parent_id: folderData.parent_id || null,
        created_by: userId,
        path,
        level,
        permissions: folderData.permissions || null,
        is_public: folderData.is_public || false,
        is_system: false,
        max_file_size: folderData.max_file_size || 104857600, // 100MB default
        allowed_file_types: folderData.allowed_file_types ? JSON.stringify(folderData.allowed_file_types) : null,
      })
      .returning('*');

    return folder;
  }

  static async getFolders(
    userId: string,
    userRole: string,
    filters: {
      parent_id?: string;
      search?: string;
      include_system?: boolean;
    } = {}
  ): Promise<Folder[]> {
    let query = db('folders').select('*');

    // Apply filters
    if (filters.parent_id !== undefined) {
      query = query.where('parent_id', filters.parent_id);
    }

    if (filters.search) {
      query = query.where(function() {
        this.where('name', 'ilike', `%${filters.search}%`)
          .orWhere('description', 'ilike', `%${filters.search}%`);
      });
    }

    if (!filters.include_system) {
      query = query.where('is_system', false);
    }

    // Apply access control for non-admin users
    if (userRole !== 'admin') {
      query = query.where(function() {
        this.where('is_public', true)
          .orWhere('created_by', userId);
      });
    }

    const folders = await query.orderBy('name', 'asc');
    
    return folders;
  }

  static async getFolderById(
    folderId: string,
    userId: string,
    userRole: string
  ): Promise<Folder | null> {
    const folder = await db('folders')
      .where({ id: folderId })
      .first();

    if (!folder) {
      return null;
    }

    // Check access permissions
    if (!this.checkFolderPermissions(userRole, folder, 'read')) {
      throw new Error('Access denied');
    }

    return folder;
  }

  static async updateFolder(
    folderId: string,
    userId: string,
    userRole: string,
    updates: {
      name?: string;
      description?: string;
      permissions?: Record<string, string[]>;
      is_public?: boolean;
      max_file_size?: number;
      allowed_file_types?: string[];
    }
  ): Promise<Folder> {
    const folder = await this.getFolderById(folderId, userId, userRole);
    
    if (!folder) {
      throw new Error('Folder not found');
    }

    // Check edit permissions
    if (!this.checkFolderPermissions(userRole, folder, 'edit')) {
      throw new Error('Insufficient permissions to edit this folder');
    }

    // Prevent editing system folders
    if (folder.is_system) {
      throw new Error('Cannot edit system folders');
    }

    // Check for duplicate name if name is being changed
    if (updates.name && updates.name !== folder.name) {
      const existingFolder = await db('folders')
        .where({ 
          parent_id: folder.parent_id,
          name: updates.name 
        })
        .whereNot('id', folderId)
        .first();

      if (existingFolder) {
        throw new Error('Folder with this name already exists in this location');
      }
    }

    const [updatedFolder] = await db('folders')
      .where({ id: folderId })
      .update(updates)
      .returning('*');

    return updatedFolder;
  }

  static async deleteFolder(
    folderId: string,
    userId: string,
    userRole: string
  ): Promise<void> {
    const folder = await this.getFolderById(folderId, userId, userRole);
    
    if (!folder) {
      throw new Error('Folder not found');
    }

    // Check delete permissions
    if (!this.checkFolderPermissions(userRole, folder, 'delete')) {
      throw new Error('Insufficient permissions to delete this folder');
    }

    // Prevent deleting system folders
    if (folder.is_system) {
      throw new Error('Cannot delete system folders');
    }

    // Check if folder has contents
    const documentsCount = await db('documents')
      .where({ folder_id: folderId, status: 'active' })
      .count('* as count')
      .first();

    const subFoldersCount = await db('folders')
      .where({ parent_id: folderId })
      .count('* as count')
      .first();

    if (parseInt(documentsCount.count) > 0 || parseInt(subFoldersCount.count) > 0) {
      throw new Error('Cannot delete folder that contains files or subfolders');
    }

    // Soft delete
    await db('folders')
      .where({ id: folderId })
      .update({ 
        status: 'deleted',
        updated_at: new Date()
      });
  }

  static async moveFolder(
    folderId: string,
    newParentId: string,
    userId: string,
    userRole: string
  ): Promise<Folder> {
    const folder = await this.getFolderById(folderId, userId, userRole);
    
    if (!folder) {
      throw new Error('Folder not found');
    }

    // Check move permissions
    if (!this.checkFolderPermissions(userRole, folder, 'move')) {
      throw new Error('Insufficient permissions to move this folder');
    }

    // Check new parent folder permissions
    const newParent = await this.getFolderById(newParentId, userId, userRole);
    if (!newParent) {
      throw new Error('Destination folder not found');
    }

    if (!this.checkFolderPermissions(userRole, newParent, 'create')) {
      throw new Error('Insufficient permissions to move folder to this location');
    }

    // Check for duplicate name in destination
    const existingFolder = await db('folders')
      .where({ 
        parent_id: newParentId,
        name: folder.name 
      })
      .whereNot('id', folderId)
      .first();

    if (existingFolder) {
      throw new Error('Folder with this name already exists in destination');
    }

    // Update folder path and parent
    const newPath = await this.getFolderPath(newParentId) + folder.name + '/';
    const newLevel = await this.getFolderLevel(newParentId) + 1;

    const [updatedFolder] = await db('folders')
      .where({ id: folderId })
      .update({
        parent_id: newParentId,
        path: newPath,
        level: newLevel,
        updated_at: new Date()
      })
      .returning('*');

    return updatedFolder;
  }

  static async getFolderTree(
    userId: string,
    userRole: string,
    rootFolderId?: string
  ): Promise<Folder[]> {
    let query = db('folders').select('*');

    if (rootFolderId) {
      // Get specific subtree
      query = query.where('path', 'like', `${await this.getFolderPath(rootFolderId)}%`);
    }

    // Apply access control
    if (userRole !== 'admin') {
      query = query.where(function() {
        this.where('is_public', true)
          .orWhere('created_by', userId);
      });
    }

    query = query.where('is_system', false).orderBy('path', 'asc');

    const folders = await query;
    
    // Build tree structure
    const folderMap = new Map();
    folders.forEach(folder => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });

    const rootFolders = [];
    folders.forEach(folder => {
      if (folder.parent_id) {
        const parent = folderMap.get(folder.parent_id);
        if (parent) {
          parent.children.push(folder);
        }
      } else {
        rootFolders.push(folder);
      }
    });

    return rootFolders;
  }

  static async getFolderPath(folderId: string): Promise<string> {
    const folder = await db('folders')
      .where({ id: folderId })
      .first();
    
    return folder ? folder.path : '/';
  }

  static async getFolderLevel(folderId: string): Promise<number> {
    const folder = await db('folders')
      .where({ id: folderId })
      .first();
    
    return folder ? folder.level : 0;
  }

  static async getFolderStats(
    folderId: string,
    userId: string,
    userRole: string
  ): Promise<{
    totalFiles: number;
    totalSize: number;
    fileTypes: Record<string, number>;
    recentFiles: any[];
  }> {
    const folder = await this.getFolderById(folderId, userId, userRole);
    
    if (!folder) {
      throw new Error('Folder not found');
    }

    // Get all files in folder and subfolders
    const folderPath = await this.getFolderPath(folderId);
    
    const files = await db('documents')
      .where('status', 'active')
      .whereRaw('file_path LIKE ?', [`${folderPath}%`])
      .select('*');

    const totalFiles = files.length;
    const totalSize = files.reduce((sum, file) => sum + file.file_size, 0);

    // Count file types
    const fileTypes: Record<string, number> = {};
    files.forEach(file => {
      const ext = file.mime_type.split('/')[1] || 'unknown';
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    });

    // Get recent files (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentFiles = files
      .filter(file => new Date(file.created_at) >= sevenDaysAgo)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);

    return {
      totalFiles,
      totalSize,
      fileTypes,
      recentFiles,
    };
  }

  private static checkFolderPermissions(
    userRole: string,
    folder: Folder,
    action: 'read' | 'create' | 'edit' | 'delete' | 'move'
  ): boolean {
    // Admin can do everything
    if (userRole === 'admin') {
      return true;
    }

    // System folders have restricted access
    if (folder.is_system) {
      return false;
    }

    // Check folder permissions if set
    if (folder.permissions) {
      const permissions = JSON.parse(folder.permissions);
      const userPermissions = permissions[userRole] || [];
      return userPermissions.includes(action);
    }

    // Default permissions based on folder visibility
    if (folder.is_public) {
      return ['read'].includes(action);
    }

    // Folder owner can do everything
    if (userRole === 'manager') {
      return true;
    }

    // Users can only read public folders
    return ['read'].includes(action);
  }

  static async createSystemFolders(): Promise<void> {
    const systemFolders = [
      {
        name: 'Root',
        description: 'Root folder for all documents',
        parent_id: null,
        path: '/',
        level: 0,
        is_system: true,
        is_public: true,
      },
      {
        name: 'Shared',
        description: 'Shared documents folder',
        parent_id: null,
        path: '/Shared/',
        level: 0,
        is_system: true,
        is_public: true,
      },
      {
        name: 'Trash',
        description: 'Deleted items folder',
        parent_id: null,
        path: '/Trash/',
        level: 0,
        is_system: true,
        is_public: false,
      }
    ];

    for (const folderData of systemFolders) {
      const existing = await db('folders')
        .where({ name: folderData.name, is_system: true })
        .first();

      if (!existing) {
        await db('folders').insert({
          id: uuidv4(),
          ...folderData,
          created_by: null, // System folders don't have a creator
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    }
  }

  static async emptyTrash(userId: string, userRole: string): Promise<void> {
    if (userRole !== 'admin') {
      throw new Error('Only administrators can empty trash');
    }

    // Get trash folder
    const trashFolder = await db('folders')
      .where({ name: 'Trash', is_system: true })
      .first();

    if (!trashFolder) {
      throw new Error('Trash folder not found');
    }

    // Permanently delete all items in trash
    const trashPath = await this.getFolderPath(trashFolder.id);
    
    await db('documents')
      .where('status', 'deleted')
      .whereRaw('file_path LIKE ?', [`${trashPath}%`])
      .del();

    await db('folders')
      .where('status', 'deleted')
      .whereRaw('path LIKE ?', [`${trashPath}%`])
      .del();
  }

  static async restoreFromTrash(
    itemId: string,
    itemType: 'folder' | 'document',
    userId: string,
    userRole: string
  ): Promise<void> {
    if (userRole !== 'admin' && userRole !== 'manager') {
      throw new Error('Insufficient permissions to restore items');
    }

    if (itemType === 'folder') {
      const folder = await db('folders')
        .where({ id: itemId, status: 'deleted' })
        .first();

      if (!folder) {
        throw new Error('Folder not found in trash');
      }

      // Check if original parent still exists
      if (folder.parent_id) {
        const parentExists = await db('folders')
          .where({ id: folder.parent_id, status: 'active' })
          .first();

        if (!parentExists) {
          throw new Error('Original parent folder no longer exists');
        }
      }

      await db('folders')
        .where({ id: itemId })
        .update({ status: 'active', updated_at: new Date() });
    } else {
      const document = await db('documents')
        .where({ id: itemId, status: 'deleted' })
        .first();

      if (!document) {
        throw new Error('Document not found in trash');
      }

      await db('documents')
        .where({ id: itemId })
        .update({ status: 'active', updated_at: new Date() });
    }
  }
}
