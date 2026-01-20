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
    
    if (sqlLower.includes('from decision_os.meals')) {
      return { rows: this.meals as unknown as T[] };
    }
    
    if (sqlLower.includes('from decision_os.meal_ingredients')) {
      return { rows: this.ingredients as unknown as T[] };
    }
    
    if (sqlLower.includes('from decision_os.inventory_items')) {
      const householdKey = params?.[0] as string ?? 'default';
      const filtered = this.inventory.filter(i => i.household_key === householdKey);
      return { rows: filtered as unknown as T[] };
    }
    
    if (sqlLower.includes('from decision_os.decision_events')) {
      const householdKey = params?.[0] as string ?? 'default';
      const limit = params?.[1] as number ?? 7;
      const filtered = this.decisionEvents
        .filter(d => d.household_key === householdKey)
        .sort((a, b) => new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime())
        .slice(0, limit);
      return { rows: filtered as unknown as T[] };
    }
    
    if (sqlLower.includes('insert into decision_os.decision_events')) {
      // Parse INSERT values from params
      const event: DecisionEventRow = {
        id: params?.[0] as string,
        household_key: params?.[1] as string,
        decided_at: params?.[2] as string,
        decision_type: params?.[3] as 'cook' | 'order' | 'zero_cook',
        meal_id: params?.[4] as string | null,
        external_vendor_key: params?.[5] as string | null,
        context_hash: params?.[6] as string,
        decision_payload: params?.[7] as Record<string, unknown>,
        user_action: (params?.[8] as string ?? 'pending') as DecisionEventRow['user_action'],
      };
      this.decisionEvents.push(event);
      return { rows: [event] as unknown as T[] };
    }
    
    if (sqlLower.includes('select') && sqlLower.includes('decision_events') && sqlLower.includes('where id')) {
      const id = params?.[0] as string;
      const found = this.decisionEvents.find(e => e.id === id);
      return { rows: found ? [found] as unknown as T[] : [] };
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
  
  _clearAll(): void {
    this.meals = [];
    this.ingredients = [];
    this.inventory = [];
    this.decisionEvents = [];
    this.initialized = false;
  }
  
  _reset(): void {
    this.inventory = [];
    this.decisionEvents = [];
    this.initialize();
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
