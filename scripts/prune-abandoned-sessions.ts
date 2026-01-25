#!/usr/bin/env node
/**
 * Prune Abandoned Sessions Script
 * 
 * Marks pending sessions as "abandoned" if they are older than the TTL.
 * 
 * Constants:
 *   ABANDONED_TTL_MINUTES = 30 (session abandoned after 30 minutes of inactivity)
 * 
 * Usage:
 *   npm run sessions:prune
 *   ABANDONED_TTL_MINUTES=45 npx ts-node scripts/prune-abandoned-sessions.ts
 * 
 * Environment variables:
 *   DATABASE_URL_STAGING - Postgres connection string (required)
 *   ABANDONED_TTL_MINUTES - Override TTL (default: 30)
 * 
 * Metrics emitted:
 *   session_abandoned - Incremented for each session marked abandoned
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_ABANDONED_TTL_MINUTES = 30;

// =============================================================================
// HELPERS
// =============================================================================

function log(step: string, status: 'PASS' | 'FAIL' | 'INFO', detail?: string): void {
  const statusStr = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : 'ℹ';
  const detailStr = detail ? ` (${detail})` : '';
  console.log(`[${statusStr}] ${step}${detailStr}`);
}

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL_STAGING });
  await client.connect();
  
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    await client.end();
  }
}

// =============================================================================
// MAIN LOGIC
// =============================================================================

interface AbandonedSession {
  id: string;
  household_key: string;
  started_at: string;
}

/**
 * Find pending sessions older than TTL
 */
async function findAbandonedSessions(ttlMinutes: number): Promise<AbandonedSession[]> {
  const sql = `
    SELECT id, household_key, started_at
    FROM sessions
    WHERE outcome = 'pending' OR outcome IS NULL
      AND ended_at IS NULL
      AND started_at < NOW() - INTERVAL '${ttlMinutes} minutes'
    ORDER BY started_at ASC
    LIMIT 100
  `;
  
  return query<AbandonedSession>(sql);
}

/**
 * Mark sessions as abandoned
 */
async function markSessionsAbandoned(sessionIds: string[]): Promise<number> {
  if (sessionIds.length === 0) {
    return 0;
  }
  
  // Build parameterized query for array of IDs
  const placeholders = sessionIds.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `
    UPDATE sessions
    SET outcome = 'abandoned',
        ended_at = NOW(),
        updated_at = NOW()
    WHERE id IN (${placeholders})
      AND (outcome = 'pending' OR outcome IS NULL)
  `;
  
  const result = await query<{ rows_affected: number }>(sql, sessionIds);
  return sessionIds.length; // Assume all succeeded if no error
}

/**
 * Record metrics for abandoned sessions
 */
async function recordAbandonedMetrics(count: number): Promise<void> {
  if (count === 0) return;
  
  // Upsert into runtime_metrics_daily
  const sql = `
    INSERT INTO runtime_metrics_daily (day, metric_key, count, updated_at)
    VALUES (CURRENT_DATE, 'session_abandoned', $1, NOW())
    ON CONFLICT (day, metric_key) 
    DO UPDATE SET count = runtime_metrics_daily.count + $1, updated_at = NOW()
  `;
  
  await query(sql, [count]);
}

/**
 * Main
 */
async function main(): Promise<void> {
  console.log('=== Prune Abandoned Sessions ===\n');
  
  // Check env
  if (!process.env.DATABASE_URL_STAGING) {
    log('env_check', 'FAIL', 'DATABASE_URL_STAGING not set');
    process.exit(1);
  }
  log('env_check', 'PASS', 'DATABASE_URL_STAGING present');
  
  // Get TTL
  const ttlMinutes = parseInt(
    process.env.ABANDONED_TTL_MINUTES || String(DEFAULT_ABANDONED_TTL_MINUTES),
    10
  );
  log('ttl_config', 'INFO', `${ttlMinutes} minutes`);
  
  // Find abandoned sessions
  let abandonedSessions: AbandonedSession[];
  try {
    abandonedSessions = await findAbandonedSessions(ttlMinutes);
    log('find_abandoned', 'PASS', `${abandonedSessions.length} sessions found`);
  } catch (error) {
    log('find_abandoned', 'FAIL', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
  
  if (abandonedSessions.length === 0) {
    log('prune', 'INFO', 'No sessions to prune');
    console.log('\n=== PRUNE COMPLETED (0 sessions) ===');
    process.exit(0);
  }
  
  // Log session IDs (no PII)
  console.log('\nSessions to mark abandoned:');
  abandonedSessions.forEach(s => {
    const age = Math.round((Date.now() - new Date(s.started_at).getTime()) / 60000);
    console.log(`  - ${s.id} (${age} min old)`);
  });
  
  // Mark as abandoned
  const sessionIds = abandonedSessions.map(s => s.id);
  try {
    const count = await markSessionsAbandoned(sessionIds);
    log('mark_abandoned', 'PASS', `${count} sessions updated`);
  } catch (error) {
    log('mark_abandoned', 'FAIL', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
  
  // Record metrics
  try {
    await recordAbandonedMetrics(sessionIds.length);
    log('record_metrics', 'PASS', `session_abandoned += ${sessionIds.length}`);
  } catch (error) {
    log('record_metrics', 'FAIL', error instanceof Error ? error.message : 'Unknown error');
    // Don't exit - pruning succeeded even if metrics failed
  }
  
  console.log(`\n=== PRUNE COMPLETED (${sessionIds.length} sessions) ===`);
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
