#!/usr/bin/env node
/**
 * Database Migration Runner for Decision OS
 * 
 * Runs all SQL migration files in order.
 * 
 * Usage:
 *   npx ts-node db/migrate.ts
 *   npm run db:migrate:staging
 * 
 * Requires:
 *   DATABASE_URL environment variable
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

interface MigrationFile {
  name: string;
  path: string;
  order: number;
}

async function getMigrationFiles(): Promise<MigrationFile[]> {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  
  return files
    .filter(f => f.endsWith('.sql'))
    .map(f => ({
      name: f,
      path: path.join(MIGRATIONS_DIR, f),
      order: parseInt(f.split('_')[0], 10),
    }))
    .sort((a, b) => a.order - b.order);
}

async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    console.error('Set DATABASE_URL to your PostgreSQL connection string');
    process.exit(1);
  }
  
  console.log('=== Decision OS Database Migration ===\n');
  console.log('Connecting to database...');
  
  // Dynamic import pg
  let pg;
  try {
    pg = await import('pg');
  } catch {
    console.error('ERROR: pg package not installed');
    console.error('Run: npm install pg');
    process.exit(1);
  }
  
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10000,
  });
  
  try {
    // Test connection
    const client = await pool.connect();
    console.log('Connected successfully!\n');
    
    // Get migration files
    const migrations = await getMigrationFiles();
    console.log(`Found ${migrations.length} migration files:\n`);
    
    for (const migration of migrations) {
      console.log(`Running: ${migration.name}`);
      
      const sql = fs.readFileSync(migration.path, 'utf-8');
      
      try {
        await client.query(sql);
        console.log(`  ✓ Success\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        // Check if it's a "already exists" error (idempotent)
        if (message.includes('already exists')) {
          console.log(`  ⊙ Already applied (skipped)\n`);
        } else {
          console.error(`  ✗ Failed: ${message}\n`);
          throw error;
        }
      }
    }
    
    client.release();
    
    // Verify tables exist
    console.log('=== Verifying Tables ===\n');
    
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('Tables in database:');
    for (const row of tablesResult.rows) {
      console.log(`  - ${row.table_name}`);
    }
    
    console.log('\n=== Migration Complete ===');
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\nMigration failed: ${message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
runMigrations().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
