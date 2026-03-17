import { v4 as uuidv4 } from 'uuid';
import db from '@/config/database';
import { logger } from '@/utils/logger';
import { SearchFilters, PaginationParams, AuthRequest } from '@/types';

export class SearchService {
  static async searchDocuments(
    userId: string,
    userRole: string,
    filters: SearchFilters,
    pagination: PaginationParams
  ): Promise<{
    documents: any[];
    total: number;
    facets: any;
    suggestions: string[];
  }> {
    let query = db('documents')
      .leftJoin('folders', 'documents.folder_id', 'folders.id')
      .leftJoin('users', 'documents.uploaded_by', 'users.id')
      .select(
        'documents.*',
        'folders.name as folder_name',
        'users.first_name as uploader_first_name',
        'users.last_name as uploader_last_name',
        'users.email as uploader_email'
      )
      .where('documents.status', 'active');

    // Apply access control
    if (userRole !== 'admin') {
      query = query.where(function () {
        this.where('documents.is_public', true)
          .orWhere('documents.uploaded_by', userId)
          .orWhereRaw('documents.allowed_users ?| ?', [userId])
          .orWhereRaw('documents.allowed_roles ?| ?', [userRole]);
      });
    }

    // Apply search filters
    if (filters.query) {
      query = query.where(function () {
        this.where('documents.original_filename', 'ilike', `%${filters.query}%`)
          .orWhere('documents.description', 'ilike', `%${filters.query}%`)
          .orWhere('documents.tags', 'ilike', `%${filters.query}%`)
          .orWhere('documents.document_number', 'ilike', `%${filters.query}%`);
      });
    }

    if (filters.folder_id) {
      query = query.where('documents.folder_id', filters.folder_id);
    }

    if (filters.document_type) {
      query = query.where('documents.document_type', filters.document_type);
    }

    if (filters.category) {
      query = query.where('documents.category', filters.category);
    }

    if (filters.tags && filters.tags.length > 0) {
      query = query.where(function () {
        filters.tags.forEach((tag: string) => {
          this.orWhere('documents.tags', 'ilike', `%${tag}%`);
        });
      });
    }

    if (filters.date_from) {
      query = query.where('documents.created_at', '>=', filters.date_from);
    }

    if (filters.date_to) {
      query = query.where('documents.created_at', '<=', filters.date_to);
    }

    if (filters.document_date_from) {
      query = query.where('documents.document_date', '>=', filters.document_date_from);
    }

    if (filters.document_date_to) {
      query = query.where('documents.document_date', '<=', filters.document_date_to);
    }

    if (filters.expiry_date_from) {
      query = query.where('documents.expiry_date', '>=', filters.expiry_date_from);
    }

    if (filters.expiry_date_to) {
      query = query.where('documents.expiry_date', '<=', filters.expiry_date_to);
    }

    if (filters.uploaded_by) {
      query = query.where('documents.uploaded_by', filters.uploaded_by);
    }

    if (filters.file_size_min) {
      query = query.where('documents.file_size', '>=', filters.file_size_min);
    }

    if (filters.file_size_max) {
      query = query.where('documents.file_size', '<=', filters.file_size_max);
    }

    if (filters.mime_type) {
      query = query.where('documents.mime_type', 'ilike', `${filters.mime_type}%`);
    }

    // Count total for pagination
    const totalQuery = query.clone().clearSelect().count('* as total');
    const [{ total }] = await totalQuery;

    // Apply sorting
    const sortBy = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'desc';
    query = query.orderBy(`documents.${sortBy}`, sortOrder);

    // Apply pagination
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const offset = (page - 1) * limit;

    const documents = await query
      .limit(limit)
      .offset(offset);

    // Generate facets
    const facets = await this.generateSearchFacets(userId, userRole, filters);

    // Generate suggestions
    const suggestions = await this.generateSearchSuggestions(filters.query);

    return {
      documents,
      total: parseInt(total),
      facets,
      suggestions,
    };
  }

  static async generateSearchFacets(
    userId: string,
    userRole: string,
    filters: SearchFilters
  ): Promise<any> {
    let baseQuery = db('documents')
      .leftJoin('folders', 'documents.folder_id', 'folders.id')
      .where('documents.status', 'active');

    // Apply access control
    if (userRole !== 'admin') {
      baseQuery = baseQuery.where(function () {
        this.where('documents.is_public', true)
          .orWhere('documents.uploaded_by', userId)
          .orWhereRaw('documents.allowed_users ?| ?', [userId])
          .orWhereRaw('documents.allowed_roles ?| ?', [userRole]);
      });
    }

    // Apply same filters as main search (except text search)
    if (filters.folder_id) {
      baseQuery = baseQuery.where('documents.folder_id', filters.folder_id);
    }

    if (filters.date_from) {
      baseQuery = baseQuery.where('documents.created_at', '>=', filters.date_from);
    }

    if (filters.date_to) {
      baseQuery = baseQuery.where('documents.created_at', '<=', filters.date_to);
    }

    // Document types facet
    const documentTypes = await baseQuery.clone()
      .select('document_type')
      .count('* as count')
      .groupBy('document_type')
      .orderBy('count', 'desc');

    // Categories facet
    const categories = await baseQuery.clone()
      .select('category')
      .count('* as count')
      .whereNotNull('category')
      .groupBy('category')
      .orderBy('count', 'desc');

    // Tags facet
    const tagsResult = await baseQuery.clone()
      .whereNotNull('tags')
      .selectRaw('unnest(string_to_array(tags)) as tag')
      .count('* as count')
      .groupBy('tag')
      .orderBy('count', 'desc')
      .limit(20);

    const tags = tagsResult.map((row: any) => ({
      tag: row.tag,
      count: parseInt(row.count),
    }));

    // Uploaders facet
    const uploaders = await baseQuery.clone()
      .select(
        'documents.uploaded_by as user_id',
        db.raw('users.first_name || \' \' || users.last_name as uploader_name'),
        'users.email'
      )
      .leftJoin('users', 'documents.uploaded_by', 'users.id')
      .count('* as count')
      .groupBy('documents.uploaded_by', 'users.first_name', 'users.last_name', 'users.email')
      .orderBy('count', 'desc')
      .limit(10);

    // File size ranges facet
    const fileSizeRanges = await baseQuery.clone()
      .selectRaw(`
        CASE 
          WHEN file_size < 1048576 THEN '< 1MB'
          WHEN file_size < 10485760 THEN '1-10MB'
          WHEN file_size < 52428800 THEN '10-50MB'
          WHEN file_size < 104857600 THEN '50-100MB'
          ELSE '> 100MB'
        END as size_range
      `)
      .count('* as count')
      .groupByRaw(`
        CASE 
          WHEN file_size < 1048576 THEN 1
          WHEN file_size < 10485760 THEN 2
          WHEN file_size < 52428800 THEN 3
          WHEN file_size < 104857600 THEN 4
          ELSE 5
        END
      `)
      .orderBy('count', 'desc');

    return {
      documentTypes,
      categories,
      tags,
      uploaders,
      fileSizeRanges,
    };
  }

  static async generateSearchSuggestions(query?: string): Promise<string[]> {
    if (!query || query.length < 2) {
      return [];
    }

    // Get recent searches (would be stored in Redis or database)
    const recentSearches = await db('search_history')
      .where('user_id', 'global') // Global search history
      .where('search_term', 'ilike', `${query}%`)
      .distinct('search_term')
      .orderBy('search_count', 'desc')
      .limit(10);

    const suggestions = recentSearches.map((row: any) => row.search_term);

    // Also suggest from document names
    const documentSuggestions = await db('documents')
      .where('status', 'active')
      .where('original_filename', 'ilike', `${query}%`)
      .distinct('original_filename')
      .orderBy('download_count', 'desc')
      .limit(5);

    documentSuggestions.forEach((doc: any) => {
      if (!suggestions.includes(doc.original_filename)) {
        suggestions.push(doc.original_filename);
      }
    });

    return suggestions.slice(0, 10);
  }

  static async saveSearchHistory(
    userId: string,
    searchTerm: string,
    filters: SearchFilters
  ): Promise<void> {
    // Save to search history for analytics
    await db('search_history')
      .insert({
        id: uuidv4(),
        user_id: userId,
        search_term: searchTerm,
        filters: JSON.stringify(filters),
        search_count: 1,
        last_searched: new Date(),
      })
      .onConflict(['user_id', 'search_term'])
      .merge({
        search_count: db.raw('search_history.search_count + 1'),
        last_searched: new Date(),
      });
  }

  static async getSearchHistory(
    userId: string,
    limit: number = 10
  ): Promise<any[]> {
    return await db('search_history')
      .where('user_id', userId)
      .orderBy('last_searched', 'desc')
      .limit(limit)
      .select('*');
  }

  static async getPopularSearches(limit: number = 20): Promise<any[]> {
    return await db('search_history')
      .where('user_id', 'global')
      .orderBy('search_count', 'desc')
      .limit(limit)
      .select('*');
  }

  static async searchFolders(
    userId: string,
    userRole: string,
    query: string,
    filters: {
      parentId?: string;
      includeSystem?: boolean;
    } = {}
  ): Promise<any[]> {
    let dbQuery = db('folders')
      .leftJoin('users', 'folders.created_by', 'users.id')
      .select(
        'folders.*',
        'users.first_name as creator_first_name',
        'users.last_name as creator_last_name'
      )
      .where('folders.status', 'active');

    // Apply access control
    if (userRole !== 'admin') {
      dbQuery = dbQuery.where(function () {
        this.where('folders.is_public', true)
          .orWhere('folders.created_by', userId);
      });
    }

    // Apply parent filter
    if (filters.parentId !== undefined) {
      dbQuery = dbQuery.where('folders.parent_id', filters.parentId);
    }

    // Apply system folder filter
    if (!filters.includeSystem) {
      dbQuery = dbQuery.where('folders.is_system', false);
    }

    // Apply search query
    if (query) {
      dbQuery = dbQuery.where(function () {
        this.where('folders.name', 'ilike', `%${query}%`)
          .orWhere('folders.description', 'ilike', `%${query}%`);
      });
    }

    return await dbQuery.orderBy('folders.name', 'asc');
  }

  static async searchUsers(
    userRole: string,
    query: string,
    filters: {
      role?: string;
      department?: string;
      isActive?: boolean;
    } = {}
  ): Promise<any[]> {
    if (userRole !== 'admin') {
      throw new Error('Access denied');
    }

    let dbQuery = db('users')
      .select('*')
      .where('id', '!=', 'system'); // Exclude system user

    // Apply search query
    if (query) {
      dbQuery = dbQuery.where(function () {
        this.where('first_name', 'ilike', `%${query}%`)
          .orWhere('last_name', 'ilike', `%${query}%`)
          .orWhere('email', 'ilike', `%${query}%`)
          .orWhere(db.raw('first_name || \' \' || last_name', 'ilike', `%${query}%`));
      });
    }

    // Apply filters
    if (filters.role) {
      dbQuery = dbQuery.where('role', filters.role);
    }

    if (filters.department) {
      dbQuery = dbQuery.where('department', 'ilike', `%${filters.department}%`);
    }

    if (filters.isActive !== undefined) {
      dbQuery = dbQuery.where('is_active', filters.isActive);
    }

    return await dbQuery.orderBy('first_name', 'asc').limit(50);
  }

  static async advancedSearch(
    userId: string,
    userRole: string,
    searchRequest: {
      query?: string;
      filters: any;
      aggregation?: {
        field: string;
        type: 'sum' | 'avg' | 'min' | 'max' | 'count';
        groupBy?: string[];
      };
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    }
  ): Promise<any> {
    let query = db('documents')
      .leftJoin('folders', 'documents.folder_id', 'folders.id')
      .leftJoin('users', 'documents.uploaded_by', 'users.id')
      .select(
        'documents.*',
        'folders.name as folder_name',
        'users.first_name as uploader_first_name',
        'users.last_name as uploader_last_name',
        'users.email as uploader_email'
      )
      .where('documents.status', 'active');

    // Apply access control
    if (userRole !== 'admin') {
      query = query.where(function () {
        this.where('documents.is_public', true)
          .orWhere('documents.uploaded_by', userId)
          .orWhereRaw('documents.allowed_users ?| ?', [userId])
          .orWhereRaw('documents.allowed_roles ?| ?', [userRole]);
      });
    }

    // Apply text search with full-text search if available
    if (searchRequest.query) {
      query = query.where(function () {
        this.where('documents.original_filename', 'ilike', `%${searchRequest.query}%`)
          .orWhere('documents.description', 'ilike', `%${searchRequest.query}%`)
          .orWhere('documents.tags', 'ilike', `%${searchRequest.query}%`)
          .orWhere('documents.document_number', 'ilike', `%${searchRequest.query}%`);
      });
    }

    // Apply advanced filters
    if (searchRequest.filters) {
      Object.entries(searchRequest.filters).forEach(([field, value]) => {
        if (value !== null && value !== undefined) {
          if (Array.isArray(value)) {
            query = query.whereIn(`documents.${field}`, value);
          } else if (typeof value === 'object' && value.range) {
            query = query.whereBetween(`documents.${field}`, [value.range.min, value.range.max]);
          } else {
            query = query.where(`documents.${field}`, value);
          }
        }
      });
    }

    // Apply aggregation if requested
    let aggregationResult = null;
    if (searchRequest.aggregation) {
      const { field, type, groupBy } = searchRequest.aggregation;

      let aggQuery = query.clone();

      if (groupBy && groupBy.length > 0) {
        aggQuery = aggQuery.select(...groupBy, db.raw(`${type}(${field}) as ${field}_${type}`))
          .groupBy(...groupBy);
      } else {
        aggQuery = aggQuery.select(db.raw(`${type}(${field}) as ${field}_${type}`));
      }

      aggregationResult = await aggQuery;
    }

    // Apply sorting
    const sortBy = searchRequest.sortBy || 'created_at';
    const sortOrder = searchRequest.sortOrder || 'desc';
    query = query.orderBy(`documents.${sortBy}`, sortOrder);

    // Apply pagination
    const page = searchRequest.page || 1;
    const limit = searchRequest.limit || 20;
    const offset = (page - 1) * limit;

    const documents = await query
      .limit(limit)
      .offset(offset);

    // Get total count
    const totalQuery = query.clone().clearSelect().count('* as total');
    const [{ total }] = await totalQuery;

    return {
      documents,
      total: parseInt(total),
      aggregation: aggregationResult,
      pagination: {
        page,
        limit,
        total: parseInt(total),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getIndexingStatus(): Promise<{
    totalDocuments: number;
    indexedDocuments: number;
    lastIndexed: Date | null;
    indexingInProgress: boolean;
  }> {
    const totalDocuments = await db('documents')
      .where('status', 'active')
      .count('* as total')
      .first();

    // This would typically use a search index like Elasticsearch
    // For now, we'll simulate with database data
    const indexingStatus = {
      totalDocuments: parseInt(totalDocuments.total),
      indexedDocuments: parseInt(totalDocuments.total), // All documents are "indexed" in DB
      lastIndexed: new Date(),
      indexingInProgress: false,
    };

    return indexingStatus;
  }

  static async rebuildSearchIndex(): Promise<void> {
    // This would trigger a full reindex in Elasticsearch or similar
    // For now, we'll just update the last indexed timestamp
    logger.info('Search index rebuild initiated');

    // In a real implementation, this would:
    // 1. Queue all documents for reindexing
    // 2. Process them in batches
    // 3. Update index status
    // 4. Handle failures and retries
  }
}
