#!/usr/bin/env node
/**
 * Dogfood Report Script
 * 
 * Fetches metrics summary from the internal endpoint and prints a concise report.
 * 
 * Usage:
 *   npm run dogfood:report
 *   STAGING_URL=https://... STAGING_AUTH_TOKEN=... npx ts-node scripts/dogfood-report.ts
 * 
 * Environment variables:
 *   STAGING_URL - Base URL for staging API (required)
 *   STAGING_AUTH_TOKEN - JWT token for authenticated requests (optional)
 * 
 * Dotenv support:
 *   Create .env.local with STAGING_URL and STAGING_AUTH_TOKEN for local dev.
 *   The script will automatically load from .env.local if present.
 * 
 * Red flags (prints warnings):
 *   - median time_to_decision > 180s
 *   - rescue_rate > 40%
 *   - acceptance_rate < 40%
 *   - any day with 0 sessions
 */

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
// CONFIGURATION
// =============================================================================

const RED_FLAG_THRESHOLDS = {
  median_time_to_decision_ms: 180_000, // 180 seconds
  rescue_rate_max: 0.40,               // 40%
  acceptance_rate_min: 0.40,           // 40%
};

// =============================================================================
// TYPES
// =============================================================================

interface MetricsSummaryResponse {
  ok: boolean;
  days_queried: number;
  summary: {
    total_sessions: number;
    accepted_sessions: number;
    rescued_sessions: number;
    abandoned_sessions: number;
    acceptance_rate: number;
    rescue_rate: number;
    median_time_to_decision_ms: number | null;
    p90_time_to_decision_ms: number | null;
    intents: {
      easy: number;
      cheap: number;
      quick: number;
      no_energy: number;
    };
  };
  computed_at: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatMs(ms: number | null): string {
  if (ms === null) return 'N/A';
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(1)}m`;
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function printSeparator(): void {
  console.log('━'.repeat(60));
}

function printWarning(message: string): void {
  console.log(`⚠️  RED FLAG: ${message}`);
}

// =============================================================================
// FETCH METRICS
// =============================================================================

async function fetchMetrics(days: number): Promise<MetricsSummaryResponse | null> {
  const stagingUrl = process.env.STAGING_URL;
  const authToken = process.env.STAGING_AUTH_TOKEN;
  
  if (!stagingUrl) {
    console.error('ERROR: STAGING_URL environment variable not set');
    return null;
  }
  
  const url = `${stagingUrl}/api/decision-os/_internal/metrics-summary?days=${days}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  try {
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.error(`ERROR: API returned ${response.status}`);
      return null;
    }
    
    return await response.json() as MetricsSummaryResponse;
  } catch (error) {
    console.error(`ERROR: Failed to fetch metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

// =============================================================================
// CHECK RED FLAGS
// =============================================================================

function checkRedFlags(summary: MetricsSummaryResponse['summary']): string[] {
  const flags: string[] = [];
  
  // Check median time to decision
  if (summary.median_time_to_decision_ms !== null) {
    if (summary.median_time_to_decision_ms > RED_FLAG_THRESHOLDS.median_time_to_decision_ms) {
      flags.push(
        `Median time-to-decision is ${formatMs(summary.median_time_to_decision_ms)} ` +
        `(threshold: ${formatMs(RED_FLAG_THRESHOLDS.median_time_to_decision_ms)})`
      );
    }
  }
  
  // Check rescue rate
  if (summary.rescue_rate > RED_FLAG_THRESHOLDS.rescue_rate_max) {
    flags.push(
      `Rescue rate is ${formatPercent(summary.rescue_rate)} ` +
      `(threshold: ${formatPercent(RED_FLAG_THRESHOLDS.rescue_rate_max)})`
    );
  }
  
  // Check acceptance rate
  if (summary.acceptance_rate < RED_FLAG_THRESHOLDS.acceptance_rate_min) {
    flags.push(
      `Acceptance rate is ${formatPercent(summary.acceptance_rate)} ` +
      `(threshold: ${formatPercent(RED_FLAG_THRESHOLDS.acceptance_rate_min)})`
    );
  }
  
  // Check for zero sessions
  if (summary.total_sessions === 0) {
    flags.push('Zero sessions recorded - logging may be broken or app not used');
  }
  
  return flags;
}

// =============================================================================
// PRINT REPORT
// =============================================================================

function printReport(data1Day: MetricsSummaryResponse | null, data7Day: MetricsSummaryResponse | null): void {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║            FAST FOOD DOGFOOD REPORT                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Print last 1 day
  if (data1Day && data1Day.ok) {
    printSeparator();
    console.log('📊 LAST 1 DAY');
    printSeparator();
    
    const s = data1Day.summary;
    console.log(`Sessions:       ${s.total_sessions} total`);
    console.log(`  Accepted:     ${s.accepted_sessions} (${formatPercent(s.acceptance_rate)})`);
    console.log(`  Rescued:      ${s.rescued_sessions} (${formatPercent(s.rescue_rate)})`);
    console.log(`  Abandoned:    ${s.abandoned_sessions}`);
    console.log('');
    console.log(`Time to Decision:`);
    console.log(`  Median:       ${formatMs(s.median_time_to_decision_ms)}`);
    console.log(`  P90:          ${formatMs(s.p90_time_to_decision_ms)}`);
    console.log('');
    console.log('Intent Buttons:');
    console.log(`  Easy:         ${s.intents.easy}`);
    console.log(`  Cheap:        ${s.intents.cheap}`);
    console.log(`  Quick:        ${s.intents.quick}`);
    console.log(`  No Energy:    ${s.intents.no_energy}`);
    
    // Check red flags for 1 day
    const flags1Day = checkRedFlags(s);
    if (flags1Day.length > 0) {
      console.log('');
      flags1Day.forEach(printWarning);
    }
  } else {
    printSeparator();
    console.log('📊 LAST 1 DAY: No data available');
    printSeparator();
  }
  
  console.log('');
  
  // Print last 7 days
  if (data7Day && data7Day.ok) {
    printSeparator();
    console.log('📊 LAST 7 DAYS');
    printSeparator();
    
    const s = data7Day.summary;
    console.log(`Sessions:       ${s.total_sessions} total`);
    console.log(`  Accepted:     ${s.accepted_sessions} (${formatPercent(s.acceptance_rate)})`);
    console.log(`  Rescued:      ${s.rescued_sessions} (${formatPercent(s.rescue_rate)})`);
    console.log(`  Abandoned:    ${s.abandoned_sessions}`);
    console.log('');
    console.log(`Time to Decision:`);
    console.log(`  Median:       ${formatMs(s.median_time_to_decision_ms)}`);
    console.log(`  P90:          ${formatMs(s.p90_time_to_decision_ms)}`);
    console.log('');
    console.log('Intent Buttons:');
    console.log(`  Easy:         ${s.intents.easy}`);
    console.log(`  Cheap:        ${s.intents.cheap}`);
    console.log(`  Quick:        ${s.intents.quick}`);
    console.log(`  No Energy:    ${s.intents.no_energy}`);
    
    // Check red flags for 7 days
    const flags7Day = checkRedFlags(s);
    if (flags7Day.length > 0) {
      console.log('');
      flags7Day.forEach(printWarning);
    }
  } else {
    printSeparator();
    console.log('📊 LAST 7 DAYS: No data available');
    printSeparator();
  }
  
  console.log('');
  printSeparator();
  console.log(`Report generated at: ${new Date().toISOString()}`);
  printSeparator();
  console.log('');
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log('Fetching metrics from staging...');
  
  // Fetch 1-day and 7-day data in parallel
  const [data1Day, data7Day] = await Promise.all([
    fetchMetrics(1),
    fetchMetrics(7),
  ]);
  
  if (!data1Day && !data7Day) {
    console.error('\nFAILED: Could not fetch any metrics data');
    process.exit(1);
  }
  
  printReport(data1Day, data7Day);
  
  // Exit with error if any red flags
  const allFlags: string[] = [];
  if (data1Day?.ok) {
    allFlags.push(...checkRedFlags(data1Day.summary));
  }
  if (data7Day?.ok) {
    allFlags.push(...checkRedFlags(data7Day.summary));
  }
  
  if (allFlags.length > 0) {
    console.log('⚠️  DOGFOOD REPORT: RED FLAGS DETECTED');
    process.exit(0); // Still exit 0 - red flags are warnings, not failures
  }
  
  console.log('✓ DOGFOOD REPORT: ALL METRICS WITHIN THRESHOLDS');
  process.exit(0);
}

main();
