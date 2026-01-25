#!/usr/bin/env node
/**
 * Metrics Alerts Script
 * 
 * Reads today's metrics from runtime_metrics_daily and checks alert thresholds.
 * Used as a CI gate to catch infrastructure issues early.
 * 
 * Thresholds:
 * - healthz_ok_false > 0: Healthz returned false at least once
 * - metrics_db_failed >= 1: Metrics DB write failed
 * - ocr_provider_failed >= 5: OCR provider failed multiple times
 * 
 * Usage:
 *   DATABASE_URL_STAGING=... npm run metrics:alerts
 * 
 * Output: Only PASS/FAIL lines (no secret leakage)
 * Exit: 0 on success, 1 on any threshold exceeded
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const DATABASE_URL = process.env.DATABASE_URL_STAGING || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('FAIL missing DATABASE_URL_STAGING or DATABASE_URL');
  process.exit(1);
}

// Alert thresholds
const THRESHOLDS: Record<string, number> = {
  healthz_ok_false: 0,      // > 0 triggers alert
  metrics_db_failed: 1,     // >= 1 triggers alert
  ocr_provider_failed: 5,   // >= 5 triggers alert
};

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
// METRICS CHECK
// =============================================================================

interface MetricRow {
  metric_key: string;
  count: string; // bigint comes as string from pg
}

async function getTodayMetrics(client: DbClient): Promise<Map<string, number>> {
  const today = new Date().toISOString().substring(0, 10);
  
  const result = await client.query<MetricRow>(`
    SELECT metric_key, count FROM runtime_metrics_daily
    WHERE day = $1
  `, [today]);
  
  const metrics = new Map<string, number>();
  for (const row of result.rows) {
    metrics.set(row.metric_key, parseInt(row.count, 10) || 0);
  }
  
  return metrics;
}

function checkThresholds(metrics: Map<string, number>): { passed: boolean; results: string[] } {
  const results: string[] = [];
  let allPassed = true;
  
  for (const [metric, threshold] of Object.entries(THRESHOLDS)) {
    const count = metrics.get(metric) || 0;
    
    // Different comparison operators based on threshold meaning
    // healthz_ok_false: > 0 triggers (even 1 is bad)
    // others: >= threshold triggers
    let exceeded: boolean;
    if (metric === 'healthz_ok_false') {
      exceeded = count > threshold;
    } else {
      exceeded = count >= threshold;
    }
    
    if (exceeded) {
      results.push(`FAIL ${metric} (count=${count}, threshold=${threshold})`);
      allPassed = false;
    } else {
      results.push(`PASS ${metric} (count=${count}, threshold=${threshold})`);
    }
  }
  
  return { passed: allPassed, results };
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log('=== Metrics Alerts Check ===\n');
  
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
    
    // Get today's metrics
    let metrics: Map<string, number>;
    try {
      metrics = await getTodayMetrics(client);
      console.log(`PASS metrics_loaded (${metrics.size} metrics)\n`);
    } catch {
      console.log('FAIL metrics_query');
      process.exit(1);
    }
    
    // Check thresholds
    const { passed, results } = checkThresholds(metrics);
    
    // Output results
    for (const result of results) {
      console.log(result);
    }
    
    console.log('');
    if (passed) {
      console.log('=== METRICS ALERTS CHECK PASSED ===');
      process.exit(0);
    } else {
      console.log('=== METRICS ALERTS CHECK FAILED ===');
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
