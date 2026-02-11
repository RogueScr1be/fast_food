#!/usr/bin/env node
/**
 * Rollback Staging Script
 * 
 * Rolls back staging to the previous "last green" deployment by re-aliasing.
 * 
 * Required env vars:
 *   DATABASE_URL_STAGING - Postgres connection string
 *   VERCEL_TOKEN - Vercel API token
 *   STAGING_URL - Current staging URL (e.g., https://your-app.vercel.app)
 * 
 * How it works:
 * 1. Queries runtime_deployments_log for the last 2 green deployments
 * 2. Takes the SECOND one (previous green) as rollback target
 * 3. Executes: vercel alias set <target_url> <alias_host>
 * 
 * Usage:
 *   DATABASE_URL_STAGING=... VERCEL_TOKEN=... STAGING_URL=... npm run staging:rollback
 * 
 * Output: PASS/FAIL only (no secret leakage)
 * Exit: 0 on success, 1 on failure
 */

import { execSync } from 'child_process';

// =============================================================================
// CONFIGURATION
// =============================================================================

const DATABASE_URL = process.env.DATABASE_URL_STAGING || process.env.DATABASE_URL;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const STAGING_URL = process.env.STAGING_URL;
const ENV_NAME = process.env.ENV_NAME || 'staging';

// Validate required env vars
function validateEnv(): boolean {
  if (!DATABASE_URL) {
    console.log('FAIL missing_database_url');
    return false;
  }
  if (!VERCEL_TOKEN) {
    console.log('FAIL missing_vercel_token');
    return false;
  }
  if (!STAGING_URL) {
    console.log('FAIL missing_staging_url');
    return false;
  }
  return true;
}

/**
 * Extract alias host from STAGING_URL
 * e.g., "https://my-app.vercel.app" -> "my-app.vercel.app"
 */
function getAliasHost(): string {
  try {
    const url = new URL(STAGING_URL!);
    return url.hostname;
  } catch {
    return '';
  }
}

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
// DATABASE CLIENT
// =============================================================================

interface DbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

interface DeploymentRow {
  id: string;
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
// ROLLBACK LOGIC
// =============================================================================

async function getLastTwoDeployments(client: DbClient): Promise<DeploymentRow[]> {
  const result = await client.query<DeploymentRow>(`
    SELECT id, deployment_url, git_sha, run_id, recorded_at
    FROM runtime_deployments_log
    WHERE env = $1
    ORDER BY recorded_at DESC
    LIMIT 2
  `, [ENV_NAME]);
  
  return result.rows;
}

function executeRollback(targetUrl: string, aliasHost: string): boolean {
  try {
    // Execute vercel alias command
    // Note: We suppress output to avoid leaking tokens
    execSync(
      `vercel alias set "${targetUrl}" "${aliasHost}" --token="${VERCEL_TOKEN}"`,
      { stdio: 'pipe' }
    );
    return true;
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
  
  const aliasHost = getAliasHost();
  if (!aliasHost) {
    console.log('FAIL invalid_staging_url');
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
    
    // Get last two deployments
    const deployments = await getLastTwoDeployments(client);
    
    if (deployments.length < 2) {
      console.log('FAIL not_enough_deployments');
      process.exit(1);
    }
    
    // Target is the SECOND deployment (previous green)
    const targetDeployment = deployments[1];
    const targetUrl = targetDeployment.deployment_url;
    
    // Validate target URL format
    if (!isValidDeploymentUrl(targetUrl)) {
      console.log('FAIL invalid_rollback_target_url');
      process.exit(1);
    }
    
    // Check healthz on target before aliasing
    const isHealthy = await checkHealthz(targetUrl);
    if (!isHealthy) {
      console.log('FAIL rollback_target_healthz_failed');
      process.exit(1);
    }
    
    // Execute rollback
    const success = executeRollback(targetUrl, aliasHost);
    
    if (success) {
      console.log('PASS rollback_complete');
      process.exit(0);
    } else {
      console.log('FAIL vercel_alias_error');
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
