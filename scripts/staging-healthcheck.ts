#!/usr/bin/env node
/**
 * Staging Healthcheck Script
 * 
 * Runs both smoke tests and dogfood report against staging.
 * Exits non-zero if either fails.
 * 
 * Usage:
 *   npm run staging:healthcheck
 * 
 * Environment variables:
 *   STAGING_URL - Base URL for staging API (required)
 *   STAGING_AUTH_TOKEN - JWT token for authenticated requests (required for smoke)
 * 
 * Dotenv support:
 *   Create .env.local with STAGING_URL and STAGING_AUTH_TOKEN for local dev.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// DOTENV SUPPORT (load .env.local if exists)
// =============================================================================

function loadEnvFile(): void {
  const envFiles = ['.env.local', '.env.staging', '.env'];
  
  for (const file of envFiles) {
    const envPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(envPath)) {
      console.log(`Loading environment from ${file}...`);
      const content = fs.readFileSync(envPath, 'utf8');
      
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          // Only set if not already defined (env vars take precedence)
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
      return; // Load only first matching file
    }
  }
}

// Load env file at startup
loadEnvFile();

// =============================================================================
// HELPERS
// =============================================================================

function printSeparator(): void {
  console.log('═'.repeat(60));
}

function printStep(step: string): void {
  console.log(`\n>>> ${step}`);
  printSeparator();
}

/**
 * Run a command and return the exit code
 */
function runCommand(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });
    
    proc.on('close', (code) => {
      resolve(code ?? 1);
    });
    
    proc.on('error', () => {
      resolve(1);
    });
  });
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║          FAST FOOD STAGING HEALTHCHECK                    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Verify required env vars
  if (!process.env.STAGING_URL) {
    console.error('ERROR: STAGING_URL environment variable not set');
    console.error('');
    console.error('Either:');
    console.error('  1. Create .env.local with STAGING_URL and STAGING_AUTH_TOKEN');
    console.error('  2. Run with: STAGING_URL=... STAGING_AUTH_TOKEN=... npm run staging:healthcheck');
    process.exit(1);
  }
  
  console.log(`Target: ${process.env.STAGING_URL}`);
  console.log(`Auth: ${process.env.STAGING_AUTH_TOKEN ? 'Token provided' : 'No token'}`);
  console.log('');
  
  let allPassed = true;
  
  // Step 1: Run smoke tests
  printStep('STEP 1: Smoke Tests (npm run smoke:staging)');
  const smokeExitCode = await runCommand('npm', ['run', 'smoke:staging']);
  
  if (smokeExitCode !== 0) {
    console.error('\n✗ Smoke tests FAILED');
    allPassed = false;
  } else {
    console.log('\n✓ Smoke tests PASSED');
  }
  
  // Step 2: Run dogfood report
  printStep('STEP 2: Dogfood Report (npm run dogfood:report)');
  const reportExitCode = await runCommand('npm', ['run', 'dogfood:report']);
  
  if (reportExitCode !== 0) {
    console.error('\n✗ Dogfood report FAILED');
    allPassed = false;
  } else {
    console.log('\n✓ Dogfood report PASSED');
  }
  
  // Summary
  console.log('');
  printSeparator();
  
  if (allPassed) {
    console.log('✓ STAGING HEALTHCHECK: ALL PASSED');
    printSeparator();
    process.exit(0);
  } else {
    console.log('✗ STAGING HEALTHCHECK: FAILED');
    printSeparator();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
