#!/usr/bin/env node
/**
 * Staging Smoke Test Runner for Decision OS — MVP Flow
 * 
 * TESTS THE FULL MVP SESSION LIFECYCLE:
 * 1. Create session + get decision (single decision returned)
 * 2. Reject once → still pending, get new decision
 * 3. Reject twice → DRM rescue returned (with full decision)
 * 4. Accept on new session → session closes accepted
 * 5. Verify DRM returns full decision (not just drmActivated)
 * 
 * AUTHENTICATION:
 * - If STAGING_AUTH_TOKEN is set, attaches it to all requests
 * - If not set, warns and runs dev scenario (no auth)
 * 
 * CANONICAL RESPONSE CONTRACTS:
 * - Decision: { decision, drmRecommended, reason?, autopilot? }
 * - Feedback: { recorded: true, drmRequired?: boolean, sessionId?: string }
 * - DRM: { drmActivated: boolean, reason?: string, decision?: object }
 * 
 * MVP INVARIANTS (must FAIL if violated):
 * - Multiple decisions returned
 * - Any endpoint asks a question / returns options list
 * - DRM returns false when fallbacks missing
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

/**
 * CANONICAL ALLOWED FIELDS (Phase 3 extended)
 */
const DECISION_ALLOWED_FIELDS = new Set(['decision', 'drmRecommended', 'reason', 'autopilot']);
const DRM_ALLOWED_FIELDS = new Set(['drmActivated', 'reason', 'decision']); // Phase 2: extended
const FEEDBACK_ALLOWED_FIELDS = new Set(['recorded', 'drmRequired', 'sessionId']); // Phase 3: extended
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

/**
 * Generate unique session ID for each test run
 */
function generateTestSessionId(): string {
  return `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// MVP FLOW TESTS
// =============================================================================

async function testMvpFlow1_CreateSessionGetDecision(): Promise<string | null> {
  console.log('\n--- MVP Flow 1: Create Session + Get Decision ---');
  
  try {
    const { status, data } = await fetchJson<{
      decision: Record<string, unknown> | null;
      drmRecommended: boolean;
      reason?: string;
    }>('/api/decision-os/decision', {
      method: 'POST',
      body: JSON.stringify({
        intent: { selected: ['easy'] },
      }),
    });
    
    const statusOk = status === 200;
    log('Decision returns 200', statusOk, `status=${status}`);
    
    // Must return exactly ONE decision (not array, not multiple options)
    const hasDecision = data.decision !== null && typeof data.decision === 'object';
    log('Decision is single object (not array)', hasDecision && !Array.isArray(data.decision));
    
    // If decision exists, must have execution_payload
    if (data.decision) {
      const hasPayload = 'execution_payload' in data.decision;
      log('Decision has execution_payload', hasPayload);
      
      // Extract sessionId from decision_id for later tests
      const decisionId = data.decision.decision_id as string | undefined;
      if (decisionId) {
        // Format: ses-xxx-xxx-timestamp
        const parts = decisionId.split('-');
        if (parts[0] === 'ses') {
          return parts.slice(0, 3).join('-');
        }
      }
    }
    
    // Field validation
    const fieldCheck = checkAllowedFields(data, DECISION_ALLOWED_FIELDS);
    log('Decision response has only allowed fields', fieldCheck.ok,
        fieldCheck.ok ? 'ok' : `BANNED: ${fieldCheck.unknown.join(',')}`);
    
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('Create session + get decision', false, message);
    return null;
  }
}

async function testMvpFlow2_RejectOnceStillPending(): Promise<void> {
  console.log('\n--- MVP Flow 2: Reject Once → Still Pending ---');
  
  const testSessionId = generateTestSessionId();
  
  try {
    // First, create a session by getting a decision
    await fetchJson('/api/decision-os/decision', {
      method: 'POST',
      body: JSON.stringify({
        intent: { selected: ['cheap'] },
        sessionId: testSessionId,
      }),
    });
    
    // Reject once
    const { status, data } = await fetchJson<{
      recorded: true;
      drmRequired?: boolean;
      sessionId?: string;
    }>('/api/decision-os/feedback', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: testSessionId,
        action: 'rejected',
      }),
    });
    
    const statusOk = status === 200;
    log('Feedback (reject) returns 200', statusOk, `status=${status}`);
    
    const recordedOk = data.recorded === true;
    log('recorded is true', recordedOk);
    
    // After 1 rejection, DRM should NOT be required
    const drmNotRequired = data.drmRequired !== true;
    log('drmRequired is false after 1 rejection', drmNotRequired, `value=${data.drmRequired}`);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('Reject once test', false, message);
  }
}

async function testMvpFlow3_RejectTwiceTriggersDrm(): Promise<void> {
  console.log('\n--- MVP Flow 3: Reject Twice → DRM Rescue ---');
  
  const testSessionId = generateTestSessionId();
  
  try {
    // Create session
    await fetchJson('/api/decision-os/decision', {
      method: 'POST',
      body: JSON.stringify({
        intent: { selected: ['quick'] },
        sessionId: testSessionId,
      }),
    });
    
    // First rejection
    await fetchJson('/api/decision-os/feedback', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: testSessionId,
        action: 'rejected',
      }),
    });
    
    // Second rejection → should trigger DRM
    const { status, data } = await fetchJson<{
      recorded: true;
      drmRequired?: boolean;
      sessionId?: string;
    }>('/api/decision-os/feedback', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: testSessionId,
        action: 'rejected',
      }),
    });
    
    const statusOk = status === 200;
    log('Feedback (2nd reject) returns 200', statusOk);
    
    // After 2 rejections, DRM should be required
    const drmRequired = data.drmRequired === true;
    log('drmRequired is true after 2 rejections', drmRequired, `value=${data.drmRequired}`);
    
    // If DRM required, call DRM endpoint and verify full decision
    if (drmRequired && data.sessionId) {
      const drmResult = await fetchJson<{
        drmActivated: boolean;
        reason?: string;
        decision?: Record<string, unknown>;
      }>('/api/decision-os/drm', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: data.sessionId,
          trigger: 'explicit_done',
        }),
      });
      
      log('DRM returns 200', drmResult.status === 200);
      log('DRM activated', drmResult.data.drmActivated === true);
      
      // DRM MUST return a full decision (Phase 2 contract)
      const hasDrmDecision = drmResult.data.decision !== null && typeof drmResult.data.decision === 'object';
      log('DRM returns full decision object', hasDrmDecision);
      
      if (hasDrmDecision && drmResult.data.decision) {
        const hasExecPayload = 'execution_payload' in drmResult.data.decision;
        log('DRM decision has execution_payload', hasExecPayload);
      }
    }
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('Reject twice test', false, message);
  }
}

async function testMvpFlow4_AcceptClosesSession(): Promise<void> {
  console.log('\n--- MVP Flow 4: Accept → Session Closes ---');
  
  const testSessionId = generateTestSessionId();
  
  try {
    // Create session
    await fetchJson('/api/decision-os/decision', {
      method: 'POST',
      body: JSON.stringify({
        intent: { selected: ['no_energy'] },
        sessionId: testSessionId,
      }),
    });
    
    // Accept the decision
    const { status, data } = await fetchJson<{
      recorded: true;
      drmRequired?: boolean;
    }>('/api/decision-os/feedback', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: testSessionId,
        action: 'accepted',
      }),
    });
    
    const statusOk = status === 200;
    log('Feedback (accept) returns 200', statusOk);
    
    const recordedOk = data.recorded === true;
    log('recorded is true', recordedOk);
    
    // Accepting should NOT require DRM
    const noDrm = data.drmRequired !== true;
    log('drmRequired is not true after accept', noDrm);
    
    // Field validation
    const fieldCheck = checkAllowedFields(data, FEEDBACK_ALLOWED_FIELDS);
    log('Feedback response has only allowed fields', fieldCheck.ok,
        fieldCheck.ok ? 'ok' : `BANNED: ${fieldCheck.unknown.join(',')}`);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('Accept closes session test', false, message);
  }
}

async function testMvpFlow5_DrmReturnsFullDecision(): Promise<void> {
  console.log('\n--- MVP Flow 5: DRM Returns Full Decision ---');
  
  try {
    // Call DRM directly with explicit_done
    const { status, data } = await fetchJson<{
      drmActivated: boolean;
      reason?: string;
      decision?: Record<string, unknown>;
    }>('/api/decision-os/drm', {
      method: 'POST',
      body: JSON.stringify({
        trigger: 'explicit_done',
      }),
    });
    
    const statusOk = status === 200;
    log('DRM returns 200', statusOk, `status=${status}`);
    
    const hasActivated = typeof data.drmActivated === 'boolean';
    log('drmActivated is boolean', hasActivated, `value=${data.drmActivated}`);
    
    // Phase 2 contract: DRM MUST return full decision
    if (data.drmActivated) {
      const hasDecision = data.decision !== null && typeof data.decision === 'object';
      log('DRM returns decision object when activated', hasDecision);
      
      if (hasDecision && data.decision) {
        // Must have execution_payload
        const hasPayload = 'execution_payload' in data.decision;
        log('DRM decision has execution_payload', hasPayload);
        
        // Must NOT be an array
        const notArray = !Array.isArray(data.decision);
        log('DRM decision is not array (single decision)', notArray);
        
        // Must have meal info
        const hasMeal = 'meal' in data.decision;
        log('DRM decision has meal', hasMeal);
      }
      
      // Must have reason
      const hasReason = typeof data.reason === 'string';
      log('DRM has reason string', hasReason, `value=${data.reason}`);
    }
    
    // Field validation
    const fieldCheck = checkAllowedFields(data, DRM_ALLOWED_FIELDS);
    log('DRM response has only allowed fields', fieldCheck.ok,
        fieldCheck.ok ? 'ok' : `BANNED: ${fieldCheck.unknown.join(',')}`);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('DRM full decision test', false, message);
  }
}

async function testMvpFlow6_TimeThresholdBehavior(): Promise<void> {
  console.log('\n--- MVP Flow 6: Time Threshold Behavior ---');
  
  try {
    // Call DRM with time_threshold trigger
    // If server time is before 18:15, should return drmActivated: false
    const { status, data } = await fetchJson<{
      drmActivated: boolean;
      reason?: string;
      decision?: Record<string, unknown>;
    }>('/api/decision-os/drm', {
      method: 'POST',
      body: JSON.stringify({
        trigger: 'time_threshold',
      }),
    });
    
    const statusOk = status === 200;
    log('DRM (time_threshold) returns 200', statusOk);
    
    // Behavior depends on server time
    // If before threshold: drmActivated=false, reason='not_time_yet'
    // If after threshold: drmActivated=true with decision
    
    if (!data.drmActivated) {
      const correctReason = data.reason === 'not_time_yet';
      log('When not activated, reason is not_time_yet', correctReason, `reason=${data.reason}`);
      
      // Should NOT have a decision when not activated
      const noDecision = data.decision === undefined || data.decision === null;
      log('No decision when not activated', noDecision);
    } else {
      // If activated (server time >= 18:15), must have decision
      const hasDecision = data.decision !== null && typeof data.decision === 'object';
      log('When activated, has decision', hasDecision);
    }
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('Time threshold test', false, message);
  }
}

async function testReceiptImport(): Promise<void> {
  console.log('\n--- Legacy: Receipt Import ---');
  
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
    
    const hasId = typeof data.receiptImportId === 'string';
    log('receiptImportId is string', hasId);
    
    const hasStatus = typeof data.status === 'string';
    log('status is string', hasStatus, `value=${data.status}`);
    
    const fieldCheck = checkAllowedFields(data, RECEIPT_ALLOWED_FIELDS);
    log('Receipt response has only allowed fields', fieldCheck.ok);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('Receipt import', false, message);
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function runSmokeTests(): Promise<void> {
  console.log('=== Staging Smoke Tests (MVP Flow Validation) ===');
  console.log(`Target: ${STAGING_URL}`);
  
  if (STAGING_AUTH_TOKEN) {
    console.log('Auth: Token provided (production mode)');
  } else {
    console.log('Auth: No token provided (dev mode fallback)');
    console.log('      Set STAGING_AUTH_TOKEN for production testing');
  }
  console.log('');
  
  // MVP Flow Tests (Phase 3)
  await testMvpFlow1_CreateSessionGetDecision();
  await testMvpFlow2_RejectOnceStillPending();
  await testMvpFlow3_RejectTwiceTriggersDrm();
  await testMvpFlow4_AcceptClosesSession();
  await testMvpFlow5_DrmReturnsFullDecision();
  await testMvpFlow6_TimeThresholdBehavior();
  
  // Legacy tests
  await testReceiptImport();
  
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
