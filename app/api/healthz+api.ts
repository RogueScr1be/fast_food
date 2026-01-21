/**
 * Health Check Endpoint
 * 
 * GET /api/healthz
 * 
 * Returns:
 * - 200 { ok: true } if all checks pass
 * - 500 { ok: false } if any check fails
 * 
 * Checks:
 * 1. DATABASE_URL environment variable exists
 * 2. SUPABASE_JWT_SECRET environment variable exists
 * 3. Can connect to Postgres and run SELECT 1
 * 
 * Response has ONLY the 'ok' field. No error strings to prevent information leakage.
 * Validated by validateHealthzResponse() before returning.
 */

import { validateHealthzResponse } from '../../lib/decision-os/invariants';
import { record, getSnapshot } from '../../lib/decision-os/monitoring/metrics';

interface HealthResponse {
  ok: boolean;
}

/**
 * Build and validate healthz response
 */
function buildResponse(ok: boolean, status: number): Response {
  const response: HealthResponse = { ok };
  
  // Validate before returning (fail-fast on contract violation)
  const validation = validateHealthzResponse(response);
  if (!validation.valid) {
    console.error('Healthz response validation failed:', validation.errors);
    // Return minimal valid response
    return Response.json({ ok: false }, { status: 500 });
  }
  
  return Response.json(response, { status });
}

/**
 * Check if required environment variables exist
 */
function checkEnvVars(): boolean {
  const databaseUrl = process.env.DATABASE_URL;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  
  return Boolean(databaseUrl && jwtSecret);
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    return false;
  }
  
  try {
    // Dynamic import to avoid bundling pg in client
    const pg = await import('pg');
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 1000,
    });
    
    try {
      const result = await pool.query('SELECT 1');
      return result.rows.length > 0;
    } finally {
      await pool.end();
    }
  } catch {
    // Silently fail - no error strings in response
    return false;
  }
}

/**
 * GET /api/healthz
 */
export async function GET(): Promise<Response> {
  record('healthz_hit');
  
  // Check 1: Environment variables
  const envOk = checkEnvVars();
  if (!envOk) {
    // Log details in dev only (no secrets, just status)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[healthz] ENV check failed: missing DATABASE_URL or SUPABASE_JWT_SECRET');
    }
    return buildResponse(false, 500);
  }
  
  // Check 2: Database connectivity
  const dbOk = await checkDatabase();
  if (!dbOk) {
    // Log details in dev only
    if (process.env.NODE_ENV !== 'production') {
      console.log('[healthz] DB connectivity check failed');
    }
    return buildResponse(false, 500);
  }
  
  // Log success metrics in dev only
  if (process.env.NODE_ENV !== 'production') {
    const metrics = getSnapshot();
    console.log('[healthz] All checks passed. Metrics:', JSON.stringify(metrics));
  }
  
  // All checks passed
  return buildResponse(true, 200);
}
