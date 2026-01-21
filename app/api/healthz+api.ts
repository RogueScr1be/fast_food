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
 */

interface HealthResponse {
  ok: boolean;
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
  // Check 1: Environment variables
  const envOk = checkEnvVars();
  if (!envOk) {
    const response: HealthResponse = { ok: false };
    return Response.json(response, { status: 500 });
  }
  
  // Check 2: Database connectivity
  const dbOk = await checkDatabase();
  if (!dbOk) {
    const response: HealthResponse = { ok: false };
    return Response.json(response, { status: 500 });
  }
  
  // All checks passed
  const response: HealthResponse = { ok: true };
  return Response.json(response, { status: 200 });
}
