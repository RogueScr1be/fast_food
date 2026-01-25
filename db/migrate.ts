#!/usr/bin/env node
/**
 * Database Migration Runner for Decision OS
 * 
 * Uses schema_migrations table to track applied migrations.
 * CI-safe and idempotent - only applies unapplied migrations.
 * 
 * Usage:
 *   npx ts-node db/migrate.ts
 *   npm run db:migrate:staging
 * 
 * Requires:
 *   DATABASE_URL environment variable
 */

import * as fs from 'fs';
import * as path from 'path';
import dns from 'node:dns/promises';
import { parse as parsePgConnection } from 'pg-connection-string';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Required tables that must exist after migrations.
 * Verification will fail if any are missing.
 */
export const REQUIRED_TABLES = [
  'user_profiles',
  'meals',
  'decision_events',
  'taste_signals',
  'taste_meal_scores',
  'receipt_imports',
  'inventory_items',
  'households',
  'household_members',
  'schema_migrations',
  'runtime_flags',
  'runtime_metrics_daily',
  'runtime_deployments_log',
  'sessions',
] as const;

/**
 * Required columns per table.
 * Verification will fail if any columns are missing.
 * This catches schema drift early and prevents runtime errors.
 */
export const REQUIRED_COLUMNS: Map<string, string[]> = new Map([
  ['user_profiles', ['id', 'auth_user_id', 'created_at']],
  ['households', ['id', 'household_key', 'created_at', 'budget_ceiling_cents', 'fallback_config']],
  ['household_members', ['household_id', 'user_profile_id', 'created_at']],
  ['meals', ['id', 'name', 'category', 'prep_time_minutes', 'tags', 'estimated_cost_cents', 'difficulty', 'cook_steps', 'mode']],
  ['sessions', ['id', 'household_key', 'started_at', 'context', 'outcome', 'rejection_count']],
  ['decision_events', [
    'id',
    'user_profile_id',
    'household_key',
    'user_action',
    'actioned_at',
    'decided_at',
    'notes',
    'decision_payload',
    'decision_type',
    'meal_id',
    'context_hash',
  ]],
  ['inventory_items', ['id', 'household_key', 'item_name', 'remaining_qty', 'confidence', 'last_seen_at']],
  ['receipt_imports', ['id', 'household_key', 'status', 'created_at']],
  ['taste_signals', ['id', 'household_key', 'event_id', 'weight', 'created_at']],
  ['taste_meal_scores', ['id', 'household_key', 'meal_id', 'score', 'approvals', 'rejections', 'updated_at']],
  ['schema_migrations', ['filename', 'applied_at']],
  ['runtime_flags', ['key', 'enabled', 'updated_at']],
  ['runtime_metrics_daily', ['day', 'metric_key', 'count', 'updated_at']],
  ['runtime_deployments_log', ['id', 'env', 'deployment_url', 'git_sha', 'run_id', 'recorded_at']],
]);

// =============================================================================
// TYPES
// =============================================================================

export interface MigrationFile {
  name: string;
  path: string;
  order: number;
}

export interface MigrationRecord {
  filename: string;
  applied_at: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  failed: string | null;
}

// =============================================================================
// MIGRATION LOGIC (exportable for testing)
// =============================================================================

/**
 * Get sorted list of migration files from disk
 */
export function getMigrationFiles(migrationsDir: string = MIGRATIONS_DIR): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  
  const files = fs.readdirSync(migrationsDir);
  
  return files
    .filter(f => f.endsWith('.sql'))
    .map(f => ({
      name: f,
      path: path.join(migrationsDir, f),
      order: parseInt(f.split('_')[0], 10) || 0,
    }))
    .sort((a, b) => a.order - b.order);
}

/**
 * Filter to only unapplied migrations
 */
export function getUnappliedMigrations(
  allMigrations: MigrationFile[],
  appliedFilenames: Set<string>
): MigrationFile[] {
  return allMigrations.filter(m => !appliedFilenames.has(m.name));
}

/**
 * Create schema_migrations table if not exists
 */
const SCHEMA_MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename ON schema_migrations(filename);
`;

// =============================================================================
// DATABASE ADAPTER INTERFACE (for testing)
// =============================================================================

export interface DbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

/**
 * Ensure schema_migrations table exists
 */
async function ensureMigrationsTable(client: DbClient): Promise<void> {
  await client.query(SCHEMA_MIGRATIONS_SQL);
}

/**
 * Get list of applied migrations from database
 */
async function getAppliedMigrations(client: DbClient): Promise<Set<string>> {
  const result = await client.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return new Set(result.rows.map(r => r.filename));
}

/**
 * Record a migration as applied
 */
async function recordMigration(client: DbClient, filename: string): Promise<void> {
  await client.query(
    'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
    [filename]
  );
}

/**
 * Verify required tables exist in database
 */
export async function verifyRequiredTables(
  client: DbClient,
  requiredTables: readonly string[] = REQUIRED_TABLES
): Promise<{ valid: boolean; missing: string[]; found: string[] }> {
  const result = await client.query<{ table_name: string }>(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
  `);
  
  const existingTables = new Set(result.rows.map(r => r.table_name));
  const found: string[] = [];
  const missing: string[] = [];
  
  for (const table of requiredTables) {
    if (existingTables.has(table)) {
      found.push(table);
    } else {
      missing.push(table);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
    found,
  };
}

/**
 * Result of column verification
 */
export interface ColumnVerificationResult {
  valid: boolean;
  missingColumns: Map<string, string[]>;
  checkedTables: string[];
  errors: string[];
}

/**
 * Verify required columns exist for each table.
 * Only checks tables that exist (use verifyRequiredTables first for table check).
 */
export async function verifyRequiredColumns(
  client: DbClient,
  requiredColumns: Map<string, string[]> = REQUIRED_COLUMNS
): Promise<ColumnVerificationResult> {
  const result: ColumnVerificationResult = {
    valid: true,
    missingColumns: new Map(),
    checkedTables: [],
    errors: [],
  };
  
  // Query all columns from information_schema
  const columnsResult = await client.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
  `);
  
  // Build lookup: table -> Set<column>
  const columnsByTable = new Map<string, Set<string>>();
  for (const row of columnsResult.rows) {
    if (!columnsByTable.has(row.table_name)) {
      columnsByTable.set(row.table_name, new Set());
    }
    columnsByTable.get(row.table_name)!.add(row.column_name);
  }
  
  // Check each required table's columns
  for (const [tableName, requiredCols] of requiredColumns) {
    result.checkedTables.push(tableName);
    
    const existingCols = columnsByTable.get(tableName);
    
    // If table doesn't exist, report it separately (skip column check)
    if (!existingCols) {
      result.errors.push(`Table '${tableName}' does not exist (cannot verify columns)`);
      result.valid = false;
      continue;
    }
    
    // Check for missing columns
    const missing: string[] = [];
    for (const col of requiredCols) {
      if (!existingCols.has(col)) {
        missing.push(col);
      }
    }
    
    if (missing.length > 0) {
      result.missingColumns.set(tableName, missing);
      result.errors.push(
        `Table '${tableName}' missing columns: ${missing.join(', ')}`
      );
      result.valid = false;
    }
  }
  
  return result;
}

// =============================================================================
// COLUMN TYPE VERIFICATION
// =============================================================================

/**
 * Required column types for critical columns.
 * Map of "table.column" -> expected type (lowercase).
 * 
 * ALL tenant tables must have household_key as TEXT type.
 */
export const REQUIRED_COLUMN_TYPES: Map<string, string> = new Map([
  // Runtime infrastructure
  ['runtime_flags.enabled', 'boolean'],
  ['runtime_flags.key', 'text'],
  ['runtime_metrics_daily.count', 'bigint'],
  ['runtime_deployments_log.env', 'text'],
  ['runtime_deployments_log.deployment_url', 'text'],
  ['runtime_deployments_log.git_sha', 'text'],
  ['runtime_deployments_log.run_id', 'text'],
  // Tenant tables - household_key MUST be TEXT
  ['decision_events.user_action', 'text'],
  ['decision_events.household_key', 'text'],
  ['taste_signals.household_key', 'text'],
  ['taste_meal_scores.household_key', 'text'],
  ['inventory_items.household_key', 'text'],
  ['receipt_imports.household_key', 'text'],
]);

/**
 * Columns that must NOT be nullable.
 * All tenant tables must have household_key NOT NULL.
 */
export const NOT_NULL_COLUMNS: string[] = [
  // decision_events
  'decision_events.user_action',
  'decision_events.household_key',
  // taste_signals
  'taste_signals.household_key',
  // taste_meal_scores
  'taste_meal_scores.household_key',
  // inventory_items
  'inventory_items.household_key',
  // receipt_imports
  'receipt_imports.household_key',
  // runtime_flags
  'runtime_flags.enabled',
  // runtime_deployments_log
  'runtime_deployments_log.env',
  'runtime_deployments_log.deployment_url',
  'runtime_deployments_log.git_sha',
  'runtime_deployments_log.run_id',
];

/**
 * Required CHECK constraints on tables.
 * Format: 'table_name.constraint_name'
 */
export const REQUIRED_CONSTRAINTS: Map<string, string[]> = new Map([
  ['decision_events', [
    'decision_events_user_action_check',
    'decision_events_household_key_check',
    'decision_events_decision_type_check',
    'decision_events_timestamps_check',
  ]],
  ['taste_signals', [
    'taste_signals_household_key_nonempty',
  ]],
  ['taste_meal_scores', [
    'taste_meal_scores_household_key_nonempty',
  ]],
  ['inventory_items', [
    'inventory_items_household_key_nonempty',
  ]],
  ['receipt_imports', [
    'receipt_imports_household_key_nonempty',
  ]],
]);

/**
 * Result of constraint verification
 */
export interface ConstraintVerificationResult {
  valid: boolean;
  missing: Array<{ table: string; constraint: string }>;
  errors: string[];
}

/**
 * Verify required CHECK constraints exist on tables.
 * Queries pg_constraint to check if constraints are present.
 */
export async function verifyRequiredConstraints(
  client: DbClient,
  requiredConstraints: Map<string, string[]> = REQUIRED_CONSTRAINTS
): Promise<ConstraintVerificationResult> {
  const result: ConstraintVerificationResult = {
    valid: true,
    missing: [],
    errors: [],
  };
  
  // Query existing CHECK constraints from pg_constraint
  const constraintsResult = await client.query<{
    table_name: string;
    constraint_name: string;
  }>(`
    SELECT 
      c.relname AS table_name,
      con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class c ON con.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND con.contype = 'c'  -- CHECK constraints only
  `);
  
  // Build lookup: table_name -> Set<constraint_name>
  const existingConstraints = new Map<string, Set<string>>();
  for (const row of constraintsResult.rows) {
    if (!existingConstraints.has(row.table_name)) {
      existingConstraints.set(row.table_name, new Set());
    }
    existingConstraints.get(row.table_name)!.add(row.constraint_name);
  }
  
  // Check each required constraint
  for (const [tableName, constraints] of requiredConstraints) {
    const tableConstraints = existingConstraints.get(tableName) || new Set();
    
    for (const constraintName of constraints) {
      if (!tableConstraints.has(constraintName)) {
        result.missing.push({ table: tableName, constraint: constraintName });
        result.errors.push(
          `Missing CHECK constraint '${constraintName}' on table '${tableName}'`
        );
        result.valid = false;
      }
    }
  }
  
  return result;
}

/**
 * Result of column type verification
 */
export interface TypeVerificationResult {
  valid: boolean;
  mismatches: Array<{ column: string; expected: string; actual: string }>;
  errors: string[];
}

/**
 * Verify required column types match expected types.
 */
export async function verifyRequiredColumnTypes(
  client: DbClient,
  requiredTypes: Map<string, string> = REQUIRED_COLUMN_TYPES
): Promise<TypeVerificationResult> {
  const result: TypeVerificationResult = {
    valid: true,
    mismatches: [],
    errors: [],
  };
  
  // Query column types from information_schema
  const typesResult = await client.query<{ 
    table_name: string; 
    column_name: string; 
    data_type: string;
  }>(`
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
  `);
  
  // Build lookup: "table.column" -> data_type
  const columnTypes = new Map<string, string>();
  for (const row of typesResult.rows) {
    const key = `${row.table_name}.${row.column_name}`;
    columnTypes.set(key, row.data_type.toLowerCase());
  }
  
  // Check each required type
  for (const [columnKey, expectedType] of requiredTypes) {
    const actualType = columnTypes.get(columnKey);
    
    if (!actualType) {
      result.errors.push(`Column '${columnKey}' not found`);
      result.valid = false;
      continue;
    }
    
    if (actualType !== expectedType.toLowerCase()) {
      result.mismatches.push({
        column: columnKey,
        expected: expectedType,
        actual: actualType,
      });
      result.errors.push(
        `Column '${columnKey}' type mismatch: expected '${expectedType}', got '${actualType}'`
      );
      result.valid = false;
    }
  }
  
  return result;
}

/**
 * Result of NOT NULL verification
 */
export interface NotNullVerificationResult {
  valid: boolean;
  nullableColumns: string[];
  errors: string[];
}

/**
 * Verify columns that should NOT be nullable are actually NOT NULL.
 */
export async function verifyNotNull(
  client: DbClient,
  notNullColumns: string[] = NOT_NULL_COLUMNS
): Promise<NotNullVerificationResult> {
  const result: NotNullVerificationResult = {
    valid: true,
    nullableColumns: [],
    errors: [],
  };
  
  // Query column nullable status from information_schema
  const nullableResult = await client.query<{ 
    table_name: string; 
    column_name: string; 
    is_nullable: string;
  }>(`
    SELECT table_name, column_name, is_nullable 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
  `);
  
  // Build lookup: "table.column" -> is_nullable ('YES' or 'NO')
  const columnNullable = new Map<string, boolean>();
  for (const row of nullableResult.rows) {
    const key = `${row.table_name}.${row.column_name}`;
    columnNullable.set(key, row.is_nullable === 'YES');
  }
  
  // Check each column that should NOT be nullable
  for (const columnKey of notNullColumns) {
    const isNullable = columnNullable.get(columnKey);
    
    if (isNullable === undefined) {
      result.errors.push(`Column '${columnKey}' not found`);
      result.valid = false;
      continue;
    }
    
    if (isNullable) {
      result.nullableColumns.push(columnKey);
      result.errors.push(`Column '${columnKey}' should be NOT NULL but is nullable`);
      result.valid = false;
    }
  }
  
  return result;
}

/**
 * Run migrations using provided client
 */
export async function runMigrationsWithClient(
  client: DbClient,
  migrationsDir: string = MIGRATIONS_DIR
): Promise<MigrationResult> {
  const result: MigrationResult = {
    applied: [],
    skipped: [],
    failed: null,
  };
  
  // Ensure schema_migrations table exists
  await ensureMigrationsTable(client);
  
  // Get all migration files
  const allMigrations = getMigrationFiles(migrationsDir);
  
  // Get already applied migrations
  const appliedFilenames = await getAppliedMigrations(client);
  
  // Filter to unapplied only
  const unapplied = getUnappliedMigrations(allMigrations, appliedFilenames);
  
  // Track skipped
  for (const migration of allMigrations) {
    if (appliedFilenames.has(migration.name)) {
      result.skipped.push(migration.name);
    }
  }
  
  // Apply unapplied migrations in order
  for (const migration of unapplied) {
    try {
      const sql = fs.readFileSync(migration.path, 'utf-8');
      await client.query(sql);
      await recordMigration(client, migration.name);
      result.applied.push(migration.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      // Check for "already exists" errors (still idempotent at SQL level)
      if (message.includes('already exists')) {
        await recordMigration(client, migration.name);
        result.skipped.push(migration.name);
      } else {
        result.failed = migration.name;
        throw error;
      }
    }
  }
  
  return result;
}

// =============================================================================
// MAIN (CLI)
// =============================================================================

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    console.error('Set DATABASE_URL to your PostgreSQL connection string');
    process.exit(1);
  }
  
  console.log('=== Decision OS Database Migration ===\n');
  console.log('Connecting to database...');
  
  // Dynamic import pg
  let pg;
  try {
    pg = await import('pg');
  } catch {
    console.error('ERROR: pg package not installed');
    console.error('Run: npm install pg');
    process.exit(1);
  }
  
  const needsSSL =
  databaseUrl.includes('supabase.com') ||
  databaseUrl.includes('sslmode=require') ||
  databaseUrl.includes('sslmode=verify-full');

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
  max: 1,
  connectionTimeoutMillis: 10000,
});
  
  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('Connected successfully!\n');
    
    // Get migration files
    const allMigrations = getMigrationFiles();
    console.log(`Found ${allMigrations.length} migration files\n`);
    
    // Run migrations
    const result = await runMigrationsWithClient(pool);
    
    // Report results
    if (result.skipped.length > 0) {
      console.log('Already applied (skipped):');
      for (const name of result.skipped) {
        console.log(`  ⊙ ${name}`);
      }
      console.log('');
    }
    
    if (result.applied.length > 0) {
      console.log('Newly applied:');
      for (const name of result.applied) {
        console.log(`  ✓ ${name}`);
      }
      console.log('');
    }
    
    if (result.applied.length === 0 && result.skipped.length > 0) {
      console.log('All migrations already applied.\n');
    }
    
    // Verify required tables exist
    console.log('=== Verifying Required Tables ===\n');
    
    const tableVerification = await verifyRequiredTables(pool);
    
    console.log('Required tables:');
    for (const table of REQUIRED_TABLES) {
      const status = tableVerification.found.includes(table) ? '✓' : '✗';
      console.log(`  ${status} ${table}`);
    }
    
    if (!tableVerification.valid) {
      console.error(`\nERROR: Missing required tables: ${tableVerification.missing.join(', ')}`);
      process.exit(1);
    }
    
    // Verify required columns exist
    console.log('\n=== Verifying Required Columns ===\n');
    
    const columnVerification = await verifyRequiredColumns(pool);
    
    if (columnVerification.valid) {
      console.log(`✓ All required columns present in ${columnVerification.checkedTables.length} tables`);
    } else {
      console.log('Column verification FAILED:\n');
      for (const error of columnVerification.errors) {
        console.error(`  ✗ ${error}`);
      }
      console.error('\nMigration verification failed - schema is incomplete.');
      console.error('Check your migrations or manually add the missing columns.');
      process.exit(1);
    }
    
    // Verify column types
    console.log('\n=== Verifying Column Types ===\n');
    
    const typeVerification = await verifyRequiredColumnTypes(pool);
    
    if (typeVerification.valid) {
      console.log(`✓ All ${REQUIRED_COLUMN_TYPES.size} critical column types verified`);
    } else {
      console.log('Type verification FAILED:\n');
      for (const error of typeVerification.errors) {
        console.error(`  ✗ ${error}`);
      }
      console.error('\nMigration verification failed - column types incorrect.');
      process.exit(1);
    }
    
    // Verify NOT NULL constraints
    console.log('\n=== Verifying NOT NULL Constraints ===\n');
    
    const notNullVerification = await verifyNotNull(pool);
    
    if (notNullVerification.valid) {
      console.log(`✓ All ${NOT_NULL_COLUMNS.length} NOT NULL constraints verified`);
    } else {
      console.log('NOT NULL verification FAILED:\n');
      for (const error of notNullVerification.errors) {
        console.error(`  ✗ ${error}`);
      }
      console.error('\nMigration verification failed - NOT NULL constraints missing.');
      process.exit(1);
    }
    
    console.log('\n=== Migration Complete ===');
    console.log(`Applied: ${result.applied.length}, Skipped: ${result.skipped.length}`);
    console.log(`Tables verified: ${tableVerification.found.length}/${REQUIRED_TABLES.length}`);
    console.log(`Columns verified: ${columnVerification.checkedTables.length} tables`);
    console.log(`Types verified: ${REQUIRED_COLUMN_TYPES.size} columns`);
    console.log(`NOT NULL verified: ${NOT_NULL_COLUMNS.length} columns`);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\nMigration failed: ${message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}
