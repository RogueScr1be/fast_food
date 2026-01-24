/**
 * Migration Ordering Proof Tests
 * 
 * These tests verify migration files exist in correct order and contain
 * expected content. They read from disk (no mocks) to catch real regressions.
 * 
 * Key invariants:
 * - Migration 028 must exist and come after 017
 * - Migrations 014/015 must NOT reference household_key
 * - Migration 028 must contain household_key constraint and index
 */

import * as fs from 'fs';
import * as path from 'path';

// Use process.cwd() for workspace root, then navigate to db/migrations
const MIGRATIONS_DIR = path.join(process.cwd(), 'db/migrations');

// Re-implement getMigrationFiles locally to avoid import issues
interface MigrationFile {
  name: string;
  path: string;
  order: number;
}

function getMigrationFiles(migrationsDir: string = MIGRATIONS_DIR): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  
  const files = fs.readdirSync(migrationsDir);
  
  return files
    .filter(f => f.endsWith('.sql'))
    .map(f => ({
      name: f,
      path: path.join(migrationsDir, f),
      order: parseInt(f.split('_')[0], 10) || 0,
    }))
    .sort((a, b) => a.order - b.order);
}

describe('Migration Ordering', () => {
  let migrations: MigrationFile[];
  
  beforeAll(() => {
    migrations = getMigrationFiles(MIGRATIONS_DIR);
  });
  
  // =========================================================================
  // Migration 028 Existence
  // =========================================================================
  
  describe('Migration 028 inclusion', () => {
    it('includes 028_decision_events_household_constraints.sql', () => {
      const migration028 = migrations.find(m => m.name.startsWith('028_'));
      expect(migration028).toBeDefined();
      expect(migration028?.name).toBe('028_decision_events_household_constraints.sql');
    });
    
    it('has correct order number for 028', () => {
      const migration028 = migrations.find(m => m.name.startsWith('028_'));
      expect(migration028?.order).toBe(28);
    });
  });
  
  // =========================================================================
  // Ordering Invariants
  // =========================================================================
  
  describe('migration ordering invariants', () => {
    it('orders 014 before 015', () => {
      const idx014 = migrations.findIndex(m => m.name.startsWith('014_'));
      const idx015 = migrations.findIndex(m => m.name.startsWith('015_'));
      
      expect(idx014).toBeGreaterThanOrEqual(0);
      expect(idx015).toBeGreaterThanOrEqual(0);
      expect(idx014).toBeLessThan(idx015);
    });
    
    it('orders 015 before 017', () => {
      const idx015 = migrations.findIndex(m => m.name.startsWith('015_'));
      const idx017 = migrations.findIndex(m => m.name.startsWith('017_'));
      
      expect(idx015).toBeGreaterThanOrEqual(0);
      expect(idx017).toBeGreaterThanOrEqual(0);
      expect(idx015).toBeLessThan(idx017);
    });
    
    it('orders 017 before 028', () => {
      const idx017 = migrations.findIndex(m => m.name.startsWith('017_'));
      const idx028 = migrations.findIndex(m => m.name.startsWith('028_'));
      
      expect(idx017).toBeGreaterThanOrEqual(0);
      expect(idx028).toBeGreaterThanOrEqual(0);
      expect(idx017).toBeLessThan(idx028);
    });
    
    it('full ordering: 014 < 015 < 017 < 028', () => {
      const idx014 = migrations.findIndex(m => m.name.startsWith('014_'));
      const idx015 = migrations.findIndex(m => m.name.startsWith('015_'));
      const idx017 = migrations.findIndex(m => m.name.startsWith('017_'));
      const idx028 = migrations.findIndex(m => m.name.startsWith('028_'));
      
      expect(idx014).toBeLessThan(idx015);
      expect(idx015).toBeLessThan(idx017);
      expect(idx017).toBeLessThan(idx028);
    });
  });
  
  // =========================================================================
  // Content Verification (household_key dependency fix)
  // =========================================================================
  
  describe('household_key dependency fix', () => {
    it('migration 014 does NOT contain household_key references', () => {
      const migration014 = migrations.find(m => m.name.startsWith('014_'));
      expect(migration014).toBeDefined();
      
      const content = fs.readFileSync(migration014!.path, 'utf8');
      
      // Should not contain constraint on household_key
      expect(content).not.toMatch(/CHECK\s*\(\s*household_key/i);
      // Should not contain direct reference to household_key column in ALTER
      expect(content).not.toMatch(/ALTER\s+TABLE.*household_key\s*<>/i);
      // But should have a note about moving to 028
      expect(content).toMatch(/household_key.*moved.*028|028.*household_key/i);
    });
    
    it('migration 015 does NOT contain household_key references', () => {
      const migration015 = migrations.find(m => m.name.startsWith('015_'));
      expect(migration015).toBeDefined();
      
      const content = fs.readFileSync(migration015!.path, 'utf8');
      
      // Should not contain index on household_key
      expect(content).not.toMatch(/CREATE\s+INDEX.*household_key/i);
      // Should not contain direct reference in any statement
      expect(content).not.toMatch(/\(\s*household_key\s*,/i);
      // But should have a note about moving to 028
      expect(content).toMatch(/household_key.*moved.*028|028.*household_key/i);
    });
    
    it('migration 028 contains decision_events_household_key_check constraint', () => {
      const migration028 = migrations.find(m => m.name.startsWith('028_'));
      expect(migration028).toBeDefined();
      
      const content = fs.readFileSync(migration028!.path, 'utf8');
      
      // Must contain the constraint name
      expect(content).toMatch(/decision_events_household_key_check/i);
      // Must contain CHECK (household_key <> '')
      expect(content).toMatch(/CHECK\s*\(\s*household_key\s*<>\s*''/i);
    });
    
    it('migration 028 contains idx_decision_events_household_actioned index', () => {
      const migration028 = migrations.find(m => m.name.startsWith('028_'));
      expect(migration028).toBeDefined();
      
      const content = fs.readFileSync(migration028!.path, 'utf8');
      
      // Must contain the index name
      expect(content).toMatch(/idx_decision_events_household_actioned/i);
      // Must contain index creation statement
      expect(content).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_decision_events_household_actioned/i);
      // Must reference both household_key and actioned_at somewhere in the file
      expect(content).toMatch(/household_key/i);
      expect(content).toMatch(/actioned_at/i);
    });
  });
  
  // =========================================================================
  // Migration Count Sanity Check
  // =========================================================================
  
  describe('migration count sanity', () => {
    it('has at least 28 migrations', () => {
      expect(migrations.length).toBeGreaterThanOrEqual(28);
    });
    
    it('all migrations have valid order numbers', () => {
      for (const m of migrations) {
        expect(m.order).toBeGreaterThan(0);
        expect(Number.isInteger(m.order)).toBe(true);
      }
    });
    
    it('no duplicate order numbers', () => {
      const orders = migrations.map(m => m.order);
      const uniqueOrders = new Set(orders);
      expect(uniqueOrders.size).toBe(orders.length);
    });
    
    it('migrations are in ascending order', () => {
      for (let i = 1; i < migrations.length; i++) {
        expect(migrations[i].order).toBeGreaterThan(migrations[i - 1].order);
      }
    });
  });
});
