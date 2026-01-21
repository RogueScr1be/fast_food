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
] as const;

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
  
  const pool = new pg.Pool({
    connectionString: databaseUrl,
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
    
    const verification = await verifyRequiredTables(pool);
    
    console.log('Required tables:');
    for (const table of REQUIRED_TABLES) {
      const status = verification.found.includes(table) ? '✓' : '✗';
      console.log(`  ${status} ${table}`);
    }
    
    if (!verification.valid) {
      console.error(`\nERROR: Missing required tables: ${verification.missing.join(', ')}`);
      process.exit(1);
    }
    
    console.log('\n=== Migration Complete ===');
    console.log(`Applied: ${result.applied.length}, Skipped: ${result.skipped.length}`);
    console.log(`Tables verified: ${verification.found.length}/${REQUIRED_TABLES.length}`);
    
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
