/**
 * FAST FOOD: Taste-Aware Arbiter Tests
 * 
 * Tests for Phase 4 taste-aware meal selection:
 * - Taste preferences influence selection
 * - Inventory still matters (doesn't get overridden)
 * - Exploration is deterministic
 * - Rotation penalty works
 * - No arrays in responses
 */

import { randomUUID } from 'crypto';
import {
  selectMeal,
  scoreMealByInventory,
  sigmoidNormalize,
  deterministicTinyNoise,
  WEIGHT_INVENTORY,
  WEIGHT_TASTE,
  ROTATION_PENALTY,
  ROTATION_WINDOW,
  MAX_EXPLORATION_NOISE,
  TASTE_SIGMOID_DIVISOR,
} from '../lib/decision-os/arbiter';
import type { MealRow, MealIngredientRow, InventoryItemRow } from '../types/decision-os/decision';
import { getTestClient, getTasteScoresForMeals } from '../lib/decision-os/database';
import { upsertTasteMealScore } from '../lib/decision-os/taste/updater';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createMeal = (
  id: string, 
  canonicalKey: string, 
  tags: string[] = []
): MealRow => ({
  id,
  name: `Meal ${canonicalKey}`,
  canonical_key: canonicalKey,
  instructions_short: 'Test instructions',
  est_minutes: 20,
  est_cost_band: '$$',
  tags_internal: tags,
  is_active: true,
});

const createIngredient = (
  mealId: string, 
  name: string, 
  isPantryStaple: boolean = false
): MealIngredientRow => ({
  meal_id: mealId,
  ingredient_name: name,
  is_pantry_staple: isPantryStaple,
});

const createInventoryItem = (
  name: string, 
  confidence: number = 0.8
): InventoryItemRow => ({
  id: randomUUID(),
  household_key: 'default',
  item_name: name,
  qty_estimated: 1,
  qty_used_estimated: 0,
  unit: 'unit',
  confidence,
  source: 'receipt',
  last_seen_at: new Date().toISOString(),
  last_used_at: null,
  expires_at: null,
  decay_rate_per_day: 0.05,
  created_at: new Date().toISOString(),
});

// =============================================================================
// SCORING CONSTANTS TESTS
// =============================================================================

describe('Taste-Aware Scoring Constants', () => {
  it('has correct weight values', () => {
    expect(WEIGHT_INVENTORY).toBe(0.60);
    expect(WEIGHT_TASTE).toBe(0.35);
    expect(ROTATION_PENALTY).toBe(-0.20);
    expect(ROTATION_WINDOW).toBe(7);
    expect(MAX_EXPLORATION_NOISE).toBe(0.05);
    expect(TASTE_SIGMOID_DIVISOR).toBe(5);
  });

  it('weights sum to less than 1 (leaving room for rotation penalty)', () => {
    expect(WEIGHT_INVENTORY + WEIGHT_TASTE).toBe(0.95);
  });
});

// =============================================================================
// SIGMOID NORMALIZATION TESTS
// =============================================================================

describe('sigmoidNormalize', () => {
  it('returns 0.5 for score of 0', () => {
    expect(sigmoidNormalize(0)).toBeCloseTo(0.5, 4);
  });

  it('returns ~0.73 for score of +5', () => {
    const result = sigmoidNormalize(5);
    expect(result).toBeGreaterThan(0.7);
    expect(result).toBeLessThan(0.8);
  });

  it('returns ~0.27 for score of -5', () => {
    const result = sigmoidNormalize(-5);
    expect(result).toBeGreaterThan(0.2);
    expect(result).toBeLessThan(0.3);
  });

  it('returns ~0.88 for score of +10', () => {
    const result = sigmoidNormalize(10);
    expect(result).toBeGreaterThan(0.85);
    expect(result).toBeLessThan(0.92);
  });

  it('is symmetric around 0.5', () => {
    const pos5 = sigmoidNormalize(5);
    const neg5 = sigmoidNormalize(-5);
    expect(pos5 + neg5).toBeCloseTo(1.0, 4);
  });

  it('is bounded between 0 and 1', () => {
    expect(sigmoidNormalize(100)).toBeLessThan(1);
    expect(sigmoidNormalize(100)).toBeGreaterThan(0.99);
    expect(sigmoidNormalize(-100)).toBeGreaterThan(0);
    expect(sigmoidNormalize(-100)).toBeLessThan(0.01);
  });
});

// =============================================================================
// DETERMINISTIC EXPLORATION TESTS
// =============================================================================

describe('deterministicTinyNoise', () => {
  it('returns value in [0, MAX_EXPLORATION_NOISE]', () => {
    const noise = deterministicTinyNoise('context-123', 'meal-001');
    expect(noise).toBeGreaterThanOrEqual(0);
    expect(noise).toBeLessThanOrEqual(MAX_EXPLORATION_NOISE);
  });

  it('is deterministic - same inputs produce same output', () => {
    const noise1 = deterministicTinyNoise('context-abc', 'meal-xyz');
    const noise2 = deterministicTinyNoise('context-abc', 'meal-xyz');
    const noise3 = deterministicTinyNoise('context-abc', 'meal-xyz');
    
    expect(noise1).toBe(noise2);
    expect(noise2).toBe(noise3);
  });

  it('produces different values for different meal IDs', () => {
    const noise1 = deterministicTinyNoise('context-123', 'meal-001');
    const noise2 = deterministicTinyNoise('context-123', 'meal-002');
    const noise3 = deterministicTinyNoise('context-123', 'meal-003');
    
    // With high probability, these should differ
    expect(new Set([noise1, noise2, noise3]).size).toBeGreaterThan(1);
  });

  it('produces different values for different context hashes', () => {
    const noise1 = deterministicTinyNoise('context-aaa', 'meal-001');
    const noise2 = deterministicTinyNoise('context-bbb', 'meal-001');
    
    expect(noise1).not.toBe(noise2);
  });

  it('distributes across the range', () => {
    // Generate many noise values and check distribution
    const values: number[] = [];
    for (let i = 0; i < 100; i++) {
      values.push(deterministicTinyNoise(`ctx-${i}`, `meal-${i}`));
    }
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Should use most of the range
    expect(max - min).toBeGreaterThan(MAX_EXPLORATION_NOISE * 0.5);
  });
});

// =============================================================================
// TASTE PREFERENCE TESTS
// =============================================================================

describe('Taste Preferences in Selection', () => {
  it('prefers meal with higher taste score when inventory is equal', () => {
    const mealA = createMeal('meal-a', 'meal-a');
    const mealB = createMeal('meal-b', 'meal-b');
    
    // Both meals have same ingredients (all pantry staples for equal inventory score)
    const ingredients = [
      createIngredient('meal-a', 'salt', true),
      createIngredient('meal-b', 'salt', true),
    ];
    
    // No inventory (both get neutral 0.5 inventory score)
    const inventory: InventoryItemRow[] = [];
    
    // Meal A has higher taste score
    const tasteScores = new Map<string, number>([
      ['meal-a', 3.0],  // sigmoid(3/5) ≈ 0.65
      ['meal-b', -3.0], // sigmoid(-3/5) ≈ 0.35
    ]);
    
    const result = selectMeal(
      [mealA, mealB],
      ingredients,
      inventory,
      [], // no recent meals
      false,
      undefined,
      tasteScores,
      'test-context'
    );
    
    expect(result.meal?.id).toBe('meal-a');
  });

  it('after 3 approvals and 3 rejections, prefers the approved meal', async () => {
    const client = getTestClient();
    
    // Meal A: 3 approvals (+3.0)
    for (let i = 0; i < 3; i++) {
      await upsertTasteMealScore({
        householdKey: 'default',
        mealId: 'meal-approved',
        weightDelta: 1.0,
        isApproval: true,
        isRejection: false,
        decidedAt: new Date().toISOString(),
      }, client);
    }
    
    // Meal B: 3 rejections (-3.0)
    for (let i = 0; i < 3; i++) {
      await upsertTasteMealScore({
        householdKey: 'default',
        mealId: 'meal-rejected',
        weightDelta: -1.0,
        isApproval: false,
        isRejection: true,
        decidedAt: new Date().toISOString(),
      }, client);
    }
    
    // Get taste scores from DB
    const tasteScores = await getTasteScoresForMeals(
      'default',
      ['meal-approved', 'meal-rejected'],
      client
    );
    
    expect(tasteScores.get('meal-approved')).toBe(3.0);
    expect(tasteScores.get('meal-rejected')).toBe(-3.0);
    
    // Create meals with equal inventory scores
    const mealA = createMeal('meal-approved', 'meal-approved');
    const mealB = createMeal('meal-rejected', 'meal-rejected');
    
    const ingredients = [
      createIngredient('meal-approved', 'salt', true),
      createIngredient('meal-rejected', 'salt', true),
    ];
    
    const result = selectMeal(
      [mealA, mealB],
      ingredients,
      [],
      [],
      false,
      undefined,
      tasteScores,
      'test-context'
    );
    
    expect(result.meal?.id).toBe('meal-approved');
  });
});

// =============================================================================
// INVENTORY STILL WINS TESTS
// =============================================================================

describe('Inventory Still Matters', () => {
  it('prefers meal with available ingredients even if taste score is lower', () => {
    const mealA = createMeal('meal-a', 'meal-a-preferred'); // Higher taste
    const mealB = createMeal('meal-b', 'meal-b-available'); // Has ingredients
    
    // Meal A needs chicken (not in inventory)
    // Meal B only needs pantry staples
    const ingredients = [
      createIngredient('meal-a', 'chicken', false),
      createIngredient('meal-b', 'salt', true),
    ];
    
    // Inventory has no chicken
    const inventory: InventoryItemRow[] = [];
    
    // Meal A has much higher taste score but no ingredients
    // Meal B has negative taste but ingredients available
    const tasteScores = new Map<string, number>([
      ['meal-a', 10.0],  // sigmoid(10/5) ≈ 0.88, but inventory = 0
      ['meal-b', -5.0],  // sigmoid(-5/5) ≈ 0.27, but inventory = 1.0 (pantry)
    ]);
    
    // Scores:
    // Meal A: 0.60 * 0 + 0.35 * 0.88 = 0.308
    // Meal B: 0.60 * 1.0 + 0.35 * 0.27 = 0.695
    
    const result = selectMeal(
      [mealA, mealB],
      ingredients,
      inventory,
      [],
      false,
      undefined,
      tasteScores,
      'test-context'
    );
    
    // Meal B wins because inventory * 0.60 > taste * 0.35
    expect(result.meal?.id).toBe('meal-b');
  });

  it('inventory score of 0 cannot be overcome by perfect taste score', () => {
    const mealNoIngredients = createMeal('no-ingredients', 'no-ingredients');
    const mealWithIngredients = createMeal('with-ingredients', 'with-ingredients');
    
    const ingredients = [
      createIngredient('no-ingredients', 'exotic-spice', false), // Not in inventory
      createIngredient('with-ingredients', 'common-item', false),
    ];
    
    const inventory = [
      createInventoryItem('common-item', 0.9), // High confidence
    ];
    
    // Max taste score for no-ingredients, min for with-ingredients
    const tasteScores = new Map<string, number>([
      ['no-ingredients', 100], // sigmoid ≈ 1.0
      ['with-ingredients', -100], // sigmoid ≈ 0.0
    ]);
    
    // no-ingredients: 0.60 * 0 + 0.35 * 1.0 = 0.35
    // with-ingredients: 0.60 * 0.9 + 0.35 * 0.0 = 0.54
    
    const result = selectMeal(
      [mealNoIngredients, mealWithIngredients],
      ingredients,
      inventory,
      [],
      false,
      undefined,
      tasteScores,
      'test-context'
    );
    
    expect(result.meal?.id).toBe('with-ingredients');
  });
});

// =============================================================================
// ROTATION PENALTY TESTS
// =============================================================================

describe('Rotation Penalty', () => {
  it('penalizes recently used meal vs similar alternative', () => {
    const mealRecent = createMeal('recent', 'aaa-recent'); // Would win alphabetically
    const mealFresh = createMeal('fresh', 'zzz-fresh');    // Loses alphabetically
    
    // Equal ingredients (pantry staples)
    const ingredients = [
      createIngredient('recent', 'salt', true),
      createIngredient('fresh', 'salt', true),
    ];
    
    // Equal taste scores
    const tasteScores = new Map<string, number>([
      ['recent', 0],
      ['fresh', 0],
    ]);
    
    // Recent meals list includes 'recent'
    const recentMealIds = ['recent'];
    
    // Without rotation: both would have ~0.475 (0.60*0.5 + 0.35*0.5)
    // With rotation: recent gets -0.2, so 0.275 vs 0.475
    
    const result = selectMeal(
      [mealRecent, mealFresh],
      ingredients,
      [],
      recentMealIds,
      false,
      undefined,
      tasteScores,
      'test-context'
    );
    
    expect(result.meal?.id).toBe('fresh');
  });

  it('respects ROTATION_WINDOW limit', () => {
    const meals = [
      createMeal('meal-old', 'aaa-old'),   // Outside rotation window
      createMeal('meal-new', 'zzz-new'),   // Fresh
    ];
    
    const ingredients = [
      createIngredient('meal-old', 'salt', true),
      createIngredient('meal-new', 'salt', true),
    ];
    
    // 'meal-old' is beyond the 7-meal rotation window
    // Fill with other IDs first
    const recentMealIds = [
      'other-1', 'other-2', 'other-3', 'other-4',
      'other-5', 'other-6', 'other-7', // These 7 fill the window
      'meal-old', // This is position 8, outside window
    ];
    
    const tasteScores = new Map<string, number>();
    
    // Don't pass contextHash to disable exploration noise for deterministic tie-breaking
    const result = selectMeal(
      meals,
      ingredients,
      [],
      recentMealIds,
      false,
      undefined,
      tasteScores,
      undefined // No exploration noise - pure tie-break by canonical_key
    );
    
    // meal-old should NOT have penalty since it's outside window
    // meal-old wins alphabetically if no penalty (aaa < zzz)
    expect(result.meal?.id).toBe('meal-old');
  });
});

// =============================================================================
// STABLE ORDERING TESTS
// =============================================================================

describe('Stable Ordering and Tie-Breaking', () => {
  it('breaks ties by canonical_key lexicographically', () => {
    // Three meals with identical scores
    const meals = [
      createMeal('id-3', 'ccc-meal'),
      createMeal('id-1', 'aaa-meal'), // Should win
      createMeal('id-2', 'bbb-meal'),
    ];
    
    const ingredients = meals.map(m => createIngredient(m.id, 'salt', true));
    const tasteScores = new Map<string, number>(); // All zero
    
    // Without exploration (no contextHash), should always pick aaa-meal (first alphabetically)
    const result1 = selectMeal(meals, ingredients, [], [], false, undefined, tasteScores, undefined);
    const result2 = selectMeal(meals, ingredients, [], [], false, undefined, tasteScores, undefined);
    const result3 = selectMeal(meals, ingredients, [], [], false, undefined, tasteScores, undefined);
    
    expect(result1.meal?.canonical_key).toBe('aaa-meal');
    expect(result2.meal?.canonical_key).toBe('aaa-meal');
    expect(result3.meal?.canonical_key).toBe('aaa-meal');
  });

  it('produces consistent results regardless of input order', () => {
    const meals = [
      createMeal('id-1', 'meal-a'),
      createMeal('id-2', 'meal-b'),
      createMeal('id-3', 'meal-c'),
    ];
    
    const ingredients = meals.map(m => createIngredient(m.id, 'salt', true));
    const tasteScores = new Map<string, number>([
      ['id-1', 1.0],
      ['id-2', 2.0], // Highest
      ['id-3', 0.5],
    ]);
    
    // Shuffle order
    const shuffled = [meals[2], meals[0], meals[1]];
    
    const result1 = selectMeal(meals, ingredients, [], [], false, undefined, tasteScores, 'ctx');
    const result2 = selectMeal(shuffled, ingredients, [], [], false, undefined, tasteScores, 'ctx');
    
    expect(result1.meal?.id).toBe(result2.meal?.id);
  });
});

// =============================================================================
// DB ADAPTER TESTS
// =============================================================================

describe('getTasteScoresForMeals', () => {
  it('returns empty map for empty meal list', async () => {
    const client = getTestClient();
    const scores = await getTasteScoresForMeals('default', [], client);
    expect(scores.size).toBe(0);
  });

  it('returns scores for meals that have them', async () => {
    const client = getTestClient();
    
    // Add some scores
    await upsertTasteMealScore({
      householdKey: 'default',
      mealId: 'meal-001',
      weightDelta: 3.0,
      isApproval: true,
      isRejection: false,
      decidedAt: new Date().toISOString(),
    }, client);
    
    await upsertTasteMealScore({
      householdKey: 'default',
      mealId: 'meal-002',
      weightDelta: -2.0,
      isApproval: false,
      isRejection: true,
      decidedAt: new Date().toISOString(),
    }, client);
    
    const scores = await getTasteScoresForMeals(
      'default',
      ['meal-001', 'meal-002', 'meal-003'],
      client
    );
    
    expect(scores.get('meal-001')).toBe(3.0);
    expect(scores.get('meal-002')).toBe(-2.0);
    expect(scores.has('meal-003')).toBe(false); // Not in DB
  });

  it('returns scores only for requested household', async () => {
    const client = getTestClient();
    
    await upsertTasteMealScore({
      householdKey: 'household-a',
      mealId: 'meal-001',
      weightDelta: 5.0,
      isApproval: true,
      isRejection: false,
      decidedAt: new Date().toISOString(),
    }, client);
    
    const scoresA = await getTasteScoresForMeals('household-a', ['meal-001'], client);
    const scoresB = await getTasteScoresForMeals('household-b', ['meal-001'], client);
    
    expect(scoresA.get('meal-001')).toBe(5.0);
    expect(scoresB.has('meal-001')).toBe(false);
  });
});

// =============================================================================
// NO ARRAYS INVARIANT
// =============================================================================

describe('No Arrays Invariant', () => {
  it('selectMeal returns single meal, not array', () => {
    const meals = [
      createMeal('id-1', 'meal-a'),
      createMeal('id-2', 'meal-b'),
    ];
    
    const ingredients = meals.map(m => createIngredient(m.id, 'salt', true));
    
    const result = selectMeal(meals, ingredients, [], [], false);
    
    expect(Array.isArray(result)).toBe(false);
    expect(result === null || typeof result === 'object').toBe(true);
  });
});
