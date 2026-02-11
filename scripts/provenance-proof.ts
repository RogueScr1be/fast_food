#!/usr/bin/env node
/**
 * Provenance Proof Script
 * 
 * Verifies that the latest recorded deployment matches the expected deployment URL.
 * Run after record_last_green to ensure consistency.
 * 
 * Required env vars:
 *   DATABASE_URL_STAGING - Postgres connection string
 *   EXPECTED_DEPLOYMENT_URL - The expected deployment URL to verify
 *   ENV_NAME - Environment name (default: staging)
 * 
 * Usage:
 *   DATABASE_URL_STAGING=... EXPECTED_DEPLOYMENT_URL=... npm run deploy:provenance:proof
 * 
 * Output: PASS/FAIL only (no secret leakage)
 * Exit: 0 on success, 1 on failure
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const DATABASE_URL = process.env.DATABASE_URL_STAGING || process.env.DATABASE_URL;
const EXPECTED_DEPLOYMENT_URL = process.env.EXPECTED_DEPLOYMENT_URL;
const ENV_NAME = process.env.ENV_NAME || 'staging';

// Validate required env vars
function validateEnv(): boolean {
  if (!DATABASE_URL) {
    console.log('FAIL missing_database_url');
    return false;
  }
  if (!EXPECTED_DEPLOYMENT_URL) {
    console.log('FAIL missing_expected_deployment_url');
    return false;
  }
  return true;
}

// =============================================================================
// DATABASE CLIENT
// =============================================================================

interface DbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

interface DeploymentRow {
  deployment_url: string;
  git_sha: string;
  run_id: string;
  recorded_at: string;
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
// PROVENANCE CHECK
// =============================================================================

async function getLatestDeployment(client: DbClient): Promise<DeploymentRow | null> {
  const result = await client.query<DeploymentRow>(`
    SELECT deployment_url, git_sha, run_id, recorded_at
    FROM runtime_deployments_log
    WHERE env = $1
    ORDER BY recorded_at DESC
    LIMIT 1
  `, [ENV_NAME]);
  
  return result.rows[0] || null;
}

/**
 * Check if deployment is healthy by hitting /healthz.json
 */
async function checkHealthz(deploymentUrl: string): Promise<boolean> {
  try {
    const healthzUrl = `${deploymentUrl}/healthz.json`;
    const response = await fetch(healthzUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  // Validate environment
  if (!validateEnv()) {
    process.exit(1);
  }
  
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
    } catch {
      console.log('FAIL db_connection_test');
      process.exit(1);
    }
    
    // Get latest deployment
    const latest = await getLatestDeployment(client);
    
    if (!latest) {
      console.log('FAIL no_deployments_recorded');
      process.exit(1);
    }
    
    // Compare URLs
    if (latest.deployment_url !== EXPECTED_DEPLOYMENT_URL) {
      console.log('FAIL provenance_mismatch');
      process.exit(1);
    }
    
    // Hit healthz on the recorded deployment to verify it's live
    const isHealthy = await checkHealthz(latest.deployment_url);
    if (!isHealthy) {
      console.log('FAIL deployment_healthz_failed');
      process.exit(1);
    }
    
    console.log('PASS provenance_verified');
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

main().catch(() => {
  console.log('FAIL unexpected_error');
  process.exit(1);
});
