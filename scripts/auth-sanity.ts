#!/usr/bin/env node
/**
 * Auth Sanity Check
 * 
 * Verifies authentication and endpoints are working correctly on staging.
 * Prints only PASS/FAIL per step - no tokens, headers, or response bodies.
 * 
 * Endpoints tested:
 * a) GET /api/healthz -> must be 200 and ok:true
 * b) POST /api/decision-os/decision -> 200 canonical OR 401 unauthorized
 * c) POST /api/decision-os/receipt/import -> 200 canonical OR 401 unauthorized
 * d) POST /api/decision-os/feedback -> 200 canonical OR 401 unauthorized
 * e) POST /api/decision-os/drm -> 200 canonical OR 401 unauthorized
 * 
 * Usage:
 *   STAGING_URL=https://your-app.vercel.app STAGING_AUTH_TOKEN=<jwt> npx ts-node scripts/auth-sanity.ts
 * 
 * Exit codes:
 *   0 = All PASS
 *   1 = Any FAIL
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

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (STAGING_AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${STAGING_AUTH_TOKEN}`;
  }
  return headers;
}

/**
 * a) GET /api/healthz -> must be 200 and ok:true
 */
async function testHealthz(): Promise<boolean> {
  try {
    const response = await fetch(`${STAGING_URL}/api/healthz`);
    if (response.status !== 200) return false;
    
    const data = await response.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

/**
 * b) POST /api/decision-os/decision
 * Expects 200 with { decision, drmRecommended } OR 401 { error: 'unauthorized' }
 */
async function testDecision(): Promise<boolean> {
  try {
    const response = await fetch(`${STAGING_URL}/api/decision-os/decision`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ context: { time: '17:30' } }),
    });
    
    const data = await response.json();
    
    // 200 with canonical shape
    if (response.status === 200) {
      return typeof data.drmRecommended === 'boolean' && 'decision' in data;
    }
    
    // 401 with error
    if (response.status === 401) {
      return data.error === 'unauthorized';
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * c) POST /api/decision-os/receipt/import
 * Expects 200 with { receiptImportId, status } OR 401 { error: 'unauthorized' }
 */
async function testReceipt(): Promise<boolean> {
  try {
    const response = await fetch(`${STAGING_URL}/api/decision-os/receipt/import`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ imageBase64: 'test-image' }),
    });
    
    const data = await response.json();
    
    // 200 with canonical shape
    if (response.status === 200) {
      return typeof data.receiptImportId === 'string' && typeof data.status === 'string';
    }
    
    // 401 with error
    if (response.status === 401) {
      return data.error === 'unauthorized';
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * d) POST /api/decision-os/feedback
 * Expects 200 with { recorded: true } OR 401 { error: 'unauthorized' }
 */
async function testFeedback(): Promise<boolean> {
  try {
    const response = await fetch(`${STAGING_URL}/api/decision-os/feedback`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ eventId: 'sanity-test', userAction: 'approved' }),
    });
    
    const data = await response.json();
    
    // 200 with canonical shape
    if (response.status === 200) {
      return data.recorded === true;
    }
    
    // 401 with error
    if (response.status === 401) {
      return data.error === 'unauthorized';
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * e) POST /api/decision-os/drm
 * Expects 200 with { drmActivated: boolean } OR 401 { error: 'unauthorized' }
 */
async function testDrm(): Promise<boolean> {
  try {
    const response = await fetch(`${STAGING_URL}/api/decision-os/drm`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ reason: 'handle_it' }),
    });
    
    const data = await response.json();
    
    // 200 with canonical shape
    if (response.status === 200) {
      return typeof data.drmActivated === 'boolean';
    }
    
    // 401 with error
    if (response.status === 401) {
      return data.error === 'unauthorized';
    }
    
    return false;
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

  // a) Healthz
  log('healthz', await testHealthz());

  // b) Decision
  log('decision', await testDecision());

  // c) Receipt
  log('receipt', await testReceipt());

  // d) Feedback
  log('feedback', await testFeedback());

  // e) DRM
  log('drm', await testDrm());

  // Summary
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();
