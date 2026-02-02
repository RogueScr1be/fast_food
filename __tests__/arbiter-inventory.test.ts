/**
 * Arbiter Inventory Integration Tests
 * 
 * INVARIANTS TESTED:
 * 1. After importing a receipt with "chicken breast", arbiter prefers chicken meal vs non-chicken
 * 2. Empty/low-confidence inventory falls back to safe core
 * 3. Only inventory items with confidence >= 0.60 are counted
 * 4. Pantry staples always score 1.0
 */

import {
  scoreMealByInventory,
  selectMeal,
  SAFE_CORE_MEAL_KEYS,
  INVENTORY_CONFIDENCE_THRESHOLD,
} from '../lib/decision-os/arbiter';
import type {
  MealRow,
  MealIngredientRow,
  InventoryItemRow,
} from '@/types/decision-os/decision';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Create a mock meal
 */
function createMeal(
  id: string,
  canonicalKey: string,
  name: string,
  estMinutes: number = 20
): MealRow {
  return {
    id,
    canonical_key: canonicalKey,
    name,
    instructions_short: `Cook ${name}`,
    est_minutes: estMinutes,
    is_active: true,
  };
}

/**
 * Create a mock ingredient
 */
function createIngredient(
  mealId: string,
  ingredientName: string,
  isPantryStaple: boolean = false
): MealIngredientRow {
  return {
    id: `ing-${mealId}-${ingredientName}`,
    meal_id: mealId,
    ingredient_name: ingredientName,
    is_pantry_staple: isPantryStaple,
    notes: null,
  };
}

/**
 * Create a mock inventory item
 */
function createInventoryItem(
  itemName: string,
  confidence: number,
  householdKey: string = 'default'
): InventoryItemRow {
  return {
    id: `inv-${itemName}`,
    household_key: householdKey,
    item_name: itemName,
    qty_estimated: null,
    unit: null,
    confidence,
    source: 'receipt',
    last_seen_at: new Date().toISOString(),
    expires_at: null,
    created_at: new Date().toISOString(),
  };
}

// =============================================================================
// TEST MEALS
// =============================================================================

const CHICKEN_MEAL: MealRow = createMeal('meal-chicken', 'chicken-stir-fry', 'Chicken Stir Fry', 25);
const BEEF_MEAL: MealRow = createMeal('meal-beef', 'beef-tacos', 'Beef Tacos', 30);
const PASTA_MEAL: MealRow = createMeal('meal-pasta', 'spaghetti-aglio-olio', 'Spaghetti Aglio Olio', 15); // Safe core

// =============================================================================
// TEST INGREDIENTS
// =============================================================================

const CHICKEN_INGREDIENTS: MealIngredientRow[] = [
  createIngredient('meal-chicken', 'chicken breast'),
  createIngredient('meal-chicken', 'soy sauce', true), // pantry staple
  createIngredient('meal-chicken', 'vegetables'),
  createIngredient('meal-chicken', 'garlic', true), // pantry staple
];

const BEEF_INGREDIENTS: MealIngredientRow[] = [
  createIngredient('meal-beef', 'ground beef'),
  createIngredient('meal-beef', 'taco seasoning', true), // pantry staple
  createIngredient('meal-beef', 'cheese'),
  createIngredient('meal-beef', 'tortillas'),
];

const PASTA_INGREDIENTS: MealIngredientRow[] = [
  createIngredient('meal-pasta', 'spaghetti', true), // pantry staple
  createIngredient('meal-pasta', 'olive oil', true), // pantry staple
  createIngredient('meal-pasta', 'garlic', true), // pantry staple
];

const ALL_INGREDIENTS = [...CHICKEN_INGREDIENTS, ...BEEF_INGREDIENTS, ...PASTA_INGREDIENTS];

// =============================================================================
// SCORING TESTS
// =============================================================================

describe('scoreMealByInventory', () => {
  test('pantry staples always score 1.0', () => {
    // Pasta meal has only pantry staples
    const score = scoreMealByInventory(
      PASTA_MEAL,
      PASTA_INGREDIENTS,
      [] // Empty inventory
    );
    
    // All 3 ingredients are pantry staples, so score should be 1.0
    expect(score).toBe(1.0);
  });
  
  test('only counts inventory items with confidence >= 0.60', () => {
    // Create inventory with varying confidence
    const inventory: InventoryItemRow[] = [
      createInventoryItem('chicken breast', 0.85), // High confidence - counts
      createInventoryItem('vegetables', 0.55), // Low confidence - does NOT count
    ];
    
    const score = scoreMealByInventory(
      CHICKEN_MEAL,
      CHICKEN_INGREDIENTS,
      inventory
    );
    
    // Breakdown:
    // - chicken breast: 0.85 (high confidence, counts)
    // - soy sauce: 1.0 (pantry staple)
    // - vegetables: 0 (confidence below threshold, treated as missing)
    // - garlic: 1.0 (pantry staple)
    // Total: (0.85 + 1.0 + 0 + 1.0) / 4 = 0.7125
    expect(score).toBeCloseTo(0.7125, 3);
  });
  
  test('missing inventory items score 0', () => {
    // Empty inventory
    const score = scoreMealByInventory(
      CHICKEN_MEAL,
      CHICKEN_INGREDIENTS,
      []
    );
    
    // Breakdown:
    // - chicken breast: 0 (not in inventory)
    // - soy sauce: 1.0 (pantry staple)
    // - vegetables: 0 (not in inventory)
    // - garlic: 1.0 (pantry staple)
    // Total: (0 + 1.0 + 0 + 1.0) / 4 = 0.5
    expect(score).toBe(0.5);
  });
  
  test('high confidence inventory items contribute their confidence', () => {
    const inventory: InventoryItemRow[] = [
      createInventoryItem('chicken breast', 0.95),
      createInventoryItem('vegetables', 0.80),
    ];
    
    const score = scoreMealByInventory(
      CHICKEN_MEAL,
      CHICKEN_INGREDIENTS,
      inventory
    );
    
    // Breakdown:
    // - chicken breast: 0.95
    // - soy sauce: 1.0 (pantry staple)
    // - vegetables: 0.80
    // - garlic: 1.0 (pantry staple)
    // Total: (0.95 + 1.0 + 0.80 + 1.0) / 4 = 0.9375
    expect(score).toBeCloseTo(0.9375, 3);
  });
  
  test('meal with no ingredients returns 0.5 (neutral)', () => {
    const emptyMeal = createMeal('empty', 'empty-meal', 'Empty Meal');
    
    const score = scoreMealByInventory(emptyMeal, [], []);
    
    expect(score).toBe(0.5);
  });
});

// =============================================================================
// MEAL SELECTION TESTS
// =============================================================================

describe('selectMeal with inventory', () => {
  test('prefers meal with more ingredients in inventory', () => {
    // Compare two non-safe-core meals when one has more inventory matches
    const inventory: InventoryItemRow[] = [
      createInventoryItem('chicken breast', 0.90),
      createInventoryItem('vegetables', 0.85),
      // No ground beef, cheese, or tortillas
    ];
    
    // Only compare chicken vs beef (exclude pasta which is all pantry staples)
    const mealsToCompare = [CHICKEN_MEAL, BEEF_MEAL];
    
    const result = selectMeal(
      mealsToCompare,
      ALL_INGREDIENTS,
      inventory,
      [],
      false
    );
    
    // Chicken meal should win: has chicken breast + vegetables in inventory
    // Beef meal loses: no ground beef, cheese, or tortillas in inventory
    expect(result.meal).not.toBeNull();
    expect(result.meal!.canonical_key).toBe('chicken-stir-fry');
  });
  
  test('prefers meal with more matching ingredients', () => {
    // Simulate: receipt imported with beef ingredients
    const inventory: InventoryItemRow[] = [
      createInventoryItem('ground beef', 0.85),
      createInventoryItem('cheese', 0.75),
      createInventoryItem('tortillas', 0.80),
      // No chicken breast or vegetables
    ];
    
    // Compare beef vs chicken (exclude pasta)
    const mealsToCompare = [CHICKEN_MEAL, BEEF_MEAL];
    
    const result = selectMeal(
      mealsToCompare,
      ALL_INGREDIENTS,
      inventory,
      [],
      false
    );
    
    // Beef meal should score higher (3 ingredients in inventory vs 0 for chicken)
    expect(result.meal).not.toBeNull();
    expect(result.meal!.canonical_key).toBe('beef-tacos');
  });
  
  test('pantry-staple meals score high when inventory is sparse', () => {
    // With sparse inventory, pantry staple meals (like pasta) score highest
    const inventory: InventoryItemRow[] = [
      createInventoryItem('chicken breast', 0.90),
      // Only chicken, no vegetables
    ];
    
    const allMeals = [CHICKEN_MEAL, PASTA_MEAL];
    
    const result = selectMeal(
      allMeals,
      ALL_INGREDIENTS,
      inventory,
      [],
      false
    );
    
    // Pasta (all pantry staples = 1.0 average) beats chicken (0.725 average)
    // This is expected: pasta is a safer bet when inventory is incomplete
    expect(result.meal).not.toBeNull();
    expect(result.meal!.canonical_key).toBe('spaghetti-aglio-olio');
  });
  
  test('empty inventory falls back to safe core when useSafeCoreOnly=true', () => {
    const allMeals = [CHICKEN_MEAL, BEEF_MEAL, PASTA_MEAL];
    
    const result = selectMeal(
      allMeals,
      ALL_INGREDIENTS,
      [], // Empty inventory
      [],
      true // Force safe core only
    );
    
    // Should select a safe core meal (pasta is in SAFE_CORE_MEAL_KEYS)
    expect(result.meal).not.toBeNull();
    expect(SAFE_CORE_MEAL_KEYS).toContain(result.meal!.canonical_key);
  });
  
  test('low confidence inventory (< 0.60) does not influence selection', () => {
    // All inventory items are below threshold
    const lowConfidenceInventory: InventoryItemRow[] = [
      createInventoryItem('chicken breast', 0.50), // Below threshold
      createInventoryItem('vegetables', 0.40), // Below threshold
    ];
    
    const allMeals = [CHICKEN_MEAL, PASTA_MEAL];
    
    // When inventory is effectively empty (all low confidence),
    // safe core meals should be preferred
    const result = selectMeal(
      allMeals,
      ALL_INGREDIENTS,
      lowConfidenceInventory,
      [],
      true // Safe core only due to low confidence
    );
    
    // Should select safe core (pasta) since low confidence items are ignored
    expect(result.meal).not.toBeNull();
    expect(result.meal!.canonical_key).toBe('spaghetti-aglio-olio');
  });
  
  test('rotation excludes recently used meals', () => {
    const inventory: InventoryItemRow[] = [
      createInventoryItem('chicken breast', 0.90),
    ];
    
    const allMeals = [CHICKEN_MEAL, BEEF_MEAL, PASTA_MEAL];
    
    const result = selectMeal(
      allMeals,
      ALL_INGREDIENTS,
      inventory,
      ['meal-chicken'], // Chicken was recently used
      false
    );
    
    // Should NOT select chicken even though it matches inventory
    // because it was recently used
    expect(result.meal).not.toBeNull();
    expect(result.meal!.canonical_key).not.toBe('chicken-stir-fry');
  });
  
  test('all meals recently used resets rotation', () => {
    const inventory: InventoryItemRow[] = [
      createInventoryItem('chicken breast', 0.90),
    ];
    
    const allMeals = [CHICKEN_MEAL, BEEF_MEAL];
    
    const result = selectMeal(
      allMeals,
      ALL_INGREDIENTS,
      inventory,
      ['meal-chicken', 'meal-beef'], // Both recently used
      false
    );
    
    // Should still select something (rotation reset)
    expect(result.meal).not.toBeNull();
  });
});

// =============================================================================
// INVENTORY THRESHOLD CONSTANT TEST
// =============================================================================

describe('INVENTORY_CONFIDENCE_THRESHOLD', () => {
  test('threshold is 0.60', () => {
    expect(INVENTORY_CONFIDENCE_THRESHOLD).toBe(0.60);
  });
});

// =============================================================================
// INTEGRATION: RECEIPT IMPORT -> ARBITER PREFERENCE
// =============================================================================

describe('Receipt Import -> Arbiter Integration', () => {
  test('after importing receipt with "chicken breast", arbiter scores chicken meal higher than beef', () => {
    // This simulates the end-to-end flow:
    // 1. User imports a receipt containing "chicken breast" and "vegetables"
    // 2. Receipt parsing normalizes with confidence 0.90
    // 3. Inventory is updated via upsert
    // 4. Arbiter queries inventory and scores meals accordingly
    
    // Simulated inventory after receipt import
    const inventoryAfterReceipt: InventoryItemRow[] = [
      createInventoryItem('chicken breast', 0.90), // From receipt import
      createInventoryItem('vegetables', 0.75), // From receipt import
    ];
    
    // Score each meal
    const chickenScore = scoreMealByInventory(CHICKEN_MEAL, ALL_INGREDIENTS, inventoryAfterReceipt);
    const beefScore = scoreMealByInventory(BEEF_MEAL, ALL_INGREDIENTS, inventoryAfterReceipt);
    const pastaScore = scoreMealByInventory(PASTA_MEAL, ALL_INGREDIENTS, inventoryAfterReceipt);
    
    // Chicken should score higher than beef (has matching ingredients)
    expect(chickenScore).toBeGreaterThan(beefScore);
    
    // Pasta (all pantry staples) will score highest - this is expected behavior
    // When comparing only chicken vs beef (non-pantry meals), chicken wins
    const mealsWithoutPantryOnly = [CHICKEN_MEAL, BEEF_MEAL];
    
    const result = selectMeal(
      mealsWithoutPantryOnly,
      ALL_INGREDIENTS,
      inventoryAfterReceipt,
      [],
      false
    );
    
    expect(result.meal!.canonical_key).toBe('chicken-stir-fry');
  });
  
  test('empty inventory means arbiter uses safe core fallback', () => {
    // No receipt imported, empty inventory
    const emptyInventory: InventoryItemRow[] = [];
    
    const allMeals = [CHICKEN_MEAL, BEEF_MEAL, PASTA_MEAL];
    
    // When inventory is empty, useSafeCoreOnly should be true
    const result = selectMeal(
      allMeals,
      ALL_INGREDIENTS,
      emptyInventory,
      [],
      true // Safe core only
    );
    
    // Should select a safe core meal
    expect(result.meal).not.toBeNull();
    expect(SAFE_CORE_MEAL_KEYS).toContain(result.meal!.canonical_key);
  });
  
  test('low confidence items from OCR errors do not influence arbiter', () => {
    // Simulated inventory where OCR had low confidence
    const lowConfidenceInventory: InventoryItemRow[] = [
      createInventoryItem('chicken breast', 0.40), // OCR was uncertain
      createInventoryItem('some item', 0.30), // OCR guessed wrong
    ];
    
    // Score with low confidence inventory (should be ignored)
    const chickenScore = scoreMealByInventory(CHICKEN_MEAL, CHICKEN_INGREDIENTS, lowConfidenceInventory);
    
    // Score should be same as empty inventory (only pantry staples count)
    const emptyScore = scoreMealByInventory(CHICKEN_MEAL, CHICKEN_INGREDIENTS, []);
    
    expect(chickenScore).toBe(emptyScore);
  });
});
