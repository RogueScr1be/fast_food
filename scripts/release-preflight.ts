#!/usr/bin/env node
/**
 * Release Preflight Script
 * 
 * Runs all pre-release checks in order. Fails fast on any error.
 * Must pass before cutting a TestFlight build.
 * 
 * Usage:
 *   npm run release:preflight
 * 
 * Checks (in order):
 *   1. npm run test:tier1 - Tier 1 loop tests must pass
 *   2. npm run lint:tier1 - Tier 1 lint gate
 *   3. npm run typecheck:tier1 - Tier 1 type safety
 *   4. npm run build:sanity - build sanity
 *   5. npm run staging:healthcheck - staging health
 *   6. npm run auth:sanity:require401 - auth fail-closed
 *   7. npm run auth:sanity:require200 - auth success path
 *   8. npm run smoke:tier1:staging - Tier 1 staging smoke
 * 
 * Environment variables (required for step 3):
 *   STAGING_URL - Staging deployment URL
 *   STAGING_AUTH_TOKEN - JWT for authenticated requests
 */

import { execSync } from 'child_process';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface PreflightStep {
  name: string;
  command: string;
  description: string;
  required_env?: string[];
}

const STEPS: PreflightStep[] = [
  {
    name: 'tier1_test',
    command: 'npm run test:tier1',
    description: 'Run Tier 1 local-first learning loop tests',
  },
  {
    name: 'tier1_lint',
    command: 'npm run lint:tier1',
    description: 'Lint Tier 1 surfaces',
  },
  {
    name: 'tier1_typecheck',
    command: 'npm run typecheck:tier1',
    description: 'Typecheck Tier 1 surfaces',
  },
  {
    name: 'build_sanity',
    command: 'npm run build:sanity',
    description: 'Verify EAS build configuration',
  },
  {
    name: 'staging_healthcheck',
    command: 'npm run staging:healthcheck',
    description: 'Verify staging deployment health',
    required_env: ['STAGING_URL', 'STAGING_AUTH_TOKEN'],
  },
  {
    name: 'auth_require_401',
    command: 'npm run auth:sanity:require401',
    description: 'Verify protected endpoints reject unauthenticated calls',
    required_env: ['STAGING_URL'],
  },
  {
    name: 'auth_require_200',
    command: 'npm run auth:sanity:require200',
    description: 'Verify protected endpoints accept authenticated calls',
    required_env: ['STAGING_URL', 'STAGING_AUTH_TOKEN'],
  },
  {
    name: 'tier1_smoke_staging',
    command: 'npm run smoke:tier1:staging',
    description: 'Run Tier 1 staging smoke for actor/sync/weights/priors',
    required_env: ['STAGING_URL', 'STAGING_AUTH_TOKEN'],
  },
];

// =============================================================================
// EXECUTION
// =============================================================================

function checkRequiredEnv(step: PreflightStep): boolean {
  if (!step.required_env) return true;
  
  const missing: string[] = [];
  for (const envVar of step.required_env) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }
  
  if (missing.length > 0) {
    console.log(`\n⚠️  Missing environment variables for ${step.name}:`);
    for (const v of missing) {
      console.log(`   - ${v}`);
    }
    return false;
  }
  
  return true;
}

function runStep(step: PreflightStep): boolean {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`STEP: ${step.name}`);
  console.log(`DESC: ${step.description}`);
  console.log(`CMD:  ${step.command}`);
  console.log('='.repeat(60));
  
  // Check required env vars
  if (!checkRequiredEnv(step)) {
    console.log(`\n❌ SKIP ${step.name} - missing required environment variables`);
    console.log('   Set the variables and re-run release:preflight');
    return false;
  }
  
  try {
    execSync(step.command, {
      stdio: 'inherit',
      env: process.env,
    });
    console.log(`\n✅ PASS ${step.name}`);
    return true;
  } catch (error) {
    console.log(`\n❌ FAIL ${step.name}`);
    return false;
  }
}

function main(): void {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           RELEASE PREFLIGHT CHECK                        ║');
  console.log('║                                                          ║');
  console.log('║  All checks must pass before cutting a TestFlight build  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  
  const results: { name: string; passed: boolean }[] = [];
  
  for (const step of STEPS) {
    const passed = runStep(step);
    results.push({ name: step.name, passed });
    
    if (!passed) {
      // Fail fast
      console.log('\n');
      console.log('╔══════════════════════════════════════════════════════════╗');
      console.log('║  ❌ PREFLIGHT FAILED                                      ║');
      console.log('╚══════════════════════════════════════════════════════════╝');
      console.log('\nFailed at:', step.name);
      console.log('Fix the issue and re-run: npm run release:preflight');
      console.log('\nDo NOT proceed with release:testflight until preflight passes.\n');
      process.exit(1);
    }
  }
  
  // All passed
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ PREFLIGHT PASSED                                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\nAll checks passed. You may proceed with:');
  console.log('  npm run release:testflight');
  console.log('');
  
  // Summary
  console.log('Summary:');
  for (const r of results) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}`);
  }
  console.log('');
}

main();
