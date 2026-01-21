/**
 * Database Client Tests
 * 
 * Tests the InMemory adapter for Decision OS.
 * Postgres adapter is tested via integration/smoke tests.
 */

import { getDb, resetDb, clearDb, isRealDb, setDbReadonly, isDbReadonly, isReadonlyModeError, isReadOnlySql } from '../db/client';
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
    const testEvent: DecisionEventInsert = {
      id: 'test-event-1',
      user_profile_id: 1,
      decided_at: new Date().toISOString(),
      actioned_at: new Date().toISOString(),
      user_action: 'approved',
      notes: 'autopilot',
      decision_payload: { meal: 'Test Meal' },
      meal_id: 42,
      context_hash: 'test-hash',
    };

    it('inserts and retrieves decision event', async () => {
      const db = getDb();
      await db.insertDecisionEvent(testEvent);
      
      const retrieved = await db.getDecisionEventById(testEvent.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(testEvent.id);
      expect(retrieved?.user_action).toBe('approved');
      expect(retrieved?.notes).toBe('autopilot');
    });

    it('retrieves events by user ID', async () => {
      const db = getDb();
      await db.insertDecisionEvent(testEvent);
      await db.insertDecisionEvent({
        ...testEvent,
        id: 'test-event-2',
        user_action: 'rejected',
      });

      const events = await db.getDecisionEventsByUserId(1);
      expect(events.length).toBe(2);
    });

    it('retrieves events by context hash', async () => {
      const db = getDb();
      await db.insertDecisionEvent(testEvent);

      const events = await db.getDecisionEventsByContextHash('test-hash');
      expect(events.length).toBe(1);
      expect(events[0].id).toBe(testEvent.id);
    });

    it('returns null for non-existent event', async () => {
      const db = getDb();
      const event = await db.getDecisionEventById('non-existent');
      expect(event).toBeNull();
    });
  });

  describe('receipt imports', () => {
    const testReceipt: ReceiptImportRecord = {
      id: 'receipt-1',
      user_profile_id: 1,
      created_at: new Date().toISOString(),
      status: 'received',
      raw_ocr_text: 'Test receipt text',
      image_hash: 'hash-123',
    };

    it('inserts and retrieves receipt import', async () => {
      const db = getDb();
      await db.insertReceiptImport(testReceipt);
      
      const retrieved = await db.getReceiptImportById(testReceipt.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.status).toBe('received');
    });

    it('updates receipt import status', async () => {
      const db = getDb();
      await db.insertReceiptImport(testReceipt);
      await db.updateReceiptImportStatus(testReceipt.id, 'parsed');

      const retrieved = await db.getReceiptImportById(testReceipt.id);
      expect(retrieved?.status).toBe('parsed');
    });

    it('finds receipt by image hash', async () => {
      const db = getDb();
      await db.insertReceiptImport(testReceipt);

      const found = await db.getReceiptImportByImageHash(1, 'hash-123');
      expect(found).not.toBeNull();
      expect(found?.id).toBe(testReceipt.id);
    });
  });

  describe('inventory items', () => {
    const testItem: InventoryItem = {
      id: 'item-1',
      user_profile_id: 1,
      name: 'Chicken',
      quantity: 2,
      confidence: 0.95,
      source: 'receipt',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('upserts and retrieves inventory item', async () => {
      const db = getDb();
      await db.upsertInventoryItem(testItem);
      
      const items = await db.getInventoryItemsByUserId(1);
      expect(items.length).toBe(1);
      expect(items[0].name).toBe('Chicken');
    });

    it('updates existing inventory item on upsert', async () => {
      const db = getDb();
      await db.upsertInventoryItem(testItem);
      await db.upsertInventoryItem({
        ...testItem,
        quantity: 5,
      });

      const items = await db.getInventoryItemsByUserId(1);
      expect(items.length).toBe(1);
      expect(items[0].quantity).toBe(5);
    });
  });

  describe('taste signals and scores', () => {
    it('inserts taste signal', async () => {
      const db = getDb();
      await db.insertTasteSignal({
        id: 'ts-1',
        user_profile_id: 1,
        meal_id: 42,
        weight: 1.0,
        created_at: new Date().toISOString(),
      });
      // No retrieval method for taste signals in adapter interface
      // This just verifies no error
      expect(true).toBe(true);
    });

    it('upserts and retrieves taste meal score', async () => {
      const db = getDb();
      await db.upsertTasteMealScore({
        id: 'score-1',
        user_profile_id: 1,
        meal_id: 42,
        score: 0.8,
        approvals: 5,
        rejections: 1,
      });

      const score = await db.getTasteMealScore(1, 42);
      expect(score).not.toBeNull();
      expect(score?.score).toBe(0.8);
      expect(score?.approvals).toBe(5);
    });
  });

  describe('clearAll', () => {
    it('clears all data', async () => {
      const db = getDb();
      
      await db.insertDecisionEvent({
        id: 'event-1',
        user_profile_id: 1,
        decided_at: new Date().toISOString(),
        actioned_at: new Date().toISOString(),
        user_action: 'approved',
        decision_payload: {},
      });

      await clearDb();

      const events = await db.getDecisionEventsByUserId(1);
      expect(events.length).toBe(0);
    });
  });

  describe('readonly mode', () => {
    const testEvent: DecisionEventInsert = {
      id: 'readonly-test-event',
      user_profile_id: 1,
      decided_at: new Date().toISOString(),
      actioned_at: new Date().toISOString(),
      user_action: 'approved',
      notes: 'test',
      decision_payload: { meal: 'Test Meal' },
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
      
      // These should work in readonly mode
      const events = await db.getDecisionEventsByUserId(1);
      expect(events).toEqual([]);
      
      const event = await db.getDecisionEventById('non-existent');
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
        created_at: new Date().toISOString(),
        status: 'received',
      });
      
      // Then try to update in readonly mode
      setDbReadonly(true);
      
      try {
        await db.updateReceiptImportStatus('receipt-update-test', 'parsed');
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
          name: 'Chicken',
          quantity: 2,
          confidence: 0.95,
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
          meal_id: 42,
          weight: 1.0,
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
      
      const event = await db.getDecisionEventById(testEvent.id);
      expect(event).not.toBeNull();
      expect(event?.id).toBe(testEvent.id);
    });

    it('data persists from before readonly mode was enabled', async () => {
      const db = getDb();
      
      // Insert while writable
      await db.insertDecisionEvent(testEvent);
      
      // Enable readonly
      setDbReadonly(true);
      
      // Should still be able to read
      const event = await db.getDecisionEventById(testEvent.id);
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
});
