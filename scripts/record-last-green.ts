#!/usr/bin/env node
/**
 * Record Last Green Deployment
 * 
 * Records a successful deployment to the runtime_deployments_log table.
 * Called after smoke_staging passes to mark this deployment as "green".
 * 
 * Required env vars:
 *   DATABASE_URL_STAGING - Postgres connection string
 *   DEPLOYMENT_URL - The Vercel deployment URL
 *   GITHUB_SHA - Git commit SHA
 *   GITHUB_RUN_ID - GitHub Actions run ID
 *   ENV_NAME - Environment name (default: staging)
 * 
 * Usage:
 *   DATABASE_URL_STAGING=... DEPLOYMENT_URL=... GITHUB_SHA=... GITHUB_RUN_ID=... npm run deploy:record:lastgreen
 * 
 * Output: PASS/FAIL only (no secret leakage)
 * Exit: 0 on success, 1 on failure
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const DATABASE_URL = process.env.DATABASE_URL_STAGING || process.env.DATABASE_URL;
const DEPLOYMENT_URL = process.env.DEPLOYMENT_URL;
const GITHUB_SHA = process.env.GITHUB_SHA;
const GITHUB_RUN_ID = process.env.GITHUB_RUN_ID;
const ENV_NAME = process.env.ENV_NAME || 'staging';

/**
 * Validate URL format (must be https:// with valid hostname)
 */
function isValidDeploymentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

// Validate required env vars
function validateEnv(): boolean {
  if (!DATABASE_URL) {
    console.log('FAIL missing_database_url');
    return false;
  }
  if (!DEPLOYMENT_URL) {
    console.log('FAIL missing_deployment_url');
    return false;
  }
  if (!isValidDeploymentUrl(DEPLOYMENT_URL)) {
    console.log('FAIL invalid_deployment_url_format');
    return false;
  }
  if (!GITHUB_SHA) {
    console.log('FAIL missing_github_sha');
    return false;
  }
  if (!GITHUB_RUN_ID) {
    console.log('FAIL missing_github_run_id');
    return false;
  }
  return true;
}

// =============================================================================
// DATABASE CLIENT
// =============================================================================

interface DbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
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
// RECORD DEPLOYMENT
// =============================================================================

async function recordDeployment(client: DbClient): Promise<boolean> {
  try {
    // Insert deployment record (ON CONFLICT DO NOTHING for idempotency)
    const result = await client.query(
      `INSERT INTO runtime_deployments_log (env, deployment_url, git_sha, run_id, recorded_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (env, deployment_url) DO NOTHING`,
      [ENV_NAME, DEPLOYMENT_URL, GITHUB_SHA, GITHUB_RUN_ID]
    );
    
    // rowCount is null on conflict (no insert), but that's still success
    return true;
  } catch {
    console.log('FAIL insert_error');
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
    
    // Record deployment
    const success = await recordDeployment(client);
    
    if (success) {
      console.log('PASS deployment_recorded');
      process.exit(0);
    } else {
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
