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
 * 
 * Readonly Mode:
 * - When readonlyMode=true, only SELECT queries are allowed
 * - INSERT/UPDATE/DELETE/ALTER/CREATE/DROP are blocked at the DB layer
 * - Throws Error('readonly_mode') for blocked operations
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
  // ALL reads are household-scoped for tenant isolation
  insertDecisionEvent(event: DecisionEventInsert): Promise<void>;
  getDecisionEventsByUserId(userId: number, householdKey: string, limit?: number): Promise<DecisionEvent[]>;
  getDecisionEventById(id: string, householdKey: string): Promise<DecisionEvent | null>;
  getDecisionEventsByContextHash(contextHash: string, householdKey: string): Promise<DecisionEvent[]>;
  
  // Receipt imports (household-scoped reads)
  insertReceiptImport(record: ReceiptImportRecord): Promise<void>;
  updateReceiptImportStatus(id: string, status: string, errorMessage?: string): Promise<void>;
  getReceiptImportById(id: string, householdKey: string): Promise<ReceiptImportRecord | null>;
  getReceiptImportByImageHash(householdKey: string, imageHash: string): Promise<ReceiptImportRecord | null>;
  
  // Inventory (household-scoped reads)
  upsertInventoryItem(item: InventoryItem): Promise<void>;
  getInventoryItemsByHousehold(householdKey: string): Promise<InventoryItem[]>;
  
  // Taste signals
  insertTasteSignal(signal: TasteSignal): Promise<void>;
  
  // Taste meal scores (household-scoped reads)
  getTasteMealScore(userId: number, householdKey: string, mealId: number): Promise<TasteMealScore | null>;
  upsertTasteMealScore(score: TasteMealScore): Promise<void>;
  
  // Health check
  ping(): Promise<boolean>;
  
  // Cleanup (for tests)
  clearAll?(): Promise<void>;
}

export interface TasteSignal {
  id: string;
  user_profile_id: number;
  household_key: string; // Partition key for multi-tenant isolation
  meal_id: number;
  weight: number;
  event_id: string; // Canonical column (alias for decision_event_id)
  decision_event_id?: string; // Legacy column (kept for backward compatibility)
  created_at: string;
}

export interface TasteMealScore {
  id: string;
  user_profile_id: number;
  household_key: string; // Partition key for multi-tenant isolation
  meal_id: number;
  score: number;
  approvals: number;
  rejections: number;
  updated_at?: string;
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
  
  // Readonly mode support
  private _readonlyMode: boolean = false;
  
  /**
   * Set readonly mode
   */
  setReadonlyMode(enabled: boolean): void {
    this._readonlyMode = enabled;
  }
  
  /**
   * Get current readonly mode status
   */
  isReadonly(): boolean {
    return this._readonlyMode;
  }
  
  /**
   * Check if operation should be blocked in readonly mode
   */
  private checkReadonly(): void {
    if (this._readonlyMode) {
      throw new Error('readonly_mode');
    }
  }
  
  /**
   * Generic query support for InMemory adapter.
   * Implements a subset of SQL needed for auth operations.
   * Respects readonly mode for write operations.
   */
  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const normalizedSql = sql.toLowerCase().trim();
    const isWriteOp = normalizedSql.startsWith('insert') || 
                      normalizedSql.startsWith('update') || 
                      normalizedSql.startsWith('delete');
    
    // Block write operations in readonly mode
    if (this._readonlyMode && isWriteOp) {
      throw new Error('readonly_mode');
    }
    
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
    this.checkReadonly();
    this.decisionEvents.set(event.id, {
      ...event,
    });
  }
  
  async getDecisionEventsByUserId(userId: number, householdKey: string, limit = 100): Promise<DecisionEvent[]> {
    return Array.from(this.decisionEvents.values())
      .filter(e => e.user_profile_id === userId && e.household_key === householdKey)
      .sort((a, b) => new Date(b.actioned_at || b.decided_at).getTime() - new Date(a.actioned_at || a.decided_at).getTime())
      .slice(0, limit);
  }
  
  async getDecisionEventById(id: string, householdKey: string): Promise<DecisionEvent | null> {
    const event = this.decisionEvents.get(id);
    // Household isolation: only return if household matches
    if (event && event.household_key === householdKey) {
      return event;
    }
    return null;
  }
  
  async getDecisionEventsByContextHash(contextHash: string, householdKey: string): Promise<DecisionEvent[]> {
    return Array.from(this.decisionEvents.values())
      .filter(e => e.context_hash === contextHash && e.household_key === householdKey);
  }
  
  async insertReceiptImport(record: ReceiptImportRecord): Promise<void> {
    this.checkReadonly();
    this.receiptImports.set(record.id, record);
  }
  
  async updateReceiptImportStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    this.checkReadonly();
    const existing = this.receiptImports.get(id);
    if (existing) {
      existing.status = status as ReceiptImportRecord['status'];
      if (errorMessage) {
        existing.error_message = errorMessage;
      }
    }
  }
  
  async getReceiptImportById(id: string, householdKey: string): Promise<ReceiptImportRecord | null> {
    const record = this.receiptImports.get(id);
    // Household isolation: only return if household matches
    if (record && record.household_key === householdKey) {
      return record;
    }
    return null;
  }
  
  async getReceiptImportByImageHash(householdKey: string, imageHash: string): Promise<ReceiptImportRecord | null> {
    return Array.from(this.receiptImports.values())
      .find(r => r.household_key === householdKey && r.image_hash === imageHash) || null;
  }
  
  async upsertInventoryItem(item: InventoryItem): Promise<void> {
    this.checkReadonly();
    this.inventoryItems.set(item.id, item);
  }
  
  async getInventoryItemsByHousehold(householdKey: string): Promise<InventoryItem[]> {
    return Array.from(this.inventoryItems.values())
      .filter(i => i.household_key === householdKey)
      .sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime());
  }
  
  async insertTasteSignal(signal: TasteSignal): Promise<void> {
    this.checkReadonly();
    this.tasteSignals.set(signal.id, signal);
  }
  
  async getTasteMealScore(userId: number, householdKey: string, mealId: number): Promise<TasteMealScore | null> {
    // Key is household-scoped: ${householdKey}-${mealId}
    const key = `${householdKey}-${mealId}`;
    const score = this.tasteMealScores.get(key);
    if (score) {
      return score;
    }
    return null;
  }
  
  async upsertTasteMealScore(score: TasteMealScore): Promise<void> {
    this.checkReadonly();
    // Key is household-scoped: ${householdKey}-${mealId}
    const key = `${score.household_key}-${score.meal_id}`;
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
 * DML/DDL tokens that indicate a write operation.
 * Must reject SQL containing these even in CTEs or subqueries.
 */
const WRITE_TOKENS = /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i;

/**
 * Strip leading SQL comments from a string.
 * Handles both line comments (--) and block comments (slash-star ... star-slash).
 * Repeats until no more leading comments found.
 */
function stripLeadingComments(sql: string): string {
  let prev = '';
  let current = sql;
  
  while (prev !== current) {
    prev = current;
    
    // Remove leading whitespace
    current = current.trimStart();
    
    // Remove line comments: --...newline
    while (current.startsWith('--')) {
      const newlineIdx = current.indexOf('\n');
      if (newlineIdx === -1) {
        current = '';
      } else {
        current = current.substring(newlineIdx + 1).trimStart();
      }
    }
    
    // Remove block comments: /*...*/
    while (current.startsWith('/*')) {
      const endIdx = current.indexOf('*/');
      if (endIdx === -1) {
        // Unclosed block comment - treat entire string as comment
        current = '';
      } else {
        current = current.substring(endIdx + 2).trimStart();
      }
    }
  }
  
  return current;
}

/**
 * Check if SQL statement is read-only (safe to execute in readonly mode).
 * 
 * Rules:
 * 1. Strip leading whitespace and SQL comments (line and block)
 * 2. Reject if contains ';' anywhere (multi-statement)
 * 3. Allow only statements starting with SELECT or WITH (case-insensitive)
 * 4. Reject if contains any DML/DDL tokens (INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/TRUNCATE)
 *    even inside CTEs or subqueries
 * 
 * @param sql - SQL statement to check
 * @returns true if the SQL is read-only safe, false otherwise
 */
export function isReadOnlySql(sql: string): boolean {
  // Strip leading comments and whitespace
  const stripped = stripLeadingComments(sql);
  
  // Reject empty SQL
  if (stripped.length === 0) {
    return false;
  }
  
  // Reject multi-statement SQL (contains semicolon)
  if (stripped.includes(';')) {
    return false;
  }
  
  // Check the first keyword (case-insensitive)
  const upperSql = stripped.toUpperCase();
  const firstWord = upperSql.split(/\s+/)[0];
  
  // Only allow SELECT or WITH
  if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
    return false;
  }
  
  // Scan for any DML/DDL tokens anywhere in the SQL
  // This catches CTEs with write operations: WITH x AS (UPDATE ...) SELECT ...
  if (WRITE_TOKENS.test(stripped)) {
    return false;
  }
  
  return true;
}

/**
 * Check if SQL statement is a write operation.
 * Inverse of isReadOnlySql for backwards compatibility.
 */
function isWriteStatement(sql: string): boolean {
  return !isReadOnlySql(sql);
}

// =============================================================================
// TENANT ISOLATION GUARD
// =============================================================================

/**
 * Tables that contain household-partitioned data and MUST be queried with household_key.
 * Any SELECT from these tables without household_key in WHERE clause is a tenant leak.
 */
const HOUSEHOLD_SCOPED_TABLES = [
  'decision_events',
  'taste_meal_scores',
  'taste_signals',
  'inventory_items',
  'receipt_imports',
];

/**
 * Check if a SQL query requires household_key filter but is missing it.
 * 
 * This is a belt-and-suspenders guard to catch tenant isolation bugs.
 * Only applies to SELECT queries from household-scoped tables.
 * 
 * @param sql - SQL statement to check
 * @returns true if the query requires household_key but doesn't have it
 */
export function requiresHouseholdKeyButMissing(sql: string): boolean {
  const upperSql = sql.toUpperCase();
  
  // Only check SELECT queries
  if (!upperSql.trimStart().startsWith('SELECT') && !upperSql.trimStart().startsWith('WITH')) {
    return false;
  }
  
  // Check if any household-scoped table is referenced
  for (const table of HOUSEHOLD_SCOPED_TABLES) {
    const tableUpper = table.toUpperCase();
    // Check for FROM <table> or JOIN <table> patterns
    if (upperSql.includes(`FROM ${tableUpper}`) || upperSql.includes(`JOIN ${tableUpper}`)) {
      // Must contain household_key in WHERE clause
      if (!upperSql.includes('HOUSEHOLD_KEY')) {
        return true; // Missing household_key filter!
      }
    }
  }
  
  return false;
}

/**
 * Assert that a SQL query has proper household_key filter if reading from tenant tables.
 * Throws if tenant isolation would be violated.
 * 
 * @param sql - SQL statement to check
 * @throws Error if household_key is required but missing
 */
export function assertHouseholdScoped(sql: string): void {
  if (requiresHouseholdKeyButMissing(sql)) {
    throw new Error('household_key_missing: SELECT from tenant table must include household_key filter');
  }
}

/**
 * Postgres adapter using native fetch to Supabase REST API
 * or direct pg connection if available
 * 
 * Supports readonlyMode which blocks all write operations at the adapter level
 */
class PostgresAdapter implements DbAdapter {
  name = 'postgres';
  
  private connectionString: string;
  private pool: unknown = null;
  private _readonlyMode: boolean = false;
  
  constructor(connectionString: string, readonlyMode: boolean = false) {
    this.connectionString = connectionString;
    this._readonlyMode = readonlyMode;
  }
  
  /**
   * Set readonly mode (can be changed after construction)
   */
  setReadonlyMode(enabled: boolean): void {
    this._readonlyMode = enabled;
  }
  
  /**
   * Get current readonly mode status
   */
  isReadonly(): boolean {
    return this._readonlyMode;
  }
  
  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    // READONLY MODE: Block write operations at the DB layer
    if (this._readonlyMode && isWriteStatement(sql)) {
      throw new Error('readonly_mode');
    }
    
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
      // Re-throw readonly_mode error as-is
      if (error instanceof Error && error.message === 'readonly_mode') {
        throw error;
      }
      // If pg not available, log and throw
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DB] Query failed:', message);
      throw new Error(`Database query failed: ${message}`);
    }
  }
  
  async insertDecisionEvent(event: DecisionEventInsert): Promise<void> {
    await this.query(
      `INSERT INTO decision_events 
       (id, user_profile_id, household_key, decided_at, actioned_at, user_action, notes, decision_payload, decision_type, meal_id, context_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        event.id,
        event.user_profile_id,
        event.household_key,
        event.decided_at,
        event.actioned_at,
        event.user_action,
        event.notes || null,
        JSON.stringify(event.decision_payload),
        event.decision_type,
        event.meal_id || null,
        event.context_hash || null,
      ]
    );
  }
  
  async getDecisionEventsByUserId(userId: number, householdKey: string, limit = 100): Promise<DecisionEvent[]> {
    return this.query<DecisionEvent>(
      `SELECT * FROM decision_events 
       WHERE user_profile_id = $1 AND household_key = $2 
       ORDER BY actioned_at DESC NULLS LAST 
       LIMIT $3`,
      [userId, householdKey, limit]
    );
  }
  
  async getDecisionEventById(id: string, householdKey: string): Promise<DecisionEvent | null> {
    const rows = await this.query<DecisionEvent>(
      `SELECT * FROM decision_events WHERE id = $1 AND household_key = $2 LIMIT 1`,
      [id, householdKey]
    );
    return rows[0] || null;
  }
  
  async getDecisionEventsByContextHash(contextHash: string, householdKey: string): Promise<DecisionEvent[]> {
    return this.query<DecisionEvent>(
      `SELECT * FROM decision_events WHERE context_hash = $1 AND household_key = $2`,
      [contextHash, householdKey]
    );
  }
  
  async insertReceiptImport(record: ReceiptImportRecord): Promise<void> {
    await this.query(
      `INSERT INTO receipt_imports 
       (id, user_profile_id, household_key, created_at, status, raw_ocr_text, error_message, image_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.id,
        record.user_profile_id,
        record.household_key,
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
  
  async getReceiptImportById(id: string, householdKey: string): Promise<ReceiptImportRecord | null> {
    const rows = await this.query<ReceiptImportRecord>(
      `SELECT * FROM receipt_imports WHERE id = $1 AND household_key = $2 LIMIT 1`,
      [id, householdKey]
    );
    return rows[0] || null;
  }
  
  async getReceiptImportByImageHash(householdKey: string, imageHash: string): Promise<ReceiptImportRecord | null> {
    const rows = await this.query<ReceiptImportRecord>(
      `SELECT * FROM receipt_imports WHERE household_key = $1 AND image_hash = $2 LIMIT 1`,
      [householdKey, imageHash]
    );
    return rows[0] || null;
  }
  
  async upsertInventoryItem(item: InventoryItem): Promise<void> {
    // Use canonical columns (item_name, remaining_qty, last_seen_at) with household_key
    // Also write to legacy columns for backward compatibility
    await this.query(
      `INSERT INTO inventory_items 
       (id, user_profile_id, household_key, item_name, remaining_qty, confidence, last_seen_at, name, quantity, unit, source, receipt_import_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         remaining_qty = EXCLUDED.remaining_qty,
         quantity = EXCLUDED.quantity,
         confidence = EXCLUDED.confidence,
         last_seen_at = EXCLUDED.last_seen_at,
         updated_at = EXCLUDED.updated_at`,
      [
        item.id,
        item.user_profile_id,
        item.household_key,
        item.item_name, // Canonical column
        item.remaining_qty, // Canonical column
        item.confidence,
        item.last_seen_at, // Canonical column
        item.item_name, // Legacy 'name' column (same value)
        item.remaining_qty, // Legacy 'quantity' column (same value)
        item.unit || null,
        item.source || 'receipt',
        item.receipt_import_id || null,
        item.created_at || new Date().toISOString(),
        item.last_seen_at, // Legacy 'updated_at' (same as last_seen_at)
      ]
    );
  }
  
  async getInventoryItemsByHousehold(householdKey: string): Promise<InventoryItem[]> {
    return this.query<InventoryItem>(
      `SELECT * FROM inventory_items WHERE household_key = $1 ORDER BY last_seen_at DESC NULLS LAST`,
      [householdKey]
    );
  }
  
  async insertTasteSignal(signal: TasteSignal): Promise<void> {
    await this.query(
      `INSERT INTO taste_signals 
       (id, user_profile_id, household_key, meal_id, weight, event_id, decision_event_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        signal.id,
        signal.user_profile_id,
        signal.household_key,
        signal.meal_id,
        signal.weight,
        signal.event_id, // Canonical column
        signal.event_id, // Also write to legacy decision_event_id for backward compat
        signal.created_at,
      ]
    );
  }
  
  async getTasteMealScore(userId: number, householdKey: string, mealId: number): Promise<TasteMealScore | null> {
    const rows = await this.query<TasteMealScore>(
      `SELECT * FROM taste_meal_scores WHERE user_profile_id = $1 AND household_key = $2 AND meal_id = $3 LIMIT 1`,
      [userId, householdKey, mealId]
    );
    return rows[0] || null;
  }
  
  async upsertTasteMealScore(score: TasteMealScore): Promise<void> {
    // Unique constraint is now (household_key, meal_id) per migration 021
    await this.query(
      `INSERT INTO taste_meal_scores 
       (id, user_profile_id, household_key, meal_id, score, approvals, rejections)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (household_key, meal_id) DO UPDATE SET
         score = EXCLUDED.score,
         approvals = EXCLUDED.approvals,
         rejections = EXCLUDED.rejections,
         user_profile_id = EXCLUDED.user_profile_id,
         updated_at = NOW()`,
      [
        score.id,
        score.user_profile_id,
        score.household_key,
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

/**
 * Set readonly mode on the DB adapter.
 * When enabled, all write operations (INSERT/UPDATE/DELETE) are blocked.
 * Throws Error('readonly_mode') for blocked operations.
 */
export function setDbReadonly(enabled: boolean): void {
  const db = getDb();
  if ('setReadonlyMode' in db && typeof db.setReadonlyMode === 'function') {
    (db as InMemoryAdapter | PostgresAdapter).setReadonlyMode(enabled);
  }
}

/**
 * Check if DB is in readonly mode
 */
export function isDbReadonly(): boolean {
  const db = getDb();
  if ('isReadonly' in db && typeof db.isReadonly === 'function') {
    return (db as InMemoryAdapter | PostgresAdapter).isReadonly();
  }
  return false;
}

/**
 * Check if error is a readonly_mode error
 */
export function isReadonlyModeError(error: unknown): boolean {
  return error instanceof Error && error.message === 'readonly_mode';
}
