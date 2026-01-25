#!/usr/bin/env node
/**
 * Metrics Prune Script
 * 
 * Deletes old metrics from runtime_metrics_daily table to prevent unbounded growth.
 * 
 * Configuration:
 * - METRICS_RETENTION_DAYS: Number of days to retain (default: 90 for staging, 365 for prod)
 * - DATABASE_URL_STAGING or DATABASE_URL: Postgres connection string
 * 
 * Usage:
 *   DATABASE_URL_STAGING=... npm run metrics:prune
 *   METRICS_RETENTION_DAYS=30 DATABASE_URL_STAGING=... npm run metrics:prune
 * 
 * Output: Only PASS/FAIL lines (no secret leakage)
 * Exit: 0 on success, 1 on failure
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const DATABASE_URL = process.env.DATABASE_URL_STAGING || process.env.DATABASE_URL;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Default retention: 90 days for staging, 365 days for production
const DEFAULT_RETENTION_DAYS = IS_PRODUCTION ? 365 : 90;
const RETENTION_DAYS = parseInt(process.env.METRICS_RETENTION_DAYS || String(DEFAULT_RETENTION_DAYS), 10);

if (!DATABASE_URL) {
  console.log('FAIL missing DATABASE_URL_STAGING or DATABASE_URL');
  process.exit(1);
}

if (isNaN(RETENTION_DAYS) || RETENTION_DAYS < 1) {
  console.log('FAIL invalid METRICS_RETENTION_DAYS (must be positive integer)');
  process.exit(1);
}

// =============================================================================
// DATABASE CLIENT
// =============================================================================

interface DbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
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
// PRUNE LOGIC
// =============================================================================

async function pruneOldMetrics(client: DbClient): Promise<{ deleted: number; cutoffDate: string }> {
  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  const cutoffDateStr = cutoffDate.toISOString().substring(0, 10);
  
  // Delete old rows
  const result = await client.query(
    `DELETE FROM runtime_metrics_daily WHERE day < $1`,
    [cutoffDateStr]
  );
  
  return {
    deleted: result.rowCount || 0,
    cutoffDate: cutoffDateStr,
  };
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log('=== Metrics Prune ===\n');
  console.log(`Retention: ${RETENTION_DAYS} days`);
  
  let client: DbClient | null = null;
  
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
    
    // Check if table exists
    const tableCheck = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'runtime_metrics_daily'
      ) as exists
    `);
    
    if (!tableCheck.rows[0]?.exists) {
      console.log('PASS no_metrics_table (nothing to prune)');
      process.exit(0);
    }
    
    // Get row count before pruning
    const beforeCount = await client.query<{ count: string }>(`
      SELECT COUNT(*) as count FROM runtime_metrics_daily
    `);
    const totalBefore = parseInt(beforeCount.rows[0]?.count || '0', 10);
    
    // Prune old metrics
    const result = await pruneOldMetrics(client);
    
    console.log(`PASS pruned ${result.deleted} rows older than ${result.cutoffDate}`);
    console.log(`PASS total_rows: ${totalBefore - result.deleted} (was ${totalBefore})`);
    
    console.log('\n=== METRICS PRUNE COMPLETED ===');
    process.exit(0);
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

main().catch((error) => {
  console.log('FAIL unexpected_error');
  process.exit(1);
});
