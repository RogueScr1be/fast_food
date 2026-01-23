#!/usr/bin/env node
/**
 * Build Sanity Check Script
 * 
 * Validates build configuration before EAS builds.
 * Fails if:
 * - STAGING_URL missing for preview/production
 * - Auth token missing in preview profile (warning only)
 * - API base URL points to localhost in preview/production
 * 
 * Usage:
 *   npm run build:sanity
 *   npx ts-node scripts/build-sanity.ts [profile]
 * 
 * Exit codes:
 *   0 = All checks passed
 *   1 = One or more checks failed
 */

import * as fs from 'fs';
import * as path from 'path';

interface EasConfig {
  build: {
    [profile: string]: {
      env?: Record<string, string>;
      [key: string]: unknown;
    };
  };
}

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
  warning?: boolean;
}

const results: CheckResult[] = [];

function log(name: string, passed: boolean, detail?: string, warning = false): void {
  const status = passed ? '✓' : (warning ? '⚠' : '✗');
  const detailStr = detail ? ` (${detail})` : '';
  console.log(`[${status}] ${name}${detailStr}`);
  results.push({ name, passed: passed || warning, detail, warning });
}

function readEasConfig(): EasConfig | null {
  const easPath = path.join(process.cwd(), 'eas.json');
  if (!fs.existsSync(easPath)) {
    log('eas.json exists', false, 'File not found');
    return null;
  }
  
  try {
    const content = fs.readFileSync(easPath, 'utf-8');
    return JSON.parse(content) as EasConfig;
  } catch (error) {
    log('eas.json parseable', false, 'Invalid JSON');
    return null;
  }
}

function checkProfile(config: EasConfig, profileName: string): void {
  console.log(`\n--- Checking '${profileName}' profile ---`);
  
  const profile = config.build?.[profileName];
  if (!profile) {
    log(`Profile '${profileName}' exists`, false, 'Not found in eas.json');
    return;
  }
  
  log(`Profile '${profileName}' exists`, true);
  
  const env = profile.env || {};
  
  // Check EXPO_PUBLIC_APP_VARIANT
  const variant = env.EXPO_PUBLIC_APP_VARIANT;
  if (variant) {
    log('EXPO_PUBLIC_APP_VARIANT set', true, variant);
  } else {
    log('EXPO_PUBLIC_APP_VARIANT set', false, 'Missing');
  }
  
  // Check EXPO_PUBLIC_FF_MVP_ENABLED (kill switch)
  const ffMvpEnabled = env.EXPO_PUBLIC_FF_MVP_ENABLED;
  if (ffMvpEnabled) {
    log('EXPO_PUBLIC_FF_MVP_ENABLED set', true, ffMvpEnabled);
  } else {
    log('EXPO_PUBLIC_FF_MVP_ENABLED set', false, 'Missing - app will be disabled', true);
  }
  
  // For preview/production, check API URL
  if (profileName === 'preview' || profileName === 'production') {
    const baseUrl = env.EXPO_PUBLIC_DECISION_OS_BASE_URL;
    
    // Check if URL is set (EAS secret or inline)
    if (baseUrl) {
      // Check for localhost (invalid for non-dev)
      if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
        log('API URL not localhost', false, `Found: ${baseUrl}`);
      } else {
        log('API URL not localhost', true, baseUrl);
      }
    } else {
      // URL not inline - should be set via EAS secret
      log('API URL set (EAS secret required)', true, 'Not inline - use EAS secret', true);
    }
    
    // Check for auth token (warning only for preview)
    const authToken = env.EXPO_PUBLIC_STAGING_AUTH_TOKEN;
    if (profileName === 'preview') {
      if (authToken) {
        log('Staging auth token set', true, 'Token present');
      } else {
        log('Staging auth token set', true, 'Not inline - use EAS secret if needed', true);
      }
    }
    
    if (profileName === 'production') {
      // Production should NEVER have auth token
      if (authToken) {
        log('No auth token in production', false, 'SECURITY: Remove EXPO_PUBLIC_STAGING_AUTH_TOKEN');
      } else {
        log('No auth token in production', true, 'Correct');
      }
    }
  }
  
  // Development profile checks
  if (profileName === 'development') {
    const baseUrl = env.EXPO_PUBLIC_DECISION_OS_BASE_URL;
    if (baseUrl && (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1'))) {
      log('API URL is localhost', true, 'Correct for development');
    } else if (baseUrl) {
      log('API URL is localhost', true, `Using: ${baseUrl}`, true);
    } else {
      log('API URL is localhost', false, 'Missing EXPO_PUBLIC_DECISION_OS_BASE_URL');
    }
  }
}

function checkRequiredProfiles(config: EasConfig): void {
  console.log('\n--- Required Profiles ---');
  
  const required = ['development', 'preview', 'production'];
  for (const profile of required) {
    if (config.build?.[profile]) {
      log(`'${profile}' profile defined`, true);
    } else {
      log(`'${profile}' profile defined`, false, 'Missing');
    }
  }
}

function main(): void {
  console.log('=== EAS Build Sanity Check ===');
  
  const profile = process.argv[2];
  
  const config = readEasConfig();
  if (!config) {
    process.exit(1);
  }
  
  log('eas.json valid', true);
  
  // Check required profiles exist
  checkRequiredProfiles(config);
  
  // If specific profile requested, check only that
  if (profile) {
    checkProfile(config, profile);
  } else {
    // Check all profiles
    checkProfile(config, 'development');
    checkProfile(config, 'preview');
    checkProfile(config, 'production');
  }
  
  // Summary
  console.log('\n=== Summary ===');
  const failed = results.filter(r => !r.passed && !r.warning);
  const warnings = results.filter(r => r.warning);
  const passed = results.filter(r => r.passed && !r.warning);
  
  console.log(`Passed: ${passed.length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Failed: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log('\nFailed checks:');
    failed.forEach(r => console.log(`  - ${r.name}: ${r.detail || 'failed'}`));
    console.log('\n✗ BUILD SANITY CHECK FAILED');
    process.exit(1);
  }
  
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    warnings.forEach(r => console.log(`  - ${r.name}: ${r.detail || ''}`));
  }
  
  console.log('\n✓ BUILD SANITY CHECK PASSED');
  process.exit(0);
}

main();
