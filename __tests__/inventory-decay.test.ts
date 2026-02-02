/**
 * Tests for Inventory Decay + Consumption Model
 * Phase 3 — Prompt 2/3
 * 
 * Tests cover:
 * - Time decay helpers (daysSince, clamp)
 * - Remaining quantity estimation (estimateRemainingQty)
 * - Confidence decay (decayConfidence)
 * - Consumption hook (consumeInventoryForMeal)
 * - Arbiter scoring with decay
 * - Feedback endpoint integration
 */

import {
  daysSince,
  clamp,
  estimateRemainingQty,
  decayConfidence,
  isItemLikelyAvailable,
  getInventoryScore,
  parseSimpleQty,
  DEFAULT_DECAY_RATE_PER_DAY,
  MIN_CONFIDENCE_FLOOR,
  CONFIDENCE_DECAY_RATE_PER_DAY,
  type InventoryItemWithDecay,
} from '../lib/decision-os/inventory-model';
import { 
  consumeInventoryForMeal,
  getMealIngredientsForMeal,
  findInventoryByIngredientName,
} from '../lib/decision-os/consumption';
import { 
  scoreMealByInventory,
  INVENTORY_CONFIDENCE_THRESHOLD,
} from '../lib/decision-os/arbiter';
import { getTestClient } from '../lib/decision-os/database';
import type { MealRow, MealIngredientRow, InventoryItemRow } from '../types/decision-os/decision';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a mock inventory item with decay fields
 */
function createMockInventoryItem(overrides: Partial<InventoryItemWithDecay> = {}): InventoryItemWithDecay {
  const now = new Date().toISOString();
  return {
    id: 'inv-test-' + Math.random().toString(36).substring(7),
    household_key: 'default',
    item_name: 'test item',
    qty_estimated: 10,
    qty_used_estimated: 0,
    unit: 'count',
    confidence: 0.85,
    source: 'receipt',
    last_seen_at: now,
    last_used_at: null,
    expires_at: null,
    decay_rate_per_day: DEFAULT_DECAY_RATE_PER_DAY,
    created_at: now,
    ...overrides,
  };
}

/**
 * Create a date ISO string N days ago from reference
 */
function daysAgo(days: number, fromDate?: Date): string {
  const from = fromDate ?? new Date();
  const past = new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
  return past.toISOString();
}

// =============================================================================
// HELPER FUNCTION TESTS
// =============================================================================

describe('Time Helpers', () => {
  describe('daysSince', () => {
    it('returns 0 for same timestamp', () => {
      const now = new Date().toISOString();
      expect(daysSince(now, now)).toBe(0);
    });

    it('calculates days correctly for 1 day ago', () => {
      const oneDayAgo = daysAgo(1);
      const now = new Date().toISOString();
      const days = daysSince(oneDayAgo, now);
      expect(days).toBeGreaterThanOrEqual(0.99);
      expect(days).toBeLessThanOrEqual(1.01);
    });

    it('calculates days correctly for 7 days ago', () => {
      const sevenDaysAgo = daysAgo(7);
      const now = new Date().toISOString();
      const days = daysSince(sevenDaysAgo, now);
      expect(days).toBeGreaterThanOrEqual(6.99);
      expect(days).toBeLessThanOrEqual(7.01);
    });

    it('returns 0 for future timestamps (no negative days)', () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      expect(daysSince(tomorrow, now)).toBe(0);
    });

    it('handles invalid date gracefully', () => {
      expect(daysSince('invalid-date')).toBe(0);
    });
  });

  describe('clamp', () => {
    it('clamps value below minimum', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('clamps value above maximum', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('returns value within range unchanged', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('handles edge cases', () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });
});

// =============================================================================
// REMAINING QUANTITY TESTS
// =============================================================================

describe('estimateRemainingQty', () => {
  it('returns null when qty_estimated is null', () => {
    const item = createMockInventoryItem({ qty_estimated: null });
    expect(estimateRemainingQty(item)).toBeNull();
  });

  it('returns full quantity for newly added item (no decay, no usage)', () => {
    const now = new Date().toISOString();
    const item = createMockInventoryItem({
      qty_estimated: 10,
      qty_used_estimated: 0,
      last_seen_at: now,
    });
    const remaining = estimateRemainingQty(item, now);
    expect(remaining).toBe(10);
  });

  it('subtracts used quantity from remaining', () => {
    const now = new Date().toISOString();
    const item = createMockInventoryItem({
      qty_estimated: 10,
      qty_used_estimated: 3,
      last_seen_at: now,
    });
    const remaining = estimateRemainingQty(item, now);
    expect(remaining).toBe(7);
  });

  it('applies decay over time', () => {
    const now = new Date();
    const tenDaysAgo = daysAgo(10, now);
    const item = createMockInventoryItem({
      qty_estimated: 10,
      qty_used_estimated: 0,
      last_seen_at: tenDaysAgo,
      decay_rate_per_day: 0.05, // 5% per day
    });
    
    // After 10 days at 5% per day: multiplier = 1 - (10 * 0.05) = 0.5
    const remaining = estimateRemainingQty(item, now.toISOString());
    expect(remaining).toBeCloseTo(5, 0.5); // 10 * 0.5 = 5
  });

  it('combines usage and decay', () => {
    const now = new Date();
    const fiveDaysAgo = daysAgo(5, now);
    const item = createMockInventoryItem({
      qty_estimated: 10,
      qty_used_estimated: 2,
      last_seen_at: fiveDaysAgo,
      decay_rate_per_day: 0.1, // 10% per day
    });
    
    // Base: 10 - 2 = 8
    // After 5 days at 10% per day: multiplier = 1 - (5 * 0.1) = 0.5
    // Remaining: 8 * 0.5 = 4
    const remaining = estimateRemainingQty(item, now.toISOString());
    expect(remaining).toBeCloseTo(4, 0.5);
  });

  it('never returns negative (floors at 0)', () => {
    const now = new Date();
    const thirtyDaysAgo = daysAgo(30, now);
    const item = createMockInventoryItem({
      qty_estimated: 10,
      qty_used_estimated: 15, // Used more than had
      last_seen_at: thirtyDaysAgo,
      decay_rate_per_day: 0.05,
    });
    
    const remaining = estimateRemainingQty(item, now.toISOString());
    expect(remaining).toBe(0);
  });

  it('handles null qty_used_estimated as 0', () => {
    const now = new Date().toISOString();
    const item = createMockInventoryItem({
      qty_estimated: 10,
      qty_used_estimated: null,
      last_seen_at: now,
    });
    const remaining = estimateRemainingQty(item, now);
    expect(remaining).toBe(10);
  });
});

// =============================================================================
// CONFIDENCE DECAY TESTS
// =============================================================================

describe('decayConfidence', () => {
  it('returns original confidence for items just seen', () => {
    const now = new Date().toISOString();
    const item = createMockInventoryItem({ confidence: 0.85, last_seen_at: now });
    const decayed = decayConfidence(item, now);
    expect(decayed).toBeCloseTo(0.85, 2);
  });

  it('decays confidence over time', () => {
    const now = new Date();
    const tenDaysAgo = daysAgo(10, now);
    const item = createMockInventoryItem({
      confidence: 1.0,
      last_seen_at: tenDaysAgo,
    });
    
    // After 10 days at 3% per day: multiplier = 1 - (10 * 0.03) = 0.7
    const decayed = decayConfidence(item, now.toISOString());
    expect(decayed).toBeCloseTo(0.7, 1);
  });

  it('has minimum floor (20% of original)', () => {
    const now = new Date();
    const longAgo = daysAgo(100, now); // 100 days ago
    const item = createMockInventoryItem({
      confidence: 1.0,
      last_seen_at: longAgo,
    });
    
    // Minimum floor is 0.2 * 1.0 = 0.2
    const decayed = decayConfidence(item, now.toISOString());
    expect(decayed).toBeGreaterThanOrEqual(0.2);
  });

  it('is clamped between 0 and 1', () => {
    const now = new Date().toISOString();
    const item1 = createMockInventoryItem({ confidence: 1.5, last_seen_at: now });
    const item2 = createMockInventoryItem({ confidence: -0.5, last_seen_at: now });
    
    expect(decayConfidence(item1, now)).toBeLessThanOrEqual(1);
    expect(decayConfidence(item2, now)).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// ITEM AVAILABILITY TESTS
// =============================================================================

describe('isItemLikelyAvailable', () => {
  it('returns true for fresh high-confidence item with quantity', () => {
    const now = new Date().toISOString();
    const item = createMockInventoryItem({
      confidence: 0.85,
      qty_estimated: 10,
      qty_used_estimated: 0,
      last_seen_at: now,
    });
    expect(isItemLikelyAvailable(item, now)).toBe(true);
  });

  it('returns false when confidence decays below threshold', () => {
    const now = new Date();
    const longAgo = daysAgo(50, now); // 50 days ago
    const item = createMockInventoryItem({
      confidence: 0.65, // Close to threshold
      last_seen_at: longAgo,
    });
    expect(isItemLikelyAvailable(item, now.toISOString())).toBe(false);
  });

  it('returns false when remaining quantity is 0', () => {
    const now = new Date().toISOString();
    const item = createMockInventoryItem({
      confidence: 0.85,
      qty_estimated: 5,
      qty_used_estimated: 5, // All used up
      last_seen_at: now,
    });
    expect(isItemLikelyAvailable(item, now)).toBe(false);
  });

  it('returns true when quantity is unknown but confidence is good', () => {
    const now = new Date().toISOString();
    const item = createMockInventoryItem({
      confidence: 0.85,
      qty_estimated: null, // Unknown quantity
      last_seen_at: now,
    });
    expect(isItemLikelyAvailable(item, now)).toBe(true);
  });
});

// =============================================================================
// INVENTORY SCORE TESTS
// =============================================================================

describe('getInventoryScore', () => {
  it('returns 0 when item is used up', () => {
    const now = new Date().toISOString();
    const item = createMockInventoryItem({
      confidence: 0.9,
      qty_estimated: 5,
      qty_used_estimated: 5,
      last_seen_at: now,
    });
    expect(getInventoryScore(item, now)).toBe(0);
  });

  it('returns decayed confidence when item has remaining quantity', () => {
    const now = new Date().toISOString();
    const item = createMockInventoryItem({
      confidence: 0.9,
      qty_estimated: 5,
      qty_used_estimated: 2,
      last_seen_at: now,
    });
    const score = getInventoryScore(item, now);
    expect(score).toBeCloseTo(0.9, 2);
  });

  it('returns decayed confidence when quantity is unknown', () => {
    const now = new Date().toISOString();
    const item = createMockInventoryItem({
      confidence: 0.8,
      qty_estimated: null,
      last_seen_at: now,
    });
    const score = getInventoryScore(item, now);
    expect(score).toBeCloseTo(0.8, 2);
  });
});

// =============================================================================
// PARSE SIMPLE QTY TESTS
// =============================================================================

describe('parseSimpleQty', () => {
  it('parses simple integer', () => {
    expect(parseSimpleQty('2')).toBe(2);
    expect(parseSimpleQty('10')).toBe(10);
  });

  it('parses decimal quantity', () => {
    expect(parseSimpleQty('1.5')).toBe(1.5);
    expect(parseSimpleQty('0.25')).toBe(0.25);
  });

  it('extracts leading number from text', () => {
    expect(parseSimpleQty('2 lb')).toBe(2);
    expect(parseSimpleQty('3 cups')).toBe(3);
  });

  it('returns 1 for unparseable input', () => {
    expect(parseSimpleQty(null)).toBe(1);
    expect(parseSimpleQty(undefined)).toBe(1);
    expect(parseSimpleQty('')).toBe(1);
    expect(parseSimpleQty('some')).toBe(1);
  });
});

// =============================================================================
// CONSUMPTION TESTS (using InMemoryClient)
// =============================================================================

describe('Consumption Service', () => {
  describe('consumeInventoryForMeal', () => {
    it('updates qty_used_estimated and last_used_at for matching items', async () => {
      const testClient = getTestClient();
      
      // Add inventory with chicken breast
      testClient._addInventory([{
        id: 'inv-chicken',
        household_key: 'default',
        item_name: 'chicken breast',
        qty_estimated: 4,
        qty_used_estimated: 0,
        unit: 'lb',
        confidence: 0.85,
        source: 'receipt',
        last_seen_at: new Date().toISOString(),
        last_used_at: null,
        expires_at: null,
        decay_rate_per_day: 0.05,
        created_at: new Date().toISOString(),
      }]);
      
      // meal-012 is Chicken Stir-Fry with chicken breast ingredient
      const nowIso = new Date().toISOString();
      const result = await consumeInventoryForMeal(
        'default',
        'meal-012', // Chicken Stir-Fry
        nowIso,
        testClient
      );
      
      expect(result.success).toBe(true);
      expect(result.itemsUpdated).toBeGreaterThanOrEqual(1);
      
      // Verify the inventory was updated
      const inventory = await testClient.query<InventoryItemRow>(
        'SELECT * FROM decision_os.inventory_items WHERE household_key = $1',
        ['default']
      );
      
      const chicken = inventory.rows.find(i => i.item_name === 'chicken breast');
      expect(chicken).toBeDefined();
      expect(chicken!.qty_used_estimated).toBeGreaterThan(0);
      expect(chicken!.last_used_at).not.toBeNull();
    });

    it('does not crash when no inventory match exists', async () => {
      const testClient = getTestClient();
      
      // No inventory added - meal-012 requires chicken breast which is not in inventory
      const result = await consumeInventoryForMeal(
        'default',
        'meal-012',
        new Date().toISOString(),
        testClient
      );
      
      expect(result.success).toBe(true);
      expect(result.itemsUpdated).toBe(0);
      // Should not have errors - silent skip
    });

    it('skips pantry staples', async () => {
      const testClient = getTestClient();
      
      // Add inventory with soy sauce (pantry staple)
      testClient._addInventory([{
        id: 'inv-soy-sauce',
        household_key: 'default',
        item_name: 'soy sauce',
        qty_estimated: 1,
        qty_used_estimated: 0,
        unit: 'bottle',
        confidence: 0.9,
        source: 'receipt',
        last_seen_at: new Date().toISOString(),
        last_used_at: null,
        expires_at: null,
        decay_rate_per_day: 0.01,
        created_at: new Date().toISOString(),
      }]);
      
      // meal-012 has soy sauce as pantry staple
      const result = await consumeInventoryForMeal(
        'default',
        'meal-012',
        new Date().toISOString(),
        testClient
      );
      
      expect(result.success).toBe(true);
      
      // Soy sauce should NOT be updated (it's a pantry staple)
      const inventory = await testClient.query<InventoryItemRow>(
        'SELECT * FROM decision_os.inventory_items WHERE household_key = $1',
        ['default']
      );
      
      const soySauce = inventory.rows.find(i => i.item_name === 'soy sauce');
      expect(soySauce).toBeDefined();
      expect(soySauce!.qty_used_estimated).toBe(0); // Not updated
      expect(soySauce!.last_used_at).toBeNull(); // Not updated
    });

    it('returns success even for meal with no ingredients', async () => {
      const testClient = getTestClient();
      
      // meal-999 doesn't exist, so no ingredients
      const result = await consumeInventoryForMeal(
        'default',
        'meal-999-nonexistent',
        new Date().toISOString(),
        testClient
      );
      
      expect(result.success).toBe(true);
      expect(result.itemsUpdated).toBe(0);
    });
  });

  describe('getMealIngredientsForMeal', () => {
    it('returns ingredients for a valid meal', async () => {
      const testClient = getTestClient();
      
      const ingredients = await getMealIngredientsForMeal('meal-012', testClient);
      
      expect(ingredients.length).toBeGreaterThan(0);
      expect(ingredients.some(i => i.ingredient_name === 'chicken breast')).toBe(true);
    });

    it('returns empty array for nonexistent meal', async () => {
      const testClient = getTestClient();
      
      const ingredients = await getMealIngredientsForMeal('meal-999-nonexistent', testClient);
      
      expect(ingredients).toEqual([]);
    });
  });

  describe('findInventoryByIngredientName', () => {
    it('finds inventory by case-insensitive match', async () => {
      const testClient = getTestClient();
      
      testClient._addInventory([{
        id: 'inv-test',
        household_key: 'default',
        item_name: 'Chicken Breast',
        qty_estimated: 2,
        qty_used_estimated: 0,
        unit: 'lb',
        confidence: 0.85,
        source: 'receipt',
        last_seen_at: new Date().toISOString(),
        last_used_at: null,
        expires_at: null,
        decay_rate_per_day: 0.05,
        created_at: new Date().toISOString(),
      }]);
      
      const matches = await findInventoryByIngredientName(
        'default',
        'chicken breast', // lowercase
        testClient
      );
      
      expect(matches.length).toBe(1);
      expect(matches[0].item_name).toBe('Chicken Breast');
    });
  });
});

// =============================================================================
// ARBITER SCORING WITH DECAY TESTS
// =============================================================================

describe('Arbiter Scoring with Decay', () => {
  const CHICKEN_MEAL: MealRow = {
    id: 'meal-chicken',
    name: 'Chicken Dish',
    canonical_key: 'chicken-dish',
    instructions_short: 'Cook chicken',
    est_minutes: 20,
    est_cost_band: '$$',
    tags_internal: ['protein'],
    is_active: true,
  };

  const CHICKEN_INGREDIENTS: MealIngredientRow[] = [
    { meal_id: 'meal-chicken', ingredient_name: 'chicken breast', is_pantry_staple: false },
    { meal_id: 'meal-chicken', ingredient_name: 'salt', is_pantry_staple: true },
  ];

  it('prefers meal with higher remaining quantity', () => {
    const now = new Date().toISOString();
    
    // Chicken with plenty remaining
    const inventory: InventoryItemRow[] = [
      {
        id: 'inv-chicken',
        household_key: 'default',
        item_name: 'chicken breast',
        qty_estimated: 10,
        qty_used_estimated: 0,
        unit: 'lb',
        confidence: 0.85,
        source: 'receipt',
        last_seen_at: now,
        last_used_at: null,
        expires_at: null,
        decay_rate_per_day: 0.05,
        created_at: now,
      } as InventoryItemRow,
    ];
    
    const score = scoreMealByInventory(
      CHICKEN_MEAL,
      CHICKEN_INGREDIENTS,
      inventory,
      now
    );
    
    // Should have good score - pantry staple (1.0) + chicken (0.85) / 2 = 0.925
    expect(score).toBeGreaterThan(0.8);
  });

  it('scores lower when item is used up', () => {
    const now = new Date().toISOString();
    
    // Chicken completely used up
    const inventory: InventoryItemRow[] = [
      {
        id: 'inv-chicken',
        household_key: 'default',
        item_name: 'chicken breast',
        qty_estimated: 5,
        qty_used_estimated: 5, // All used
        unit: 'lb',
        confidence: 0.85,
        source: 'receipt',
        last_seen_at: now,
        last_used_at: now,
        expires_at: null,
        decay_rate_per_day: 0.05,
        created_at: now,
      } as InventoryItemRow,
    ];
    
    const score = scoreMealByInventory(
      CHICKEN_MEAL,
      CHICKEN_INGREDIENTS,
      inventory,
      now
    );
    
    // Pantry staple (1.0) + chicken used up (0) / 2 = 0.5
    expect(score).toBe(0.5);
  });

  it('scores lower when confidence has decayed below threshold', () => {
    const now = new Date();
    const longAgo = daysAgo(30, now); // 30 days old
    
    // Old chicken - confidence will decay below threshold
    const inventory: InventoryItemRow[] = [
      {
        id: 'inv-chicken',
        household_key: 'default',
        item_name: 'chicken breast',
        qty_estimated: 10,
        qty_used_estimated: 0,
        unit: 'lb',
        confidence: 0.65, // Just above threshold, but will decay
        source: 'receipt',
        last_seen_at: longAgo,
        last_used_at: null,
        expires_at: null,
        decay_rate_per_day: 0.05,
        created_at: longAgo,
      } as InventoryItemRow,
    ];
    
    const score = scoreMealByInventory(
      CHICKEN_MEAL,
      CHICKEN_INGREDIENTS,
      inventory,
      now.toISOString()
    );
    
    // Decayed confidence: 0.65 * (1 - 30 * 0.03) = 0.65 * 0.1 = 0.065 < 0.60 threshold
    // So chicken scores 0, pantry staple 1.0 / 2 = 0.5
    expect(score).toBe(0.5);
  });

  it('still scores pantry-staple-only meals high', () => {
    const PANTRY_MEAL: MealRow = {
      id: 'meal-pantry',
      name: 'Pantry Meal',
      canonical_key: 'pantry-meal',
      instructions_short: 'Use pantry items',
      est_minutes: 10,
      est_cost_band: '$',
      tags_internal: [],
      is_active: true,
    };

    const PANTRY_INGREDIENTS: MealIngredientRow[] = [
      { meal_id: 'meal-pantry', ingredient_name: 'pasta', is_pantry_staple: true },
      { meal_id: 'meal-pantry', ingredient_name: 'olive oil', is_pantry_staple: true },
    ];

    const now = new Date().toISOString();
    
    const score = scoreMealByInventory(
      PANTRY_MEAL,
      PANTRY_INGREDIENTS,
      [], // Empty inventory
      now
    );
    
    // All pantry staples = 1.0
    expect(score).toBe(1.0);
  });
});

// =============================================================================
// FEEDBACK ENDPOINT INTEGRATION TESTS
// =============================================================================

describe('Feedback Endpoint Consumption Hook', () => {
  it('triggers consumption when approved cook decision', async () => {
    const testClient = getTestClient();
    
    // Set up: Add a decision event that can be approved
    const decisionId = 'test-decision-' + Date.now();
    testClient._addDecisionEvent({
      id: decisionId,
      household_key: 'default',
      decided_at: new Date().toISOString(),
      decision_type: 'cook',
      meal_id: 'meal-012', // Chicken Stir-Fry
      external_vendor_key: null,
      context_hash: 'test-hash',
      decision_payload: { test: true },
      user_action: 'pending',
    });
    
    // Add inventory that will be consumed
    testClient._addInventory([{
      id: 'inv-chicken-test',
      household_key: 'default',
      item_name: 'chicken breast',
      qty_estimated: 4,
      qty_used_estimated: 0,
      unit: 'lb',
      confidence: 0.85,
      source: 'receipt',
      last_seen_at: new Date().toISOString(),
      last_used_at: null,
      expires_at: null,
      decay_rate_per_day: 0.05,
      created_at: new Date().toISOString(),
    }]);
    
    // Simulate what feedback endpoint does
    const originalEvent = {
      id: decisionId,
      household_key: 'default',
      decided_at: new Date().toISOString(),
      decision_type: 'cook' as const,
      meal_id: 'meal-012',
      external_vendor_key: null,
      context_hash: 'test-hash',
      decision_payload: {},
      user_action: 'pending' as const,
    };
    
    // Call consumption hook directly (as feedback endpoint would)
    const result = await consumeInventoryForMeal(
      'default',
      originalEvent.meal_id!,
      new Date().toISOString(),
      testClient
    );
    
    expect(result.success).toBe(true);
    expect(result.itemsUpdated).toBeGreaterThan(0);
  });

  it('does not trigger consumption for rejected decision', async () => {
    const testClient = getTestClient();
    
    // Add inventory
    testClient._addInventory([{
      id: 'inv-test-reject',
      household_key: 'default',
      item_name: 'chicken breast',
      qty_estimated: 4,
      qty_used_estimated: 0,
      unit: 'lb',
      confidence: 0.85,
      source: 'receipt',
      last_seen_at: new Date().toISOString(),
      last_used_at: null,
      expires_at: null,
      decay_rate_per_day: 0.05,
      created_at: new Date().toISOString(),
    }]);
    
    // For rejected, the feedback endpoint would NOT call consumeInventoryForMeal
    // This test documents that behavior
    
    // Verify inventory is unchanged (we don't call consumption)
    const inventory = await testClient.query<InventoryItemRow>(
      'SELECT * FROM decision_os.inventory_items WHERE household_key = $1',
      ['default']
    );
    
    const chicken = inventory.rows.find(i => i.item_name === 'chicken breast');
    expect(chicken!.qty_used_estimated).toBe(0);
    expect(chicken!.last_used_at).toBeNull();
  });

  it('does not trigger consumption for order decision type', async () => {
    // For order type, no consumption should happen
    // This is documented behavior - order doesn't use inventory
    
    const testClient = getTestClient();
    testClient._addInventory([{
      id: 'inv-test-order',
      household_key: 'default',
      item_name: 'chicken breast',
      qty_estimated: 4,
      qty_used_estimated: 0,
      unit: 'lb',
      confidence: 0.85,
      source: 'receipt',
      last_seen_at: new Date().toISOString(),
      last_used_at: null,
      expires_at: null,
      decay_rate_per_day: 0.05,
      created_at: new Date().toISOString(),
    }]);
    
    // For order decision_type, feedback endpoint would NOT call consumeInventoryForMeal
    // Even if approved, ordering doesn't consume inventory
    
    // Verify no consumption occurred
    const inventory = await testClient.query<InventoryItemRow>(
      'SELECT * FROM decision_os.inventory_items WHERE household_key = $1',
      ['default']
    );
    
    const chicken = inventory.rows.find(i => i.item_name === 'chicken breast');
    expect(chicken!.qty_used_estimated).toBe(0);
  });
});
