#!/usr/bin/env node
/**
 * DB Verify Staging Script
 * 
 * Verifies staging database schema matches required structure:
 * - Required tables exist
 * - Required columns exist per table
 * - Required column types are correct
 * - Required NOT NULL constraints are in place
 * 
 * Usage:
 *   DATABASE_URL_STAGING=... npm run db:verify:staging
 * 
 * Output: Only PASS/FAIL lines (no secret leakage)
 * Exit: 0 on success, 1 on failure
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const DATABASE_URL = process.env.DATABASE_URL_STAGING || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('FAIL missing DATABASE_URL_STAGING or DATABASE_URL');
  process.exit(1);
}

// =============================================================================
// IMPORTS (dynamic to avoid bundling issues)
// =============================================================================

interface DbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

async function getDbClient(): Promise<DbClient | null> {
  try {
    const pg = await import('pg');
    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 10000,
    });
    return pool;
  } catch (error) {
    console.log('FAIL db_connection_error');
    return null;
  }
}

// =============================================================================
// VERIFICATION FUNCTIONS (copied from db/migrate.ts for standalone execution)
// =============================================================================

const REQUIRED_TABLES = [
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
];

const REQUIRED_COLUMNS: Map<string, string[]> = new Map([
  ['user_profiles', ['id', 'auth_user_id', 'created_at']],
  ['households', ['id', 'household_key', 'created_at']],
  ['household_members', ['household_id', 'user_profile_id', 'created_at']],
  ['decision_events', [
    'id', 'user_profile_id', 'household_key', 'user_action', 'actioned_at',
    'decided_at', 'notes', 'decision_payload', 'decision_type', 'meal_id', 'context_hash',
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

const REQUIRED_COLUMN_TYPES: Map<string, string> = new Map([
  ['runtime_flags.enabled', 'boolean'],
  ['runtime_flags.key', 'text'],
  ['runtime_metrics_daily.count', 'bigint'],
  ['decision_events.user_action', 'text'],
  ['decision_events.household_key', 'text'],
  ['runtime_deployments_log.env', 'text'],
  ['runtime_deployments_log.deployment_url', 'text'],
  ['runtime_deployments_log.git_sha', 'text'],
  ['runtime_deployments_log.run_id', 'text'],
]);

const NOT_NULL_COLUMNS: string[] = [
  'decision_events.user_action',
  'decision_events.household_key',
  'runtime_flags.enabled',
  'runtime_deployments_log.env',
  'runtime_deployments_log.deployment_url',
  'runtime_deployments_log.git_sha',
  'runtime_deployments_log.run_id',
];

async function verifyRequiredTables(client: DbClient): Promise<{ valid: boolean; missing: string[] }> {
  const result = await client.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  
  const existingTables = new Set(result.rows.map(r => r.table_name));
  const missing = REQUIRED_TABLES.filter(t => !existingTables.has(t));
  
  return { valid: missing.length === 0, missing };
}

async function verifyRequiredColumns(client: DbClient): Promise<{ valid: boolean; errors: string[] }> {
  const result = await client.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  
  const columnsByTable = new Map<string, Set<string>>();
  for (const row of result.rows) {
    if (!columnsByTable.has(row.table_name)) {
      columnsByTable.set(row.table_name, new Set());
    }
    columnsByTable.get(row.table_name)!.add(row.column_name);
  }
  
  const errors: string[] = [];
  for (const [table, requiredCols] of REQUIRED_COLUMNS) {
    const existingCols = columnsByTable.get(table);
    if (!existingCols) {
      errors.push(`Table '${table}' does not exist`);
      continue;
    }
    for (const col of requiredCols) {
      if (!existingCols.has(col)) {
        errors.push(`Table '${table}' missing column '${col}'`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

async function verifyRequiredColumnTypes(client: DbClient): Promise<{ valid: boolean; errors: string[] }> {
  const result = await client.query<{ table_name: string; column_name: string; data_type: string }>(`
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  
  const columnTypes = new Map<string, string>();
  for (const row of result.rows) {
    const key = `${row.table_name}.${row.column_name}`;
    columnTypes.set(key, row.data_type.toLowerCase());
  }
  
  const errors: string[] = [];
  for (const [columnKey, expectedType] of REQUIRED_COLUMN_TYPES) {
    const actualType = columnTypes.get(columnKey);
    if (!actualType) {
      errors.push(`Column '${columnKey}' not found`);
      continue;
    }
    if (actualType !== expectedType.toLowerCase()) {
      errors.push(`Column '${columnKey}' type mismatch: expected '${expectedType}', got '${actualType}'`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

async function verifyNotNull(client: DbClient): Promise<{ valid: boolean; errors: string[] }> {
  const result = await client.query<{ table_name: string; column_name: string; is_nullable: string }>(`
    SELECT table_name, column_name, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  
  const columnNullable = new Map<string, boolean>();
  for (const row of result.rows) {
    const key = `${row.table_name}.${row.column_name}`;
    columnNullable.set(key, row.is_nullable === 'YES');
  }
  
  const errors: string[] = [];
  for (const columnKey of NOT_NULL_COLUMNS) {
    const isNullable = columnNullable.get(columnKey);
    if (isNullable === undefined) {
      errors.push(`Column '${columnKey}' not found`);
      continue;
    }
    if (isNullable) {
      errors.push(`Column '${columnKey}' should be NOT NULL but is nullable`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log('=== DB Schema Verification ===\n');
  
  let client: DbClient | null = null;
  let allPassed = true;
  
  try {
    // Connect to database
    client = await getDbClient();
    if (!client) {
      process.exit(1);
    }
    
    // Test connection
    try {
      await client.query('SELECT 1');
      console.log('PASS db_connected');
    } catch {
      console.log('FAIL db_connection_test');
      process.exit(1);
    }
    
    // Verify required tables
    const tableResult = await verifyRequiredTables(client);
    if (tableResult.valid) {
      console.log(`PASS tables_verified (${REQUIRED_TABLES.length} tables)`);
    } else {
      console.log(`FAIL missing_tables: ${tableResult.missing.length} tables missing`);
      allPassed = false;
    }
    
    // Verify required columns
    const columnResult = await verifyRequiredColumns(client);
    if (columnResult.valid) {
      console.log(`PASS columns_verified (${REQUIRED_COLUMNS.size} tables checked)`);
    } else {
      console.log(`FAIL missing_columns: ${columnResult.errors.length} errors`);
      allPassed = false;
    }
    
    // Verify column types
    const typeResult = await verifyRequiredColumnTypes(client);
    if (typeResult.valid) {
      console.log(`PASS column_types_verified (${REQUIRED_COLUMN_TYPES.size} columns)`);
    } else {
      console.log(`FAIL column_type_errors: ${typeResult.errors.length} errors`);
      allPassed = false;
    }
    
    // Verify NOT NULL constraints
    const notNullResult = await verifyNotNull(client);
    if (notNullResult.valid) {
      console.log(`PASS not_null_verified (${NOT_NULL_COLUMNS.length} columns)`);
    } else {
      console.log(`FAIL not_null_errors: ${notNullResult.errors.length} errors`);
      allPassed = false;
    }
    
    console.log('');
    if (allPassed) {
      console.log('=== SCHEMA VERIFICATION PASSED ===');
      process.exit(0);
    } else {
      console.log('=== SCHEMA VERIFICATION FAILED ===');
      process.exit(1);
    }
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

main().catch(() => {
  console.log('FAIL unexpected_error');
  process.exit(1);
});
