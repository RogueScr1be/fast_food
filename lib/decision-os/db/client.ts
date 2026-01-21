/**
 * Database Client for Decision OS
 * 
 * Supports two adapters:
 * - InMemory: For tests and local development
 * - Postgres: For staging and production (requires DATABASE_URL)
 * 
 * Selection logic:
 * - NODE_ENV=test: Always InMemory
 * - DATABASE_URL present: Postgres
 * - Otherwise: InMemory with warning
 */

import type {
  DecisionEvent,
  DecisionEventInsert,
  ReceiptImportRecord,
  InventoryItem,
} from '../../../types/decision-os';

// =============================================================================
// DB ADAPTER INTERFACE
// =============================================================================

export interface DbAdapter {
  name: string;
  
  // Generic query (for auth and custom queries)
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  
  // Decision events (APPEND-ONLY - no update/delete methods)
  insertDecisionEvent(event: DecisionEventInsert): Promise<void>;
  getDecisionEventsByUserId(userId: number, limit?: number): Promise<DecisionEvent[]>;
  getDecisionEventById(id: string): Promise<DecisionEvent | null>;
  getDecisionEventsByContextHash(contextHash: string): Promise<DecisionEvent[]>;
  
  // Receipt imports
  insertReceiptImport(record: ReceiptImportRecord): Promise<void>;
  updateReceiptImportStatus(id: string, status: string, errorMessage?: string): Promise<void>;
  getReceiptImportById(id: string): Promise<ReceiptImportRecord | null>;
  getReceiptImportByImageHash(userId: number, imageHash: string): Promise<ReceiptImportRecord | null>;
  
  // Inventory
  upsertInventoryItem(item: InventoryItem): Promise<void>;
  getInventoryItemsByUserId(userId: number): Promise<InventoryItem[]>;
  
  // Taste signals
  insertTasteSignal(signal: TasteSignal): Promise<void>;
  
  // Taste meal scores
  getTasteMealScore(userId: number, mealId: number): Promise<TasteMealScore | null>;
  upsertTasteMealScore(score: TasteMealScore): Promise<void>;
  
  // Health check
  ping(): Promise<boolean>;
  
  // Cleanup (for tests)
  clearAll?(): Promise<void>;
}

export interface TasteSignal {
  id: string;
  user_profile_id: number;
  meal_id: number;
  weight: number;
  decision_event_id?: string;
  created_at: string;
}

export interface TasteMealScore {
  id: string;
  user_profile_id: number;
  meal_id: number;
  score: number;
  approvals: number;
  rejections: number;
}

// =============================================================================
// IN-MEMORY ADAPTER (for tests)
// =============================================================================

class InMemoryAdapter implements DbAdapter {
  name = 'inmemory';
  
  private decisionEvents: Map<string, DecisionEvent> = new Map();
  private receiptImports: Map<string, ReceiptImportRecord> = new Map();
  private inventoryItems: Map<string, InventoryItem> = new Map();
  private tasteSignals: Map<string, TasteSignal> = new Map();
  private tasteMealScores: Map<string, TasteMealScore> = new Map();
  
  // In-memory stores for auth (households, members, user profiles with auth)
  private households: Map<string, { id: string; household_key: string }> = new Map([
    ['default', { id: '00000000-0000-0000-0000-000000000000', household_key: 'default' }],
  ]);
  private householdMembers: Map<number, { id: string; household_id: string; user_profile_id: number; role: string }> = new Map([
    [1, { id: '00000000-0000-0000-0000-000000000001', household_id: '00000000-0000-0000-0000-000000000000', user_profile_id: 1, role: 'owner' }],
  ]);
  private userProfiles: Map<number, { id: number; auth_user_id?: string }> = new Map([
    [1, { id: 1 }],
  ]);
  private nextUserProfileId = 2;
  
  /**
   * Generic query support for InMemory adapter.
   * Implements a subset of SQL needed for auth operations.
   */
  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const normalizedSql = sql.toLowerCase().trim();
    
    // SELECT id FROM user_profiles WHERE auth_user_id = $1
    if (normalizedSql.includes('select') && normalizedSql.includes('user_profiles') && normalizedSql.includes('auth_user_id')) {
      const authUserId = params[0] as string;
      for (const user of this.userProfiles.values()) {
        if (user.auth_user_id === authUserId) {
          return [{ id: user.id }] as T[];
        }
      }
      return [];
    }
    
    // INSERT INTO user_profiles (auth_user_id) VALUES ($1) RETURNING id
    if (normalizedSql.includes('insert') && normalizedSql.includes('user_profiles') && normalizedSql.includes('auth_user_id')) {
      const authUserId = params[0] as string;
      const newId = this.nextUserProfileId++;
      this.userProfiles.set(newId, { id: newId, auth_user_id: authUserId });
      return [{ id: newId }] as T[];
    }
    
    // SELECT id FROM households WHERE household_key = $1
    if (normalizedSql.includes('select') && normalizedSql.includes('households') && normalizedSql.includes('household_key')) {
      const householdKey = params[0] as string;
      const household = this.households.get(householdKey);
      if (household) {
        return [{ id: household.id }] as T[];
      }
      return [];
    }
    
    // INSERT INTO households (household_key) VALUES ($1) RETURNING id
    if (normalizedSql.includes('insert') && normalizedSql.includes('households') && normalizedSql.includes('household_key')) {
      const householdKey = params[0] as string;
      const newId = `hh-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      this.households.set(householdKey, { id: newId, household_key: householdKey });
      return [{ id: newId }] as T[];
    }
    
    // SELECT id FROM household_members WHERE user_profile_id = $1
    if (normalizedSql.includes('select') && normalizedSql.includes('household_members') && normalizedSql.includes('user_profile_id')) {
      const userProfileId = params[0] as number;
      const member = this.householdMembers.get(userProfileId);
      if (member) {
        return [{ id: member.id }] as T[];
      }
      return [];
    }
    
    // INSERT INTO household_members (household_id, user_profile_id, role)
    if (normalizedSql.includes('insert') && normalizedSql.includes('household_members')) {
      const householdId = params[0] as string;
      const userProfileId = params[1] as number;
      if (!this.householdMembers.has(userProfileId)) {
        const newId = `hm-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        this.householdMembers.set(userProfileId, {
          id: newId,
          household_id: householdId,
          user_profile_id: userProfileId,
          role: 'owner',
        });
      }
      return [];
    }
    
    // SELECT 1 (ping)
    if (normalizedSql === 'select 1') {
      return [{ '?column?': 1 }] as T[];
    }
    
    // Fallback: return empty array
    console.warn('[InMemoryAdapter] Unhandled query:', sql.substring(0, 100));
    return [];
  }
  
  async insertDecisionEvent(event: DecisionEventInsert): Promise<void> {
    this.decisionEvents.set(event.id, {
      ...event,
    });
  }
  
  async getDecisionEventsByUserId(userId: number, limit = 100): Promise<DecisionEvent[]> {
    return Array.from(this.decisionEvents.values())
      .filter(e => e.user_profile_id === userId)
      .sort((a, b) => new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime())
      .slice(0, limit);
  }
  
  async getDecisionEventById(id: string): Promise<DecisionEvent | null> {
    return this.decisionEvents.get(id) || null;
  }
  
  async getDecisionEventsByContextHash(contextHash: string): Promise<DecisionEvent[]> {
    return Array.from(this.decisionEvents.values())
      .filter(e => e.context_hash === contextHash);
  }
  
  async insertReceiptImport(record: ReceiptImportRecord): Promise<void> {
    this.receiptImports.set(record.id, record);
  }
  
  async updateReceiptImportStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    const existing = this.receiptImports.get(id);
    if (existing) {
      existing.status = status as ReceiptImportRecord['status'];
      if (errorMessage) {
        existing.error_message = errorMessage;
      }
    }
  }
  
  async getReceiptImportById(id: string): Promise<ReceiptImportRecord | null> {
    return this.receiptImports.get(id) || null;
  }
  
  async getReceiptImportByImageHash(userId: number, imageHash: string): Promise<ReceiptImportRecord | null> {
    return Array.from(this.receiptImports.values())
      .find(r => r.user_profile_id === userId && r.image_hash === imageHash) || null;
  }
  
  async upsertInventoryItem(item: InventoryItem): Promise<void> {
    this.inventoryItems.set(item.id, item);
  }
  
  async getInventoryItemsByUserId(userId: number): Promise<InventoryItem[]> {
    return Array.from(this.inventoryItems.values())
      .filter(i => i.user_profile_id === userId);
  }
  
  async insertTasteSignal(signal: TasteSignal): Promise<void> {
    this.tasteSignals.set(signal.id, signal);
  }
  
  async getTasteMealScore(userId: number, mealId: number): Promise<TasteMealScore | null> {
    const key = `${userId}-${mealId}`;
    return this.tasteMealScores.get(key) || null;
  }
  
  async upsertTasteMealScore(score: TasteMealScore): Promise<void> {
    const key = `${score.user_profile_id}-${score.meal_id}`;
    this.tasteMealScores.set(key, score);
  }
  
  async ping(): Promise<boolean> {
    return true;
  }
  
  async clearAll(): Promise<void> {
    this.decisionEvents.clear();
    this.receiptImports.clear();
    this.inventoryItems.clear();
    this.tasteSignals.clear();
    this.tasteMealScores.clear();
    
    // Reset auth-related stores to defaults
    this.households.clear();
    this.households.set('default', { id: '00000000-0000-0000-0000-000000000000', household_key: 'default' });
    this.householdMembers.clear();
    this.householdMembers.set(1, { id: '00000000-0000-0000-0000-000000000001', household_id: '00000000-0000-0000-0000-000000000000', user_profile_id: 1, role: 'owner' });
    this.userProfiles.clear();
    this.userProfiles.set(1, { id: 1 });
    this.nextUserProfileId = 2;
  }
}

// =============================================================================
// POSTGRES ADAPTER (for staging/prod)
// =============================================================================

/**
 * Postgres adapter using native fetch to Supabase REST API
 * or direct pg connection if available
 */
class PostgresAdapter implements DbAdapter {
  name = 'postgres';
  
  private connectionString: string;
  private pool: unknown = null;
  
  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }
  
  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    // Dynamic import to avoid bundling pg in client code
    try {
      const pg = await import('pg');
      if (!this.pool) {
        this.pool = new pg.Pool({
          connectionString: this.connectionString,
          max: 5,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        });
      }
      const result = await (this.pool as pg.Pool).query(sql, params);
      return result.rows as T[];
    } catch (error) {
      // If pg not available, log and throw
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DB] Query failed:', message);
      throw new Error(`Database query failed: ${message}`);
    }
  }
  
  async insertDecisionEvent(event: DecisionEventInsert): Promise<void> {
    await this.query(
      `INSERT INTO decision_events 
       (id, user_profile_id, decided_at, actioned_at, user_action, notes, decision_payload, decision_type, meal_id, context_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        event.id,
        event.user_profile_id,
        event.decided_at,
        event.actioned_at,
        event.user_action,
        event.notes || null,
        JSON.stringify(event.decision_payload),
        event.decision_type || null,
        event.meal_id || null,
        event.context_hash || null,
      ]
    );
  }
  
  async getDecisionEventsByUserId(userId: number, limit = 100): Promise<DecisionEvent[]> {
    return this.query<DecisionEvent>(
      `SELECT * FROM decision_events WHERE user_profile_id = $1 ORDER BY decided_at DESC LIMIT $2`,
      [userId, limit]
    );
  }
  
  async getDecisionEventById(id: string): Promise<DecisionEvent | null> {
    const rows = await this.query<DecisionEvent>(
      `SELECT * FROM decision_events WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }
  
  async getDecisionEventsByContextHash(contextHash: string): Promise<DecisionEvent[]> {
    return this.query<DecisionEvent>(
      `SELECT * FROM decision_events WHERE context_hash = $1`,
      [contextHash]
    );
  }
  
  async insertReceiptImport(record: ReceiptImportRecord): Promise<void> {
    await this.query(
      `INSERT INTO receipt_imports 
       (id, user_profile_id, created_at, status, raw_ocr_text, error_message, image_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        record.id,
        record.user_profile_id,
        record.created_at,
        record.status,
        record.raw_ocr_text || null,
        record.error_message || null,
        record.image_hash || null,
      ]
    );
  }
  
  async updateReceiptImportStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    await this.query(
      `UPDATE receipt_imports SET status = $1, error_message = $2 WHERE id = $3`,
      [status, errorMessage || null, id]
    );
  }
  
  async getReceiptImportById(id: string): Promise<ReceiptImportRecord | null> {
    const rows = await this.query<ReceiptImportRecord>(
      `SELECT * FROM receipt_imports WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }
  
  async getReceiptImportByImageHash(userId: number, imageHash: string): Promise<ReceiptImportRecord | null> {
    const rows = await this.query<ReceiptImportRecord>(
      `SELECT * FROM receipt_imports WHERE user_profile_id = $1 AND image_hash = $2`,
      [userId, imageHash]
    );
    return rows[0] || null;
  }
  
  async upsertInventoryItem(item: InventoryItem): Promise<void> {
    await this.query(
      `INSERT INTO inventory_items 
       (id, user_profile_id, name, quantity, unit, confidence, source, receipt_import_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         quantity = EXCLUDED.quantity,
         confidence = EXCLUDED.confidence,
         updated_at = EXCLUDED.updated_at`,
      [
        item.id,
        item.user_profile_id,
        item.name,
        item.quantity,
        item.unit || null,
        item.confidence,
        item.source,
        item.receipt_import_id || null,
        item.created_at,
        item.updated_at,
      ]
    );
  }
  
  async getInventoryItemsByUserId(userId: number): Promise<InventoryItem[]> {
    return this.query<InventoryItem>(
      `SELECT * FROM inventory_items WHERE user_profile_id = $1`,
      [userId]
    );
  }
  
  async insertTasteSignal(signal: TasteSignal): Promise<void> {
    await this.query(
      `INSERT INTO taste_signals 
       (id, user_profile_id, meal_id, weight, decision_event_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        signal.id,
        signal.user_profile_id,
        signal.meal_id,
        signal.weight,
        signal.decision_event_id || null,
        signal.created_at,
      ]
    );
  }
  
  async getTasteMealScore(userId: number, mealId: number): Promise<TasteMealScore | null> {
    const rows = await this.query<TasteMealScore>(
      `SELECT * FROM taste_meal_scores WHERE user_profile_id = $1 AND meal_id = $2`,
      [userId, mealId]
    );
    return rows[0] || null;
  }
  
  async upsertTasteMealScore(score: TasteMealScore): Promise<void> {
    await this.query(
      `INSERT INTO taste_meal_scores 
       (id, user_profile_id, meal_id, score, approvals, rejections)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_profile_id, meal_id) DO UPDATE SET
         score = EXCLUDED.score,
         approvals = EXCLUDED.approvals,
         rejections = EXCLUDED.rejections,
         updated_at = NOW()`,
      [
        score.id,
        score.user_profile_id,
        score.meal_id,
        score.score,
        score.approvals,
        score.rejections,
      ]
    );
  }
  
  async ping(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

// =============================================================================
// DB CLIENT SINGLETON
// =============================================================================

let dbInstance: DbAdapter | null = null;

/**
 * Get the database adapter instance.
 * 
 * Selection logic:
 * - NODE_ENV=test: InMemory
 * - DATABASE_URL set: Postgres
 * - Otherwise: InMemory with warning
 */
export function getDb(): DbAdapter {
  if (dbInstance) {
    return dbInstance;
  }
  
  const isTest = process.env.NODE_ENV === 'test';
  const databaseUrl = process.env.DATABASE_URL;
  
  if (isTest) {
    dbInstance = new InMemoryAdapter();
    return dbInstance;
  }
  
  if (databaseUrl) {
    // Validate URL format (basic check)
    if (!databaseUrl.startsWith('postgres')) {
      throw new Error('DATABASE_URL must be a PostgreSQL connection string');
    }
    
    dbInstance = new PostgresAdapter(databaseUrl);
    console.log('[DB] Using Postgres adapter');
    return dbInstance;
  }
  
  // Fallback to InMemory for local dev
  console.warn('[DB] WARNING: DATABASE_URL not set, using InMemory adapter');
  dbInstance = new InMemoryAdapter();
  return dbInstance;
}

/**
 * Reset the database instance (for tests)
 */
export function resetDb(): void {
  dbInstance = null;
}

/**
 * Clear all data (for tests)
 */
export async function clearDb(): Promise<void> {
  const db = getDb();
  if (db.clearAll) {
    await db.clearAll();
  }
}

/**
 * Check if we're using a real database
 */
export function isRealDb(): boolean {
  return getDb().name === 'postgres';
}

/**
 * Fail fast if real DB is required but not configured
 */
export function requireRealDb(): void {
  if (process.env.NODE_ENV === 'test') {
    return; // Tests can use InMemory
  }
  
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required in staging/production. ' +
      'Set DATABASE_URL to a PostgreSQL connection string.'
    );
  }
}
