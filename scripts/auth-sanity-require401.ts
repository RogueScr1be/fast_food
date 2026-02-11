#!/usr/bin/env node
/**
 * Auth Sanity Check - Require 401
 * 
 * Verifies that protected endpoints correctly return 401 when NO auth token is provided.
 * This prevents silent auth bypass bugs.
 * 
 * Endpoints tested (WITHOUT token):
 * a) GET /healthz.json -> must be 200 and ok:true (public endpoint)
 * b) POST /api/decision-os/decision -> MUST be 401 { error:'unauthorized' }
 * c) POST /api/decision-os/receipt/import -> MUST be 401 { error:'unauthorized' }
 * d) POST /api/decision-os/feedback -> MUST be 401 { error:'unauthorized' }
 * e) POST /api/decision-os/drm -> MUST be 401 { error:'unauthorized' }
 * 
 * Usage:
 *   STAGING_URL=https://your-app.vercel.app npm run auth:sanity:require401
 * 
 * Exit codes:
 *   0 = All PASS (401s received where expected)
 *   1 = Any FAIL (got 200 when should have got 401, or other error)
 */

const STAGING_URL = process.env.STAGING_URL;

interface TestResult {
  name: string;
  passed: boolean;
}

const results: TestResult[] = [];

function log(name: string, passed: boolean): void {
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`${status} ${name}`);
  results.push({ name, passed });
}

function getHeaders(): Record<string, string> {
  // NO Authorization header - that's the point of this test
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * a) GET /healthz.json -> must be 200 and ok:true (public endpoint)
 */
async function testHealthz(): Promise<boolean> {
  try {
    const response = await fetch(`${STAGING_URL}/healthz.json`);
    if (response.status !== 200) return false;
    
    const data = await response.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

/**
 * Test protected endpoint - MUST return 401 { error: 'unauthorized' }
 */
async function testProtectedEndpoint(
  path: string,
  body: Record<string, unknown>
): Promise<boolean> {
  try {
    const response = await fetch(`${STAGING_URL}${path}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    
    // MUST be 401
    if (response.status !== 401) {
      return false;
    }
    
    const data = await response.json();
    return data.error === 'unauthorized';
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!STAGING_URL) {
    console.log('FAIL setup');
    console.error('STAGING_URL environment variable is required');
    process.exit(1);
  }

  console.log('--- Auth Sanity: Require 401 (no token) ---\n');

  // a) Healthz (public - should be 200)
  log('healthz', await testHealthz());

  // b) Decision (protected - MUST be 401)
  log('decision_401', await testProtectedEndpoint(
    '/api/decision-os/decision',
    { context: { time: '17:30' } }
  ));

  // c) Receipt (protected - MUST be 401)
  log('receipt_401', await testProtectedEndpoint(
    '/api/decision-os/receipt/import',
    { imageBase64: 'test' }
  ));

  // d) Feedback (protected - MUST be 401)
  log('feedback_401', await testProtectedEndpoint(
    '/api/decision-os/feedback',
    { eventId: 'test', userAction: 'approved' }
  ));

  // e) DRM (protected - MUST be 401)
  log('drm_401', await testProtectedEndpoint(
    '/api/decision-os/drm',
    { reason: 'handle_it' }
  ));

  // Summary
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    console.log(`\nFailed: ${failed.map(f => f.name).join(', ')}`);
    process.exit(1);
  }
  
  console.log('\nAll protected endpoints correctly require auth.');
  process.exit(0);
}

main();
