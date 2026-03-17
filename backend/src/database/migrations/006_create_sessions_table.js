/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('sessions', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('session_token').unique().notNullable();
    table.string('refresh_token').unique().nullable();
    
    // Device and browser information
    table.string('device_type').nullable(); // desktop, mobile, tablet
    table.string('browser').nullable();
    table.string('browser_version').nullable();
    table.string('operating_system').nullable();
    table.string('ip_address').notNullable();
    table.string('user_agent').nullable();
    
    // Session management
    table.boolean('is_active').defaultTo(true).notNullable();
    table.timestamp('last_activity').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('expires_at').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    
    // Security
    table.boolean('remember_me').defaultTo(false).notNullable();
    table.string('fingerprint').nullable(); // browser fingerprint for security
    table.json('security_flags').nullable(); // additional security metadata
    
    // Indexes
    table.index(['user_id']);
    table.index(['session_token']);
    table.index(['refresh_token']);
    table.index(['ip_address']);
    table.index(['is_active']);
    table.index(['expires_at']);
    table.index(['last_activity']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('sessions');
};
