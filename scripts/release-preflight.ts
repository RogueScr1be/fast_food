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
 *   1. npm test - All tests must pass
 *   2. npm run build:sanity - EAS config must be valid
 *   3. npm run staging:healthcheck - Staging must be healthy
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
    name: 'test',
    command: 'npm test',
    description: 'Run all unit tests',
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
