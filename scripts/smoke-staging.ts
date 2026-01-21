#!/usr/bin/env node
/**
 * Staging Smoke Test Runner for Decision OS
 * 
 * AUTHENTICATION:
 * - If STAGING_AUTH_TOKEN is set, attaches it to all requests
 * - If not set in production mode, warns and runs dev scenario (no auth)
 * 
 * Verifies CANONICAL response shapes:
 * 1. Receipt import: { receiptImportId: string, status: string }
 * 2. Decision: { decision: object|null, drmRecommended: boolean, reason?: string, autopilot?: boolean }
 * 3. Feedback: { recorded: true }
 * 4. DRM: { drmActivated: boolean }
 * 
 * Error responses (401): { error: 'unauthorized' }
 * 
 * NOTE: decisionEventId is NOT in the canonical contract, so feedback test uses
 * a synthetic eventId (server handles gracefully as no-op for unknown IDs).
 * 
 * Usage:
 *   STAGING_URL=https://your-app.vercel.app STAGING_AUTH_TOKEN=<jwt> npm run smoke:staging
 * 
 * Exit codes:
 *   0 = All tests passed
 *   1 = One or more tests failed
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:8081';
const STAGING_AUTH_TOKEN = process.env.STAGING_AUTH_TOKEN;

// Canonical allowed fields (must match invariants.ts)
const DECISION_ALLOWED_FIELDS = new Set(['decision', 'drmRecommended', 'reason', 'autopilot']);
const DRM_ALLOWED_FIELDS = new Set(['drmActivated']);
const FEEDBACK_ALLOWED_FIELDS = new Set(['recorded']);
const RECEIPT_ALLOWED_FIELDS = new Set(['receiptImportId', 'status']);

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function log(name: string, passed: boolean, detail?: string): void {
  const status = passed ? '✓' : '✗';
  const detailStr = detail ? ` (${detail})` : '';
  console.log(`[${status}] ${name}${detailStr}`);
  results.push({ name, passed, detail });
}

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<{ status: number; data: T }> {
  const url = `${STAGING_URL}${path}`;
  
  // Build headers with auth if available
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (STAGING_AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${STAGING_AUTH_TOKEN}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });
  
  const data = await response.json() as T;
  return { status: response.status, data };
}

/**
 * Check that response only contains allowed fields
 */
function checkAllowedFields(data: Record<string, unknown>, allowed: Set<string>): { ok: boolean; unknown: string[] } {
  const unknown = Object.keys(data).filter(k => !allowed.has(k));
  return { ok: unknown.length === 0, unknown };
}

// =============================================================================
// TEST STEPS
// =============================================================================

async function testReceiptImport(): Promise<void> {
  console.log('\n--- Step 1: Receipt Import ---');
  
  try {
    const { status, data } = await fetchJson<{ receiptImportId: string; status: string }>(
      '/api/decision-os/receipt/import',
      {
        method: 'POST',
        body: JSON.stringify({
          imageBase64: 'test-image-data-for-staging',
          userProfileId: 1,
        }),
      }
    );
    
    const statusOk = status === 200;
    log('Receipt import returns 200', statusOk, `status=${status}`);
    
    // Must have receiptImportId (string)
    const hasId = typeof data.receiptImportId === 'string';
    log('receiptImportId is string', hasId);
    
    // Must have status (string)
    const hasStatus = typeof data.status === 'string';
    log('status is string', hasStatus, `value=${data.status}`);
    
    // Response shape: ONLY allowed fields
    const fieldCheck = checkAllowedFields(data, RECEIPT_ALLOWED_FIELDS);
    log('Receipt response has only allowed fields', fieldCheck.ok, 
        fieldCheck.ok ? 'ok' : `unknown: ${fieldCheck.unknown.join(',')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('Receipt import request', false, message);
  }
}

async function testDecision(): Promise<void> {
  console.log('\n--- Step 2: Decision Request ---');
  
  try {
    const { status, data } = await fetchJson<{
      decision: Record<string, unknown> | null;
      drmRecommended: boolean;
      reason?: string;
      autopilot?: boolean;
    }>('/api/decision-os/decision', {
      method: 'POST',
      body: JSON.stringify({
        userProfileId: 1,
        context: { time: '17:30', dayOfWeek: 'Tuesday' },
      }),
    });
    
    const statusOk = status === 200;
    log('Decision returns 200', statusOk, `status=${status}`);
    
    // drmRecommended: required boolean
    const hasDrm = typeof data.drmRecommended === 'boolean';
    log('drmRecommended is boolean', hasDrm, `value=${data.drmRecommended}`);
    
    // decision: required, object or null
    const hasDecision = 'decision' in data && (data.decision === null || typeof data.decision === 'object');
    log('decision is object|null', hasDecision);
    
    // reason: optional string
    if ('reason' in data) {
      const reasonOk = typeof data.reason === 'string';
      log('reason is string if present', reasonOk, `value=${data.reason}`);
    }
    
    // autopilot: optional boolean
    if ('autopilot' in data) {
      const autopilotOk = typeof data.autopilot === 'boolean';
      log('autopilot is boolean if present', autopilotOk, `value=${data.autopilot}`);
    }
    
    // Response shape: ONLY allowed fields (NO decisionEventId, NO message)
    const fieldCheck = checkAllowedFields(data, DECISION_ALLOWED_FIELDS);
    log('Decision response has only allowed fields', fieldCheck.ok,
        fieldCheck.ok ? 'ok' : `BANNED: ${fieldCheck.unknown.join(',')}`);
    
    // No arrays at any level
    const hasNoArrays = !Object.values(data).some(v => Array.isArray(v));
    log('No arrays in response', hasNoArrays);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('Decision request', false, message);
  }
}

async function testFeedback(): Promise<void> {
  console.log('\n--- Step 3: Feedback ---');
  
  // NOTE: Since decisionEventId is NOT in the canonical contract,
  // we use a synthetic eventId. Server handles gracefully (no-op for unknown IDs).
  const syntheticEventId = `smoke-test-event-${Date.now()}`;
  
  try {
    const { status, data } = await fetchJson<{ recorded: true }>('/api/decision-os/feedback', {
      method: 'POST',
      body: JSON.stringify({
        eventId: syntheticEventId,
        userAction: 'approved',
      }),
    });
    
    const statusOk = status === 200;
    log('Feedback returns 200', statusOk, `status=${status}`);
    
    // recorded: must be true
    const recordedOk = data.recorded === true;
    log('recorded is true', recordedOk, `value=${data.recorded}`);
    
    // Response shape: ONLY allowed fields (NO eventId)
    const fieldCheck = checkAllowedFields(data, FEEDBACK_ALLOWED_FIELDS);
    log('Feedback response has only allowed fields', fieldCheck.ok,
        fieldCheck.ok ? 'ok' : `BANNED: ${fieldCheck.unknown.join(',')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('Feedback request', false, message);
  }
}

async function testDrmRecommendation(): Promise<void> {
  console.log('\n--- Step 4: DRM Recommendation Check ---');
  
  try {
    // Multiple decision calls to verify drmRecommended behavior
    for (let i = 0; i < 3; i++) {
      const { data } = await fetchJson<{ drmRecommended: boolean }>(
        '/api/decision-os/decision',
        {
          method: 'POST',
          body: JSON.stringify({
            userProfileId: 1,
            context: { time: `18:0${i}`, dayOfWeek: 'Tuesday', testIteration: i },
          }),
        }
      );
      
      // Verify drmRecommended is always a boolean
      const drmValid = typeof data.drmRecommended === 'boolean';
      log(`Decision ${i + 1} drmRecommended is boolean`, drmValid, `value=${data.drmRecommended}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('DRM recommendation test', false, message);
  }
}

async function testDrmEndpoint(): Promise<void> {
  console.log('\n--- Step 5: DRM Endpoint ---');
  
  try {
    const { status, data } = await fetchJson<{ drmActivated: boolean }>(
      '/api/decision-os/drm',
      {
        method: 'POST',
        body: JSON.stringify({
          userProfileId: 1,
          reason: 'handle_it',
        }),
      }
    );
    
    const statusOk = status === 200;
    log('DRM returns 200', statusOk, `status=${status}`);
    
    // drmActivated: required boolean
    const hasActivated = typeof data.drmActivated === 'boolean';
    log('drmActivated is boolean', hasActivated, `value=${data.drmActivated}`);
    
    // Response shape: ONLY allowed fields (NO rescueActivated, rescueType, recorded, message)
    const fieldCheck = checkAllowedFields(data, DRM_ALLOWED_FIELDS);
    log('DRM response has only allowed fields', fieldCheck.ok,
        fieldCheck.ok ? 'ok' : `BANNED: ${fieldCheck.unknown.join(',')}`);
    
    // No arrays
    const hasNoArrays = !Object.values(data).some(v => Array.isArray(v));
    log('No arrays in DRM response', hasNoArrays);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('DRM request', false, message);
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function runSmokeTests(): Promise<void> {
  console.log('=== Staging Smoke Tests (Canonical Contract Validation) ===');
  console.log(`Target: ${STAGING_URL}`);
  
  // Auth warning
  if (STAGING_AUTH_TOKEN) {
    console.log('Auth: Token provided (production mode)');
  } else {
    console.log('Auth: No token provided (dev mode fallback)');
    console.log('      Set STAGING_AUTH_TOKEN for production testing\n');
  }
  console.log('');
  
  // Step 1: Receipt Import
  await testReceiptImport();
  
  // Step 2: Decision
  await testDecision();
  
  // Step 3: Feedback
  await testFeedback();
  
  // Step 4: DRM Recommendation
  await testDrmRecommendation();
  
  // Step 5: DRM Endpoint
  await testDrmEndpoint();
  
  // Summary
  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`Passed: ${passed}/${total}`);
  
  if (passed < total) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.detail || 'failed'}`);
    });
  }
  
  const allPassed = passed === total;
  console.log(`\n${allPassed ? '✓ STAGING SMOKE PASSED' : '✗ STAGING SMOKE FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

runSmokeTests().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
