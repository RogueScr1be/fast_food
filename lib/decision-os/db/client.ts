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
  // householdKey is ALWAYS the primary partition key
  insertDecisionEvent(event: DecisionEventInsert): Promise<void>;
  getDecisionEvents(householdKey: string, limit?: number): Promise<DecisionEvent[]>;
  getDecisionEventById(householdKey: string, id: string): Promise<DecisionEvent | null>;
  getDecisionEventsByContextHash(householdKey: string, contextHash: string): Promise<DecisionEvent[]>;
  
  // Receipt imports (household-scoped reads + updates)
  insertReceiptImport(record: ReceiptImportRecord): Promise<void>;
  updateReceiptImportStatus(householdKey: string, id: string, status: string, errorMessage?: string): Promise<void>;
  getReceiptImportById(householdKey: string, id: string): Promise<ReceiptImportRecord | null>;
  getReceiptImportByImageHash(householdKey: string, imageHash: string): Promise<ReceiptImportRecord | null>;
  
  // Inventory (household-scoped reads)
  upsertInventoryItem(item: InventoryItem): Promise<void>;
  getInventoryItems(householdKey: string): Promise<InventoryItem[]>;
  
  // Taste signals
  insertTasteSignal(signal: TasteSignal): Promise<void>;
  
  // Taste meal scores (household-scoped reads)
  // householdKey is primary, mealId is secondary - NO userId in interface
  getTasteMealScore(householdKey: string, mealId: number): Promise<TasteMealScore | null>;
  upsertTasteMealScore(score: TasteMealScore): Promise<void>;
  
  // Sessions (MVP - Decision Lock)
  // householdKey is ALWAYS the primary partition key
  createSession(session: SessionRecord): Promise<void>;
  getActiveSession(householdKey: string): Promise<SessionRecord | null>;
  getSessionById(householdKey: string, id: string): Promise<SessionRecord | null>;
  updateSession(householdKey: string, id: string, update: Partial<SessionRecord>): Promise<void>;
  
  // Meals (for Arbiter)
  // Not tenant-scoped - meals are global
  getMeals(): Promise<MealRecord[]>;
  getMealById(id: number): Promise<MealRecord | null>;
  
  // Household config (for budget ceiling and fallback config)
  getHouseholdConfig(householdKey: string): Promise<HouseholdConfig | null>;
  
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
// SESSION TYPES (MVP Decision Lock)
// =============================================================================

export type SessionOutcome = 'pending' | 'accepted' | 'rescued' | 'abandoned';

export interface SessionRecord {
  id: string;
  household_key: string;
  started_at: string;
  ended_at?: string;
  context: Record<string, unknown>;
  decision_id?: string;
  decision_payload?: Record<string, unknown>;
  outcome?: SessionOutcome;
  rejection_count: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// MEAL TYPES (for Arbiter)
// =============================================================================

export type ExecutionMode = 'cook' | 'pickup' | 'delivery' | 'no_cook';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface CookStep {
  step: number;
  instruction: string;
  duration_minutes: number;
}

export interface MealRecord {
  id: number;
  name: string;
  category: string;
  prep_time_minutes: number;
  tags: string[];
  estimated_cost_cents: number;
  difficulty: DifficultyLevel;
  mode: ExecutionMode;
  cook_steps: CookStep[];
  created_at?: string;
  updated_at?: string;
}

// =============================================================================
// HOUSEHOLD CONFIG (for budget and DRM fallback)
// =============================================================================

export interface FallbackOption {
  type: 'pickup' | 'delivery' | 'no_cook';
  meal_id?: number;
  meal_name: string;
  instructions: string;
  vendor_id?: string;
  order_id?: string;
}

export interface FallbackConfig {
  hierarchy: FallbackOption[];
  drm_time_threshold: string;
  rejection_threshold: number;
}

export interface HouseholdConfig {
  id: string;
  household_key: string;
  budget_ceiling_cents: number;
  fallback_config: FallbackConfig;
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
  private sessions: Map<string, SessionRecord> = new Map();
  
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
  
  // In-memory stores for household config (with MVP defaults)
  private householdConfigs: Map<string, HouseholdConfig> = new Map([
    ['default', {
      id: '00000000-0000-0000-0000-000000000000',
      household_key: 'default',
      budget_ceiling_cents: 2000,
      fallback_config: {
        hierarchy: [
          { type: 'no_cook' as const, meal_id: 11, meal_name: 'Cereal with Milk', instructions: 'Pour cereal into bowl, add milk' },
          { type: 'no_cook' as const, meal_id: 12, meal_name: 'PB&J Sandwich', instructions: 'Make a peanut butter and jelly sandwich' },
          { type: 'no_cook' as const, meal_id: 13, meal_name: 'Cheese and Crackers', instructions: 'Slice cheese, arrange with crackers' },
        ],
        drm_time_threshold: '18:15',
        rejection_threshold: 2,
      },
    }],
  ]);
  
  // In-memory meals store (seeded with MVP test data)
  private meals: Map<number, MealRecord> = new Map([
    [1, { id: 1, name: 'Chicken Pasta', category: 'dinner', prep_time_minutes: 30, tags: ['pasta', 'italian', 'comfort'], estimated_cost_cents: 1200, difficulty: 'medium', mode: 'cook', cook_steps: [{ step: 1, instruction: 'Boil water and cook pasta', duration_minutes: 10 }, { step: 2, instruction: 'Season and cook chicken', duration_minutes: 8 }, { step: 3, instruction: 'Add sauce and simmer', duration_minutes: 5 }, { step: 4, instruction: 'Combine and serve', duration_minutes: 2 }] }],
    [2, { id: 2, name: 'Quick Salad', category: 'dinner', prep_time_minutes: 15, tags: ['salad', 'quick', 'healthy'], estimated_cost_cents: 600, difficulty: 'easy', mode: 'cook', cook_steps: [{ step: 1, instruction: 'Chop vegetables', duration_minutes: 5 }, { step: 2, instruction: 'Add dressing', duration_minutes: 2 }, { step: 3, instruction: 'Toss and serve', duration_minutes: 1 }] }],
    [3, { id: 3, name: 'Vegetable Stir Fry', category: 'dinner', prep_time_minutes: 20, tags: ['vegetarian', 'quick', 'healthy'], estimated_cost_cents: 800, difficulty: 'easy', mode: 'cook', cook_steps: [{ step: 1, instruction: 'Chop vegetables', duration_minutes: 5 }, { step: 2, instruction: 'Heat oil in wok', duration_minutes: 2 }, { step: 3, instruction: 'Stir fry vegetables', duration_minutes: 8 }, { step: 4, instruction: 'Add sauce and serve', duration_minutes: 5 }] }],
    [4, { id: 4, name: 'Beef Tacos', category: 'dinner', prep_time_minutes: 25, tags: ['mexican', 'quick', 'family'], estimated_cost_cents: 1000, difficulty: 'easy', mode: 'cook', cook_steps: [{ step: 1, instruction: 'Season and brown beef', duration_minutes: 8 }, { step: 2, instruction: 'Warm taco shells', duration_minutes: 3 }, { step: 3, instruction: 'Prep toppings', duration_minutes: 5 }, { step: 4, instruction: 'Assemble and serve', duration_minutes: 5 }] }],
    [11, { id: 11, name: 'Cereal with Milk', category: 'dinner', prep_time_minutes: 2, tags: ['no_cook', 'fallback', 'quick'], estimated_cost_cents: 200, difficulty: 'easy', mode: 'no_cook', cook_steps: [{ step: 1, instruction: 'Pour cereal into bowl', duration_minutes: 1 }, { step: 2, instruction: 'Add milk', duration_minutes: 1 }] }],
    [12, { id: 12, name: 'PB&J Sandwich', category: 'dinner', prep_time_minutes: 5, tags: ['no_cook', 'fallback', 'quick'], estimated_cost_cents: 150, difficulty: 'easy', mode: 'no_cook', cook_steps: [{ step: 1, instruction: 'Spread peanut butter', duration_minutes: 1 }, { step: 2, instruction: 'Spread jelly', duration_minutes: 1 }, { step: 3, instruction: 'Combine and cut', duration_minutes: 1 }] }],
    [13, { id: 13, name: 'Cheese and Crackers', category: 'dinner', prep_time_minutes: 3, tags: ['no_cook', 'fallback', 'quick'], estimated_cost_cents: 300, difficulty: 'easy', mode: 'no_cook', cook_steps: [{ step: 1, instruction: 'Slice cheese', duration_minutes: 2 }, { step: 2, instruction: 'Arrange with crackers', duration_minutes: 1 }] }],
  ]);
  
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
   * Also enforces tenant isolation via assertHouseholdScoped.
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
    
    // TENANT ISOLATION: Assert household_key predicate for SELECT from tenant tables
    // This is a runtime guard against cross-tenant data leakage
    assertHouseholdScoped(sql);
    
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
  
  // Household-first: householdKey is the partition key
  async getDecisionEvents(householdKey: string, limit = 100): Promise<DecisionEvent[]> {
    return Array.from(this.decisionEvents.values())
      .filter(e => e.household_key === householdKey)
      .sort((a, b) => new Date(b.actioned_at || b.decided_at).getTime() - new Date(a.actioned_at || a.decided_at).getTime())
      .slice(0, limit);
  }
  
  // Household-first: householdKey is always first param
  async getDecisionEventById(householdKey: string, id: string): Promise<DecisionEvent | null> {
    const event = this.decisionEvents.get(id);
    // Household isolation: only return if household matches
    if (event && event.household_key === householdKey) {
      return event;
    }
    return null;
  }
  
  // Household-first: householdKey is always first param
  async getDecisionEventsByContextHash(householdKey: string, contextHash: string): Promise<DecisionEvent[]> {
    return Array.from(this.decisionEvents.values())
      .filter(e => e.context_hash === contextHash && e.household_key === householdKey);
  }
  
  async insertReceiptImport(record: ReceiptImportRecord): Promise<void> {
    this.checkReadonly();
    this.receiptImports.set(record.id, record);
  }
  
  // Household-scoped update: requires householdKey for tenant isolation
  async updateReceiptImportStatus(householdKey: string, id: string, status: string, errorMessage?: string): Promise<void> {
    this.checkReadonly();
    const existing = this.receiptImports.get(id);
    // Only update if household matches (tenant isolation)
    if (existing && existing.household_key === householdKey) {
      existing.status = status as ReceiptImportRecord['status'];
      if (errorMessage) {
        existing.error_message = errorMessage;
      }
    }
  }
  
  // Household-first: householdKey is always first param
  async getReceiptImportById(householdKey: string, id: string): Promise<ReceiptImportRecord | null> {
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
  
  // Household-first: renamed from getInventoryItemsByHousehold
  async getInventoryItems(householdKey: string): Promise<InventoryItem[]> {
    return Array.from(this.inventoryItems.values())
      .filter(i => i.household_key === householdKey)
      .sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime());
  }
  
  async insertTasteSignal(signal: TasteSignal): Promise<void> {
    this.checkReadonly();
    this.tasteSignals.set(signal.id, signal);
  }
  
  // Household-first: householdKey is the partition key, no userId in signature
  async getTasteMealScore(householdKey: string, mealId: number): Promise<TasteMealScore | null> {
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
  
  // ==========================================================================
  // SESSION METHODS (MVP Decision Lock)
  // ==========================================================================
  
  async createSession(session: SessionRecord): Promise<void> {
    this.checkReadonly();
    this.sessions.set(session.id, session);
  }
  
  async getActiveSession(householdKey: string): Promise<SessionRecord | null> {
    // Find most recent session without an ended_at timestamp
    const activeSessions = Array.from(this.sessions.values())
      .filter(s => s.household_key === householdKey && !s.ended_at && s.outcome === 'pending')
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    
    return activeSessions[0] || null;
  }
  
  async getSessionById(householdKey: string, id: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(id);
    if (session && session.household_key === householdKey) {
      return session;
    }
    return null;
  }
  
  async updateSession(householdKey: string, id: string, update: Partial<SessionRecord>): Promise<void> {
    this.checkReadonly();
    const existing = this.sessions.get(id);
    if (existing && existing.household_key === householdKey) {
      this.sessions.set(id, { ...existing, ...update, updated_at: new Date().toISOString() });
    }
  }
  
  // ==========================================================================
  // MEAL METHODS (for Arbiter)
  // ==========================================================================
  
  async getMeals(): Promise<MealRecord[]> {
    return Array.from(this.meals.values());
  }
  
  async getMealById(id: number): Promise<MealRecord | null> {
    return this.meals.get(id) || null;
  }
  
  // ==========================================================================
  // HOUSEHOLD CONFIG METHODS
  // ==========================================================================
  
  async getHouseholdConfig(householdKey: string): Promise<HouseholdConfig | null> {
    return this.householdConfigs.get(householdKey) || this.householdConfigs.get('default') || null;
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
    this.sessions.clear();
    
    // Reset auth-related stores to defaults
    this.households.clear();
    this.households.set('default', { id: '00000000-0000-0000-0000-000000000000', household_key: 'default' });
    this.householdMembers.clear();
    this.householdMembers.set(1, { id: '00000000-0000-0000-0000-000000000001', household_id: '00000000-0000-0000-0000-000000000000', user_profile_id: 1, role: 'owner' });
    this.userProfiles.clear();
    this.userProfiles.set(1, { id: 1 });
    this.nextUserProfileId = 2;
    
    // Note: meals and householdConfigs are not cleared as they are seed data
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
 * SINGLE SOURCE OF TRUTH: Tables that contain household-partitioned data.
 * Any SELECT/UPDATE/DELETE from these tables MUST include household_key predicate.
 * Any INSERT with ON CONFLICT MUST have household_key in conflict target.
 * 
 * Exported so db/migrate.ts and tests can reference the same list.
 */
export const TENANT_TABLES = new Set([
  'decision_events',
  'taste_meal_scores',
  'taste_signals',
  'inventory_items',
  'receipt_imports',
]);

// Alias for backward compatibility
const HOUSEHOLD_SCOPED_TABLES = Array.from(TENANT_TABLES);

// =============================================================================
// SQL STYLE CONTRACT v1 - TENANT-SAFE DIALECT
// =============================================================================

/**
 * Banned SQL tokens that should never appear in tenant queries.
 * Any of these triggers immediate rejection.
 */
const BANNED_SQL_TOKENS = [
  'DELETE',    // No deletes on tenant tables
  'ALTER',     // No DDL
  'CREATE',    // No DDL
  'DROP',      // No DDL  
  'TRUNCATE',  // No DDL
  'COPY',      // No bulk operations
  'GRANT',     // No permission changes
  'REVOKE',    // No permission changes
  'EXECUTE',   // No dynamic SQL
];

/**
 * Strip string literals from SQL to prevent false positives.
 * Replaces 'content' with '' (empty string literal placeholder).
 * 
 * This prevents things like SELECT ';' or SELECT 'DROP TABLE' from
 * triggering banned token/multi-statement detection.
 */
export function stripStringLiterals(sql: string): string {
  // Replace single-quoted strings (handling escaped quotes '')
  // Pattern: '...' where ... doesn't contain unescaped quotes
  // We use a simple approach: match '...' and replace with ''
  // Handle escaped quotes by matching non-quote or doubled quotes
  return sql.replace(/'(?:[^']|'')*'/g, "''");
}

/**
 * Normalize SQL for contract checking.
 * - Strips comments (line and block)
 * - Strips string literals (prevents false positives)
 * - Collapses whitespace
 * 
 * IMPORTANT: String literals are stripped BEFORE banned token scanning
 * to avoid false positives on values like 'DROP TABLE' or ';'.
 */
export function normalizeSql(sql: string): string {
  let normalized = sql;
  
  // Strip line comments (-- ...)
  normalized = normalized.replace(/--.*$/gm, ' ');
  
  // Strip block comments (/* ... */)
  normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, ' ');
  
  // Strip string literals to prevent false positives
  normalized = stripStringLiterals(normalized);
  
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * SQL Style Contract violation result.
 */
export interface SqlContractViolation {
  rule: string;
  message: string;
  sql?: string;
}

/**
 * Check SQL against the Tenant-Safe Dialect contract.
 * Returns violations array (empty = valid).
 * 
 * Rules enforced:
 * 1. No multi-statement SQL (;)
 * 2. No banned tokens (DELETE, DDL, etc.)
 * 3. No reverse predicates ($1 = alias.household_key)
 * 4. No IN/ANY tenant predicates
 * 5. No OR with tenant predicates
 * 6. Qualified predicates required when aliases exist in multi-table queries
 * 7. UPDATE must have household_key = $1 in WHERE
 * 8. $1 MUST be used for tenant predicates (not $2, $3, etc.)
 * 9. Literal tenant predicates banned (no household_key = 'value')
 * 10. ON CONFLICT ON CONSTRAINT is banned (use column-based ON CONFLICT)
 * 11. Tenant SQL cannot use CTEs or subqueries (flat queries only)
 */
export function checkSqlStyleContract(sql: string): SqlContractViolation[] {
  const violations: SqlContractViolation[] = [];
  const normalized = normalizeSql(sql);
  const upper = normalized.toUpperCase();
  
  // Rule 1: No multi-statement SQL (checked AFTER string literal stripping)
  if (normalized.includes(';')) {
    violations.push({
      rule: 'no_multi_statement',
      message: 'Multi-statement SQL is banned (contains semicolon outside string literals)',
    });
  }
  
  // Rule 2: No banned tokens (checked AFTER string literal stripping)
  for (const token of BANNED_SQL_TOKENS) {
    // Match whole word only
    const tokenRegex = new RegExp(`\\b${token}\\b`, 'i');
    if (tokenRegex.test(normalized)) {
      violations.push({
        rule: 'banned_token',
        message: `Banned SQL token: ${token}`,
      });
    }
  }
  
  // Rule 3: No reverse predicates ($N = alias.household_key)
  if (/\$\d+\s*=\s*\w*\.?household_key/i.test(normalized)) {
    violations.push({
      rule: 'reverse_predicate',
      message: 'Reverse predicate ($N = household_key) is banned; use alias.household_key = $1',
    });
  }
  
  // Rule 4: No IN/ANY tenant predicates
  if (/household_key\s+(IN|=\s*ANY)\s*\(/i.test(normalized)) {
    violations.push({
      rule: 'in_any_predicate',
      message: 'IN/ANY predicates on household_key are banned; use equality only',
    });
  }
  
  // Rule 5: No OR with tenant predicates
  if (/household_key\s*=\s*\$\d+\s+OR\b/i.test(normalized) ||
      /\bOR\s+\w*\.?household_key\s*=/i.test(normalized)) {
    violations.push({
      rule: 'or_with_tenant_predicate',
      message: 'Tenant predicate in OR clause is banned',
    });
  }
  
  // Rule 6: Qualified predicates required for multi-table queries
  const refs = extractTableReferences(sql);
  const tenantRefs = refs.filter(r => TENANT_TABLES.has(r.table));
  const hasMultipleTenantTables = tenantRefs.length > 1;
  
  if (hasMultipleTenantTables) {
    // In multi-table queries, unqualified predicates are ALWAYS wrong
    // Pattern: WHERE household_key = or AND household_key = (without alias prefix)
    if (/(?:WHERE|AND)\s+household_key\s*=\s*\$/i.test(normalized)) {
      violations.push({
        rule: 'unqualified_predicate',
        message: 'Unqualified household_key predicate in multi-table query is banned; use alias.household_key = $1 for each table',
      });
    }
  }
  
  // Rule 7: UPDATE must have household_key = $1 in WHERE
  if (upper.trimStart().startsWith('UPDATE')) {
    // Extract table name (handles schema-qualified and quoted)
    const updateRefs = extractTableReferences(sql);
    const updateTenantRef = updateRefs.find(r => TENANT_TABLES.has(r.table));
    
    if (updateTenantRef) {
      // Must have WHERE household_key = $1 (specifically $1, not other indices)
      if (!(/WHERE\s+(?:\w+\.)?household_key\s*=\s*\$1(?!\d)/i.test(normalized))) {
        violations.push({
          rule: 'update_missing_tenant_predicate',
          message: `UPDATE on tenant table '${updateTenantRef.table}' must include WHERE household_key = $1`,
        });
      }
    }
  }
  
  // Rule 8: $1 MUST be used for tenant predicates (not $2, $3, etc.)
  if (hasWrongParamIndexForTenant(normalized)) {
    violations.push({
      rule: 'wrong_param_index',
      message: '$1 must be used for household_key predicate (found $2 or higher); contract: $1 is ALWAYS household_key',
    });
  }
  
  // Rule 9: Literal tenant predicates banned
  // Note: We check the original SQL (before literal stripping) for this
  if (hasLiteralTenantPredicate(sql)) {
    violations.push({
      rule: 'literal_tenant_predicate',
      message: 'Literal values for household_key are banned; use parameterized $1',
    });
  }
  
  // Rule 10: ON CONFLICT ON CONSTRAINT is banned
  if (/ON\s+CONFLICT\s+ON\s+CONSTRAINT/i.test(normalized)) {
    violations.push({
      rule: 'on_conflict_on_constraint_banned',
      message: 'ON CONFLICT ON CONSTRAINT is banned; use column-based ON CONFLICT (household_key, ...)',
    });
  }
  
  // Rule 11: Tenant SQL cannot use CTEs or subqueries
  // This keeps SQL flat and parseable for tenant predicate verification
  // Note: reusing 'refs' from Rule 6 above
  const touchesTenantTable = refs.some(r => TENANT_TABLES.has(r.table));
  
  if (touchesTenantTable) {
    if (hasCte(sql)) {
      violations.push({
        rule: 'cte_banned_for_tenant_sql',
        message: 'CTEs (WITH ...) are banned in tenant SQL; use flat queries only',
      });
    }
    
    if (hasAnySubquery(sql)) {
      violations.push({
        rule: 'subquery_banned_for_tenant_sql',
        message: 'Subqueries are banned in tenant SQL; use flat queries only',
      });
    }
  }
  
  return violations;
}

/**
 * Assert SQL passes the Tenant-Safe Dialect contract.
 * Throws on first violation.
 */
export function assertSqlStyleContract(sql: string): void {
  const violations = checkSqlStyleContract(sql);
  if (violations.length > 0) {
    const v = violations[0];
    throw new Error(`sql_contract_violation: [${v.rule}] ${v.message}`);
  }
}

/**
 * Normalize a table name by stripping schema prefix and quotes.
 * 
 * Examples:
 *   "public.receipt_imports" -> "receipt_imports"
 *   '"receipt_imports"' -> "receipt_imports"
 *   '"public"."receipt_imports"' -> "receipt_imports"
 *   "receipt_imports" -> "receipt_imports"
 */
export function normalizeTableName(tableName: string): string {
  // Strip quotes
  let normalized = tableName.replace(/"/g, '');
  
  // Strip schema prefix (take last part after dot)
  if (normalized.includes('.')) {
    const parts = normalized.split('.');
    normalized = parts[parts.length - 1];
  }
  
  return normalized.toLowerCase();
}

/**
 * Extract table references from SQL (FROM, JOIN, UPDATE, INSERT INTO).
 * Returns array of {table, alias} objects.
 * 
 * Handles:
 *   - Simple: FROM decision_events
 *   - Aliased: FROM decision_events de
 *   - Schema-qualified: FROM public.receipt_imports ri
 *   - Quoted: FROM "receipt_imports" ri
 *   - Quoted+schema: FROM "public"."receipt_imports" ri
 *   - UPDATE: UPDATE receipt_imports SET ...
 *   - INSERT: INSERT INTO inventory_items ...
 * 
 * Examples:
 *   "FROM decision_events" -> [{table: 'decision_events', alias: null}]
 *   "FROM public.decision_events de" -> [{table: 'decision_events', alias: 'de'}]
 *   "UPDATE receipt_imports SET ..." -> [{table: 'receipt_imports', alias: null}]
 */
export function extractTableReferences(sql: string): Array<{table: string, alias: string | null}> {
  const refs: Array<{table: string, alias: string | null}> = [];
  
  // SQL keywords that should NOT be treated as aliases
  const SQL_KEYWORDS = new Set([
    'where', 'and', 'or', 'on', 'inner', 'outer', 'left', 'right', 'full', 
    'cross', 'join', 'natural', 'using', 'order', 'group', 'having', 'limit',
    'offset', 'union', 'intersect', 'except', 'set', 'values', 'select', 'from',
    'returning', 'conflict', 'do', 'update', 'nothing'
  ]);
  
  // Pattern for table identifier: handles schema.table, "table", "schema"."table"
  // Table part: (?:"[^"]+"|[a-z_][a-z0-9_]*)(?:\.(?:"[^"]+"|[a-z_][a-z0-9_]*))?
  const tableIdent = '(?:"[^"]+"|[a-z_][a-z0-9_]*)(?:\\.(?:"[^"]+"|[a-z_][a-z0-9_]*))?';
  
  // Match FROM <table> [AS] [alias] and JOIN <table> [AS] [alias]
  const fromJoinPattern = new RegExp(
    `(?:FROM|JOIN)\\s+(${tableIdent})(?:\\s+(?:AS\\s+)?([a-z_][a-z0-9_]*))?`,
    'gi'
  );
  
  // Match UPDATE <table> [AS] [alias]
  const updatePattern = new RegExp(
    `UPDATE\\s+(${tableIdent})(?:\\s+(?:AS\\s+)?([a-z_][a-z0-9_]*))?`,
    'gi'
  );
  
  // Match INSERT INTO <table>
  const insertPattern = new RegExp(
    `INSERT\\s+INTO\\s+(${tableIdent})`,
    'gi'
  );
  
  // Process FROM/JOIN matches
  let match;
  while ((match = fromJoinPattern.exec(sql)) !== null) {
    const tableName = normalizeTableName(match[1]);
    let alias = match[2]?.toLowerCase() || null;
    
    // Filter out SQL keywords from being treated as aliases
    if (alias && SQL_KEYWORDS.has(alias)) {
      alias = null;
    }
    
    // Only track tenant tables
    if (TENANT_TABLES.has(tableName)) {
      refs.push({ table: tableName, alias });
    }
  }
  
  // Process UPDATE matches
  while ((match = updatePattern.exec(sql)) !== null) {
    const tableName = normalizeTableName(match[1]);
    let alias = match[2]?.toLowerCase() || null;
    
    if (alias && SQL_KEYWORDS.has(alias)) {
      alias = null;
    }
    
    if (TENANT_TABLES.has(tableName)) {
      refs.push({ table: tableName, alias });
    }
  }
  
  // Process INSERT matches
  while ((match = insertPattern.exec(sql)) !== null) {
    const tableName = normalizeTableName(match[1]);
    
    if (TENANT_TABLES.has(tableName)) {
      refs.push({ table: tableName, alias: null });
    }
  }
  
  return refs;
}

/**
 * Check if SQL has a household_key predicate for a specific table/alias.
 * 
 * CONTRACT ENFORCEMENT:
 * - $1 MUST be used for household_key (not $2, $3, etc.)
 * - Literals are banned for tenant predicates
 * - For single-table queries: accepts unqualified "household_key = $1"
 * - For multi-table queries: requires qualified "alias.household_key = $1"
 * 
 * @returns true if valid predicate found, false otherwise
 */
export function hasPredicateForTableOrAlias(sql: string, tableOrAlias: string, isSingleTable: boolean): boolean {
  const patterns: RegExp[] = [];
  
  if (isSingleTable) {
    // Single table: accept unqualified predicates, but ONLY $1
    patterns.push(
      new RegExp(`WHERE\\s+household_key\\s*=\\s*\\$1(?!\\d)`, 'i'),
      new RegExp(`AND\\s+household_key\\s*=\\s*\\$1(?!\\d)`, 'i'),
    );
  }
  
  // Always check for qualified predicates (alias.household_key = $1)
  const escaped = tableOrAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  patterns.push(
    new RegExp(`WHERE\\s+${escaped}\\.household_key\\s*=\\s*\\$1(?!\\d)`, 'i'),
    new RegExp(`AND\\s+${escaped}\\.household_key\\s*=\\s*\\$1(?!\\d)`, 'i'),
  );
  
  return patterns.some(p => p.test(sql));
}

/**
 * Check if SQL uses wrong parameter index for tenant predicate.
 * 
 * CONTRACT: $1 is ALWAYS household_key.
 * This detects violations like: WHERE de.household_key = $2
 */
export function hasWrongParamIndexForTenant(sql: string): boolean {
  // Match household_key = $N where N is not 1
  return /household_key\s*=\s*\$([2-9]|\d{2,})/i.test(sql);
}

/**
 * Check if SQL uses string literal for tenant predicate.
 * 
 * Literals like household_key = 'abc' are banned.
 */
export function hasLiteralTenantPredicate(sql: string): boolean {
  return /household_key\s*=\s*'/i.test(sql);
}

/**
 * Check if SQL contains any subquery construct.
 * 
 * Subqueries are banned in tenant SQL because they can hide
 * tenant predicates in ways that are hard to verify.
 * 
 * Detects: (SELECT ...), EXISTS (SELECT ...), IN (SELECT ...), ANY (SELECT ...), ALL (SELECT ...)
 */
export function hasAnySubquery(sql: string): boolean {
  const normalized = normalizeSql(sql).toLowerCase();
  
  // Check for various subquery patterns
  const subqueryPatterns = [
    /\(\s*select\s/i,           // (SELECT ...
    /exists\s*\(\s*select\s/i,  // EXISTS (SELECT ...
    /\bin\s*\(\s*select\s/i,    // IN (SELECT ...
    /\bany\s*\(\s*select\s/i,   // ANY (SELECT ...
    /\ball\s*\(\s*select\s/i,   // ALL (SELECT ...
  ];
  
  return subqueryPatterns.some(pattern => pattern.test(normalized));
}

/**
 * Check if SQL uses a CTE (Common Table Expression).
 * 
 * CTEs are banned in tenant SQL because they can obscure
 * tenant isolation verification.
 */
export function hasCte(sql: string): boolean {
  const normalized = normalizeSql(sql).toLowerCase().trim();
  
  // CTE starts with WITH keyword
  return normalized.startsWith('with ');
}

/**
 * Check if a SQL query has a proper household_key predicate (not just substring).
 * 
 * For backward compatibility - checks for any household_key predicate.
 * Use assertTenantSafe() for full join-safe checking.
 */
export function hasHouseholdKeyPredicate(sql: string): boolean {
  const predicatePatterns = [
    /WHERE\s+(?:\w+\.)?household_key\s*=\s*\$/i,
    /AND\s+(?:\w+\.)?household_key\s*=\s*\$/i,
    /WHERE\s+(?:\w+\.)?household_key\s*=\s*'/i,
    /AND\s+(?:\w+\.)?household_key\s*=\s*'/i,
  ];
  
  return predicatePatterns.some(pattern => pattern.test(sql));
}

/**
 * Check if a SQL query requires household_key predicate but is missing it.
 * 
 * STRENGTHENED: Requires actual predicate pattern (WHERE/AND household_key = $N),
 * not just substring match on 'household_key'.
 * 
 * For full join-safety, use assertTenantSafe() instead.
 */
export function requiresHouseholdKeyButMissing(sql: string): boolean {
  const upperSql = sql.toUpperCase();
  
  // Only check SELECT/WITH queries (reads)
  const trimmed = upperSql.trimStart();
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
    return false;
  }
  
  // Check if any household-scoped table is referenced
  for (const table of HOUSEHOLD_SCOPED_TABLES) {
    const tableUpper = table.toUpperCase();
    if (upperSql.includes(`FROM ${tableUpper}`) || upperSql.includes(`JOIN ${tableUpper}`)) {
      if (!hasHouseholdKeyPredicate(sql)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * COMPREHENSIVE tenant safety check for SELECT queries.
 * 
 * For each tenant table referenced (FROM or JOIN), verifies:
 * - Single table query: accepts unqualified household_key predicate
 * - Multi-table query (joins): requires qualified predicate for EACH tenant table
 * 
 * @returns {valid: boolean, missingPredicates: string[]}
 */
export function checkTenantSafety(sql: string): {valid: boolean, missingPredicates: string[]} {
  const upperSql = sql.toUpperCase().trimStart();
  
  // Only check SELECT/WITH queries
  if (!upperSql.startsWith('SELECT') && !upperSql.startsWith('WITH')) {
    return { valid: true, missingPredicates: [] };
  }
  
  const refs = extractTableReferences(sql);
  if (refs.length === 0) {
    return { valid: true, missingPredicates: [] };
  }
  
  const isSingleTable = refs.length === 1;
  const missingPredicates: string[] = [];
  
  for (const ref of refs) {
    const identifier = ref.alias || ref.table;
    if (!hasPredicateForTableOrAlias(sql, identifier, isSingleTable)) {
      missingPredicates.push(ref.alias ? `${ref.table} (alias: ${ref.alias})` : ref.table);
    }
  }
  
  return {
    valid: missingPredicates.length === 0,
    missingPredicates,
  };
}

/**
 * Check if an INSERT statement has household_key in ON CONFLICT target.
 * 
 * For tenant tables, ON CONFLICT MUST include household_key to prevent
 * cross-tenant overwrites.
 * 
 * ALSO: ON CONFLICT ON CONSTRAINT is always banned (must use column-based).
 * 
 * @returns {valid: boolean, table: string | null, conflictTarget: string | null, reason?: string}
 */
export function checkOnConflictSafety(sql: string): {valid: boolean, table: string | null, conflictTarget: string | null, reason?: string} {
  const upperSql = sql.toUpperCase();
  
  // Only check INSERT statements
  if (!upperSql.trimStart().startsWith('INSERT')) {
    return { valid: true, table: null, conflictTarget: null };
  }
  
  // FIRST: Ban ON CONFLICT ON CONSTRAINT (before any other check)
  if (/ON\s+CONFLICT\s+ON\s+CONSTRAINT/i.test(sql)) {
    return { 
      valid: false, 
      table: null, 
      conflictTarget: 'ON CONSTRAINT', 
      reason: 'ON CONFLICT ON CONSTRAINT is banned; use column-based ON CONFLICT (household_key, ...)' 
    };
  }
  
  // Extract table from INSERT INTO <table> (handles schema.table and "quoted")
  const refs = extractTableReferences(sql);
  const insertRef = refs.find(r => TENANT_TABLES.has(r.table));
  
  if (!insertRef) {
    // Not inserting into a tenant table
    return { valid: true, table: null, conflictTarget: null };
  }
  
  const tableName = insertRef.table;
  
  // Check if ON CONFLICT exists
  const conflictMatch = /ON\s+CONFLICT\s*\(([^)]+)\)/i.exec(sql);
  if (!conflictMatch) {
    // No ON CONFLICT clause - that's fine for simple inserts
    return { valid: true, table: tableName, conflictTarget: null };
  }
  
  const conflictTarget = conflictMatch[1].toLowerCase();
  
  // ON CONFLICT target MUST include household_key for tenant tables
  if (!conflictTarget.includes('household_key')) {
    return { valid: false, table: tableName, conflictTarget };
  }
  
  return { valid: true, table: tableName, conflictTarget };
}

/**
 * Assert that a SQL query is tenant-safe.
 * 
 * Performs three levels of checking:
 * 1. SQL Style Contract (banned tokens, multi-statement, reverse predicates, etc.)
 * 2. SELECT tenant safety (household_key predicate for all tenant table references)
 * 3. INSERT ON CONFLICT safety (household_key in conflict target)
 * 
 * This is called automatically by adapters.
 * 
 * @throws Error if tenant isolation would be violated
 */
export function assertTenantSafe(sql: string): void {
  // Level 1: SQL Style Contract (dialect rules)
  assertSqlStyleContract(sql);
  
  // Level 2: Check SELECT queries
  const selectCheck = checkTenantSafety(sql);
  if (!selectCheck.valid) {
    throw new Error(
      `household_key_missing: Tenant tables [${selectCheck.missingPredicates.join(', ')}] ` +
      `require household_key predicate in WHERE clause`
    );
  }
  
  // Level 3: Check INSERT ON CONFLICT
  const conflictCheck = checkOnConflictSafety(sql);
  if (!conflictCheck.valid) {
    throw new Error(
      `on_conflict_unsafe: INSERT INTO ${conflictCheck.table} with ON CONFLICT (${conflictCheck.conflictTarget}) ` +
      `must include household_key in conflict target for tenant safety`
    );
  }
}

/**
 * Assert that a SQL query has proper household_key predicate if reading from tenant tables.
 * 
 * This is the legacy guard - calls assertTenantSafe internally.
 * 
 * @throws Error if household_key predicate is required but missing
 */
export function assertHouseholdScoped(sql: string): void {
  assertTenantSafe(sql);
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
    
    // TENANT ISOLATION: Assert household_key predicate for SELECT from tenant tables
    // This is a runtime guard against cross-tenant data leakage
    assertHouseholdScoped(sql);
    
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
  
  // Household-first: householdKey is the partition key
  async getDecisionEvents(householdKey: string, limit = 100): Promise<DecisionEvent[]> {
    return this.query<DecisionEvent>(
      `SELECT * FROM decision_events 
       WHERE household_key = $1 
       ORDER BY actioned_at DESC NULLS LAST 
       LIMIT $2`,
      [householdKey, limit]
    );
  }
  
  // Household-first: householdKey is always first param
  async getDecisionEventById(householdKey: string, id: string): Promise<DecisionEvent | null> {
    const rows = await this.query<DecisionEvent>(
      `SELECT * FROM decision_events WHERE household_key = $1 AND id = $2 LIMIT 1`,
      [householdKey, id]
    );
    return rows[0] || null;
  }
  
  // Household-first: householdKey is always first param
  async getDecisionEventsByContextHash(householdKey: string, contextHash: string): Promise<DecisionEvent[]> {
    return this.query<DecisionEvent>(
      `SELECT * FROM decision_events WHERE household_key = $1 AND context_hash = $2`,
      [householdKey, contextHash]
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
  
  // Household-scoped update: requires householdKey for tenant isolation
  // CONTRACT: $1 is ALWAYS household_key for UPDATE WHERE clauses
  async updateReceiptImportStatus(householdKey: string, id: string, status: string, errorMessage?: string): Promise<void> {
    await this.query(
      `UPDATE receipt_imports SET status = $2, error_message = $3 WHERE household_key = $1 AND id = $4`,
      [householdKey, status, errorMessage || null, id]
    );
  }
  
  // Household-first: householdKey is always first param
  async getReceiptImportById(householdKey: string, id: string): Promise<ReceiptImportRecord | null> {
    const rows = await this.query<ReceiptImportRecord>(
      `SELECT * FROM receipt_imports WHERE household_key = $1 AND id = $2 LIMIT 1`,
      [householdKey, id]
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
    // TENANT SAFETY: ON CONFLICT uses (household_key, item_name) per migration 024
    await this.query(
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
  
  // Household-first: renamed from getInventoryItemsByHousehold
  async getInventoryItems(householdKey: string): Promise<InventoryItem[]> {
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
  
  // Household-first: householdKey is the partition key, no userId in signature
  async getTasteMealScore(householdKey: string, mealId: number): Promise<TasteMealScore | null> {
    const rows = await this.query<TasteMealScore>(
      `SELECT * FROM taste_meal_scores WHERE household_key = $1 AND meal_id = $2 LIMIT 1`,
      [householdKey, mealId]
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
  
  // ==========================================================================
  // SESSION METHODS (MVP Decision Lock)
  // ==========================================================================
  
  async createSession(session: SessionRecord): Promise<void> {
    await this.query(
      `INSERT INTO sessions 
       (id, household_key, started_at, context, decision_id, decision_payload, outcome, rejection_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        session.id,
        session.household_key,
        session.started_at,
        JSON.stringify(session.context),
        session.decision_id || null,
        session.decision_payload ? JSON.stringify(session.decision_payload) : null,
        session.outcome || 'pending',
        session.rejection_count,
        session.created_at,
        session.updated_at,
      ]
    );
  }
  
  async getActiveSession(householdKey: string): Promise<SessionRecord | null> {
    const rows = await this.query<SessionRecord>(
      `SELECT * FROM sessions WHERE household_key = $1 AND ended_at IS NULL AND outcome = 'pending' ORDER BY started_at DESC LIMIT 1`,
      [householdKey]
    );
    return rows[0] || null;
  }
  
  async getSessionById(householdKey: string, id: string): Promise<SessionRecord | null> {
    const rows = await this.query<SessionRecord>(
      `SELECT * FROM sessions WHERE household_key = $1 AND id = $2 LIMIT 1`,
      [householdKey, id]
    );
    return rows[0] || null;
  }
  
  async updateSession(householdKey: string, id: string, update: Partial<SessionRecord>): Promise<void> {
    // Build dynamic update query for allowed fields
    const allowedFields = ['ended_at', 'decision_id', 'decision_payload', 'outcome', 'rejection_count', 'context'];
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [householdKey, id];
    let paramIndex = 3;
    
    for (const field of allowedFields) {
      if (field in update) {
        const value = (update as Record<string, unknown>)[field];
        if (field === 'context' || field === 'decision_payload') {
          setClauses.push(`${field} = $${paramIndex}`);
          params.push(value ? JSON.stringify(value) : null);
        } else {
          setClauses.push(`${field} = $${paramIndex}`);
          params.push(value);
        }
        paramIndex++;
      }
    }
    
    await this.query(
      `UPDATE sessions SET ${setClauses.join(', ')} WHERE household_key = $1 AND id = $2`,
      params
    );
  }
  
  // ==========================================================================
  // MEAL METHODS (for Arbiter)
  // ==========================================================================
  
  async getMeals(): Promise<MealRecord[]> {
    // Meals are global (not tenant-scoped)
    const rows = await this.query<MealRecord>(`SELECT * FROM meals ORDER BY id`);
    return rows;
  }
  
  async getMealById(id: number): Promise<MealRecord | null> {
    const rows = await this.query<MealRecord>(`SELECT * FROM meals WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] || null;
  }
  
  // ==========================================================================
  // HOUSEHOLD CONFIG METHODS
  // ==========================================================================
  
  async getHouseholdConfig(householdKey: string): Promise<HouseholdConfig | null> {
    const rows = await this.query<HouseholdConfig>(
      `SELECT id, household_key, budget_ceiling_cents, fallback_config FROM households WHERE household_key = $1 LIMIT 1`,
      [householdKey]
    );
    if (rows.length === 0) {
      // Return default config if household not found
      const defaultRows = await this.query<HouseholdConfig>(
        `SELECT id, household_key, budget_ceiling_cents, fallback_config FROM households WHERE household_key = $1 LIMIT 1`,
        ['default']
      );
      return defaultRows[0] || null;
    }
    return rows[0];
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
