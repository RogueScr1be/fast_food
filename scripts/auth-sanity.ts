#!/usr/bin/env node
/**
 * Auth Sanity Check
 * 
 * Verifies authentication is working correctly on staging.
 * Prints only PASS/FAIL - no tokens, headers, or response bodies.
 * 
 * Usage:
 *   STAGING_URL=https://your-app.vercel.app STAGING_AUTH_TOKEN=<jwt> npx ts-node scripts/auth-sanity.ts
 * 
 * Exit codes:
 *   0 = PASS (got 200 with valid response OR 401 with { error: 'unauthorized' })
 *   1 = FAIL (unexpected response)
 */

const STAGING_URL = process.env.STAGING_URL;
const STAGING_AUTH_TOKEN = process.env.STAGING_AUTH_TOKEN;

async function checkAuth(): Promise<boolean> {
  if (!STAGING_URL) {
    return false;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (STAGING_AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${STAGING_AUTH_TOKEN}`;
  }

  try {
    const response = await fetch(`${STAGING_URL}/api/decision-os/decision`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        context: { time: '17:30' },
      }),
    });

    const data = await response.json();

    // Case 1: 200 with canonical Decision response
    if (response.status === 200) {
      // Verify it has the required shape (drmRecommended and decision fields)
      if (typeof data.drmRecommended === 'boolean' && 'decision' in data) {
        return true;
      }
      return false;
    }

    // Case 2: 401 with { error: 'unauthorized' }
    if (response.status === 401) {
      if (data.error === 'unauthorized') {
        return true;
      }
      return false;
    }

    // Any other status is unexpected
    return false;
  } catch {
    // Network error or parse error
    return false;
  }
}

async function main(): Promise<void> {
  if (!STAGING_URL) {
    console.log('FAIL');
    console.error('STAGING_URL environment variable is required');
    process.exit(1);
  }

  const passed = await checkAuth();

  if (passed) {
    console.log('PASS');
    process.exit(0);
  } else {
    console.log('FAIL');
    process.exit(1);
  }
}

main();
