#!/usr/bin/env node
/**
 * Metrics Health Script
 * 
 * Verifies that the runtime_metrics_daily table exists and is queryable.
 * Used as a CI gate to ensure metrics persistence is working.
 * 
 * Usage:
 *   DATABASE_URL_STAGING=... npm run metrics:health
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
// DATABASE CLIENT
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
  } catch {
    console.log('FAIL db_connection_error');
    return null;
  }
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

async function checkMetricsHealth(client: DbClient): Promise<boolean> {
  // Check if table exists
  const tableCheck = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'runtime_metrics_daily'
    ) as exists
  `);
  
  if (!tableCheck.rows[0]?.exists) {
    console.log('FAIL table_missing');
    return false;
  }
  console.log('PASS table_exists');
  
  // Get today's date
  const today = new Date().toISOString().substring(0, 10);
  
  // Query today's metrics (even if 0 rows, this proves table is queryable)
  try {
    const metricsResult = await client.query<{ metric_key: string; count: string }>(`
      SELECT metric_key, count FROM runtime_metrics_daily
      WHERE day = $1
      ORDER BY metric_key
    `, [today]);
    
    const rowCount = metricsResult.rows.length;
    console.log(`PASS query_succeeded (${rowCount} metrics for today)`);
    return true;
  } catch {
    console.log('FAIL query_error');
    return false;
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log('=== Metrics Health Check ===\n');
  
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
    
    // Run health check
    const healthy = await checkMetricsHealth(client);
    
    console.log('');
    if (healthy) {
      console.log('=== METRICS HEALTH CHECK PASSED ===');
      process.exit(0);
    } else {
      console.log('=== METRICS HEALTH CHECK FAILED ===');
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
