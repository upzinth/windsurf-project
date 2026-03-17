/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('folders', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.text('description').nullable();
    table.uuid('parent_id').nullable();
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    
    // Path for hierarchical structure
    table.string('path').notNullable(); // e.g., /root/documents/2024
    table.integer('level').defaultTo(0).notNullable(); // depth in hierarchy
    
    // Permissions
    table.json('permissions').nullable(); // role-based permissions
    table.boolean('is_public').defaultTo(false).notNullable();
    table.boolean('is_system').defaultTo(false).notNullable(); // system folders cannot be deleted
    
    // Settings
    table.integer('max_file_size').defaultTo(104857600); // 100MB
    table.json('allowed_file_types').nullable(); // array of allowed MIME types
    
    table.timestamps(true, true);
    
    // Indexes
    table.index(['parent_id']);
    table.index(['created_by']);
    table.index(['path']);
    table.index(['level']);
    
    // Foreign key constraint for self-reference
    table.foreign('parent_id').references('id').inTable('folders').onDelete('CASCADE');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('folders');
};
