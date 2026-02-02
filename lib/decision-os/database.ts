/**
 * FAST FOOD: Decision OS Database Adapter
 * 
 * Production database operations for decision-os.
 * Connects to Postgres decision_os schema.
 * 
 * INVARIANTS:
 * - Never returns arrays of meals to client (internal use only)
 * - decision_events is append-only
 * - inventory confidence must be 0..1
 */

import type {
  MealRow,
  InventoryItemRow,
  MealIngredientRow,
  DecisionEventRow,
} from '@/types/decision-os/decision';
import type { DrmEventRow } from '@/types/decision-os/drm';

// =============================================================================
// DATABASE CONNECTION CONFIGURATION
// =============================================================================

/**
 * Database connection configuration
 * In production, use environment variables
 */
export interface DatabaseConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

/**
 * Get database configuration from environment
 */
export function getDatabaseConfig(): DatabaseConfig {
  return {
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME ?? 'fastfood_dev',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD,
  };
}

// =============================================================================
// DATABASE CLIENT INTERFACE
// =============================================================================

/**
 * Database client interface
 * Implementations: PostgresClient (production), MockClient (testing)
 */
export interface DatabaseClient {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
}

// =============================================================================
// POSTGRES CLIENT (PRODUCTION)
// =============================================================================

/**
 * PostgreSQL database client
 * Uses pg library when available, falls back to mock for development
 */
class PostgresClient implements DatabaseClient {
  private connected: boolean = false;
  private pool: any = null;
  
  constructor(private config: DatabaseConfig) {}
  
  private async ensureConnection(): Promise<void> {
    if (this.connected) return;
    
    try {
      // Dynamic import to avoid bundling pg in client
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg') as { Pool: new (config: DatabaseConfig & { max: number; idleTimeoutMillis: number }) => unknown };
      this.pool = new Pool({
        connectionString: this.config.connectionString,
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        max: 10,
        idleTimeoutMillis: 30000,
      });
      this.connected = true;
    } catch (error) {
      // pg not available - will use fallback
      console.warn('PostgreSQL client not available, using in-memory fallback');
      throw error;
    }
  }
  
  async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    await this.ensureConnection();
    return this.pool.query(sql, params);
  }
  
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
    }
  }
}

// =============================================================================
// IN-MEMORY FALLBACK CLIENT (DEVELOPMENT)
// =============================================================================

/**
 * In-memory fallback client for development when Postgres is not available
 * Loads seed data on initialization
 */
class InMemoryClient implements DatabaseClient {
  private meals: MealRow[] = [];
  private ingredients: MealIngredientRow[] = [];
  private inventory: InventoryItemRow[] = [];
  private decisionEvents: DecisionEventRow[] = [];
  private drmEvents: DrmEventRow[] = [];
  private receiptImports: ReceiptImportRow[] = [];
  private receiptLineItems: ReceiptLineItemRow[] = [];
  private tasteSignals: TasteSignalRow[] = [];
  private tasteMealScores: TasteMealScoreRow[] = [];
  private initialized: boolean = false;
  
  private initialize(): void {
    if (this.initialized) return;
    
    // Load seed data
    this.meals = getDefaultMeals();
    this.ingredients = getDefaultIngredients();
    this.initialized = true;
  }
  
  async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    this.initialize();
    
    // Parse SQL and return appropriate data
    const sqlLower = sql.toLowerCase();
    
    if (sqlLower.includes('from decision_os.meals') && sqlLower.includes('where is_active')) {
      return { rows: this.meals.filter(m => m.is_active) as unknown as T[] };
    }
    
    // SELECT meal by ID (for taste feature extraction)
    if (sqlLower.includes('from decision_os.meals') && sqlLower.includes('where id')) {
      const id = params?.[0] as string;
      const found = this.meals.find(m => m.id === id);
      return { rows: found ? [found] as unknown as T[] : [] };
    }
    
    if (sqlLower.includes('from decision_os.meals')) {
      return { rows: this.meals as unknown as T[] };
    }
    
    // SELECT meal_ingredients by meal_id (specific - must be before general)
    if (sqlLower.includes('from decision_os.meal_ingredients') && sqlLower.includes('where meal_id')) {
      const mealId = params?.[0] as string;
      const filtered = this.ingredients.filter(i => i.meal_id === mealId);
      return { rows: filtered as unknown as T[] };
    }
    
    if (sqlLower.includes('from decision_os.meal_ingredients')) {
      return { rows: this.ingredients as unknown as T[] };
    }
    
    // Note: Specific inventory_items queries (LIKE, item_name, ORDER BY) are handled later
    // This general handler only matches simple "SELECT * FROM inventory_items WHERE household_key = $1"
    if (sqlLower.includes('from decision_os.inventory_items') && 
        sqlLower.includes('where household_key') &&
        !sqlLower.includes('like') &&
        !sqlLower.includes('and item_name') &&
        !sqlLower.includes('order by')) {
      const householdKey = params?.[0] as string ?? 'default';
      const filtered = this.inventory.filter(i => i.household_key === householdKey);
      return { rows: filtered as unknown as T[] };
    }
    
    // ==== DECISION EVENTS QUERIES - ORDER MATTERS (specific to general) ====
    
    // COUNT decision events (most specific - contains "count")
    if (sqlLower.includes('select count') && sqlLower.includes('decision_events')) {
      const householdKey = params?.[0] as string ?? 'default';
      const count = this.decisionEvents.filter(d => d.household_key === householdKey).length;
      return { rows: [{ count: count.toString() }] as unknown as T[] };
    }
    
    // Get decision event by ID and household_key (for feedback validation)
    if (sqlLower.includes('select') && sqlLower.includes('decision_events') && sqlLower.includes('where id') && sqlLower.includes('and household_key')) {
      const id = params?.[0] as string;
      const householdKey = params?.[1] as string;
      const found = this.decisionEvents.find(e => e.id === id && e.household_key === householdKey);
      return { rows: found ? [found] as unknown as T[] : [] };
    }
    
    // Get decision event by ID only
    if (sqlLower.includes('select') && sqlLower.includes('decision_events') && sqlLower.includes('where id')) {
      const id = params?.[0] as string;
      const found = this.decisionEvents.find(e => e.id === id);
      return { rows: found ? [found] as unknown as T[] : [] };
    }
    
    // INSERT decision events
    if (sqlLower.includes('insert into decision_os.decision_events')) {
      // Parse INSERT values from params
      // Supports both 9-param (original decision) and 10-param (feedback copy with actioned_at) versions
      const event: DecisionEventRow = {
        id: params?.[0] as string,
        household_key: params?.[1] as string,
        decided_at: params?.[2] as string,
        decision_type: params?.[3] as 'cook' | 'order' | 'zero_cook',
        meal_id: params?.[4] as string | null,
        external_vendor_key: params?.[5] as string | null,
        context_hash: params?.[6] as string,
        decision_payload: typeof params?.[7] === 'string' 
          ? JSON.parse(params[7] as string) 
          : (params?.[7] as Record<string, unknown>),
        user_action: (params?.[8] as string ?? 'pending') as DecisionEventRow['user_action'],
        actioned_at: params?.[9] as string | undefined, // 10th param for feedback copy
      };
      this.decisionEvents.push(event);
      return { rows: [event] as unknown as T[] };
    }
    
    // Get all decision events (ORDER BY decided_at ASC - for getAllDecisionEvents)
    if (sqlLower.includes('from decision_os.decision_events') && sqlLower.includes('order by decided_at asc')) {
      const householdKey = params?.[0] as string ?? 'default';
      const filtered = this.decisionEvents
        .filter(d => d.household_key === householdKey)
        .sort((a, b) => new Date(a.decided_at).getTime() - new Date(b.decided_at).getTime());
      return { rows: filtered as unknown as T[] };
    }
    
    // Get recent decision events (ORDER BY decided_at DESC LIMIT - for getRecentDecisionEvents)
    // This is the catch-all for FROM decision_events queries
    if (sqlLower.includes('from decision_os.decision_events')) {
      const householdKey = params?.[0] as string ?? 'default';
      const limit = params?.[1] as number ?? 7;
      const filtered = this.decisionEvents
        .filter(d => d.household_key === householdKey)
        .sort((a, b) => new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime())
        .slice(0, limit);
      return { rows: filtered as unknown as T[] };
    }
    
    // DRM events queries
    if (sqlLower.includes('insert into decision_os.drm_events')) {
      const event: DrmEventRow = {
        id: params?.[0] as string,
        household_key: params?.[1] as string,
        triggered_at: params?.[2] as string,
        trigger_type: params?.[3] as 'explicit' | 'implicit',
        trigger_reason: params?.[4] as DrmEventRow['trigger_reason'],
        rescue_type: params?.[5] as 'order' | 'zero_cook' | null,
        rescue_payload: params?.[6] ? JSON.parse(params[6] as string) : null,
        exhausted: params?.[7] as boolean,
      };
      this.drmEvents.push(event);
      return { rows: [event] as unknown as T[] };
    }
    
    if (sqlLower.includes('select') && sqlLower.includes('drm_events') && sqlLower.includes('where id')) {
      const id = params?.[0] as string;
      const found = this.drmEvents.find(e => e.id === id);
      return { rows: found ? [found] as unknown as T[] : [] };
    }
    
    if (sqlLower.includes('from decision_os.drm_events') && sqlLower.includes('where household_key')) {
      const householdKey = params?.[0] as string ?? 'default';
      const filtered = this.drmEvents
        .filter(d => d.household_key === householdKey)
        .sort((a, b) => new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime());
      return { rows: filtered as unknown as T[] };
    }
    
    // ==== RECEIPT IMPORTS QUERIES ====
    
    // INSERT receipt_imports (with dedupe columns)
    if (sqlLower.includes('insert into decision_os.receipt_imports')) {
      const receipt: ReceiptImportRow = {
        id: params?.[0] as string,
        household_key: params?.[1] as string,
        source: params?.[2] as 'image_upload' | 'email_forward' | 'manual_text',
        vendor_name: params?.[3] as string | null,
        purchased_at: params?.[4] as string | null,
        ocr_provider: params?.[5] as string | null,
        ocr_raw_text: params?.[6] as string | null,
        status: params?.[7] as 'received' | 'parsed' | 'failed',
        error_message: params?.[8] as string | null,
        content_hash: params?.[9] as string ?? '',
        is_duplicate: params?.[10] as boolean ?? false,
        duplicate_of_receipt_import_id: params?.[11] as string | null ?? null,
        created_at: new Date().toISOString(),
      };
      this.receiptImports.push(receipt);
      return { rows: [receipt] as unknown as T[] };
    }
    
    // UPDATE receipt_imports
    if (sqlLower.includes('update decision_os.receipt_imports')) {
      const id = params?.[0] as string;
      const receipt = this.receiptImports.find(r => r.id === id);
      if (receipt) {
        receipt.status = params?.[1] as 'received' | 'parsed' | 'failed';
        // Handle dynamic params - check for specific fields
        let paramIdx = 2;
        if (sqlLower.includes('ocr_provider')) {
          receipt.ocr_provider = params?.[paramIdx++] as string | null;
        }
        if (sqlLower.includes('ocr_raw_text')) {
          receipt.ocr_raw_text = params?.[paramIdx++] as string | null;
        }
        if (sqlLower.includes('vendor_name') && !sqlLower.includes('insert')) {
          receipt.vendor_name = params?.[paramIdx++] as string | null;
        }
        if (sqlLower.includes('purchased_at') && !sqlLower.includes('insert')) {
          receipt.purchased_at = params?.[paramIdx++] as string | null;
        }
        if (sqlLower.includes('error_message') && !sqlLower.includes('insert')) {
          receipt.error_message = params?.[paramIdx++] as string | null;
        }
        // Dedupe fields
        if (sqlLower.includes('content_hash') && !sqlLower.includes('insert')) {
          receipt.content_hash = params?.[paramIdx++] as string;
        }
        if (sqlLower.includes('is_duplicate') && !sqlLower.includes('insert')) {
          receipt.is_duplicate = params?.[paramIdx++] as boolean;
        }
        if (sqlLower.includes('duplicate_of_receipt_import_id') && !sqlLower.includes('insert')) {
          receipt.duplicate_of_receipt_import_id = params?.[paramIdx++] as string | null;
        }
      }
      return { rows: [] };
    }
    
    // SELECT canonical receipt by household_key + content_hash + is_duplicate=false
    if (sqlLower.includes('from decision_os.receipt_imports') && 
        sqlLower.includes('where household_key') && 
        sqlLower.includes('content_hash') && 
        sqlLower.includes('is_duplicate = false')) {
      const householdKey = params?.[0] as string;
      const contentHash = params?.[1] as string;
      const found = this.receiptImports.find(r => 
        r.household_key === householdKey && 
        r.content_hash === contentHash && 
        r.is_duplicate === false
      );
      return { rows: found ? [found] as unknown as T[] : [] };
    }
    
    // SELECT receipt_imports by ID
    if (sqlLower.includes('from decision_os.receipt_imports') && sqlLower.includes('where id')) {
      const id = params?.[0] as string;
      const found = this.receiptImports.find(r => r.id === id);
      return { rows: found ? [found] as unknown as T[] : [] };
    }
    
    // ==== RECEIPT LINE ITEMS QUERIES ====
    
    // INSERT receipt_line_items
    if (sqlLower.includes('insert into decision_os.receipt_line_items')) {
      const lineItem: ReceiptLineItemRow = {
        id: params?.[0] as string,
        receipt_import_id: params?.[1] as string,
        raw_line: params?.[2] as string,
        raw_item_name: params?.[3] as string | null,
        raw_qty_text: params?.[4] as string | null,
        raw_price: params?.[5] as number | null,
        normalized_item_name: params?.[6] as string | null,
        normalized_unit: params?.[7] as string | null,
        normalized_qty_estimated: params?.[8] as number | null,
        confidence: params?.[9] as number,
        created_at: new Date().toISOString(),
      };
      this.receiptLineItems.push(lineItem);
      return { rows: [lineItem] as unknown as T[] };
    }
    
    // SELECT receipt_line_items COUNT by receipt_import_id
    if (sqlLower.includes('select count') && sqlLower.includes('receipt_line_items')) {
      const receiptImportId = params?.[0] as string;
      const count = this.receiptLineItems.filter(li => li.receipt_import_id === receiptImportId).length;
      return { rows: [{ count: count.toString() }] as unknown as T[] };
    }
    
    // SELECT receipt_line_items by receipt_import_id
    if (sqlLower.includes('from decision_os.receipt_line_items') && sqlLower.includes('where receipt_import_id')) {
      const receiptImportId = params?.[0] as string;
      const filtered = this.receiptLineItems
        .filter(li => li.receipt_import_id === receiptImportId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return { rows: filtered as unknown as T[] };
    }
    
    // ==== INVENTORY UPSERT/QUERIES ====
    
    // INSERT inventory_items with ON CONFLICT (upsert)
    if (sqlLower.includes('insert into decision_os.inventory_items') && sqlLower.includes('on conflict')) {
      const id = params?.[0] as string;
      const householdKey = params?.[1] as string;
      const itemName = params?.[2] as string;
      const qtyEstimated = params?.[3] as number | null;
      const unit = params?.[4] as string | null;
      const confidence = params?.[5] as number;
      const lastSeenAt = params?.[6] as string;
      
      // Find existing
      const existing = this.inventory.find(
        i => i.household_key === householdKey && i.item_name === itemName
      );
      
      if (existing) {
        // UPSERT: update with GREATEST confidence rule
        existing.confidence = Math.max(existing.confidence, confidence);
        // qty_estimated: add if both present
        if (existing.qty_estimated !== null && qtyEstimated !== null) {
          existing.qty_estimated = (existing.qty_estimated as number) + qtyEstimated;
        } else if (qtyEstimated !== null) {
          existing.qty_estimated = qtyEstimated;
        }
        // unit: keep existing if present
        if (!existing.unit && unit) {
          existing.unit = unit;
        }
        existing.source = 'receipt';
        existing.last_seen_at = lastSeenAt;
      } else {
        // INSERT new
        const newItem: InventoryItemRow = {
          id,
          household_key: householdKey,
          item_name: itemName,
          qty_estimated: qtyEstimated,
          qty_used_estimated: 0,
          unit,
          confidence,
          source: 'receipt',
          last_seen_at: lastSeenAt,
          last_used_at: null,
          expires_at: null,
          decay_rate_per_day: 0.05,
          created_at: new Date().toISOString(),
        };
        this.inventory.push(newItem);
      }
      return { rows: [] };
    }
    
    // UPDATE inventory_items for consumption (qty_used_estimated + last_used_at)
    if (sqlLower.includes('update decision_os.inventory_items') && sqlLower.includes('qty_used_estimated')) {
      const qtyUsedIncrement = params?.[0] as number;
      const lastUsedAt = params?.[1] as string;
      const id = params?.[2] as string;
      const item = this.inventory.find(i => i.id === id);
      if (item) {
        item.qty_used_estimated = (item.qty_used_estimated ?? 0) + qtyUsedIncrement;
        item.last_used_at = lastUsedAt;
      }
      return { rows: [] };
    }
    
    // SELECT inventory by ingredient name (LIKE match with LOWER for case-insensitive)
    // Query pattern: WHERE household_key = $1 AND (LOWER(item_name) LIKE $2 OR $3 LIKE '%' || LOWER(item_name) || '%')
    if (sqlLower.includes('from decision_os.inventory_items') && 
        sqlLower.includes('lower(item_name)') && 
        sqlLower.includes('like')) {
      const householdKey = params?.[0] as string;
      const pattern = params?.[1] as string;
      const ingredientLower = params?.[2] as string;
      const searchTerm = pattern.replace(/%/g, '').toLowerCase();
      
      const matched = this.inventory.filter(i => {
        if (i.household_key !== householdKey) return false;
        const itemLower = i.item_name.toLowerCase();
        // Contains match in either direction
        return itemLower.includes(searchTerm) || ingredientLower.includes(itemLower);
      });
      return { rows: matched as unknown as T[] };
    }
    
    
    // COUNT inventory_items
    if (sqlLower.includes('select count') && sqlLower.includes('inventory_items')) {
      const householdKey = params?.[0] as string ?? 'default';
      const count = this.inventory.filter(i => i.household_key === householdKey).length;
      return { rows: [{ count: count.toString() }] as unknown as T[] };
    }
    
    // SELECT inventory_items with ILIKE ANY pattern matching (candidate pre-filter)
    // MUST be before other item_name handlers to avoid false matches
    if (sqlLower.includes('from decision_os.inventory_items') && 
        sqlLower.includes('ilike any') && 
        sqlLower.includes('order by confidence')) {
      const householdKey = params?.[0] as string ?? 'default';
      const patterns = params?.[1] as string[] ?? [];
      const limit = params?.[2] as number ?? 50;
      
      // Empty patterns = no matches
      if (patterns.length === 0) {
        return { rows: [] as unknown as T[] };
      }
      
      // Filter items that match any pattern (case-insensitive contains)
      const filtered = this.inventory.filter(item => {
        if (item.household_key !== householdKey) return false;
        const itemLower = item.item_name.toLowerCase();
        // Patterns are like %token% - check if item_name contains token
        return patterns.some(pattern => {
          const token = pattern.replace(/%/g, '').toLowerCase();
          return itemLower.includes(token);
        });
      });
      
      // Sort by confidence DESC, last_seen_at DESC
      filtered.sort((a, b) => {
        const confDiff = (b.confidence ?? 0) - (a.confidence ?? 0);
        if (Math.abs(confDiff) > 0.001) return confDiff;
        const aTime = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
        const bTime = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
        return bTime - aTime;
      });
      
      // Apply limit
      return { rows: filtered.slice(0, limit) as unknown as T[] };
    }
    
    // SELECT inventory_items by household_key and item_name (exact match)
    if (sqlLower.includes('from decision_os.inventory_items') && 
        sqlLower.includes('where household_key') && 
        sqlLower.includes('and item_name') &&
        !sqlLower.includes('ilike')) {
      const householdKey = params?.[0] as string;
      const itemName = params?.[1] as string;
      const found = this.inventory.find(
        i => i.household_key === householdKey && i.item_name === itemName
      );
      return { rows: found ? [found] as unknown as T[] : [] };
    }
    
    // SELECT all inventory_items by household_key ORDER BY item_name
    if (sqlLower.includes('from decision_os.inventory_items') && sqlLower.includes('where household_key') && sqlLower.includes('order by item_name')) {
      const householdKey = params?.[0] as string ?? 'default';
      const filtered = this.inventory
        .filter(i => i.household_key === householdKey)
        .sort((a, b) => a.item_name.localeCompare(b.item_name));
      return { rows: filtered as unknown as T[] };
    }
    
    // ==== TASTE SIGNALS QUERIES ====
    
    // INSERT taste_signals
    if (sqlLower.includes('insert into decision_os.taste_signals')) {
      const signal: TasteSignalRow = {
        id: params?.[0] as string,
        household_key: params?.[1] as string,
        decided_at: params?.[2] as string,
        actioned_at: params?.[3] as string | null,
        decision_event_id: params?.[4] as string,
        meal_id: params?.[5] as string | null,
        decision_type: params?.[6] as 'cook' | 'order' | 'zero_cook',
        user_action: params?.[7] as 'approved' | 'rejected' | 'drm_triggered' | 'expired',
        context_hash: params?.[8] as string,
        features: typeof params?.[9] === 'string' 
          ? JSON.parse(params[9] as string) 
          : (params?.[9] as Record<string, unknown>) ?? {},
        weight: params?.[10] as number,
        created_at: new Date().toISOString(),
      };
      
      // Check for duplicate decision_event_id (UNIQUE constraint)
      const existingSignal = this.tasteSignals.find(s => s.decision_event_id === signal.decision_event_id);
      if (existingSignal) {
        throw new Error(`UNIQUE constraint violation: taste_signal with decision_event_id ${signal.decision_event_id} already exists`);
      }
      
      this.tasteSignals.push(signal);
      return { rows: [signal] as unknown as T[] };
    }
    
    // SELECT taste_signals by decision_event_id
    if (sqlLower.includes('from decision_os.taste_signals') && sqlLower.includes('where decision_event_id')) {
      const decisionEventId = params?.[0] as string;
      const found = this.tasteSignals.find(s => s.decision_event_id === decisionEventId);
      return { rows: found ? [found] as unknown as T[] : [] };
    }
    
    // SELECT taste_signals by household_key
    if (sqlLower.includes('from decision_os.taste_signals') && sqlLower.includes('where household_key')) {
      const householdKey = params?.[0] as string;
      const filtered = this.tasteSignals.filter(s => s.household_key === householdKey);
      return { rows: filtered as unknown as T[] };
    }
    
    // ==== TASTE MEAL SCORES QUERIES ====
    
    // INSERT/UPSERT taste_meal_scores
    if (sqlLower.includes('insert into decision_os.taste_meal_scores') && sqlLower.includes('on conflict')) {
      const householdKey = params?.[0] as string;
      const mealId = params?.[1] as string;
      const scoreDelta = params?.[2] as number;
      const approvalsDelta = params?.[3] as number;
      const rejectionsDelta = params?.[4] as number;
      const lastSeenAt = params?.[5] as string;
      
      // Find existing
      const existing = this.tasteMealScores.find(
        s => s.household_key === householdKey && s.meal_id === mealId
      );
      
      if (existing) {
        // UPDATE
        existing.score = existing.score + scoreDelta;
        existing.approvals = existing.approvals + approvalsDelta;
        existing.rejections = existing.rejections + rejectionsDelta;
        existing.last_seen_at = lastSeenAt;
        existing.updated_at = new Date().toISOString();
      } else {
        // INSERT
        const newScore: TasteMealScoreRow = {
          household_key: householdKey,
          meal_id: mealId,
          score: scoreDelta,
          approvals: approvalsDelta,
          rejections: rejectionsDelta,
          last_seen_at: lastSeenAt,
          updated_at: new Date().toISOString(),
        };
        this.tasteMealScores.push(newScore);
      }
      return { rows: [] };
    }
    
    // SELECT taste_meal_scores by household_key and meal_id IN (list)
    // Query: SELECT meal_id, score FROM ... WHERE household_key = $1 AND meal_id = ANY($2)
    // NOTE: Must come BEFORE "and meal_id" handler since query contains both patterns
    if (sqlLower.includes('from decision_os.taste_meal_scores') && 
        sqlLower.includes('where household_key') && 
        sqlLower.includes('any')) {
      const householdKey = params?.[0] as string;
      const mealIds = params?.[1] as string[];
      const filtered = this.tasteMealScores.filter(
        s => s.household_key === householdKey && mealIds.includes(s.meal_id)
      );
      return { rows: filtered as unknown as T[] };
    }
    
    // SELECT taste_meal_scores by household_key and meal_id (single)
    if (sqlLower.includes('from decision_os.taste_meal_scores') && 
        sqlLower.includes('where household_key') && 
        sqlLower.includes('and meal_id')) {
      const householdKey = params?.[0] as string;
      const mealId = params?.[1] as string;
      const found = this.tasteMealScores.find(
        s => s.household_key === householdKey && s.meal_id === mealId
      );
      return { rows: found ? [found] as unknown as T[] : [] };
    }
    
    // SELECT taste_meal_scores by household_key
    if (sqlLower.includes('from decision_os.taste_meal_scores') && sqlLower.includes('where household_key')) {
      const householdKey = params?.[0] as string;
      const filtered = this.tasteMealScores.filter(s => s.household_key === householdKey);
      return { rows: filtered as unknown as T[] };
    }
    
    return { rows: [] };
  }
  
  async close(): Promise<void> {
    // No-op for in-memory
  }
  
  // Test helpers (only used in tests)
  _addInventory(items: InventoryItemRow[]): void {
    this.inventory.push(...items);
  }
  
  _addDecisionEvent(event: DecisionEventRow): void {
    this.decisionEvents.push(event);
  }
  
  _addDrmEvent(event: DrmEventRow): void {
    this.drmEvents.push(event);
  }
  
  _getDrmEvents(): DrmEventRow[] {
    return this.drmEvents;
  }
  
  _clearAll(): void {
    this.meals = [];
    this.ingredients = [];
    this.inventory = [];
    this.decisionEvents = [];
    this.drmEvents = [];
    this.receiptImports = [];
    this.receiptLineItems = [];
    this.tasteSignals = [];
    this.tasteMealScores = [];
    this.initialized = false;
  }
  
  _reset(): void {
    this.inventory = [];
    this.decisionEvents = [];
    this.drmEvents = [];
    this.receiptImports = [];
    this.receiptLineItems = [];
    this.tasteSignals = [];
    this.tasteMealScores = [];
    this.initialize();
  }
  
  // Taste graph test helpers
  _getTasteSignals(): TasteSignalRow[] {
    return this.tasteSignals;
  }
  
  _getTasteMealScores(): TasteMealScoreRow[] {
    return this.tasteMealScores;
  }
}

// =============================================================================
// DEFAULT SEED DATA
// =============================================================================

function getDefaultMeals(): MealRow[] {
  return [
    {
      id: 'meal-001',
      name: 'Spaghetti Aglio e Olio',
      canonical_key: 'spaghetti-aglio-olio',
      instructions_short: 'Cook spaghetti. Saute garlic in olive oil until golden, add red pepper flakes. Toss with pasta and parsley.',
      est_minutes: 15,
      est_cost_band: '$',
      tags_internal: ['italian', 'vegetarian', 'easy', 'pantry_friendly'],
      is_active: true,
    },
    {
      id: 'meal-002',
      name: 'Egg Fried Rice',
      canonical_key: 'egg-fried-rice',
      instructions_short: 'Scramble eggs, set aside. Stir-fry cold rice with soy sauce, add peas and eggs. Season with sesame oil.',
      est_minutes: 12,
      est_cost_band: '$',
      tags_internal: ['asian', 'easy', 'pantry_friendly'],
      is_active: true,
    },
    {
      id: 'meal-003',
      name: 'Quick Grilled Cheese',
      canonical_key: 'quick-grilled-cheese',
      instructions_short: 'Butter bread, add cheese slices, grill in pan until golden on both sides.',
      est_minutes: 10,
      est_cost_band: '$',
      tags_internal: ['american', 'vegetarian', 'easy', 'comfort', 'pantry_friendly'],
      is_active: true,
    },
    {
      id: 'meal-004',
      name: 'Scrambled Eggs on Toast',
      canonical_key: 'scrambled-eggs-toast',
      instructions_short: 'Whisk eggs with salt and pepper, scramble in butter until just set. Serve on buttered toast.',
      est_minutes: 8,
      est_cost_band: '$',
      tags_internal: ['american', 'breakfast', 'easy', 'vegetarian', 'pantry_friendly'],
      is_active: true,
    },
    {
      id: 'meal-005',
      name: 'Pasta Marinara',
      canonical_key: 'pasta-marinara',
      instructions_short: 'Cook pasta al dente. Heat marinara sauce with garlic. Toss pasta with sauce, top with parmesan and basil.',
      est_minutes: 20,
      est_cost_band: '$',
      tags_internal: ['italian', 'vegetarian', 'medium', 'pantry_friendly'],
      is_active: true,
    },
    {
      id: 'meal-006',
      name: 'Cheese Quesadilla',
      canonical_key: 'quesadilla-cheese',
      instructions_short: 'Fill tortilla with shredded cheese, fold in half, cook in dry pan until cheese melts and tortilla is crispy.',
      est_minutes: 8,
      est_cost_band: '$',
      tags_internal: ['mexican', 'vegetarian', 'easy', 'pantry_friendly'],
      is_active: true,
    },
    {
      id: 'meal-007',
      name: 'Bean & Cheese Burrito',
      canonical_key: 'bean-and-cheese-burrito',
      instructions_short: 'Warm refried beans, spoon onto tortilla with cheese and salsa. Roll up and serve.',
      est_minutes: 10,
      est_cost_band: '$',
      tags_internal: ['mexican', 'vegetarian', 'easy', 'pantry_friendly'],
      is_active: true,
    },
    {
      id: 'meal-008',
      name: 'Upgraded Instant Ramen',
      canonical_key: 'instant-ramen-upgrade',
      instructions_short: 'Cook ramen, add soft-boiled egg, green onions, and a drizzle of sesame oil.',
      est_minutes: 10,
      est_cost_band: '$',
      tags_internal: ['asian', 'easy', 'pantry_friendly', 'comfort'],
      is_active: true,
    },
    {
      id: 'meal-009',
      name: 'Tuna Salad with Crackers',
      canonical_key: 'tuna-salad-crackers',
      instructions_short: 'Mix canned tuna with mayo, celery, and lemon juice. Serve with crackers or on bread.',
      est_minutes: 10,
      est_cost_band: '$',
      tags_internal: ['american', 'easy', 'pantry_friendly', 'protein'],
      is_active: true,
    },
    {
      id: 'meal-010',
      name: 'Peanut Butter Banana Sandwich',
      canonical_key: 'pb-banana-sandwich',
      instructions_short: 'Spread peanut butter on bread, add sliced banana and drizzle of honey. Close and slice.',
      est_minutes: 5,
      est_cost_band: '$',
      tags_internal: ['american', 'vegetarian', 'easy', 'pantry_friendly'],
      is_active: true,
    },
    {
      id: 'meal-011',
      name: 'Quick Chicken Tacos',
      canonical_key: 'quick-chicken-tacos',
      instructions_short: 'Season chicken with taco spices, cook 6-8 minutes. Warm tortillas, assemble with lettuce, tomato, cheese.',
      est_minutes: 15,
      est_cost_band: '$',
      tags_internal: ['mexican', 'easy', 'protein'],
      is_active: true,
    },
    {
      id: 'meal-012',
      name: 'Chicken Stir-Fry',
      canonical_key: 'chicken-stir-fry',
      instructions_short: 'Slice chicken thin, stir-fry with vegetables in hot wok. Add soy sauce and garlic. Serve over rice.',
      est_minutes: 20,
      est_cost_band: '$$',
      tags_internal: ['asian', 'medium', 'protein', 'healthy'],
      is_active: true,
    },
  ];
}

function getDefaultIngredients(): MealIngredientRow[] {
  return [
    // Spaghetti Aglio e Olio
    { meal_id: 'meal-001', ingredient_name: 'spaghetti', is_pantry_staple: true },
    { meal_id: 'meal-001', ingredient_name: 'garlic', is_pantry_staple: false },
    { meal_id: 'meal-001', ingredient_name: 'olive oil', is_pantry_staple: true },
    { meal_id: 'meal-001', ingredient_name: 'red pepper flakes', is_pantry_staple: true },
    
    // Egg Fried Rice
    { meal_id: 'meal-002', ingredient_name: 'rice', is_pantry_staple: true },
    { meal_id: 'meal-002', ingredient_name: 'eggs', is_pantry_staple: false },
    { meal_id: 'meal-002', ingredient_name: 'soy sauce', is_pantry_staple: true },
    { meal_id: 'meal-002', ingredient_name: 'peas', is_pantry_staple: true },
    
    // Quick Grilled Cheese
    { meal_id: 'meal-003', ingredient_name: 'bread', is_pantry_staple: false },
    { meal_id: 'meal-003', ingredient_name: 'cheese', is_pantry_staple: false },
    { meal_id: 'meal-003', ingredient_name: 'butter', is_pantry_staple: true },
    
    // Scrambled Eggs on Toast
    { meal_id: 'meal-004', ingredient_name: 'eggs', is_pantry_staple: false },
    { meal_id: 'meal-004', ingredient_name: 'bread', is_pantry_staple: false },
    { meal_id: 'meal-004', ingredient_name: 'butter', is_pantry_staple: true },
    
    // Pasta Marinara
    { meal_id: 'meal-005', ingredient_name: 'pasta', is_pantry_staple: true },
    { meal_id: 'meal-005', ingredient_name: 'marinara sauce', is_pantry_staple: true },
    { meal_id: 'meal-005', ingredient_name: 'garlic', is_pantry_staple: false },
    { meal_id: 'meal-005', ingredient_name: 'parmesan', is_pantry_staple: false },
    
    // Cheese Quesadilla
    { meal_id: 'meal-006', ingredient_name: 'tortilla', is_pantry_staple: false },
    { meal_id: 'meal-006', ingredient_name: 'cheese', is_pantry_staple: false },
    
    // Bean & Cheese Burrito
    { meal_id: 'meal-007', ingredient_name: 'tortilla', is_pantry_staple: false },
    { meal_id: 'meal-007', ingredient_name: 'refried beans', is_pantry_staple: true },
    { meal_id: 'meal-007', ingredient_name: 'cheese', is_pantry_staple: false },
    { meal_id: 'meal-007', ingredient_name: 'salsa', is_pantry_staple: true },
    
    // Upgraded Instant Ramen
    { meal_id: 'meal-008', ingredient_name: 'instant ramen', is_pantry_staple: true },
    { meal_id: 'meal-008', ingredient_name: 'eggs', is_pantry_staple: false },
    { meal_id: 'meal-008', ingredient_name: 'green onions', is_pantry_staple: false },
    
    // Tuna Salad with Crackers
    { meal_id: 'meal-009', ingredient_name: 'canned tuna', is_pantry_staple: true },
    { meal_id: 'meal-009', ingredient_name: 'mayonnaise', is_pantry_staple: true },
    { meal_id: 'meal-009', ingredient_name: 'crackers', is_pantry_staple: true },
    
    // PB Banana Sandwich
    { meal_id: 'meal-010', ingredient_name: 'bread', is_pantry_staple: false },
    { meal_id: 'meal-010', ingredient_name: 'peanut butter', is_pantry_staple: true },
    { meal_id: 'meal-010', ingredient_name: 'banana', is_pantry_staple: false },
    
    // Quick Chicken Tacos
    { meal_id: 'meal-011', ingredient_name: 'chicken breast', is_pantry_staple: false },
    { meal_id: 'meal-011', ingredient_name: 'taco shells', is_pantry_staple: false },
    { meal_id: 'meal-011', ingredient_name: 'lettuce', is_pantry_staple: false },
    { meal_id: 'meal-011', ingredient_name: 'tomato', is_pantry_staple: false },
    { meal_id: 'meal-011', ingredient_name: 'cheese', is_pantry_staple: false },
    
    // Chicken Stir-Fry
    { meal_id: 'meal-012', ingredient_name: 'chicken breast', is_pantry_staple: false },
    { meal_id: 'meal-012', ingredient_name: 'mixed vegetables', is_pantry_staple: false },
    { meal_id: 'meal-012', ingredient_name: 'soy sauce', is_pantry_staple: true },
    { meal_id: 'meal-012', ingredient_name: 'garlic', is_pantry_staple: false },
    { meal_id: 'meal-012', ingredient_name: 'rice', is_pantry_staple: true },
  ];
}

// =============================================================================
// SINGLETON CLIENT
// =============================================================================

let dbClient: DatabaseClient | null = null;

/**
 * Get database client (singleton)
 * Uses PostgreSQL if available, falls back to in-memory
 */
export async function getClient(): Promise<DatabaseClient> {
  if (dbClient) return dbClient;
  
  const config = getDatabaseConfig();
  
  // Try PostgreSQL first
  if (config.connectionString || config.host) {
    try {
      const client = new PostgresClient(config);
      // Test connection
      await client.query('SELECT 1');
      dbClient = client;
      console.log('Connected to PostgreSQL');
      return dbClient;
    } catch (error) {
      console.warn('PostgreSQL connection failed, using in-memory fallback');
    }
  }
  
  // Fall back to in-memory
  dbClient = new InMemoryClient();
  console.log('Using in-memory database (development mode)');
  return dbClient;
}

/**
 * Get client for testing (always returns new InMemoryClient)
 */
export function getTestClient(): InMemoryClient {
  return new InMemoryClient();
}

// =============================================================================
// QUERY FUNCTIONS
// =============================================================================

/**
 * Get all active meals
 * SQL: SELECT * FROM decision_os.meals WHERE is_active = true
 */
export async function getActiveMeals(client?: DatabaseClient): Promise<MealRow[]> {
  const db = client ?? await getClient();
  const result = await db.query<MealRow>(
    'SELECT * FROM decision_os.meals WHERE is_active = true'
  );
  return result.rows;
}

/**
 * Get all meal ingredients
 * SQL: SELECT * FROM decision_os.meal_ingredients
 */
export async function getMealIngredients(client?: DatabaseClient): Promise<MealIngredientRow[]> {
  const db = client ?? await getClient();
  const result = await db.query<MealIngredientRow>(
    'SELECT * FROM decision_os.meal_ingredients'
  );
  return result.rows;
}

/**
 * Get inventory items for a household
 * SQL: SELECT * FROM decision_os.inventory_items WHERE household_key = $1
 */
export async function getInventoryItems(
  householdKey: string,
  client?: DatabaseClient
): Promise<InventoryItemRow[]> {
  const db = client ?? await getClient();
  const result = await db.query<InventoryItemRow>(
    'SELECT * FROM decision_os.inventory_items WHERE household_key = $1',
    [householdKey]
  );
  return result.rows;
}

/**
 * Default limit for inventory candidate queries
 */
export const INVENTORY_CANDIDATES_LIMIT = 50;

/**
 * Maximum tokens to use for ILIKE pattern matching
 */
export const MAX_CANDIDATE_TOKENS = 3;

/**
 * Get inventory candidates matching token patterns.
 * 
 * Used for pre-filtering before running the full token matcher.
 * Builds %token% patterns for up to 3 tokens and queries with ILIKE ANY.
 * 
 * SQL: SELECT * FROM decision_os.inventory_items 
 *      WHERE household_key = $1 AND item_name ILIKE ANY($2)
 *      ORDER BY confidence DESC, last_seen_at DESC
 *      LIMIT $3
 * 
 * @param householdKey - Household identifier
 * @param tokens - Tokens to build patterns from (will use longest 3)
 * @param limit - Maximum candidates to return (default 50)
 * @param client - Database client
 * @returns Matching inventory items, ordered by confidence and recency
 */
export async function getInventoryCandidates(
  householdKey: string,
  tokens: string[],
  limit: number = INVENTORY_CANDIDATES_LIMIT,
  client?: DatabaseClient
): Promise<InventoryItemRow[]> {
  if (tokens.length === 0) {
    return [];
  }
  
  // Sort by length descending and take up to MAX_CANDIDATE_TOKENS
  const sortedTokens = [...tokens].sort((a, b) => b.length - a.length);
  const selectedTokens = sortedTokens.slice(0, MAX_CANDIDATE_TOKENS);
  
  // Build ILIKE patterns: %token%
  const patterns = selectedTokens.map(t => `%${t}%`);
  
  const db = client ?? await getClient();
  const result = await db.query<InventoryItemRow>(
    `SELECT * FROM decision_os.inventory_items 
     WHERE household_key = $1 AND item_name ILIKE ANY($2)
     ORDER BY confidence DESC, last_seen_at DESC
     LIMIT $3`,
    [householdKey, patterns, limit]
  );
  return result.rows;
}

/**
 * Get recent decision events for rotation
 * SQL: SELECT * FROM decision_os.decision_events 
 *      WHERE household_key = $1 
 *      ORDER BY decided_at DESC LIMIT $2
 */
export async function getRecentDecisionEvents(
  householdKey: string,
  limit: number = 7,
  client?: DatabaseClient
): Promise<DecisionEventRow[]> {
  const db = client ?? await getClient();
  const result = await db.query<DecisionEventRow>(
    `SELECT * FROM decision_os.decision_events 
     WHERE household_key = $1 
     ORDER BY decided_at DESC 
     LIMIT $2`,
    [householdKey, limit]
  );
  return result.rows;
}

/**
 * Insert a decision event
 * SQL: INSERT INTO decision_os.decision_events (...)
 * 
 * Note: Append-only - no updates or deletes allowed
 */
export async function insertDecisionEvent(
  event: DecisionEventRow,
  client?: DatabaseClient
): Promise<void> {
  const db = client ?? await getClient();
  
  await db.query(
    `INSERT INTO decision_os.decision_events 
     (id, household_key, decided_at, decision_type, meal_id, external_vendor_key, 
      context_hash, decision_payload, user_action)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      event.id,
      event.household_key,
      event.decided_at,
      event.decision_type,
      event.meal_id,
      event.external_vendor_key,
      event.context_hash,
      JSON.stringify(event.decision_payload),
      event.user_action ?? 'pending',
    ]
  );
}

/**
 * Get decision event by ID
 * SQL: SELECT * FROM decision_os.decision_events WHERE id = $1
 */
export async function getDecisionEventById(
  id: string,
  client?: DatabaseClient
): Promise<DecisionEventRow | null> {
  const db = client ?? await getClient();
  const result = await db.query<DecisionEventRow>(
    'SELECT * FROM decision_os.decision_events WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}

// =============================================================================
// DRM EVENT QUERIES
// =============================================================================

/**
 * Insert a DRM event
 * SQL: INSERT INTO decision_os.drm_events (...)
 * 
 * Note: Append-only - no updates or deletes allowed
 */
export async function insertDrmEvent(
  event: DrmEventRow,
  client?: DatabaseClient
): Promise<void> {
  const db = client ?? await getClient();
  
  await db.query(
    `INSERT INTO decision_os.drm_events 
     (id, household_key, triggered_at, trigger_type, trigger_reason,
      rescue_type, rescue_payload, exhausted)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      event.id,
      event.household_key,
      event.triggered_at,
      event.trigger_type,
      event.trigger_reason,
      event.rescue_type,
      event.rescue_payload ? JSON.stringify(event.rescue_payload) : null,
      event.exhausted,
    ]
  );
}

/**
 * Get DRM event by ID
 * SQL: SELECT * FROM decision_os.drm_events WHERE id = $1
 */
export async function getDrmEventById(
  id: string,
  client?: DatabaseClient
): Promise<DrmEventRow | null> {
  const db = client ?? await getClient();
  const result = await db.query<DrmEventRow>(
    'SELECT * FROM decision_os.drm_events WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Get DRM events for a household
 * SQL: SELECT * FROM decision_os.drm_events WHERE household_key = $1
 */
export async function getDrmEventsForHousehold(
  householdKey: string,
  client?: DatabaseClient
): Promise<DrmEventRow[]> {
  const db = client ?? await getClient();
  const result = await db.query<DrmEventRow>(
    'SELECT * FROM decision_os.drm_events WHERE household_key = $1 ORDER BY triggered_at DESC',
    [householdKey]
  );
  return result.rows;
}

// =============================================================================
// FEEDBACK EVENT QUERIES (APPEND-ONLY)
// =============================================================================

/**
 * Get decision event by ID and household key for feedback
 * Validates that event belongs to the specified household
 * 
 * SQL: SELECT * FROM decision_os.decision_events WHERE id = $1 AND household_key = $2
 */
export async function getDecisionEventByIdAndHousehold(
  eventId: string,
  householdKey: string,
  client?: DatabaseClient
): Promise<DecisionEventRow | null> {
  const db = client ?? await getClient();
  const result = await db.query<DecisionEventRow>(
    'SELECT * FROM decision_os.decision_events WHERE id = $1 AND household_key = $2',
    [eventId, householdKey]
  );
  return result.rows[0] ?? null;
}

/**
 * Insert a feedback copy of a decision event (APPEND-ONLY)
 * 
 * Copies the original event data and adds user_action + actioned_at.
 * NEVER updates the original row - always creates a new one.
 * 
 * SQL: INSERT INTO decision_os.decision_events (...)
 */
export async function insertDecisionEventFeedbackCopy(
  originalEvent: DecisionEventRow,
  newEventId: string,
  userAction: 'approved' | 'rejected' | 'drm_triggered',
  actionedAt: string,
  client?: DatabaseClient
): Promise<DecisionEventRow> {
  const db = client ?? await getClient();
  
  // Create feedback copy event - copies original data with user_action set
  const feedbackEvent: DecisionEventRow = {
    id: newEventId,
    household_key: originalEvent.household_key,
    decided_at: actionedAt,
    decision_type: originalEvent.decision_type,
    meal_id: originalEvent.meal_id,
    external_vendor_key: originalEvent.external_vendor_key,
    context_hash: originalEvent.context_hash,
    decision_payload: originalEvent.decision_payload,
    user_action: userAction,
    actioned_at: actionedAt,
  };
  
  await db.query(
    `INSERT INTO decision_os.decision_events 
     (id, household_key, decided_at, decision_type, meal_id, external_vendor_key, 
      context_hash, decision_payload, user_action, actioned_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      feedbackEvent.id,
      feedbackEvent.household_key,
      feedbackEvent.decided_at,
      feedbackEvent.decision_type,
      feedbackEvent.meal_id,
      feedbackEvent.external_vendor_key,
      feedbackEvent.context_hash,
      JSON.stringify(feedbackEvent.decision_payload),
      feedbackEvent.user_action,
      feedbackEvent.actioned_at,
    ]
  );
  
  return feedbackEvent;
}

/**
 * Get count of decision events for a household (for testing)
 */
export async function getDecisionEventCount(
  householdKey: string,
  client?: DatabaseClient
): Promise<number> {
  const db = client ?? await getClient();
  const result = await db.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM decision_os.decision_events WHERE household_key = $1',
    [householdKey]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

/**
 * Get all decision events for a household (for testing)
 */
export async function getAllDecisionEvents(
  householdKey: string,
  client?: DatabaseClient
): Promise<DecisionEventRow[]> {
  const db = client ?? await getClient();
  const result = await db.query<DecisionEventRow>(
    'SELECT * FROM decision_os.decision_events WHERE household_key = $1 ORDER BY decided_at ASC',
    [householdKey]
  );
  return result.rows;
}

// =============================================================================
// RECEIPT INGESTION QUERIES (Phase 2)
// =============================================================================

/**
 * Receipt import row type
 */
export interface ReceiptImportRow {
  id: string;
  household_key: string;
  source: 'image_upload' | 'email_forward' | 'manual_text';
  vendor_name: string | null;
  purchased_at: string | null;
  ocr_provider: string | null;
  ocr_raw_text: string | null;
  status: 'received' | 'parsed' | 'failed';
  error_message: string | null;
  created_at: string;
  // Dedupe fields (Phase 3)
  content_hash: string;
  is_duplicate: boolean;
  duplicate_of_receipt_import_id: string | null;
}

/**
 * Receipt line item row type
 */
export interface ReceiptLineItemRow {
  id: string;
  receipt_import_id: string;
  raw_line: string;
  raw_item_name: string | null;
  raw_qty_text: string | null;
  raw_price: number | null;
  normalized_item_name: string | null;
  normalized_unit: string | null;
  normalized_qty_estimated: number | null;
  confidence: number;
  created_at: string;
}

/**
 * Taste signal row type (APPEND-ONLY)
 * Phase 4 - Behavioral learning
 */
export interface TasteSignalRow {
  id: string;
  household_key: string;
  decided_at: string;
  actioned_at: string | null;
  decision_event_id: string;
  meal_id: string | null;
  decision_type: 'cook' | 'order' | 'zero_cook';
  user_action: 'approved' | 'rejected' | 'drm_triggered' | 'expired';
  context_hash: string;
  features: Record<string, unknown>; // INTERNAL ONLY - never sent to client
  weight: number;
  created_at: string;
}

/**
 * Taste meal score row type (MUTABLE CACHE)
 * Phase 4 - Aggregated scores per meal
 */
export interface TasteMealScoreRow {
  household_key: string;
  meal_id: string;
  score: number;
  approvals: number;
  rejections: number;
  last_seen_at: string | null;
  updated_at: string;
}

/**
 * Insert a receipt import record
 * 
 * SQL: INSERT INTO decision_os.receipt_imports (...)
 */
export async function insertReceiptImport(
  receipt: Omit<ReceiptImportRow, 'created_at'>,
  client?: DatabaseClient
): Promise<ReceiptImportRow> {
  const db = client ?? await getClient();
  
  await db.query(
    `INSERT INTO decision_os.receipt_imports 
     (id, household_key, source, vendor_name, purchased_at, ocr_provider, ocr_raw_text, status, error_message,
      content_hash, is_duplicate, duplicate_of_receipt_import_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      receipt.id,
      receipt.household_key,
      receipt.source,
      receipt.vendor_name,
      receipt.purchased_at,
      receipt.ocr_provider,
      receipt.ocr_raw_text,
      receipt.status,
      receipt.error_message,
      receipt.content_hash,
      receipt.is_duplicate,
      receipt.duplicate_of_receipt_import_id,
    ]
  );
  
  return {
    ...receipt,
    created_at: new Date().toISOString(),
  };
}

/**
 * Update receipt import status and OCR data
 * 
 * SQL: UPDATE decision_os.receipt_imports SET ... WHERE id = $1
 */
export async function updateReceiptImportStatus(
  id: string,
  updates: {
    status: 'received' | 'parsed' | 'failed';
    ocr_provider?: string | null;
    ocr_raw_text?: string | null;
    vendor_name?: string | null;
    purchased_at?: string | null;
    error_message?: string | null;
    // Dedupe fields
    content_hash?: string;
    is_duplicate?: boolean;
    duplicate_of_receipt_import_id?: string | null;
  },
  client?: DatabaseClient
): Promise<void> {
  const db = client ?? await getClient();
  
  const setClauses: string[] = ['status = $2'];
  const params: unknown[] = [id, updates.status];
  let paramIndex = 3;
  
  if (updates.ocr_provider !== undefined) {
    setClauses.push(`ocr_provider = $${paramIndex}`);
    params.push(updates.ocr_provider);
    paramIndex++;
  }
  
  if (updates.ocr_raw_text !== undefined) {
    setClauses.push(`ocr_raw_text = $${paramIndex}`);
    params.push(updates.ocr_raw_text);
    paramIndex++;
  }
  
  if (updates.vendor_name !== undefined) {
    setClauses.push(`vendor_name = $${paramIndex}`);
    params.push(updates.vendor_name);
    paramIndex++;
  }
  
  if (updates.purchased_at !== undefined) {
    setClauses.push(`purchased_at = $${paramIndex}`);
    params.push(updates.purchased_at);
    paramIndex++;
  }
  
  if (updates.error_message !== undefined) {
    setClauses.push(`error_message = $${paramIndex}`);
    params.push(updates.error_message);
    paramIndex++;
  }
  
  // Dedupe fields
  if (updates.content_hash !== undefined) {
    setClauses.push(`content_hash = $${paramIndex}`);
    params.push(updates.content_hash);
    paramIndex++;
  }
  
  if (updates.is_duplicate !== undefined) {
    setClauses.push(`is_duplicate = $${paramIndex}`);
    params.push(updates.is_duplicate);
    paramIndex++;
  }
  
  if (updates.duplicate_of_receipt_import_id !== undefined) {
    setClauses.push(`duplicate_of_receipt_import_id = $${paramIndex}`);
    params.push(updates.duplicate_of_receipt_import_id);
    paramIndex++;
  }
  
  await db.query(
    `UPDATE decision_os.receipt_imports SET ${setClauses.join(', ')} WHERE id = $1`,
    params
  );
}

/**
 * Find canonical (non-duplicate) receipt import by household and content hash.
 * Returns null if no canonical import exists with this hash.
 * 
 * SQL: SELECT * FROM decision_os.receipt_imports 
 *      WHERE household_key = $1 AND content_hash = $2 AND is_duplicate = false
 */
export async function findCanonicalReceiptByHash(
  householdKey: string,
  contentHash: string,
  client?: DatabaseClient
): Promise<ReceiptImportRow | null> {
  const db = client ?? await getClient();
  const result = await db.query<ReceiptImportRow>(
    `SELECT * FROM decision_os.receipt_imports 
     WHERE household_key = $1 AND content_hash = $2 AND is_duplicate = false
     LIMIT 1`,
    [householdKey, contentHash]
  );
  return result.rows[0] ?? null;
}

/**
 * Insert receipt line item
 * 
 * SQL: INSERT INTO decision_os.receipt_line_items (...)
 */
export async function insertReceiptLineItem(
  lineItem: Omit<ReceiptLineItemRow, 'created_at'>,
  client?: DatabaseClient
): Promise<ReceiptLineItemRow> {
  const db = client ?? await getClient();
  
  await db.query(
    `INSERT INTO decision_os.receipt_line_items 
     (id, receipt_import_id, raw_line, raw_item_name, raw_qty_text, raw_price,
      normalized_item_name, normalized_unit, normalized_qty_estimated, confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      lineItem.id,
      lineItem.receipt_import_id,
      lineItem.raw_line,
      lineItem.raw_item_name,
      lineItem.raw_qty_text,
      lineItem.raw_price,
      lineItem.normalized_item_name,
      lineItem.normalized_unit,
      lineItem.normalized_qty_estimated,
      lineItem.confidence,
    ]
  );
  
  return {
    ...lineItem,
    created_at: new Date().toISOString(),
  };
}

/**
 * Get receipt import by ID
 * 
 * SQL: SELECT * FROM decision_os.receipt_imports WHERE id = $1
 */
export async function getReceiptImportById(
  id: string,
  client?: DatabaseClient
): Promise<ReceiptImportRow | null> {
  const db = client ?? await getClient();
  const result = await db.query<ReceiptImportRow>(
    'SELECT * FROM decision_os.receipt_imports WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Get receipt line items by receipt import ID
 * 
 * SQL: SELECT * FROM decision_os.receipt_line_items WHERE receipt_import_id = $1
 */
export async function getReceiptLineItemsByImportId(
  receiptImportId: string,
  client?: DatabaseClient
): Promise<ReceiptLineItemRow[]> {
  const db = client ?? await getClient();
  const result = await db.query<ReceiptLineItemRow>(
    'SELECT * FROM decision_os.receipt_line_items WHERE receipt_import_id = $1 ORDER BY created_at ASC',
    [receiptImportId]
  );
  return result.rows;
}

/**
 * Count receipt line items by import ID (for testing)
 */
export async function getReceiptLineItemCount(
  receiptImportId: string,
  client?: DatabaseClient
): Promise<number> {
  const db = client ?? await getClient();
  const result = await db.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM decision_os.receipt_line_items WHERE receipt_import_id = $1',
    [receiptImportId]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

// =============================================================================
// INVENTORY UPSERT FOR RECEIPT INGESTION
// =============================================================================

/**
 * Upsert inventory item from receipt (advisory)
 * 
 * Rules:
 * - UPSERT by (household_key, item_name)
 * - confidence = GREATEST(existing.confidence, new.confidence)
 * - qty_estimated: add if both present, else keep existing or set new
 * - unit: keep existing if present, else set new
 * - source = 'receipt'
 * - last_seen_at = provided timestamp or NOW()
 * 
 * SQL: INSERT ... ON CONFLICT (household_key, item_name) DO UPDATE ...
 */
export async function upsertInventoryItemFromReceipt(
  item: {
    id: string;
    householdKey: string;
    itemName: string;
    qtyEstimated: number | null;
    unit: string | null;
    confidence: number;
    lastSeenAt: string;
  },
  client?: DatabaseClient
): Promise<void> {
  const db = client ?? await getClient();
  
  await db.query(
    `INSERT INTO decision_os.inventory_items 
     (id, household_key, item_name, qty_estimated, unit, confidence, source, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'receipt', $7)
     ON CONFLICT (household_key, item_name) DO UPDATE SET
       confidence = GREATEST(decision_os.inventory_items.confidence, EXCLUDED.confidence),
       qty_estimated = CASE 
         WHEN decision_os.inventory_items.qty_estimated IS NOT NULL AND EXCLUDED.qty_estimated IS NOT NULL 
         THEN decision_os.inventory_items.qty_estimated + EXCLUDED.qty_estimated
         WHEN EXCLUDED.qty_estimated IS NOT NULL 
         THEN EXCLUDED.qty_estimated
         ELSE decision_os.inventory_items.qty_estimated
       END,
       unit = COALESCE(decision_os.inventory_items.unit, EXCLUDED.unit),
       source = 'receipt',
       last_seen_at = EXCLUDED.last_seen_at`,
    [
      item.id,
      item.householdKey,
      item.itemName,
      item.qtyEstimated,
      item.unit,
      item.confidence,
      item.lastSeenAt,
    ]
  );
}

/**
 * Get inventory item by household and name
 */
export async function getInventoryItemByName(
  householdKey: string,
  itemName: string,
  client?: DatabaseClient
): Promise<InventoryItemRow | null> {
  const db = client ?? await getClient();
  const result = await db.query<InventoryItemRow>(
    'SELECT * FROM decision_os.inventory_items WHERE household_key = $1 AND item_name = $2',
    [householdKey, itemName]
  );
  return result.rows[0] ?? null;
}

/**
 * Get all inventory items for testing
 */
export async function getAllInventoryItems(
  householdKey: string,
  client?: DatabaseClient
): Promise<InventoryItemRow[]> {
  const db = client ?? await getClient();
  const result = await db.query<InventoryItemRow>(
    'SELECT * FROM decision_os.inventory_items WHERE household_key = $1 ORDER BY item_name ASC',
    [householdKey]
  );
  return result.rows;
}

/**
 * Count inventory items for testing
 */
export async function getInventoryItemCount(
  householdKey: string,
  client?: DatabaseClient
): Promise<number> {
  const db = client ?? await getClient();
  const result = await db.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM decision_os.inventory_items WHERE household_key = $1',
    [householdKey]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

// =============================================================================
// TASTE GRAPH QUERIES (Phase 4)
// =============================================================================

/**
 * Get taste meal scores for a list of meal IDs.
 * Returns a Map<meal_id, score> for efficient lookup.
 * 
 * @param householdKey - Household key
 * @param mealIds - List of meal IDs to get scores for
 * @param client - Database client
 * @returns Map of meal_id to score (missing meals default to 0)
 */
export async function getTasteScoresForMeals(
  householdKey: string,
  mealIds: string[],
  client?: DatabaseClient
): Promise<Map<string, number>> {
  const db = client ?? await getClient();
  
  if (mealIds.length === 0) {
    return new Map();
  }
  
  const result = await db.query<{ meal_id: string; score: number }>(
    `SELECT meal_id, score 
     FROM decision_os.taste_meal_scores 
     WHERE household_key = $1 AND meal_id = ANY($2)`,
    [householdKey, mealIds]
  );
  
  const scoreMap = new Map<string, number>();
  for (const row of result.rows) {
    scoreMap.set(row.meal_id, row.score);
  }
  
  return scoreMap;
}
