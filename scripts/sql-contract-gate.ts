#!/usr/bin/env node
/**
 * SQL Contract Gate
 * 
 * CI job that fails if:
 * 1. Raw SQL strings with household_key appear outside allowed files
 * 2. Direct household_key predicates are written without using helpers
 * 
 * ALLOWED FILES (can have household_key in SQL):
 * - lib/decision-os/db/sql.ts (helper definitions)
 * - lib/decision-os/db/client.ts (runtime SQL - canonical source)
 * - lib/decision-os/__tests__/*.test.ts (tests)
 * 
 * BLOCKED:
 * - Any other file in lib/decision-os with household_key in SQL context
 * 
 * This is a "cheap enforcement" layer on top of runtime contract checks.
 */

import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_FILES = [
  'lib/decision-os/db/sql.ts',
  'lib/decision-os/db/client.ts',
  'lib/decision-os/auth/helper.ts', // Auth helper uses household_key for system tables (not tenant tables)
];

const ALLOWED_PATTERNS = [
  /\/__tests__\//,  // Test files
  /\.test\.ts$/,    // Test files
];

// Tenant tables that require contract enforcement
// Must match TENANT_TABLES in client.ts
const TENANT_TABLES = [
  'decision_events',
  'taste_meal_scores',
  'taste_signals',
  'inventory_items',
  'receipt_imports',
];

// Patterns that indicate SQL with household_key touching tenant tables
// Only flag if it looks like it's touching a tenant table
const SQL_HOUSEHOLD_PATTERNS = TENANT_TABLES.map(table => ({
  table,
  patterns: [
    new RegExp(`FROM\\s+(?:public\\.)?${table}.*household_key`, 'i'),
    new RegExp(`UPDATE\\s+(?:public\\.)?${table}.*household_key`, 'i'),
    new RegExp(`INSERT\\s+INTO\\s+(?:public\\.)?${table}.*household_key`, 'i'),
    new RegExp(`JOIN\\s+(?:public\\.)?${table}.*household_key`, 'i'),
  ]
}));

function isAllowedFile(filePath: string): boolean {
  // Check explicit allowed files
  if (ALLOWED_FILES.some(allowed => filePath.endsWith(allowed))) {
    return true;
  }
  
  // Check allowed patterns
  if (ALLOWED_PATTERNS.some(pattern => pattern.test(filePath))) {
    return true;
  }
  
  return false;
}

function findTsFiles(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and hidden directories
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      findTsFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function checkFile(filePath: string): { violations: string[], file: string } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const violations: string[] = [];
  
  // Skip if it's an allowed file
  if (isAllowedFile(filePath)) {
    return { violations: [], file: filePath };
  }
  
  // Check the entire file content for SQL patterns touching tenant tables
  for (const { table, patterns } of SQL_HOUSEHOLD_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        // Find the specific line(s)
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          // Skip comments
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
            return;
          }
          
          if (pattern.test(line)) {
            violations.push(`Line ${index + 1} (${table}): ${line.trim().substring(0, 70)}`);
          }
        });
      }
    }
  }
  
  return { violations, file: filePath };
}

function main() {
  console.log('=== SQL Contract Gate ===');
  console.log('Checking for household_key in SQL outside allowed files...\n');
  
  const decisionOsDir = path.join(process.cwd(), 'lib', 'decision-os');
  
  if (!fs.existsSync(decisionOsDir)) {
    console.log('SKIP: lib/decision-os not found');
    process.exit(0);
  }
  
  const tsFiles = findTsFiles(decisionOsDir);
  console.log(`Found ${tsFiles.length} TypeScript files to check\n`);
  
  let totalViolations = 0;
  const results: { file: string, violations: string[] }[] = [];
  
  for (const file of tsFiles) {
    const result = checkFile(file);
    if (result.violations.length > 0) {
      results.push(result);
      totalViolations += result.violations.length;
    }
  }
  
  if (totalViolations === 0) {
    console.log('PASS: No SQL contract violations found');
    console.log('\nAllowed files checked (contain household_key):');
    ALLOWED_FILES.forEach(f => console.log(`  - ${f}`));
    console.log('  - lib/decision-os/__tests__/*.test.ts');
    process.exit(0);
  }
  
  console.log(`FAIL: Found ${totalViolations} violation(s)\n`);
  
  for (const result of results) {
    console.log(`\n${result.file}:`);
    result.violations.forEach(v => console.log(`  ${v}`));
  }
  
  console.log('\n---');
  console.log('To fix: Use sql.ts helpers (tenantWhere, tenantAnd, tenantConflict)');
  console.log('Or add the file to ALLOWED_FILES if it legitimately needs raw SQL');
  
  process.exit(1);
}

main();
