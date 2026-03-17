/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('audit_trails', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('user_email').nullable(); // store email even if user is deleted
    table.string('action').notNullable(); // login, logout, upload, download, delete, etc.
    table.string('resource_type').notNullable(); // user, document, folder, system
    table.uuid('resource_id').nullable(); // ID of the affected resource
    table.string('resource_name').nullable(); // name of the affected resource
    
    // Details
    table.text('description').nullable();
    table.json('old_values').nullable(); // previous values for updates
    table.json('new_values').nullable(); // new values for updates
    
    // Request information
    table.string('ip_address').notNullable();
    table.string('user_agent').nullable();
    table.string('session_id').nullable();
    
    // Result
    table.enum('status', ['success', 'failure', 'warning']).defaultTo('success').notNullable();
    table.text('error_message').nullable();
    
    // Additional metadata
    table.json('metadata').nullable(); // additional context
    table.string('department').nullable(); // user's department at time of action
    table.string('location').nullable(); // geographical location
    
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    
    // Indexes
    table.index(['user_id']);
    table.index(['action']);
    table.index(['resource_type']);
    table.index(['resource_id']);
    table.index(['ip_address']);
    table.index(['status']);
    table.index(['created_at']);
    
    // Composite indexes for common queries
    table.index(['user_id', 'created_at']);
    table.index(['action', 'created_at']);
    table.index(['resource_type', 'resource_id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('audit_trails');
};
