#!/usr/bin/env node
/**
 * Refresh privacy-safe global priors using k-anonymous buckets.
 *
 * Env:
 * - DATABASE_URL_STAGING or DATABASE_URL (required)
 * - GLOBAL_PRIORS_MIN_HOUSEHOLDS (optional, default: 30)
 * - GLOBAL_PRIORS_MIN_EVENTS (optional, default: 200)
 *
 * Usage:
 *   DATABASE_URL_STAGING=... npm run global-priors:refresh
 */

const DATABASE_URL = process.env.DATABASE_URL_STAGING || process.env.DATABASE_URL;
const MIN_HOUSEHOLDS = Number.parseInt(process.env.GLOBAL_PRIORS_MIN_HOUSEHOLDS ?? '30', 10);
const MIN_EVENTS = Number.parseInt(process.env.GLOBAL_PRIORS_MIN_EVENTS ?? '200', 10);

if (!DATABASE_URL) {
  console.log('FAIL missing DATABASE_URL_STAGING or DATABASE_URL');
  process.exit(1);
}

if (!Number.isFinite(MIN_HOUSEHOLDS) || MIN_HOUSEHOLDS <= 0) {
  console.log('FAIL invalid GLOBAL_PRIORS_MIN_HOUSEHOLDS');
  process.exit(1);
}

if (!Number.isFinite(MIN_EVENTS) || MIN_EVENTS <= 0) {
  console.log('FAIL invalid GLOBAL_PRIORS_MIN_EVENTS');
  process.exit(1);
}

async function main(): Promise<void> {
  let pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>; end: () => Promise<void> } | null = null;

  try {
    const pg = await import('pg');
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 10_000,
      ssl: /sslmode=/i.test(DATABASE_URL) || !!process.env.PGSSLMODE
        ? { rejectUnauthorized: false }
        : undefined,
    });

    await pool.query('SELECT 1');
    console.log('PASS db_connected');

    await pool.query('SELECT public.refresh_global_priors($1, $2)', [MIN_HOUSEHOLDS, MIN_EVENTS]);
    console.log(
      `PASS global_priors_refreshed (min_households=${MIN_HOUSEHOLDS}, min_events=${MIN_EVENTS})`,
    );

    const count = await pool.query('SELECT COUNT(*)::int AS count FROM global_priors');
    const row = count.rows[0] as { count?: number };
    console.log(`PASS global_priors_rows (${row?.count ?? 0})`);
  } catch {
    console.log('FAIL global_priors_refresh');
    process.exitCode = 1;
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch {
        // ignore
      }
    }
  }
}

void main();
