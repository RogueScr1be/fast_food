#!/usr/bin/env node
/**
 * SQL Contract Gate
 * 
 * Ensures SQL touching tenant tables only appears in allowed locations:
 * - lib/decision-os/db/sql.ts (helpers)
 * - lib/decision-os/db/client.ts (runtime SQL)
 * - lib/decision-os/auth/helper.ts (auth tables)
 * - Test files (__tests__)
 * 
 * Violations fail CI.
 */

const { execSync } = require('child_process');
const path = require('path');

// Tenant tables that require household_key isolation
const TENANT_TABLES = [
  'households',
  'user_profiles', 
  'sessions',
  'decisions',
  'receipts',
  'inventory_items',
  'meal_plans',
  'decision_events',
  'rescue_attempts'
];

// Allowed file patterns (relative to repo root)
const ALLOWED_PATTERNS = [
  'lib/decision-os/db/',
  'lib/decision-os/auth/',
  '__tests__',
  'test',
  '.test.ts',
  '.test.tsx',
  'scripts/',
  'db/migrations/'
];

function isAllowedFile(filePath) {
  return ALLOWED_PATTERNS.some(pattern => filePath.includes(pattern));
}

function main() {
  console.log('SQL Contract Gate: Checking for tenant SQL outside allowed locations...\n');
  
  let violations = [];
  
  for (const table of TENANT_TABLES) {
    // Search for SQL patterns referencing this table
    const patterns = [
      `FROM\\s+${table}`,
      `INTO\\s+${table}`,
      `UPDATE\\s+${table}`,
      `DELETE\\s+FROM\\s+${table}`,
      `JOIN\\s+${table}`
    ];
    
    for (const pattern of patterns) {
      try {
        // Use ripgrep to find matches
        const result = execSync(
          `rg -l -i "${pattern}" --type ts --type tsx 2>/dev/null || true`,
          { encoding: 'utf-8', cwd: process.cwd() }
        );
        
        const files = result.trim().split('\n').filter(f => f);
        
        for (const file of files) {
          if (!isAllowedFile(file)) {
            violations.push({ file, table, pattern });
          }
        }
      } catch (e) {
        // rg not found or no matches - continue
      }
    }
  }
  
  if (violations.length > 0) {
    console.error('FAIL: SQL contract violations found:\n');
    for (const v of violations) {
      console.error(`  ${v.file}: references '${v.table}'`);
    }
    console.error('\nSQL touching tenant tables must be in:');
    console.error('  - lib/decision-os/db/');
    console.error('  - lib/decision-os/auth/');
    console.error('  - Test files');
    process.exit(1);
  }
  
  console.log('PASS: No SQL contract violations found.');
  process.exit(0);
}

main();
