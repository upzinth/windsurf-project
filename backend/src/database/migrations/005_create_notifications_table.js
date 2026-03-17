/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('notifications', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('title').notNullable();
    table.text('message').notNullable();
    table.enum('type', ['info', 'success', 'warning', 'error', 'system']).defaultTo('info').notNullable();
    table.enum('category', ['upload', 'download', 'share', 'system', 'security', 'expiry']).notNullable();
    
    // Related resource
    table.string('resource_type').nullable(); // document, folder, user
    table.uuid('resource_id').nullable();
    table.string('resource_url').nullable(); // direct link to resource
    
    // Delivery methods
    table.boolean('email_sent').defaultTo(false).notNullable();
    table.timestamp('email_sent_at').nullable();
    table.boolean('in_app_read').defaultTo(false).notNullable();
    table.timestamp('read_at').nullable();
    
    // Priority and scheduling
    table.enum('priority', ['low', 'medium', 'high', 'urgent']).defaultTo('medium').notNullable();
    table.boolean('is_active').defaultTo(true).notNullable();
    table.timestamp('expires_at').nullable();
    
    // Additional data
    table.json('metadata').nullable();
    table.string('action_url').nullable(); // call-to-action URL
    
    table.timestamps(true, true);
    
    // Indexes
    table.index(['user_id']);
    table.index(['type']);
    table.index(['category']);
    table.index(['priority']);
    table.index(['in_app_read']);
    table.index(['created_at']);
    
    // Composite indexes
    table.index(['user_id', 'in_app_read']);
    table.index(['user_id', 'created_at']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('notifications');
};
