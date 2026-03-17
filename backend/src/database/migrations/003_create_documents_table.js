/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('documents', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('filename').notNullable();
    table.string('original_filename').notNullable();
    table.string('file_path').notNullable();
    table.string('mime_type').notNullable();
    table.integer('file_size').notNullable(); // in bytes
    table.string('file_hash').notNullable(); // SHA-256 hash for integrity
    table.text('description').nullable();
    
    // Relationships
    table.uuid('folder_id').notNullable().references('id').inTable('folders').onDelete('CASCADE');
    table.uuid('uploaded_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    
    // Document metadata
    table.string('document_number').nullable(); // auto-generated document number
    table.string('document_type').nullable(); // invoice, contract, report, etc.
    table.date('document_date').nullable(); // document creation date
    table.date('expiry_date').nullable(); // document expiry date
    
    // PDF conversion
    table.string('pdf_path').nullable(); // path to converted PDF
    table.boolean('pdf_converted').defaultTo(false).notNullable();
    table.string('thumbnail_path').nullable(); // path to thumbnail image
    
    // Security
    table.boolean('is_encrypted').defaultTo(false).notNullable();
    table.string('encryption_key').nullable(); // encrypted storage key
    table.boolean('is_public').defaultTo(false).notNullable();
    
    // Access control
    table.json('allowed_users').nullable(); // array of user IDs
    table.json('allowed_roles').nullable(); // array of roles
    table.integer('download_count').defaultTo(0).notNullable();
    table.timestamp('last_downloaded').nullable();
    
    // Version control
    table.string('version').defaultTo('1.0').notNullable();
    table.uuid('parent_document_id').nullable(); // for version history
    table.boolean('is_latest_version').defaultTo(true).notNullable();
    
    // Tags and categories
    table.json('tags').nullable(); // array of tags
    table.string('category').nullable();
    
    // Status
    table.enum('status', ['active', 'archived', 'deleted']).defaultTo('active').notNullable();
    table.text('archive_reason').nullable();
    
    table.timestamps(true, true);
    
    // Indexes
    table.index(['folder_id']);
    table.index(['uploaded_by']);
    table.index(['file_hash']);
    table.index(['document_number']);
    table.index(['status']);
    table.index(['document_type']);
    table.index(['mime_type']);
    table.index(['is_latest_version']);
    table.index(['parent_document_id']);
    
    // Full-text search index (PostgreSQL specific)
    table.index(['filename', 'original_filename', 'description'], 'documents_search_index', {
      type: 'fulltext'
    });
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('documents');
};
