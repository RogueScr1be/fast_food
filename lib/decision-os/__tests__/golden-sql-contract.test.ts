/**
 * Golden Runtime SQL Contract Test
 * 
 * This test validates that ALL SQL strings used in the db client
 * pass the tenant-safe dialect contract.
 * 
 * PURPOSE: Prevent slow decay where new SQL queries bypass the contract.
 * 
 * HOW IT WORKS:
 * 1. Collects all runtime SQL strings from PostgresAdapter
 * 2. Validates each against assertTenantSafe()
 * 3. Fails if any SQL violates the contract
 * 
 * WHEN TO UPDATE:
 * - When adding new SQL queries to the db client
 * - When modifying existing SQL queries
 */

import { assertTenantSafe, checkSqlStyleContract, TENANT_TABLES, normalizeSql, hasAnySubquery, hasCte } from '../db/client';

/**
 * All runtime SQL strings used by PostgresAdapter.
 * 
 * IMPORTANT: Keep this list in sync with actual SQL in client.ts
 * If a test fails saying "SQL not found in RUNTIME_SQL", add the new query here.
 * If a query here is not in the client, remove it.
 */
const RUNTIME_SQL: string[] = [
  // Decision Events
  `INSERT INTO decision_events 
   (id, user_profile_id, household_key, decided_at, actioned_at, user_action, notes, decision_payload, decision_type, meal_id, context_hash)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
  
  `SELECT * FROM decision_events 
   WHERE household_key = $1 
   ORDER BY actioned_at DESC NULLS LAST 
   LIMIT $2`,
  
  `SELECT * FROM decision_events WHERE household_key = $1 AND id = $2 LIMIT 1`,
  
  `SELECT * FROM decision_events WHERE household_key = $1 AND context_hash = $2`,
  
  // Receipt Imports
  `INSERT INTO receipt_imports 
   (id, user_profile_id, household_key, created_at, status, raw_ocr_text, error_message, image_hash)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
  
  `UPDATE receipt_imports SET status = $2, error_message = $3 WHERE household_key = $1 AND id = $4`,
  
  `SELECT * FROM receipt_imports WHERE household_key = $1 AND id = $2 LIMIT 1`,
  
  `SELECT * FROM receipt_imports WHERE household_key = $1 AND image_hash = $2 LIMIT 1`,
  
  // Inventory Items
  `INSERT INTO inventory_items 
   (id, user_profile_id, household_key, item_name, remaining_qty, confidence, last_seen_at, name, quantity, unit, source, receipt_import_id, created_at, updated_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
   ON CONFLICT (household_key, item_name) DO UPDATE SET
     remaining_qty = EXCLUDED.remaining_qty,
     quantity = EXCLUDED.quantity,
     confidence = EXCLUDED.confidence,
     last_seen_at = EXCLUDED.last_seen_at,
     updated_at = EXCLUDED.updated_at,
     user_profile_id = EXCLUDED.user_profile_id`,
  
  `SELECT * FROM inventory_items WHERE household_key = $1 ORDER BY last_seen_at DESC NULLS LAST`,
  
  // Taste Signals
  `INSERT INTO taste_signals 
   (id, user_profile_id, household_key, meal_id, weight, event_id, decision_event_id, created_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
  
  // Taste Meal Scores
  `SELECT * FROM taste_meal_scores WHERE household_key = $1 AND meal_id = $2 LIMIT 1`,
  
  `INSERT INTO taste_meal_scores 
   (id, user_profile_id, household_key, meal_id, score, approvals, rejections)
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   ON CONFLICT (household_key, meal_id) DO UPDATE SET
     score = EXCLUDED.score,
     approvals = EXCLUDED.approvals,
     rejections = EXCLUDED.rejections,
     user_profile_id = EXCLUDED.user_profile_id,
     updated_at = NOW()`,
  
  // Ping
  `SELECT 1`,
];

describe('Golden Runtime SQL Contract', () => {
  describe('all runtime SQL passes tenant contract', () => {
    RUNTIME_SQL.forEach((sql, index) => {
      // Extract a short name for the test
      const firstLine = sql.trim().split('\n')[0].substring(0, 60);
      
      it(`[${index}] ${firstLine}...`, () => {
        // This should NOT throw for valid SQL
        expect(() => assertTenantSafe(sql)).not.toThrow();
      });
    });
  });

  describe('contract validation details', () => {
    RUNTIME_SQL.forEach((sql, index) => {
      const firstLine = sql.trim().split('\n')[0].substring(0, 50);
      
      it(`[${index}] ${firstLine} has zero violations`, () => {
        const violations = checkSqlStyleContract(sql);
        expect(violations).toEqual([]);
      });
    });
  });

  describe('SELECT queries use $1 for household_key', () => {
    const selectQueries = RUNTIME_SQL.filter(sql => 
      sql.trim().toUpperCase().startsWith('SELECT') &&
      sql.toLowerCase().includes('household_key')
    );

    selectQueries.forEach((sql) => {
      const firstLine = sql.trim().split('\n')[0].substring(0, 50);
      
      it(`${firstLine} has household_key = $1`, () => {
        expect(sql).toMatch(/household_key\s*=\s*\$1(?!\d)/i);
      });
    });
  });

  describe('UPDATE queries use $1 for household_key in WHERE', () => {
    const updateQueries = RUNTIME_SQL.filter(sql => 
      sql.trim().toUpperCase().startsWith('UPDATE')
    );

    updateQueries.forEach((sql) => {
      const firstLine = sql.trim().split('\n')[0].substring(0, 50);
      
      it(`${firstLine} has WHERE household_key = $1`, () => {
        expect(sql).toMatch(/WHERE\s+household_key\s*=\s*\$1(?!\d)/i);
      });
    });
  });

  describe('INSERT ON CONFLICT uses household_key in target', () => {
    const upsertQueries = RUNTIME_SQL.filter(sql => 
      sql.toUpperCase().includes('ON CONFLICT')
    );

    upsertQueries.forEach((sql) => {
      const firstLine = sql.trim().split('\n')[0].substring(0, 50);
      
      it(`${firstLine} has household_key in ON CONFLICT`, () => {
        const conflictMatch = /ON\s+CONFLICT\s*\(([^)]+)\)/i.exec(sql);
        expect(conflictMatch).not.toBeNull();
        expect(conflictMatch![1].toLowerCase()).toContain('household_key');
      });
    });
  });

  describe('no ON CONFLICT ON CONSTRAINT', () => {
    RUNTIME_SQL.forEach((sql, index) => {
      it(`[${index}] does not use ON CONFLICT ON CONSTRAINT`, () => {
        expect(sql.toUpperCase()).not.toMatch(/ON\s+CONFLICT\s+ON\s+CONSTRAINT/);
      });
    });
  });

  describe('tenant table coverage', () => {
    it('has queries for all tenant tables', () => {
      const coveredTables = new Set<string>();
      
      RUNTIME_SQL.forEach(sql => {
        const upper = sql.toUpperCase();
        TENANT_TABLES.forEach(table => {
          if (upper.includes(table.toUpperCase())) {
            coveredTables.add(table);
          }
        });
      });

      // Verify all tenant tables have at least one query
      TENANT_TABLES.forEach(table => {
        expect(coveredTables.has(table)).toBe(true);
      });
    });
  });

  describe('no CTEs in tenant SQL (Rule 11)', () => {
    it('golden runtime SQL contains no CTEs', () => {
      RUNTIME_SQL.forEach((sql, index) => {
        const normalized = normalizeSql(sql).toLowerCase().trim();
        expect(normalized.startsWith('with ')).toBe(false);
      });
    });
  });

  describe('no subqueries in tenant SQL (Rule 11)', () => {
    it('golden runtime SQL contains no subqueries', () => {
      RUNTIME_SQL.forEach((sql, index) => {
        expect(hasAnySubquery(sql)).toBe(false);
      });
    });

    it('golden runtime SQL contains no (SELECT ...)', () => {
      RUNTIME_SQL.forEach((sql, index) => {
        const normalized = normalizeSql(sql).toLowerCase();
        expect(normalized).not.toMatch(/\(\s*select\s/);
      });
    });

    it('golden runtime SQL contains no EXISTS (SELECT ...)', () => {
      RUNTIME_SQL.forEach((sql, index) => {
        const normalized = normalizeSql(sql).toLowerCase();
        expect(normalized).not.toMatch(/exists\s*\(\s*select\s/);
      });
    });
  });
});
