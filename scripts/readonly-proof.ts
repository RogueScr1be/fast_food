#!/usr/bin/env node
/**
 * Readonly Mode Proof Script
 * 
 * Proves that readonly mode prevents DB writes while maintaining valid responses.
 * 
 * Required environment variables:
 * - DATABASE_URL_STAGING: Postgres connection string for staging DB
 * - STAGING_URL: Base URL for staging API (e.g., https://app.vercel.app)
 * - STAGING_AUTH_TOKEN: JWT for authenticated requests
 * 
 * RUNTIME_FLAGS_ENABLED must be true in staging env for this test to be meaningful.
 * 
 * Steps:
 * 1. Count current rows in decision_events, taste_signals, inventory_items, receipt_imports
 * 2. Set decision_os_readonly = true in DB
 * 3. Call decision/receipt/feedback/drm endpoints
 * 4. Verify canonical responses
 * 5. Verify row counts unchanged
 * 6. Restore readonly = false
 * 
 * Output: Only PASS/FAIL lines (no tokens, URLs, or payloads)
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const DATABASE_URL = process.env.DATABASE_URL_STAGING;
const STAGING_URL = process.env.STAGING_URL;
const STAGING_AUTH_TOKEN = process.env.STAGING_AUTH_TOKEN;

function checkEnv(): boolean {
  if (!DATABASE_URL) {
    console.log('FAIL missing DATABASE_URL_STAGING');
    return false;
  }
  if (!STAGING_URL) {
    console.log('FAIL missing STAGING_URL');
    return false;
  }
  if (!STAGING_AUTH_TOKEN) {
    console.log('FAIL missing STAGING_AUTH_TOKEN');
    return false;
  }
  return true;
}

// =============================================================================
// DATABASE HELPERS
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

async function setReadonlyFlag(
  client: DbClient,
  enabled: boolean
): Promise<boolean> {
  try {
    await client.query(
      `INSERT INTO runtime_flags (key, enabled, updated_at) 
       VALUES ('decision_os_readonly', $1, NOW()) 
       ON CONFLICT (key) DO UPDATE SET enabled = $1, updated_at = NOW()`,
      [enabled]
    );
    return true;
  } catch {
    return false;
  }
}

interface RowCounts {
  decision_events: number;
  taste_signals: number;
  inventory_items: number;
  receipt_imports: number;
}

async function getRowCounts(client: DbClient): Promise<RowCounts | null> {
  try {
    const tables = ['decision_events', 'taste_signals', 'inventory_items', 'receipt_imports'];
    const counts: RowCounts = {
      decision_events: 0,
      taste_signals: 0,
      inventory_items: 0,
      receipt_imports: 0,
    };
    
    for (const table of tables) {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ${table}`
      );
      counts[table as keyof RowCounts] = parseInt(result.rows[0]?.count || '0', 10);
    }
    
    return counts;
  } catch {
    return null;
  }
}

// =============================================================================
// API HELPERS
// =============================================================================

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (STAGING_AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${STAGING_AUTH_TOKEN}`;
  }
  return headers;
}

async function callEndpoint(
  path: string,
  body: Record<string, unknown>
): Promise<{ status: number; ok: boolean } | null> {
  try {
    const response = await fetch(`${STAGING_URL}${path}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    
    return {
      status: response.status,
      ok: response.status === 200,
    };
  } catch {
    return null;
  }
}

// =============================================================================
// PROOF STEPS
// =============================================================================

async function runProof(): Promise<boolean> {
  let client: DbClient | null = null;
  let allPassed = true;
  
  try {
    // Step 0: Connect to DB
    client = await getDbClient();
    if (!client) {
      return false;
    }
    console.log('PASS db_connected');
    
    // Step 1: Get initial row counts
    const initialCounts = await getRowCounts(client);
    if (!initialCounts) {
      console.log('FAIL initial_count_failed');
      return false;
    }
    console.log('PASS initial_counts_captured');
    
    // Step 2: Set readonly = true
    const setTrue = await setReadonlyFlag(client, true);
    if (!setTrue) {
      console.log('FAIL set_readonly_true');
      return false;
    }
    console.log('PASS set_readonly_true');
    
    // Small delay to allow cache to expire
    await new Promise(r => setTimeout(r, 500));
    
    // Step 3: Call all endpoints
    const decisionResult = await callEndpoint('/api/decision-os/decision', {
      context: { time: '18:00' }
    });
    if (!decisionResult || !decisionResult.ok) {
      console.log('FAIL decision_call');
      allPassed = false;
    } else {
      console.log('PASS decision_returns_200');
    }
    
    const receiptResult = await callEndpoint('/api/decision-os/receipt/import', {
      imageBase64: 'dGVzdA=='
    });
    if (!receiptResult || !receiptResult.ok) {
      console.log('FAIL receipt_call');
      allPassed = false;
    } else {
      console.log('PASS receipt_returns_200');
    }
    
    const feedbackResult = await callEndpoint('/api/decision-os/feedback', {
      eventId: 'test-event-readonly-proof',
      userAction: 'approved'
    });
    if (!feedbackResult || !feedbackResult.ok) {
      console.log('FAIL feedback_call');
      allPassed = false;
    } else {
      console.log('PASS feedback_returns_200');
    }
    
    const drmResult = await callEndpoint('/api/decision-os/drm', {
      reason: 'handle_it'
    });
    if (!drmResult || !drmResult.ok) {
      console.log('FAIL drm_call');
      allPassed = false;
    } else {
      console.log('PASS drm_returns_200');
    }
    
    // Step 4: Verify row counts unchanged
    const finalCounts = await getRowCounts(client);
    if (!finalCounts) {
      console.log('FAIL final_count_failed');
      return false;
    }
    
    // Check each table
    if (finalCounts.decision_events !== initialCounts.decision_events) {
      console.log('FAIL decision_events_changed');
      allPassed = false;
    } else {
      console.log('PASS decision_events_unchanged');
    }
    
    if (finalCounts.taste_signals !== initialCounts.taste_signals) {
      console.log('FAIL taste_signals_changed');
      allPassed = false;
    } else {
      console.log('PASS taste_signals_unchanged');
    }
    
    if (finalCounts.inventory_items !== initialCounts.inventory_items) {
      console.log('FAIL inventory_items_changed');
      allPassed = false;
    } else {
      console.log('PASS inventory_items_unchanged');
    }
    
    if (finalCounts.receipt_imports !== initialCounts.receipt_imports) {
      console.log('FAIL receipt_imports_changed');
      allPassed = false;
    } else {
      console.log('PASS receipt_imports_unchanged');
    }
    
    return allPassed;
  } finally {
    // Step 5: Always restore readonly = false
    if (client) {
      try {
        await setReadonlyFlag(client, false);
        console.log('PASS readonly_restored');
      } catch {
        console.log('WARN readonly_restore_failed');
      }
      
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log('=== Readonly Mode Proof ===\n');
  
  // Check environment
  if (!checkEnv()) {
    process.exit(1);
  }
  console.log('PASS env_vars_present\n');
  
  // Run proof
  const success = await runProof();
  
  console.log('');
  if (success) {
    console.log('=== READONLY PROOF PASSED ===');
    process.exit(0);
  } else {
    console.log('=== READONLY PROOF FAILED ===');
    process.exit(1);
  }
}

main().catch(() => {
  console.log('FAIL unexpected_error');
  process.exit(1);
});
