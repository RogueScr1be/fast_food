/**
 * Database Client Tests
 * 
 * Tests the InMemory adapter for Decision OS.
 * Postgres adapter is tested via integration/smoke tests.
 */

import { 
  getDb, resetDb, clearDb, isRealDb, setDbReadonly, isDbReadonly, isReadonlyModeError, isReadOnlySql, 
  requiresHouseholdKeyButMissing, assertHouseholdScoped, hasHouseholdKeyPredicate,
  TENANT_TABLES, extractTableReferences, hasPredicateForTableOrAlias, checkTenantSafety, checkOnConflictSafety, assertTenantSafe,
  normalizeSql, checkSqlStyleContract, assertSqlStyleContract,
  stripStringLiterals, normalizeTableName, hasWrongParamIndexForTenant, hasLiteralTenantPredicate
} from '../db/client';
import { tenantWhere, tenantAnd, tenantConflict, tenantUpdateWhere, TABLE_ALIASES } from '../db/sql';
import type { DecisionEventInsert, ReceiptImportRecord, InventoryItem } from '../../../types/decision-os';

describe('Database Client', () => {
  beforeEach(async () => {
    resetDb();
    await clearDb();
  });

  describe('adapter selection', () => {
    it('uses InMemory adapter in test environment', () => {
      const db = getDb();
      expect(db.name).toBe('inmemory');
    });

    it('isRealDb returns false for InMemory', () => {
      expect(isRealDb()).toBe(false);
    });

    it('ping returns true for InMemory', async () => {
      const db = getDb();
      const result = await db.ping();
      expect(result).toBe(true);
    });
  });

  describe('decision events', () => {
    const TEST_HOUSEHOLD_KEY = 'test-household';
    const testEvent: DecisionEventInsert = {
      id: 'test-event-1',
      user_profile_id: 1,
      household_key: TEST_HOUSEHOLD_KEY,
      decided_at: new Date().toISOString(),
      actioned_at: new Date().toISOString(),
      user_action: 'approved',
      notes: 'autopilot',
      decision_payload: { meal: 'Test Meal' },
      decision_type: 'meal_decision',
      meal_id: 42,
      context_hash: 'test-hash',
    };

    it('inserts and retrieves decision event (household-scoped)', async () => {
      const db = getDb();
      await db.insertDecisionEvent(testEvent);
      
      // getDecisionEventById is now (householdKey, id) - household-first
      const retrieved = await db.getDecisionEventById(TEST_HOUSEHOLD_KEY, testEvent.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(testEvent.id);
      expect(retrieved?.user_action).toBe('approved');
      expect(retrieved?.notes).toBe('autopilot');
    });

    it('retrieves events by household (household-first)', async () => {
      const db = getDb();
      await db.insertDecisionEvent(testEvent);
      await db.insertDecisionEvent({
        ...testEvent,
        id: 'test-event-2',
        user_action: 'rejected',
      });

      // getDecisionEvents is now (householdKey, limit) - no userId
      const events = await db.getDecisionEvents(TEST_HOUSEHOLD_KEY);
      expect(events.length).toBe(2);
    });

    it('retrieves events by context hash (household-scoped)', async () => {
      const db = getDb();
      await db.insertDecisionEvent(testEvent);

      // getDecisionEventsByContextHash is now (householdKey, contextHash) - household-first
      const events = await db.getDecisionEventsByContextHash(TEST_HOUSEHOLD_KEY, 'test-hash');
      expect(events.length).toBe(1);
      expect(events[0].id).toBe(testEvent.id);
    });

    it('returns null for non-existent event', async () => {
      const db = getDb();
      const event = await db.getDecisionEventById(TEST_HOUSEHOLD_KEY, 'non-existent');
      expect(event).toBeNull();
    });

    it('household isolation: event in different household not returned', async () => {
      const db = getDb();
      await db.insertDecisionEvent(testEvent);
      
      // Query with different household key - should return null
      const retrieved = await db.getDecisionEventById('other-household', testEvent.id);
      expect(retrieved).toBeNull();
    });

    it('household isolation: events filtered by household', async () => {
      const db = getDb();
      // Insert event in household A
      await db.insertDecisionEvent(testEvent);
      // Insert event in household B
      await db.insertDecisionEvent({
        ...testEvent,
        id: 'test-event-other-hh',
        household_key: 'other-household',
      });

      // Query for household A - should only get 1 event
      const eventsA = await db.getDecisionEvents(TEST_HOUSEHOLD_KEY);
      expect(eventsA.length).toBe(1);
      expect(eventsA[0].id).toBe(testEvent.id);

      // Query for household B - should only get 1 event
      const eventsB = await db.getDecisionEvents('other-household');
      expect(eventsB.length).toBe(1);
      expect(eventsB[0].id).toBe('test-event-other-hh');
    });
  });

  describe('receipt imports', () => {
    const TEST_HOUSEHOLD_KEY = 'test-household';
    const testReceipt: ReceiptImportRecord = {
      id: 'receipt-1',
      user_profile_id: 1,
      household_key: TEST_HOUSEHOLD_KEY,
      created_at: new Date().toISOString(),
      status: 'received',
      raw_ocr_text: 'Test receipt text',
      image_hash: 'hash-123',
    };

    it('inserts and retrieves receipt import (household-scoped)', async () => {
      const db = getDb();
      await db.insertReceiptImport(testReceipt);
      
      // getReceiptImportById is now (householdKey, id) - household-first
      const retrieved = await db.getReceiptImportById(TEST_HOUSEHOLD_KEY, testReceipt.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.status).toBe('received');
    });

    it('updates receipt import status (household-scoped)', async () => {
      const db = getDb();
      await db.insertReceiptImport(testReceipt);
      // updateReceiptImportStatus is now (householdKey, id, status) - household-first
      await db.updateReceiptImportStatus(TEST_HOUSEHOLD_KEY, testReceipt.id, 'parsed');

      const retrieved = await db.getReceiptImportById(TEST_HOUSEHOLD_KEY, testReceipt.id);
      expect(retrieved?.status).toBe('parsed');
    });

    it('finds receipt by image hash (household-scoped)', async () => {
      const db = getDb();
      await db.insertReceiptImport(testReceipt);

      const found = await db.getReceiptImportByImageHash(TEST_HOUSEHOLD_KEY, 'hash-123');
      expect(found).not.toBeNull();
      expect(found?.id).toBe(testReceipt.id);
    });
  });

  describe('inventory items', () => {
    const TEST_HOUSEHOLD_KEY = 'test-household';
    const testItem: InventoryItem = {
      id: 'item-1',
      user_profile_id: 1,
      household_key: TEST_HOUSEHOLD_KEY,
      item_name: 'Chicken',
      remaining_qty: 2,
      confidence: 0.95,
      last_seen_at: new Date().toISOString(),
      // Legacy columns for backward compat
      name: 'Chicken',
      quantity: 2,
      source: 'receipt',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('upserts and retrieves inventory item (household-scoped)', async () => {
      const db = getDb();
      await db.upsertInventoryItem(testItem);
      
      // getInventoryItems is now (householdKey) - household-first, renamed from getInventoryItemsByHousehold
      const items = await db.getInventoryItems(TEST_HOUSEHOLD_KEY);
      expect(items.length).toBe(1);
      expect(items[0].item_name).toBe('Chicken');
    });

    it('updates existing inventory item on upsert', async () => {
      const db = getDb();
      await db.upsertInventoryItem(testItem);
      await db.upsertInventoryItem({
        ...testItem,
        remaining_qty: 5,
        quantity: 5,
      });

      const items = await db.getInventoryItems(TEST_HOUSEHOLD_KEY);
      expect(items.length).toBe(1);
      expect(items[0].remaining_qty).toBe(5);
    });

    it('household isolation: inventory filtered by household', async () => {
      const db = getDb();
      await db.upsertInventoryItem(testItem);
      await db.upsertInventoryItem({
        ...testItem,
        id: 'item-other-hh',
        household_key: 'other-household',
        item_name: 'Beef',
      });

      // Query for household A - should only get 1 item
      const itemsA = await db.getInventoryItems(TEST_HOUSEHOLD_KEY);
      expect(itemsA.length).toBe(1);
      expect(itemsA[0].item_name).toBe('Chicken');

      // Query for household B - should only get 1 item
      const itemsB = await db.getInventoryItems('other-household');
      expect(itemsB.length).toBe(1);
      expect(itemsB[0].item_name).toBe('Beef');
    });
  });

  describe('taste signals and scores', () => {
    const TEST_HOUSEHOLD_KEY = 'test-household';

    it('inserts taste signal', async () => {
      const db = getDb();
      await db.insertTasteSignal({
        id: 'ts-1',
        user_profile_id: 1,
        household_key: TEST_HOUSEHOLD_KEY,
        meal_id: 42,
        weight: 1.0,
        event_id: 'event-1',
        created_at: new Date().toISOString(),
      });
      // No retrieval method for taste signals in adapter interface
      // This just verifies no error
      expect(true).toBe(true);
    });

    it('upserts and retrieves taste meal score (household-scoped)', async () => {
      const db = getDb();
      await db.upsertTasteMealScore({
        id: 'score-1',
        user_profile_id: 1,
        household_key: TEST_HOUSEHOLD_KEY,
        meal_id: 42,
        score: 0.8,
        approvals: 5,
        rejections: 1,
      });

      // getTasteMealScore is now (householdKey, mealId) - no userId, household-first
      const score = await db.getTasteMealScore(TEST_HOUSEHOLD_KEY, 42);
      expect(score).not.toBeNull();
      expect(score?.score).toBe(0.8);
      expect(score?.approvals).toBe(5);
    });

    it('household isolation: taste score filtered by household', async () => {
      const db = getDb();
      await db.upsertTasteMealScore({
        id: 'score-hh-a',
        user_profile_id: 1,
        household_key: TEST_HOUSEHOLD_KEY,
        meal_id: 42,
        score: 0.8,
        approvals: 5,
        rejections: 1,
      });
      await db.upsertTasteMealScore({
        id: 'score-hh-b',
        user_profile_id: 1,
        household_key: 'other-household',
        meal_id: 42,
        score: 0.2,
        approvals: 1,
        rejections: 4,
      });

      // Query for household A - should get 0.8 score
      const scoreA = await db.getTasteMealScore(TEST_HOUSEHOLD_KEY, 42);
      expect(scoreA).not.toBeNull();
      expect(scoreA?.score).toBe(0.8);

      // Query for household B - should get 0.2 score
      const scoreB = await db.getTasteMealScore('other-household', 42);
      expect(scoreB).not.toBeNull();
      expect(scoreB?.score).toBe(0.2);

      // Query for non-existent household - should return null
      const scoreC = await db.getTasteMealScore('non-existent-hh', 42);
      expect(scoreC).toBeNull();
    });

    it('upsert does not overwrite across households (cross-tenant protection)', async () => {
      const db = getDb();
      
      // Insert score in household A
      await db.upsertTasteMealScore({
        id: 'score-hh-a-upsert',
        user_profile_id: 1,
        household_key: TEST_HOUSEHOLD_KEY,
        meal_id: 99,
        score: 0.9,
        approvals: 10,
        rejections: 1,
      });
      
      // Attempt to "upsert" in household B with same meal_id
      // This should create a separate record, not overwrite household A
      await db.upsertTasteMealScore({
        id: 'score-hh-b-upsert',
        user_profile_id: 1,
        household_key: 'other-household',
        meal_id: 99,
        score: 0.1,
        approvals: 1,
        rejections: 10,
      });
      
      // Verify household A still has its original score
      const scoreA = await db.getTasteMealScore(TEST_HOUSEHOLD_KEY, 99);
      expect(scoreA).not.toBeNull();
      expect(scoreA?.score).toBe(0.9);
      expect(scoreA?.approvals).toBe(10);
      
      // Verify household B has its own score
      const scoreB = await db.getTasteMealScore('other-household', 99);
      expect(scoreB).not.toBeNull();
      expect(scoreB?.score).toBe(0.1);
      expect(scoreB?.approvals).toBe(1);
    });

    it('updateReceiptImportStatus only updates within household (tenant isolation)', async () => {
      const db = getDb();
      
      // Insert receipt in household A
      await db.insertReceiptImport({
        id: 'receipt-tenant-test',
        user_profile_id: 1,
        household_key: TEST_HOUSEHOLD_KEY,
        created_at: new Date().toISOString(),
        status: 'received',
      });
      
      // Try to update with wrong household key - should NOT update
      await db.updateReceiptImportStatus('other-household', 'receipt-tenant-test', 'parsed');
      
      // Verify original receipt is unchanged
      const receipt = await db.getReceiptImportById(TEST_HOUSEHOLD_KEY, 'receipt-tenant-test');
      expect(receipt).not.toBeNull();
      expect(receipt?.status).toBe('received'); // Should NOT be 'parsed'
    });
  });

  describe('clearAll', () => {
    const TEST_HOUSEHOLD_KEY = 'test-household';

    it('clears all data', async () => {
      const db = getDb();
      
      await db.insertDecisionEvent({
        id: 'event-1',
        user_profile_id: 1,
        household_key: TEST_HOUSEHOLD_KEY,
        decided_at: new Date().toISOString(),
        actioned_at: new Date().toISOString(),
        user_action: 'approved',
        decision_payload: {},
        decision_type: 'meal_decision',
      });

      await clearDb();

      const events = await db.getDecisionEvents(TEST_HOUSEHOLD_KEY);
      expect(events.length).toBe(0);
    });
  });

  describe('readonly mode', () => {
    const TEST_HOUSEHOLD_KEY = 'test-household';
    const testEvent: DecisionEventInsert = {
      id: 'readonly-test-event',
      user_profile_id: 1,
      household_key: TEST_HOUSEHOLD_KEY,
      decided_at: new Date().toISOString(),
      actioned_at: new Date().toISOString(),
      user_action: 'approved',
      notes: 'test',
      decision_payload: { meal: 'Test Meal' },
      decision_type: 'meal_decision',
      meal_id: 1,
      context_hash: 'readonly-hash',
    };

    afterEach(() => {
      // Always reset readonly mode after tests
      setDbReadonly(false);
    });

    it('defaults to readonly mode disabled', () => {
      expect(isDbReadonly()).toBe(false);
    });

    it('can enable and disable readonly mode', () => {
      setDbReadonly(true);
      expect(isDbReadonly()).toBe(true);
      
      setDbReadonly(false);
      expect(isDbReadonly()).toBe(false);
    });

    it('allows SELECT queries in readonly mode', async () => {
      const db = getDb();
      setDbReadonly(true);
      
      // These should work in readonly mode (household-first methods)
      const events = await db.getDecisionEvents(TEST_HOUSEHOLD_KEY);
      expect(events).toEqual([]);
      
      const event = await db.getDecisionEventById(TEST_HOUSEHOLD_KEY, 'non-existent');
      expect(event).toBeNull();
    });

    it('blocks INSERT in readonly mode', async () => {
      const db = getDb();
      setDbReadonly(true);
      
      try {
        await db.insertDecisionEvent(testEvent);
        fail('Expected readonly_mode error');
      } catch (error) {
        expect(isReadonlyModeError(error)).toBe(true);
        expect((error as Error).message).toBe('readonly_mode');
      }
    });

    it('blocks insertReceiptImport in readonly mode', async () => {
      const db = getDb();
      setDbReadonly(true);
      
      try {
        await db.insertReceiptImport({
          id: 'receipt-readonly',
          user_profile_id: 1,
          household_key: TEST_HOUSEHOLD_KEY,
          created_at: new Date().toISOString(),
          status: 'received',
        });
        fail('Expected readonly_mode error');
      } catch (error) {
        expect(isReadonlyModeError(error)).toBe(true);
      }
    });

    it('blocks updateReceiptImportStatus in readonly mode', async () => {
      const db = getDb();
      
      // First insert while writable
      await db.insertReceiptImport({
        id: 'receipt-update-test',
        user_profile_id: 1,
        household_key: TEST_HOUSEHOLD_KEY,
        created_at: new Date().toISOString(),
        status: 'received',
      });
      
      // Then try to update in readonly mode
      setDbReadonly(true);
      
      try {
        // updateReceiptImportStatus is now (householdKey, id, status) - household-first
        await db.updateReceiptImportStatus(TEST_HOUSEHOLD_KEY, 'receipt-update-test', 'parsed');
        fail('Expected readonly_mode error');
      } catch (error) {
        expect(isReadonlyModeError(error)).toBe(true);
      }
    });

    it('blocks upsertInventoryItem in readonly mode', async () => {
      const db = getDb();
      setDbReadonly(true);
      
      try {
        await db.upsertInventoryItem({
          id: 'item-readonly',
          user_profile_id: 1,
          household_key: TEST_HOUSEHOLD_KEY,
          item_name: 'Chicken',
          remaining_qty: 2,
          confidence: 0.95,
          last_seen_at: new Date().toISOString(),
          name: 'Chicken',
          quantity: 2,
          source: 'receipt',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        fail('Expected readonly_mode error');
      } catch (error) {
        expect(isReadonlyModeError(error)).toBe(true);
      }
    });

    it('blocks insertTasteSignal in readonly mode', async () => {
      const db = getDb();
      setDbReadonly(true);
      
      try {
        await db.insertTasteSignal({
          id: 'ts-readonly',
          user_profile_id: 1,
          household_key: TEST_HOUSEHOLD_KEY,
          meal_id: 42,
          weight: 1.0,
          event_id: 'event-1',
          created_at: new Date().toISOString(),
        });
        fail('Expected readonly_mode error');
      } catch (error) {
        expect(isReadonlyModeError(error)).toBe(true);
      }
    });

    it('blocks upsertTasteMealScore in readonly mode', async () => {
      const db = getDb();
      setDbReadonly(true);
      
      try {
        await db.upsertTasteMealScore({
          id: 'score-readonly',
          user_profile_id: 1,
          meal_id: 42,
          score: 0.8,
          approvals: 5,
          rejections: 1,
        });
        fail('Expected readonly_mode error');
      } catch (error) {
        expect(isReadonlyModeError(error)).toBe(true);
      }
    });

    it('allows writes when readonly mode is disabled', async () => {
      const db = getDb();
      
      // Enable then disable readonly
      setDbReadonly(true);
      setDbReadonly(false);
      
      // Should work now
      await db.insertDecisionEvent(testEvent);
      
      // getDecisionEventById is now (householdKey, id) - household-first
      const event = await db.getDecisionEventById(TEST_HOUSEHOLD_KEY, testEvent.id);
      expect(event).not.toBeNull();
      expect(event?.id).toBe(testEvent.id);
    });

    it('data persists from before readonly mode was enabled', async () => {
      const db = getDb();
      
      // Insert while writable
      await db.insertDecisionEvent(testEvent);
      
      // Enable readonly
      setDbReadonly(true);
      
      // Should still be able to read (household-scoped, household-first)
      const event = await db.getDecisionEventById(TEST_HOUSEHOLD_KEY, testEvent.id);
      expect(event).not.toBeNull();
      expect(event?.id).toBe(testEvent.id);
    });
  });

  describe('isReadonlyModeError', () => {
    it('returns true for readonly_mode error', () => {
      const error = new Error('readonly_mode');
      expect(isReadonlyModeError(error)).toBe(true);
    });

    it('returns false for other errors', () => {
      const error = new Error('some other error');
      expect(isReadonlyModeError(error)).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(isReadonlyModeError('string')).toBe(false);
      expect(isReadonlyModeError(null)).toBe(false);
      expect(isReadonlyModeError(undefined)).toBe(false);
      expect(isReadonlyModeError(42)).toBe(false);
    });
  });

  describe('isReadOnlySql', () => {
    describe('allows valid SELECT statements', () => {
      it('allows simple SELECT', () => {
        expect(isReadOnlySql('SELECT 1')).toBe(true);
      });

      it('allows SELECT with leading whitespace', () => {
        expect(isReadOnlySql('   SELECT 1')).toBe(true);
      });

      it('allows SELECT with leading line comment', () => {
        expect(isReadOnlySql('-- hi\nSELECT 1')).toBe(true);
      });

      it('allows SELECT with leading block comment', () => {
        expect(isReadOnlySql('/*x*/SELECT 1')).toBe(true);
      });

      it('allows SELECT with multiple leading comments', () => {
        expect(isReadOnlySql('-- comment 1\n/* comment 2 */\nSELECT 1')).toBe(true);
      });

      it('allows SELECT with complex FROM clause', () => {
        expect(isReadOnlySql('SELECT * FROM users WHERE id = 1')).toBe(true);
      });

      it('allows SELECT with subquery', () => {
        expect(isReadOnlySql('SELECT * FROM (SELECT id FROM users) sub')).toBe(true);
      });

      it('allows lowercase select', () => {
        expect(isReadOnlySql('select 1')).toBe(true);
      });

      it('allows mixed case SELECT', () => {
        expect(isReadOnlySql('SeLeCt 1')).toBe(true);
      });
    });

    describe('allows valid WITH (CTE) statements', () => {
      it('allows simple WITH...SELECT', () => {
        expect(isReadOnlySql('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true);
      });

      it('allows WITH with leading whitespace', () => {
        expect(isReadOnlySql('   WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true);
      });

      it('allows WITH with multiple CTEs', () => {
        expect(isReadOnlySql('WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a, b')).toBe(true);
      });

      it('allows lowercase with', () => {
        expect(isReadOnlySql('with x as (select 1) select * from x')).toBe(true);
      });
    });

    describe('rejects write operations', () => {
      it('rejects INSERT', () => {
        expect(isReadOnlySql('INSERT INTO users (name) VALUES (\'test\')')).toBe(false);
      });

      it('rejects UPDATE', () => {
        expect(isReadOnlySql('UPDATE users SET name = \'test\'')).toBe(false);
      });

      it('rejects DELETE', () => {
        expect(isReadOnlySql('DELETE FROM users')).toBe(false);
      });

      it('rejects ALTER', () => {
        expect(isReadOnlySql('ALTER TABLE users ADD COLUMN foo TEXT')).toBe(false);
      });

      it('rejects CREATE', () => {
        expect(isReadOnlySql('CREATE TABLE foo (id INT)')).toBe(false);
      });

      it('rejects DROP', () => {
        expect(isReadOnlySql('DROP TABLE users')).toBe(false);
      });

      it('rejects TRUNCATE', () => {
        expect(isReadOnlySql('TRUNCATE users')).toBe(false);
      });

      it('rejects UPDATE with leading comment', () => {
        expect(isReadOnlySql('-- hi\nUPDATE runtime_flags SET enabled=true')).toBe(false);
      });

      it('rejects lowercase update', () => {
        expect(isReadOnlySql('update users set name = \'test\'')).toBe(false);
      });
    });

    describe('rejects multi-statement SQL', () => {
      it('rejects SELECT followed by INSERT', () => {
        expect(isReadOnlySql('SELECT 1; INSERT INTO runtime_flags (key) VALUES (\'x\')')).toBe(false);
      });

      it('rejects SELECT with trailing semicolon and INSERT', () => {
        expect(isReadOnlySql('SELECT 1;INSERT INTO users VALUES (1)')).toBe(false);
      });

      it('rejects semicolon anywhere in SQL', () => {
        expect(isReadOnlySql('SELECT 1; --')).toBe(false);
      });
    });

    describe('rejects DML/DDL tokens in CTEs', () => {
      it('rejects WITH containing INSERT', () => {
        expect(isReadOnlySql('WITH x AS (INSERT INTO users VALUES (1) RETURNING *) SELECT * FROM x')).toBe(false);
      });

      it('rejects WITH containing UPDATE', () => {
        expect(isReadOnlySql('WITH x AS (UPDATE users SET name = \'foo\' RETURNING *) SELECT * FROM x')).toBe(false);
      });

      it('rejects WITH containing DELETE', () => {
        expect(isReadOnlySql('WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x')).toBe(false);
      });

      it('rejects UPDATE inside nested CTE', () => {
        expect(isReadOnlySql('WITH a AS (SELECT 1), b AS (UPDATE foo SET x=1 RETURNING *) SELECT * FROM a,b')).toBe(false);
      });
    });

    describe('rejects DML/DDL tokens in subqueries', () => {
      it('rejects INSERT in subquery (theoretical)', () => {
        // This is invalid SQL but we should still reject it
        expect(isReadOnlySql('SELECT * FROM (INSERT INTO foo VALUES (1)) x')).toBe(false);
      });

      it('rejects SQL containing DML keywords even in string literals (defense-in-depth)', () => {
        // Defense-in-depth: We reject SQL containing DML keywords even in string literals.
        // This is intentionally over-cautious - it's better to reject safe queries
        // than to allow unsafe ones through clever SQL injection.
        // Applications that need to select string values containing 'update', 'delete', etc.
        // should use parameterized queries instead.
        expect(isReadOnlySql('SELECT * FROM users WHERE action = \'update\'')).toBe(false);
        expect(isReadOnlySql('SELECT * FROM logs WHERE message LIKE \'%DELETE%\'')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('rejects empty SQL', () => {
        expect(isReadOnlySql('')).toBe(false);
      });

      it('rejects SQL with only whitespace', () => {
        expect(isReadOnlySql('   ')).toBe(false);
      });

      it('rejects SQL with only comments', () => {
        expect(isReadOnlySql('-- just a comment')).toBe(false);
      });

      it('rejects SQL with only block comment', () => {
        expect(isReadOnlySql('/* nothing here */')).toBe(false);
      });

      it('allows SELECT with comment inside', () => {
        expect(isReadOnlySql('SELECT /* inline */ 1')).toBe(true);
      });

      it('handles unclosed block comment', () => {
        expect(isReadOnlySql('/* unclosed comment')).toBe(false);
      });

      it('rejects non-SELECT/WITH statements', () => {
        expect(isReadOnlySql('EXPLAIN SELECT 1')).toBe(false); // EXPLAIN not allowed
        expect(isReadOnlySql('SET search_path = public')).toBe(false);
        expect(isReadOnlySql('SHOW all')).toBe(false);
      });
    });
  });

  describe('requiresHouseholdKeyButMissing (tenant isolation guard)', () => {
    describe('returns false for non-tenant tables', () => {
      it('allows SELECT from users table', () => {
        expect(requiresHouseholdKeyButMissing('SELECT * FROM users WHERE id = 1')).toBe(false);
      });

      it('allows SELECT from schema_migrations', () => {
        expect(requiresHouseholdKeyButMissing('SELECT * FROM schema_migrations')).toBe(false);
      });

      it('allows SELECT from runtime_flags', () => {
        expect(requiresHouseholdKeyButMissing('SELECT * FROM runtime_flags')).toBe(false);
      });
    });

    describe('returns false when household_key is present', () => {
      it('decision_events with household_key', () => {
        expect(requiresHouseholdKeyButMissing(
          'SELECT * FROM decision_events WHERE household_key = $1'
        )).toBe(false);
      });

      it('taste_meal_scores with household_key', () => {
        expect(requiresHouseholdKeyButMissing(
          'SELECT * FROM taste_meal_scores WHERE household_key = $1 AND meal_id = $2'
        )).toBe(false);
      });

      it('inventory_items with household_key', () => {
        expect(requiresHouseholdKeyButMissing(
          'SELECT * FROM inventory_items WHERE household_key = $1 ORDER BY last_seen_at DESC'
        )).toBe(false);
      });

      it('receipt_imports with household_key', () => {
        expect(requiresHouseholdKeyButMissing(
          'SELECT * FROM receipt_imports WHERE household_key = $1 AND image_hash = $2'
        )).toBe(false);
      });

      it('taste_signals with household_key', () => {
        expect(requiresHouseholdKeyButMissing(
          'SELECT * FROM taste_signals WHERE household_key = $1 ORDER BY created_at DESC'
        )).toBe(false);
      });
    });

    describe('returns true for tenant tables without household_key (leaky queries)', () => {
      it('decision_events without household_key', () => {
        expect(requiresHouseholdKeyButMissing(
          'SELECT * FROM decision_events WHERE user_profile_id = $1'
        )).toBe(true);
      });

      it('decision_events by id only', () => {
        expect(requiresHouseholdKeyButMissing(
          'SELECT * FROM decision_events WHERE id = $1'
        )).toBe(true);
      });

      it('taste_meal_scores without household_key', () => {
        expect(requiresHouseholdKeyButMissing(
          'SELECT * FROM taste_meal_scores WHERE user_profile_id = $1 AND meal_id = $2'
        )).toBe(true);
      });

      it('inventory_items without household_key', () => {
        expect(requiresHouseholdKeyButMissing(
          'SELECT * FROM inventory_items WHERE user_profile_id = $1'
        )).toBe(true);
      });

      it('receipt_imports without household_key', () => {
        expect(requiresHouseholdKeyButMissing(
          'SELECT * FROM receipt_imports WHERE user_profile_id = $1 AND image_hash = $2'
        )).toBe(true);
      });

      it('taste_signals without household_key', () => {
        expect(requiresHouseholdKeyButMissing(
          'SELECT * FROM taste_signals WHERE user_profile_id = $1'
        )).toBe(true);
      });
    });

    describe('returns false for non-SELECT queries', () => {
      it('INSERT does not require household_key check', () => {
        expect(requiresHouseholdKeyButMissing(
          'INSERT INTO decision_events (id, user_profile_id) VALUES ($1, $2)'
        )).toBe(false);
      });

      it('UPDATE does not require household_key check', () => {
        expect(requiresHouseholdKeyButMissing(
          'UPDATE decision_events SET status = $1 WHERE id = $2'
        )).toBe(false);
      });
    });
  });

  describe('assertHouseholdScoped', () => {
    it('does not throw for properly scoped query', () => {
      expect(() => {
        assertHouseholdScoped('SELECT * FROM decision_events WHERE household_key = $1');
      }).not.toThrow();
    });

    it('throws for leaky query', () => {
      expect(() => {
        assertHouseholdScoped('SELECT * FROM decision_events WHERE user_profile_id = $1');
      }).toThrow('household_key_missing');
    });

    it('does not throw for non-tenant tables', () => {
      expect(() => {
        assertHouseholdScoped('SELECT * FROM users WHERE id = $1');
      }).not.toThrow();
    });
  });

  describe('hasHouseholdKeyPredicate (strengthened predicate check)', () => {
    describe('returns true for valid predicates', () => {
      it('WHERE household_key = $1', () => {
        expect(hasHouseholdKeyPredicate('SELECT * FROM decision_events WHERE household_key = $1')).toBe(true);
      });

      it('AND household_key = $2', () => {
        expect(hasHouseholdKeyPredicate('SELECT * FROM decision_events WHERE id = $1 AND household_key = $2')).toBe(true);
      });

      it('WHERE household_key=$1 (no spaces)', () => {
        expect(hasHouseholdKeyPredicate('SELECT * FROM decision_events WHERE household_key=$1')).toBe(true);
      });

      it("WHERE household_key = 'value'", () => {
        expect(hasHouseholdKeyPredicate("SELECT * FROM decision_events WHERE household_key = 'hh-123'")).toBe(true);
      });

      it('case insensitive', () => {
        expect(hasHouseholdKeyPredicate('SELECT * FROM decision_events WHERE HOUSEHOLD_KEY = $1')).toBe(true);
      });
    });

    describe('returns false for invalid predicates (substring only)', () => {
      it('just contains household_key as column name', () => {
        expect(hasHouseholdKeyPredicate('SELECT household_key FROM decision_events WHERE id = $1')).toBe(false);
      });

      it('household_key in ORDER BY', () => {
        expect(hasHouseholdKeyPredicate('SELECT * FROM decision_events WHERE id = $1 ORDER BY household_key')).toBe(false);
      });

      it('household_key in SELECT list only', () => {
        expect(hasHouseholdKeyPredicate('SELECT id, household_key FROM decision_events WHERE id = $1')).toBe(false);
      });

      it('no household_key at all', () => {
        expect(hasHouseholdKeyPredicate('SELECT * FROM decision_events WHERE user_profile_id = $1')).toBe(false);
      });
    });
  });

  describe('guard wired into adapter (integration)', () => {
    beforeEach(async () => {
      resetDb();
      await clearDb();
    });

    it('adapter methods work with valid household-scoped queries', async () => {
      const db = getDb();
      const TEST_HOUSEHOLD_KEY = 'test-hh-guard';
      
      // Insert test data
      await db.insertDecisionEvent({
        id: 'guard-test-event',
        user_profile_id: 1,
        household_key: TEST_HOUSEHOLD_KEY,
        decided_at: new Date().toISOString(),
        actioned_at: new Date().toISOString(),
        user_action: 'approved',
        decision_payload: {},
        decision_type: 'meal_decision',
      });
      
      // All these should work (valid household-scoped queries)
      const events = await db.getDecisionEvents(TEST_HOUSEHOLD_KEY, 10);
      expect(events.length).toBe(1);
      
      const event = await db.getDecisionEventById(TEST_HOUSEHOLD_KEY, 'guard-test-event');
      expect(event).not.toBeNull();
      
      const byHash = await db.getDecisionEventsByContextHash(TEST_HOUSEHOLD_KEY, 'some-hash');
      expect(byHash).toBeDefined();
    });
  });

  // ==========================================================================
  // PASS 3: JOIN-SAFE + UPSERT-SAFE TENANT ISOLATION
  // ==========================================================================

  describe('TENANT_TABLES constant', () => {
    it('contains all expected tenant tables', () => {
      expect(TENANT_TABLES.has('decision_events')).toBe(true);
      expect(TENANT_TABLES.has('taste_meal_scores')).toBe(true);
      expect(TENANT_TABLES.has('taste_signals')).toBe(true);
      expect(TENANT_TABLES.has('inventory_items')).toBe(true);
      expect(TENANT_TABLES.has('receipt_imports')).toBe(true);
    });

    it('does not contain non-tenant tables', () => {
      expect(TENANT_TABLES.has('user_profiles')).toBe(false);
      expect(TENANT_TABLES.has('households')).toBe(false);
      expect(TENANT_TABLES.has('schema_migrations')).toBe(false);
    });
  });

  describe('extractTableReferences', () => {
    it('extracts single table without alias', () => {
      const refs = extractTableReferences('SELECT * FROM decision_events WHERE household_key = $1');
      expect(refs).toHaveLength(1);
      expect(refs[0].table).toBe('decision_events');
      expect(refs[0].alias).toBeNull();
    });

    it('extracts single table with alias', () => {
      const refs = extractTableReferences('SELECT * FROM decision_events de WHERE de.household_key = $1');
      expect(refs).toHaveLength(1);
      expect(refs[0].table).toBe('decision_events');
      expect(refs[0].alias).toBe('de');
    });

    it('extracts multiple tables from JOIN', () => {
      const sql = `
        SELECT * FROM decision_events de 
        JOIN receipt_imports ri ON ri.id = de.receipt_id 
        WHERE de.household_key = $1
      `;
      const refs = extractTableReferences(sql);
      expect(refs).toHaveLength(2);
      expect(refs.find(r => r.table === 'decision_events')?.alias).toBe('de');
      expect(refs.find(r => r.table === 'receipt_imports')?.alias).toBe('ri');
    });

    it('ignores non-tenant tables', () => {
      const refs = extractTableReferences('SELECT * FROM user_profiles WHERE id = $1');
      expect(refs).toHaveLength(0);
    });

    it('handles AS keyword in alias', () => {
      const refs = extractTableReferences('SELECT * FROM decision_events AS de WHERE de.household_key = $1');
      expect(refs).toHaveLength(1);
      expect(refs[0].alias).toBe('de');
    });
  });

  describe('hasPredicateForTableOrAlias', () => {
    it('accepts unqualified predicate for single-table query', () => {
      const sql = 'SELECT * FROM decision_events WHERE household_key = $1';
      expect(hasPredicateForTableOrAlias(sql, 'decision_events', true)).toBe(true);
    });

    it('accepts qualified predicate with alias', () => {
      const sql = 'SELECT * FROM decision_events de WHERE de.household_key = $1';
      expect(hasPredicateForTableOrAlias(sql, 'de', false)).toBe(true);
    });

    it('accepts qualified predicate with table name', () => {
      const sql = 'SELECT * FROM decision_events WHERE decision_events.household_key = $1';
      expect(hasPredicateForTableOrAlias(sql, 'decision_events', false)).toBe(true);
    });

    it('rejects missing predicate for table', () => {
      const sql = 'SELECT * FROM decision_events de JOIN receipt_imports ri ON ri.id = de.id WHERE de.household_key = $1';
      // receipt_imports (ri) has no predicate
      expect(hasPredicateForTableOrAlias(sql, 'ri', false)).toBe(false);
    });
  });

  describe('checkTenantSafety (join-safe checking)', () => {
    describe('single table queries', () => {
      it('allows properly scoped single table query', () => {
        const result = checkTenantSafety('SELECT * FROM decision_events WHERE household_key = $1');
        expect(result.valid).toBe(true);
        expect(result.missingPredicates).toHaveLength(0);
      });

      it('rejects single table query without predicate', () => {
        const result = checkTenantSafety('SELECT * FROM decision_events WHERE id = $1');
        expect(result.valid).toBe(false);
        expect(result.missingPredicates.some(p => p.includes('decision_events'))).toBe(true);
      });
    });

    describe('join queries (CRITICAL for tenant isolation)', () => {
      it('allows join when ALL tables have predicates', () => {
        const sql = `
          SELECT * FROM decision_events de 
          JOIN receipt_imports ri ON ri.id = de.receipt_id 
          WHERE de.household_key = $1 AND ri.household_key = $1
        `;
        const result = checkTenantSafety(sql);
        expect(result.valid).toBe(true);
      });

      it('REJECTS join when one table missing predicate (LEAK)', () => {
        const sql = `
          SELECT * FROM decision_events de 
          JOIN receipt_imports ri ON ri.id = de.receipt_id 
          WHERE de.household_key = $1
        `;
        // receipt_imports (ri) has no household_key predicate
        const result = checkTenantSafety(sql);
        expect(result.valid).toBe(false);
        expect(result.missingPredicates.some(p => p.includes('receipt_imports'))).toBe(true);
      });

      it('REJECTS join where only outer table has predicate', () => {
        const sql = `
          SELECT * FROM decision_events de 
          JOIN taste_signals ts ON ts.event_id = de.id
          WHERE de.household_key = $1
        `;
        const result = checkTenantSafety(sql);
        expect(result.valid).toBe(false);
        expect(result.missingPredicates.some(p => p.includes('taste_signals'))).toBe(true);
      });
    });

    describe('non-tenant table queries', () => {
      it('allows queries on non-tenant tables without predicate', () => {
        const result = checkTenantSafety('SELECT * FROM user_profiles WHERE id = $1');
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('checkOnConflictSafety (upsert protection)', () => {
    describe('tenant table upserts', () => {
      it('allows ON CONFLICT with household_key in target', () => {
        const sql = `
          INSERT INTO taste_meal_scores (id, household_key, meal_id, score)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (household_key, meal_id) DO UPDATE SET score = EXCLUDED.score
        `;
        const result = checkOnConflictSafety(sql);
        expect(result.valid).toBe(true);
        expect(result.table).toBe('taste_meal_scores');
      });

      it('allows ON CONFLICT with household_key + item_name for inventory', () => {
        const sql = `
          INSERT INTO inventory_items (id, household_key, item_name)
          VALUES ($1, $2, $3)
          ON CONFLICT (household_key, item_name) DO UPDATE SET remaining_qty = EXCLUDED.remaining_qty
        `;
        const result = checkOnConflictSafety(sql);
        expect(result.valid).toBe(true);
      });

      it('REJECTS ON CONFLICT without household_key (CRITICAL)', () => {
        const sql = `
          INSERT INTO inventory_items (id, household_key, item_name)
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO UPDATE SET remaining_qty = EXCLUDED.remaining_qty
        `;
        const result = checkOnConflictSafety(sql);
        expect(result.valid).toBe(false);
        expect(result.table).toBe('inventory_items');
        expect(result.conflictTarget).toBe('id');
      });

      it('REJECTS ON CONFLICT with only non-household columns', () => {
        const sql = `
          INSERT INTO taste_meal_scores (id, household_key, meal_id, score)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_profile_id, meal_id) DO UPDATE SET score = EXCLUDED.score
        `;
        const result = checkOnConflictSafety(sql);
        expect(result.valid).toBe(false);
        expect(result.table).toBe('taste_meal_scores');
      });
    });

    describe('non-tenant table upserts', () => {
      it('allows ON CONFLICT without household_key for non-tenant tables', () => {
        const sql = `
          INSERT INTO user_profiles (id, auth_user_id)
          VALUES ($1, $2)
          ON CONFLICT (id) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id
        `;
        const result = checkOnConflictSafety(sql);
        expect(result.valid).toBe(true);
      });
    });

    describe('simple inserts (no ON CONFLICT)', () => {
      it('allows simple insert without ON CONFLICT', () => {
        const sql = 'INSERT INTO decision_events (id, household_key) VALUES ($1, $2)';
        const result = checkOnConflictSafety(sql);
        expect(result.valid).toBe(true);
        expect(result.conflictTarget).toBeNull();
      });
    });
  });

  describe('assertTenantSafe (comprehensive guard)', () => {
    it('allows valid single-table SELECT', () => {
      expect(() => {
        assertTenantSafe('SELECT * FROM decision_events WHERE household_key = $1');
      }).not.toThrow();
    });

    it('throws for leaky single-table SELECT', () => {
      expect(() => {
        assertTenantSafe('SELECT * FROM decision_events WHERE id = $1');
      }).toThrow('household_key_missing');
    });

    it('throws for leaky JOIN (one table missing predicate)', () => {
      const sql = `
        SELECT * FROM decision_events de 
        JOIN receipt_imports ri ON ri.id = de.receipt_id 
        WHERE de.household_key = $1
      `;
      expect(() => {
        assertTenantSafe(sql);
      }).toThrow('household_key_missing');
    });

    it('throws for unsafe ON CONFLICT', () => {
      const sql = `
        INSERT INTO inventory_items (id, household_key, item_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET remaining_qty = EXCLUDED.remaining_qty
      `;
      expect(() => {
        assertTenantSafe(sql);
      }).toThrow('on_conflict_unsafe');
    });

    it('allows safe ON CONFLICT', () => {
      const sql = `
        INSERT INTO inventory_items (id, household_key, item_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (household_key, item_name) DO UPDATE SET remaining_qty = EXCLUDED.remaining_qty
      `;
      expect(() => {
        assertTenantSafe(sql);
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // SQL STYLE CONTRACT v1 - TENANT-SAFE DIALECT TESTS
  // ==========================================================================

  describe('SQL Style Contract', () => {
    describe('normalizeSql', () => {
      it('strips line comments', () => {
        const sql = 'SELECT * FROM users -- this is a comment\nWHERE id = 1';
        expect(normalizeSql(sql)).toBe('SELECT * FROM users WHERE id = 1');
      });

      it('strips block comments', () => {
        const sql = 'SELECT * FROM /* comment */ users WHERE id = 1';
        expect(normalizeSql(sql)).toBe('SELECT * FROM users WHERE id = 1');
      });

      it('collapses whitespace', () => {
        const sql = 'SELECT   *   FROM    users    WHERE   id = 1';
        expect(normalizeSql(sql)).toBe('SELECT * FROM users WHERE id = 1');
      });
    });

    describe('checkSqlStyleContract - MUST PASS patterns', () => {
      it('allows single-table tenant SELECT with alias predicate', () => {
        const sql = 'SELECT * FROM decision_events de WHERE de.household_key = $1';
        const violations = checkSqlStyleContract(sql);
        expect(violations).toHaveLength(0);
      });

      it('allows JOIN between two tenant tables with both predicates', () => {
        const sql = `
          SELECT * FROM decision_events de 
          JOIN receipt_imports ri ON ri.id = de.receipt_id
          WHERE de.household_key = $1 AND ri.household_key = $1
        `;
        const violations = checkSqlStyleContract(sql);
        expect(violations).toHaveLength(0);
      });

      it('allows UPSERT with household_key in conflict target', () => {
        const sql = `
          INSERT INTO taste_meal_scores (id, household_key, meal_id, score)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (household_key, meal_id) DO UPDATE SET score = EXCLUDED.score
        `;
        const violations = checkSqlStyleContract(sql);
        expect(violations).toHaveLength(0);
      });

      it('allows UPDATE with WHERE household_key = $1 AND id = $2', () => {
        const sql = 'UPDATE receipt_imports SET status = $2 WHERE household_key = $1 AND id = $3';
        const violations = checkSqlStyleContract(sql);
        expect(violations).toHaveLength(0);
      });
    });

    describe('checkSqlStyleContract - MUST FAIL patterns', () => {
      it('rejects reverse predicate ($1 = alias.household_key)', () => {
        const sql = 'SELECT * FROM decision_events de WHERE $1 = de.household_key';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'reverse_predicate')).toBe(true);
      });

      it('rejects IN predicate on household_key', () => {
        const sql = 'SELECT * FROM decision_events de WHERE de.household_key IN ($1, $2)';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'in_any_predicate')).toBe(true);
      });

      it('rejects ANY predicate on household_key', () => {
        const sql = 'SELECT * FROM decision_events de WHERE de.household_key = ANY($1)';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'in_any_predicate')).toBe(true);
      });

      it('rejects household_key predicate in OR clause', () => {
        const sql = 'SELECT * FROM decision_events de WHERE de.household_key = $1 OR de.user_profile_id = $2';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'or_with_tenant_predicate')).toBe(true);
      });

      it('rejects multi-statement SQL (semicolon)', () => {
        const sql = 'SELECT * FROM decision_events; DELETE FROM users';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'no_multi_statement')).toBe(true);
      });

      it('rejects DELETE statement', () => {
        const sql = 'DELETE FROM decision_events WHERE id = $1';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'banned_token')).toBe(true);
      });

      it('rejects DDL (ALTER)', () => {
        const sql = 'ALTER TABLE decision_events ADD COLUMN foo TEXT';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'banned_token')).toBe(true);
      });

      it('rejects DDL (DROP)', () => {
        const sql = 'DROP TABLE decision_events';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'banned_token')).toBe(true);
      });

      it('rejects TRUNCATE', () => {
        const sql = 'TRUNCATE decision_events';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'banned_token')).toBe(true);
      });

      it('rejects UPDATE on tenant table without household_key predicate', () => {
        const sql = 'UPDATE decision_events SET notes = $1 WHERE id = $2';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'update_missing_tenant_predicate')).toBe(true);
      });
    });

    describe('assertSqlStyleContract', () => {
      it('throws on first violation', () => {
        expect(() => {
          assertSqlStyleContract('SELECT * FROM decision_events; DROP TABLE users');
        }).toThrow('sql_contract_violation');
      });

      it('does not throw for valid SQL', () => {
        expect(() => {
          assertSqlStyleContract('SELECT * FROM decision_events de WHERE de.household_key = $1');
        }).not.toThrow();
      });
    });
  });

  // ==========================================================================
  // SQL HELPER FUNCTIONS TESTS
  // ==========================================================================

  describe('SQL Helper Functions', () => {
    describe('tenantWhere', () => {
      it('generates WHERE clause with alias', () => {
        expect(tenantWhere('de')).toBe('de.household_key = $1');
      });
    });

    describe('tenantAnd', () => {
      it('generates AND clause with alias', () => {
        expect(tenantAnd('ri')).toBe('AND ri.household_key = $1');
      });
    });

    describe('tenantConflict', () => {
      it('generates ON CONFLICT with household_key first', () => {
        expect(tenantConflict('item_name')).toBe('ON CONFLICT (household_key, item_name)');
      });

      it('generates ON CONFLICT with multiple columns', () => {
        expect(tenantConflict('meal_id', 'user_profile_id')).toBe('ON CONFLICT (household_key, meal_id, user_profile_id)');
      });
    });

    describe('tenantUpdateWhere', () => {
      it('generates WHERE clause without alias', () => {
        expect(tenantUpdateWhere()).toBe('WHERE household_key = $1');
      });

      it('generates WHERE clause with alias', () => {
        expect(tenantUpdateWhere('ri')).toBe('WHERE ri.household_key = $1');
      });
    });

    describe('TABLE_ALIASES', () => {
      it('has all expected tenant table aliases', () => {
        expect(TABLE_ALIASES.decision_events).toBe('de');
        expect(TABLE_ALIASES.receipt_imports).toBe('ri');
        expect(TABLE_ALIASES.inventory_items).toBe('ii');
        expect(TABLE_ALIASES.taste_signals).toBe('ts');
        expect(TABLE_ALIASES.taste_meal_scores).toBe('tms');
      });
    });
  });

  // ==========================================================================
  // BYPASS-PROOF TESTS (HOSTILE TRUTH)
  // These tests verify that real bypass vectors are blocked.
  // ==========================================================================

  describe('Bypass-Proof Contract Tests', () => {
    describe('stripStringLiterals', () => {
      it('strips single-quoted strings', () => {
        expect(stripStringLiterals("SELECT 'hello' as x")).toBe("SELECT '' as x");
      });

      it('handles escaped quotes inside strings', () => {
        expect(stripStringLiterals("SELECT 'it''s fine' as x")).toBe("SELECT '' as x");
      });

      it('handles multiple strings', () => {
        expect(stripStringLiterals("SELECT 'a', 'b', 'c'")).toBe("SELECT '', '', ''");
      });
    });

    describe('normalizeTableName', () => {
      it('strips schema prefix', () => {
        expect(normalizeTableName('public.receipt_imports')).toBe('receipt_imports');
      });

      it('strips quotes', () => {
        expect(normalizeTableName('"receipt_imports"')).toBe('receipt_imports');
      });

      it('strips both schema and quotes', () => {
        expect(normalizeTableName('"public"."receipt_imports"')).toBe('receipt_imports');
      });

      it('lowercases table name', () => {
        expect(normalizeTableName('Receipt_Imports')).toBe('receipt_imports');
      });
    });

    describe('schema-qualified tables are detected', () => {
      it('detects FROM public.receipt_imports ri', () => {
        const refs = extractTableReferences('SELECT * FROM public.receipt_imports ri WHERE ri.household_key = $1');
        expect(refs).toHaveLength(1);
        expect(refs[0]).toEqual({ table: 'receipt_imports', alias: 'ri' });
      });

      it('enforces predicate on schema-qualified table', () => {
        const sql = 'SELECT * FROM public.decision_events de WHERE de.id = $1';
        const result = checkTenantSafety(sql);
        expect(result.valid).toBe(false);
        expect(result.missingPredicates.some(p => p.includes('decision_events'))).toBe(true);
      });
    });

    describe('quoted identifiers are detected', () => {
      it('detects FROM "receipt_imports" ri', () => {
        const refs = extractTableReferences('SELECT * FROM "receipt_imports" ri WHERE ri.household_key = $1');
        expect(refs).toHaveLength(1);
        expect(refs[0]).toEqual({ table: 'receipt_imports', alias: 'ri' });
      });

      it('detects FROM "public"."receipt_imports" ri', () => {
        const refs = extractTableReferences('SELECT * FROM "public"."receipt_imports" ri WHERE ri.household_key = $1');
        expect(refs).toHaveLength(1);
        expect(refs[0]).toEqual({ table: 'receipt_imports', alias: 'ri' });
      });

      it('enforces predicate on quoted table', () => {
        const sql = 'SELECT * FROM "decision_events" de WHERE de.id = $1';
        const result = checkTenantSafety(sql);
        expect(result.valid).toBe(false);
      });
    });

    describe('UPDATE and INSERT are detected', () => {
      it('detects UPDATE receipt_imports', () => {
        const refs = extractTableReferences('UPDATE receipt_imports SET status = $2 WHERE household_key = $1');
        expect(refs).toHaveLength(1);
        expect(refs[0]).toEqual({ table: 'receipt_imports', alias: null });
      });

      it('detects UPDATE public.receipt_imports', () => {
        const refs = extractTableReferences('UPDATE public.receipt_imports SET status = $2 WHERE household_key = $1');
        expect(refs).toHaveLength(1);
        expect(refs[0]).toEqual({ table: 'receipt_imports', alias: null });
      });

      it('detects INSERT INTO inventory_items', () => {
        const refs = extractTableReferences('INSERT INTO inventory_items (id, household_key) VALUES ($1, $2)');
        expect(refs).toHaveLength(1);
        expect(refs[0]).toEqual({ table: 'inventory_items', alias: null });
      });

      it('detects INSERT INTO public.inventory_items', () => {
        const refs = extractTableReferences('INSERT INTO public.inventory_items (id, household_key) VALUES ($1, $2)');
        expect(refs).toHaveLength(1);
        expect(refs[0]).toEqual({ table: 'inventory_items', alias: null });
      });
    });

    describe('string literals do NOT trip contract (false positive prevention)', () => {
      it('allows SELECT with semicolon in string', () => {
        const sql = "SELECT ';' as semi FROM users WHERE id = $1";
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'no_multi_statement')).toBe(false);
      });

      it('allows SELECT with DROP in string', () => {
        const sql = "SELECT 'DROP TABLE users' as txt FROM users WHERE id = $1";
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'banned_token')).toBe(false);
      });

      it('allows SELECT with DELETE in string', () => {
        const sql = "SELECT 'DELETE FROM x' as txt FROM users WHERE id = $1";
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'banned_token')).toBe(false);
      });

      it('still rejects actual semicolon outside strings', () => {
        const sql = "SELECT 'ok' as x; DELETE FROM users";
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'no_multi_statement')).toBe(true);
      });
    });

    describe('$1 predicate enforcement (CRITICAL)', () => {
      it('hasWrongParamIndexForTenant detects $2', () => {
        expect(hasWrongParamIndexForTenant('WHERE de.household_key = $2')).toBe(true);
      });

      it('hasWrongParamIndexForTenant allows $1', () => {
        expect(hasWrongParamIndexForTenant('WHERE de.household_key = $1')).toBe(false);
      });

      it('hasWrongParamIndexForTenant detects $10', () => {
        expect(hasWrongParamIndexForTenant('WHERE de.household_key = $10')).toBe(true);
      });

      it('rejects WHERE de.household_key = $2 via contract', () => {
        const sql = 'SELECT * FROM decision_events de WHERE de.household_key = $2';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'wrong_param_index')).toBe(true);
      });

      it('rejects JOIN where one table uses $1 and other uses $2', () => {
        const sql = `
          SELECT * FROM decision_events de 
          JOIN receipt_imports ri ON ri.id = de.receipt_id
          WHERE de.household_key = $1 AND ri.household_key = $2
        `;
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'wrong_param_index')).toBe(true);
      });
    });

    describe('literal tenant predicates banned', () => {
      it('hasLiteralTenantPredicate detects literal value', () => {
        expect(hasLiteralTenantPredicate("WHERE household_key = 'abc'")).toBe(true);
      });

      it('hasLiteralTenantPredicate allows parameter', () => {
        expect(hasLiteralTenantPredicate('WHERE household_key = $1')).toBe(false);
      });

      it('rejects household_key = literal via contract', () => {
        const sql = "SELECT * FROM decision_events de WHERE de.household_key = 'abc'";
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'literal_tenant_predicate')).toBe(true);
      });
    });

    describe('multi-table forbids unqualified predicate', () => {
      it('rejects unqualified predicate in JOIN', () => {
        const sql = `
          SELECT * FROM decision_events de 
          JOIN receipt_imports ri ON ri.id = de.receipt_id
          WHERE household_key = $1
        `;
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'unqualified_predicate')).toBe(true);
      });

      it('allows qualified predicates in JOIN', () => {
        const sql = `
          SELECT * FROM decision_events de 
          JOIN receipt_imports ri ON ri.id = de.receipt_id
          WHERE de.household_key = $1 AND ri.household_key = $1
        `;
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'unqualified_predicate')).toBe(false);
      });
    });

    describe('ON CONFLICT ON CONSTRAINT is banned', () => {
      it('rejects ON CONFLICT ON CONSTRAINT via contract', () => {
        const sql = `
          INSERT INTO inventory_items (id, household_key, item_name)
          VALUES ($1, $2, $3)
          ON CONFLICT ON CONSTRAINT inventory_items_pkey DO UPDATE SET item_name = $3
        `;
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'on_conflict_on_constraint_banned')).toBe(true);
      });

      it('rejects ON CONFLICT ON CONSTRAINT via checkOnConflictSafety', () => {
        const sql = `
          INSERT INTO inventory_items (id, household_key, item_name)
          VALUES ($1, $2, $3)
          ON CONFLICT ON CONSTRAINT some_constraint DO UPDATE SET item_name = $3
        `;
        const result = checkOnConflictSafety(sql);
        expect(result.valid).toBe(false);
        expect(result.conflictTarget).toBe('ON CONSTRAINT');
      });

      it('allows column-based ON CONFLICT', () => {
        const sql = `
          INSERT INTO inventory_items (id, household_key, item_name)
          VALUES ($1, $2, $3)
          ON CONFLICT (household_key, item_name) DO UPDATE SET remaining_qty = $4
        `;
        const result = checkOnConflictSafety(sql);
        expect(result.valid).toBe(true);
      });
    });

    describe('UPDATE tenant predicate enforcement', () => {
      it('rejects UPDATE with missing household_key predicate', () => {
        const sql = 'UPDATE receipt_imports SET status = $1 WHERE id = $2';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'update_missing_tenant_predicate')).toBe(true);
      });

      it('rejects UPDATE with wrong param index for household_key', () => {
        const sql = 'UPDATE receipt_imports SET status = $1 WHERE household_key = $2 AND id = $3';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'update_missing_tenant_predicate')).toBe(true);
      });

      it('allows UPDATE with correct WHERE household_key = $1', () => {
        const sql = 'UPDATE receipt_imports SET status = $2 WHERE household_key = $1 AND id = $3';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'update_missing_tenant_predicate')).toBe(false);
      });

      it('allows UPDATE on non-tenant table without household_key', () => {
        const sql = 'UPDATE users SET name = $1 WHERE id = $2';
        const violations = checkSqlStyleContract(sql);
        expect(violations.some(v => v.rule === 'update_missing_tenant_predicate')).toBe(false);
      });
    });

    describe('hasPredicateForTableOrAlias enforces $1', () => {
      it('rejects predicate with $2 for single table', () => {
        const result = hasPredicateForTableOrAlias(
          'SELECT * FROM decision_events WHERE household_key = $2', 
          'decision_events', 
          true
        );
        expect(result).toBe(false);
      });

      it('accepts predicate with $1 for single table', () => {
        const result = hasPredicateForTableOrAlias(
          'SELECT * FROM decision_events WHERE household_key = $1', 
          'decision_events', 
          true
        );
        expect(result).toBe(true);
      });

      it('rejects qualified predicate with $2', () => {
        const result = hasPredicateForTableOrAlias(
          'SELECT * FROM decision_events de WHERE de.household_key = $2', 
          'de', 
          false
        );
        expect(result).toBe(false);
      });

      it('accepts qualified predicate with $1', () => {
        const result = hasPredicateForTableOrAlias(
          'SELECT * FROM decision_events de WHERE de.household_key = $1', 
          'de', 
          false
        );
        expect(result).toBe(true);
      });
    });
  });
});
