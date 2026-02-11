#!/usr/bin/env node
/**
 * Auth Sanity Check - Require 200
 * 
 * Verifies that protected endpoints correctly return 200 when valid auth token is provided.
 * Includes JWT expiration preflight to prevent "green now, red later" issues.
 * 
 * PREFLIGHT: Decodes JWT and fails fast if token expires within 5 minutes.
 * 
 * Endpoints tested (WITH token):
 * a) GET /healthz.json -> must be 200 and ok:true
 * b) POST /api/decision-os/decision -> MUST be 200 with canonical shape
 * c) POST /api/decision-os/receipt/import -> MUST be 200 with canonical shape
 * d) POST /api/decision-os/feedback -> MUST be 200 with { recorded: true }
 * e) POST /api/decision-os/drm -> MUST be 200 with { drmActivated: boolean }
 * 
 * Usage:
 *   STAGING_URL=https://your-app.vercel.app STAGING_AUTH_TOKEN=eyJ... npm run auth:sanity:require200
 * 
 * Exit codes:
 *   0 = All PASS (200s received with correct shapes)
 *   1 = Any FAIL (got 401, wrong shape, or token expiring)
 */

const STAGING_URL = process.env.STAGING_URL;
const STAGING_AUTH_TOKEN = process.env.STAGING_AUTH_TOKEN;

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

// =============================================================================
// JWT PREFLIGHT CHECK
// =============================================================================

/**
 * Decode JWT payload without logging the token.
 * Returns null if decode fails.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Check if token expires within the next N minutes.
 * Returns { valid: true } if token is good, { valid: false, reason } if not.
 */
function checkTokenExpiration(token: string, minutesBuffer: number = 5): { valid: boolean; reason?: string } {
  const payload = decodeJwtPayload(token);
  
  if (!payload) {
    return { valid: false, reason: 'invalid_jwt_format' };
  }
  
  const exp = payload.exp;
  if (typeof exp !== 'number') {
    // No expiration claim - assume valid
    return { valid: true };
  }
  
  const now = Math.floor(Date.now() / 1000);
  const bufferSeconds = minutesBuffer * 60;
  
  if (exp < now) {
    return { valid: false, reason: 'token_expired' };
  }
  
  if (exp < now + bufferSeconds) {
    return { valid: false, reason: 'token_expiring' };
  }
  
  return { valid: true };
}

// =============================================================================
// HTTP HELPERS
// =============================================================================

function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${STAGING_AUTH_TOKEN}`,
  };
}

/**
 * a) GET /healthz.json -> must be 200 and ok:true
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
 * b) POST /api/decision-os/decision
 * MUST be 200 with { decision, drmRecommended }
 */
async function testDecision(): Promise<boolean> {
  try {
    const response = await fetch(`${STAGING_URL}/api/decision-os/decision`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ context: { time: '17:30' } }),
    });
    
    if (response.status !== 200) return false;
    
    const data = await response.json();
    return typeof data.drmRecommended === 'boolean' && 'decision' in data;
  } catch {
    return false;
  }
}

/**
 * c) POST /api/decision-os/receipt/import
 * MUST be 200 with { receiptImportId, status }
 */
async function testReceipt(): Promise<boolean> {
  try {
    const response = await fetch(`${STAGING_URL}/api/decision-os/receipt/import`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ imageBase64: 'test-image' }),
    });
    
    if (response.status !== 200) return false;
    
    const data = await response.json();
    return typeof data.receiptImportId === 'string' && typeof data.status === 'string';
  } catch {
    return false;
  }
}

/**
 * d) POST /api/decision-os/feedback
 * MUST be 200 with { recorded: true }
 */
async function testFeedback(): Promise<boolean> {
  try {
    const response = await fetch(`${STAGING_URL}/api/decision-os/feedback`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ eventId: 'sanity-test', userAction: 'approved' }),
    });
    
    if (response.status !== 200) return false;
    
    const data = await response.json();
    return data.recorded === true;
  } catch {
    return false;
  }
}

/**
 * e) POST /api/decision-os/drm
 * MUST be 200 with { drmActivated: boolean }
 */
async function testDrm(): Promise<boolean> {
  try {
    const response = await fetch(`${STAGING_URL}/api/decision-os/drm`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ reason: 'handle_it' }),
    });
    
    if (response.status !== 200) return false;
    
    const data = await response.json();
    return typeof data.drmActivated === 'boolean';
  } catch {
    return false;
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  if (!STAGING_URL) {
    console.log('FAIL setup');
    console.error('STAGING_URL environment variable is required');
    process.exit(1);
  }

  if (!STAGING_AUTH_TOKEN) {
    console.log('FAIL setup');
    console.error('STAGING_AUTH_TOKEN environment variable is required');
    process.exit(1);
  }

  console.log('--- Auth Sanity: Require 200 (with token) ---\n');

  // PREFLIGHT: Check token expiration
  const tokenCheck = checkTokenExpiration(STAGING_AUTH_TOKEN, 5);
  if (!tokenCheck.valid) {
    log('token_preflight', false);
    console.error(`Token issue: ${tokenCheck.reason}`);
    console.error('Rotate STAGING_AUTH_TOKEN and try again.');
    process.exit(1);
  }
  log('token_preflight', true);

  // a) Healthz (public - should be 200)
  log('healthz', await testHealthz());

  // b) Decision (protected - MUST be 200 with auth)
  log('decision_200', await testDecision());

  // c) Receipt (protected - MUST be 200 with auth)
  log('receipt_200', await testReceipt());

  // d) Feedback (protected - MUST be 200 with auth)
  log('feedback_200', await testFeedback());

  // e) DRM (protected - MUST be 200 with auth)
  log('drm_200', await testDrm());

  // Summary
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    console.log(`\nFailed: ${failed.map(f => f.name).join(', ')}`);
    process.exit(1);
  }
  
  console.log('\nAll endpoints returned 200 with valid shapes.');
  process.exit(0);
}

main();
