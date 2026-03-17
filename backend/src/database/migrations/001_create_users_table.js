/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email').unique().notNullable();
    table.string('password').nullable(); // nullable for OAuth users
    table.string('first_name').notNullable();
    table.string('last_name').notNullable();
    table.enum('role', ['admin', 'manager', 'user']).defaultTo('user').notNullable();
    table.boolean('is_active').defaultTo(true).notNullable();
    table.boolean('email_verified').defaultTo(false).notNullable();
    table.string('google_id').nullable().unique();
    table.string('avatar_url').nullable();
    table.string('phone').nullable();
    table.string('department').nullable();
    table.string('position').nullable();
    
    // 2FA settings
    table.boolean('two_factor_enabled').defaultTo(false).notNullable();
    table.string('two_factor_secret').nullable();
    table.string('backup_codes').nullable(); // JSON array
    
    // Security settings
    table.integer('failed_login_attempts').defaultTo(0).notNullable();
    table.timestamp('locked_until').nullable();
    table.timestamp('last_login').nullable();
    table.string('last_login_ip').nullable();
    table.string('password_reset_token').nullable();
    table.timestamp('password_reset_expires').nullable();
    
    // Quota settings
    table.integer('storage_quota').defaultTo(1073741824); // 1GB in bytes
    table.integer('storage_used').defaultTo(0).notNullable();
    
    table.timestamps(true, true);
    
    // Indexes
    table.index(['email']);
    table.index(['role']);
    table.index(['is_active']);
    table.index(['google_id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
