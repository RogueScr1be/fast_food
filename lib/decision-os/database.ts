/**
 * FAST FOOD: Decision OS Database Layer
 * 
 * Database operations for decision-os.
 * This module abstracts database access for the arbiter.
 * 
 * In production, replace with actual Postgres queries.
 * For Expo API routes, we use a simple in-memory mock or direct SQL.
 */

import type {
  MealRow,
  InventoryItemRow,
  MealIngredientRow,
  DecisionEventRow,
} from '@/types/decision-os/decision';

// =============================================================================
// DATABASE CONNECTION
// =============================================================================

// In production, this would be a real database connection
// For now, we define the interface and provide a mock implementation

export interface DatabaseClient {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// Mock data store for development/testing
let mockMeals: MealRow[] = [];
let mockIngredients: MealIngredientRow[] = [];
let mockInventory: InventoryItemRow[] = [];
let mockDecisionEvents: DecisionEventRow[] = [];

// =============================================================================
// MOCK DATABASE OPERATIONS
// =============================================================================

/**
 * Initialize mock database with seed data
 * In production, this reads from Postgres
 */
export function initializeMockData(data: {
  meals: MealRow[];
  ingredients: MealIngredientRow[];
  inventory?: InventoryItemRow[];
  decisionEvents?: DecisionEventRow[];
}): void {
  mockMeals = data.meals;
  mockIngredients = data.ingredients;
  mockInventory = data.inventory ?? [];
  mockDecisionEvents = data.decisionEvents ?? [];
}

/**
 * Clear mock data (for testing)
 */
export function clearMockData(): void {
  mockMeals = [];
  mockIngredients = [];
  mockInventory = [];
  mockDecisionEvents = [];
}

// =============================================================================
// QUERY FUNCTIONS
// =============================================================================

/**
 * Get all active meals
 * In production: SELECT * FROM decision_os.meals WHERE is_active = true
 */
export async function getActiveMeals(): Promise<MealRow[]> {
  // In production, this would be a database query
  return mockMeals.filter(m => m.is_active);
}

/**
 * Get all meal ingredients
 * In production: SELECT * FROM decision_os.meal_ingredients
 */
export async function getMealIngredients(): Promise<MealIngredientRow[]> {
  return mockIngredients;
}

/**
 * Get inventory items for a household
 * In production: SELECT * FROM decision_os.inventory_items WHERE household_key = $1
 */
export async function getInventoryItems(householdKey: string): Promise<InventoryItemRow[]> {
  return mockInventory.filter(i => i.household_key === householdKey);
}

/**
 * Get recent decision events for rotation
 * In production: SELECT * FROM decision_os.decision_events 
 *                WHERE household_key = $1 
 *                ORDER BY decided_at DESC LIMIT 7
 */
export async function getRecentDecisionEvents(
  householdKey: string,
  limit: number = 7
): Promise<DecisionEventRow[]> {
  return mockDecisionEvents
    .filter(d => d.household_key === householdKey)
    .sort((a, b) => new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime())
    .slice(0, limit);
}

/**
 * Insert a decision event
 * In production: INSERT INTO decision_os.decision_events (...)
 * 
 * Note: Append-only - no updates or deletes allowed
 */
export async function insertDecisionEvent(
  event: DecisionEventRow
): Promise<void> {
  // Validate no duplicate IDs
  if (mockDecisionEvents.some(e => e.id === event.id)) {
    throw new Error(`Decision event ${event.id} already exists`);
  }
  
  // Append-only insert
  mockDecisionEvents.push({
    ...event,
    user_action: event.user_action ?? 'pending',
  });
}

/**
 * Get decision event by ID
 * In production: SELECT * FROM decision_os.decision_events WHERE id = $1
 */
export async function getDecisionEventById(
  id: string
): Promise<DecisionEventRow | null> {
  return mockDecisionEvents.find(e => e.id === id) ?? null;
}

// =============================================================================
// SEED DATA FOR TESTING
// =============================================================================

/**
 * Load minimal seed data for testing
 * This mirrors a subset of the 50 meals from the seed file
 */
export function loadTestSeedData(): void {
  const testMeals: MealRow[] = [
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
      instructions_short: 'Butter bread, add cheese slices, grill in pan until golden on both sides. Serve with tomato soup if desired.',
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
      instructions_short: 'Cook ramen, add soft-boiled egg, green onions, and a drizzle of sesame oil. Optional: add leftover protein.',
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
  
  const testIngredients: MealIngredientRow[] = [
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
  
  initializeMockData({
    meals: testMeals,
    ingredients: testIngredients,
    inventory: [],
    decisionEvents: [],
  });
}

// =============================================================================
// ADD TEST INVENTORY
// =============================================================================

export function addTestInventory(items: InventoryItemRow[]): void {
  mockInventory = [...mockInventory, ...items];
}

export function addTestDecisionEvent(event: DecisionEventRow): void {
  mockDecisionEvents.push(event);
}
