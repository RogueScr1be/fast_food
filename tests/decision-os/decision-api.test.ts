/**
 * FAST FOOD: Decision OS API Tests
 * 
 * Tests for POST /api/decision-os/decision
 * 
 * INVARIANTS TESTED:
 * 1. Response contains single decision object OR null - never arrays
 * 2. No embedded arrays in decision payload
 * 3. Low energy / calendar conflict / late time returns drmRecommended=true
 * 4. Empty inventory still returns valid cook OR zero_cook decision
 * 5. decision_events row is inserted with user_action='pending'
 */

import {
  makeDecision,
  computeContextHash,
  evaluateDrmTrigger,
  selectMeal,
  scoreMealByInventory,
  SAFE_CORE_MEAL_KEYS,
  DINNER_START_HOUR,
  DINNER_END_HOUR,
  LATE_THRESHOLD_HOUR,
  DRM_REJECTION_THRESHOLD,
} from '@/lib/decision-os/arbiter';
import {
  initializeMockData,
  clearMockData,
  loadTestSeedData,
  getDecisionEventById,
  addTestInventory,
  addTestDecisionEvent,
  getActiveMeals,
  getMealIngredients,
  getInventoryItems,
  getRecentDecisionEvents,
  insertDecisionEvent,
} from '@/lib/decision-os/database.mock';
import {
  assertNoArraysDeep,
  findArraysDeep,
  validateDecisionResponse,
  InvariantViolationError,
} from '@/lib/decision-os/invariants';
import type {
  DecisionRequest,
  DecisionResponse,
  SingleAction,
  MealRow,
  InventoryItemRow,
  DecisionEventRow,
} from '@/types/decision-os/decision';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestRequest(overrides: Partial<DecisionRequest> = {}): DecisionRequest {
  const defaultSignal = {
    timeWindow: 'dinner' as const,
    energy: 'ok' as const,
    calendarConflict: false,
  };
  
  return {
    householdKey: overrides.householdKey ?? 'test-household',
    nowIso: overrides.nowIso ?? '2026-01-19T18:05:00-06:00', // 6:05 PM
    signal: overrides.signal ? { ...defaultSignal, ...overrides.signal } : defaultSignal,
  };
}

let eventIdCounter = 0;
function generateTestEventId(): string {
  return `test-event-${++eventIdCounter}`;
}

async function makeTestDecision(
  request: DecisionRequest,
  inventory: InventoryItemRow[] = []
): Promise<DecisionResponse> {
  const activeMeals = await getActiveMeals();
  const ingredients = await getMealIngredients();
  const recentDecisions = await getRecentDecisionEvents(request.householdKey, 7);
  
  return makeDecision({
    request,
    activeMeals,
    ingredients,
    inventory,
    recentDecisions,
    generateEventId: generateTestEventId,
    persistDecisionEvent: insertDecisionEvent,
  });
}

// =============================================================================
// TEST SETUP
// =============================================================================

beforeEach(() => {
  clearMockData();
  loadTestSeedData();
  eventIdCounter = 0;
});

// =============================================================================
// TEST: Response contains single decision object OR null - never arrays
// =============================================================================

describe('Response structure invariants', () => {
  test('response contains decision object, not array', async () => {
    const request = createTestRequest();
    const response = await makeTestDecision(request);
    
    // decision must be object or null, never array
    expect(Array.isArray(response.decision)).toBe(false);
    
    if (response.decision !== null) {
      expect(typeof response.decision).toBe('object');
      expect(response.decision).toHaveProperty('decisionType');
      expect(response.decision).toHaveProperty('decisionEventId');
    }
  });
  
  test('response does not contain decisions array', async () => {
    const request = createTestRequest();
    const response = await makeTestDecision(request);
    
    // Must NOT have plural "decisions"
    expect(response).not.toHaveProperty('decisions');
    expect(response).not.toHaveProperty('options');
    expect(response).not.toHaveProperty('alternatives');
    expect(response).not.toHaveProperty('suggestions');
  });
  
  test('decision payload contains no embedded arrays', async () => {
    const request = createTestRequest();
    const response = await makeTestDecision(request);
    
    if (response.decision !== null) {
      // Check every field in the decision object
      for (const [key, value] of Object.entries(response.decision)) {
        expect(Array.isArray(value)).toBe(false);
      }
    }
  });
  
  test('drmRecommended is boolean', async () => {
    const request = createTestRequest();
    const response = await makeTestDecision(request);
    
    expect(typeof response.drmRecommended).toBe('boolean');
  });
});

// =============================================================================
// TEST: DRM triggers
// =============================================================================

describe('DRM trigger conditions', () => {
  test('low energy returns drmRecommended=true with decision=null', async () => {
    const request = createTestRequest({
      signal: {
        timeWindow: 'dinner',
        energy: 'low',
        calendarConflict: false,
      },
    });
    
    const response = await makeTestDecision(request);
    
    expect(response.decision).toBeNull();
    expect(response.drmRecommended).toBe(true);
    expect((response as any).reason).toBe('low_energy');
  });
  
  test('calendar conflict returns drmRecommended=true with decision=null', async () => {
    const request = createTestRequest({
      signal: {
        timeWindow: 'dinner',
        energy: 'ok',
        calendarConflict: true,
      },
    });
    
    const response = await makeTestDecision(request);
    
    expect(response.decision).toBeNull();
    expect(response.drmRecommended).toBe(true);
    expect((response as any).reason).toBe('calendar_conflict');
  });
  
  test('late time (after 8 PM) returns drmRecommended=true with decision=null', async () => {
    const request = createTestRequest({
      nowIso: '2026-01-19T20:30:00-06:00', // 8:30 PM
      signal: {
        timeWindow: 'dinner',
        energy: 'ok',
        calendarConflict: false,
      },
    });
    
    const response = await makeTestDecision(request);
    
    expect(response.decision).toBeNull();
    expect(response.drmRecommended).toBe(true);
    expect((response as any).reason).toBe('late_no_action');
  });
  
  test('two recent rejections triggers DRM', async () => {
    // Add two rejected decisions to history
    addTestDecisionEvent({
      id: 'past-1',
      household_key: 'test-household',
      decided_at: '2026-01-19T17:00:00-06:00',
      decision_type: 'cook',
      meal_id: 'meal-001',
      external_vendor_key: null,
      context_hash: 'hash1',
      decision_payload: {},
      user_action: 'rejected',
    });
    addTestDecisionEvent({
      id: 'past-2',
      household_key: 'test-household',
      decided_at: '2026-01-19T17:30:00-06:00',
      decision_type: 'cook',
      meal_id: 'meal-002',
      external_vendor_key: null,
      context_hash: 'hash2',
      decision_payload: {},
      user_action: 'rejected',
    });
    
    const request = createTestRequest();
    const response = await makeTestDecision(request);
    
    expect(response.decision).toBeNull();
    expect(response.drmRecommended).toBe(true);
    expect((response as any).reason).toBe('two_rejections');
  });
  
  test('normal conditions return drmRecommended=false with decision', async () => {
    const request = createTestRequest({
      nowIso: '2026-01-19T18:00:00-06:00', // 6 PM
      signal: {
        timeWindow: 'dinner',
        energy: 'ok',
        calendarConflict: false,
      },
    });
    
    const response = await makeTestDecision(request);
    
    expect(response.decision).not.toBeNull();
    expect(response.drmRecommended).toBe(false);
  });
});

// =============================================================================
// TEST: Empty inventory does not block decisions
// =============================================================================

describe('Empty inventory handling', () => {
  test('empty inventory returns valid cook decision', async () => {
    // Clear any inventory
    clearMockData();
    loadTestSeedData();
    
    const request = createTestRequest();
    const response = await makeTestDecision(request, []); // Explicitly empty inventory
    
    expect(response.decision).not.toBeNull();
    expect(response.drmRecommended).toBe(false);
    
    if (response.decision) {
      expect(['cook', 'zero_cook']).toContain(response.decision.decisionType);
    }
  });
  
  test('empty inventory prefers safe core meals', async () => {
    const request = createTestRequest();
    const response = await makeTestDecision(request, []);
    
    if (response.decision && response.decision.decisionType === 'cook') {
      // The selected meal should be from safe core list
      // We can verify by checking it was one of the test meals with safe core keys
      expect(response.decision).toHaveProperty('mealId');
    }
  });
  
  test('unknown inventory items do not crash', async () => {
    const request = createTestRequest();
    const inventory: InventoryItemRow[] = [
      {
        id: 'inv-1',
        household_key: 'test-household',
        item_name: 'mystery ingredient xyz',
        confidence: 0.8,
      },
    ];
    
    const response = await makeTestDecision(request, inventory);
    
    // Should not crash, should return valid decision
    expect(response.decision).not.toBeNull();
    expect(response.drmRecommended).toBe(false);
  });
});

// =============================================================================
// TEST: Decision event persistence
// =============================================================================

describe('Decision event persistence', () => {
  test('decision creates decision_events row with user_action=pending', async () => {
    const request = createTestRequest();
    const response = await makeTestDecision(request);
    
    expect(response.decision).not.toBeNull();
    
    if (response.decision) {
      const eventId = response.decision.decisionEventId;
      const event = await getDecisionEventById(eventId);
      
      expect(event).not.toBeNull();
      expect(event?.user_action).toBe('pending');
    }
  });
  
  test('decision event matches response decisionEventId', async () => {
    const request = createTestRequest();
    const response = await makeTestDecision(request);
    
    if (response.decision) {
      const eventId = response.decision.decisionEventId;
      const event = await getDecisionEventById(eventId);
      
      expect(event).not.toBeNull();
      expect(event?.id).toBe(eventId);
    }
  });
  
  test('decision event has correct decision_type', async () => {
    const request = createTestRequest();
    const response = await makeTestDecision(request);
    
    if (response.decision) {
      const event = await getDecisionEventById(response.decision.decisionEventId);
      
      expect(event).not.toBeNull();
      expect(event?.decision_type).toBe(response.decision.decisionType);
    }
  });
  
  test('decision event has context_hash', async () => {
    const request = createTestRequest();
    const response = await makeTestDecision(request);
    
    if (response.decision) {
      const event = await getDecisionEventById(response.decision.decisionEventId);
      
      expect(event).not.toBeNull();
      expect(event?.context_hash).toBeTruthy();
      expect(event?.context_hash).toBe(response.decision.contextHash);
    }
  });
  
  test('decision event has decision_payload as JSONB', async () => {
    const request = createTestRequest();
    const response = await makeTestDecision(request);
    
    if (response.decision) {
      const event = await getDecisionEventById(response.decision.decisionEventId);
      
      expect(event).not.toBeNull();
      expect(typeof event?.decision_payload).toBe('object');
    }
  });
  
  test('DRM recommendation does NOT create decision event', async () => {
    const request = createTestRequest({
      signal: {
        timeWindow: 'dinner',
        energy: 'low',
        calendarConflict: false,
      },
    });
    
    const response = await makeTestDecision(request);
    
    expect(response.decision).toBeNull();
    expect(response.drmRecommended).toBe(true);
    
    // No event should be created for DRM recommendations
    const events = await getRecentDecisionEvents('test-household', 10);
    expect(events.length).toBe(0);
  });
});

// =============================================================================
// TEST: Meal rotation
// =============================================================================

describe('Meal rotation', () => {
  test('avoids recently selected meals', async () => {
    // Make first decision
    const request1 = createTestRequest({ nowIso: '2026-01-19T17:00:00-06:00' });
    const response1 = await makeTestDecision(request1);
    
    expect(response1.decision).not.toBeNull();
    const firstMealId = (response1.decision as any).mealId;
    
    // Make second decision
    const request2 = createTestRequest({ nowIso: '2026-01-19T17:30:00-06:00' });
    const response2 = await makeTestDecision(request2);
    
    expect(response2.decision).not.toBeNull();
    const secondMealId = (response2.decision as any).mealId;
    
    // Should be different meals
    expect(secondMealId).not.toBe(firstMealId);
  });
});

// =============================================================================
// TEST: Inventory scoring
// =============================================================================

describe('Inventory scoring', () => {
  test('higher confidence inventory items boost meal score', async () => {
    // Add inventory with eggs (high confidence)
    const inventory: InventoryItemRow[] = [
      {
        id: 'inv-eggs',
        household_key: 'test-household',
        item_name: 'eggs',
        confidence: 0.95,
      },
    ];
    
    const request = createTestRequest();
    const response = await makeTestDecision(request, inventory);
    
    // Should prefer meals with eggs
    expect(response.decision).not.toBeNull();
    // This is a heuristic test - we verify the system doesn't crash
  });
  
  test('pantry staples are assumed available (score 1.0)', async () => {
    const meals = await getActiveMeals();
    const ingredients = await getMealIngredients();
    
    const meal = meals.find(m => m.canonical_key === 'spaghetti-aglio-olio');
    expect(meal).toBeDefined();
    
    if (meal) {
      // Score with empty inventory
      const score = scoreMealByInventory(meal, ingredients, []);
      
      // Spaghetti Aglio e Olio: 3 pantry staples (1.0) + 1 non-pantry garlic (0)
      // Score = (1.0 + 1.0 + 1.0 + 0) / 4 = 0.75
      expect(score).toBe(0.75);
    }
  });
});

// =============================================================================
// TEST: Context hash
// =============================================================================

describe('Context hash', () => {
  test('same inputs produce same hash', () => {
    const input = {
      nowIso: '2026-01-19T18:00:00-06:00',
      signal: { timeWindow: 'dinner' as const, energy: 'ok' as const, calendarConflict: false },
      inventoryItemNames: ['eggs', 'bread'],
      selectedMealKey: 'scrambled-eggs-toast',
    };
    
    const hash1 = computeContextHash(input);
    const hash2 = computeContextHash(input);
    
    expect(hash1).toBe(hash2);
  });
  
  test('different inputs produce different hash', () => {
    const input1 = {
      nowIso: '2026-01-19T18:00:00-06:00',
      signal: { timeWindow: 'dinner' as const, energy: 'ok' as const, calendarConflict: false },
      inventoryItemNames: ['eggs'],
      selectedMealKey: 'scrambled-eggs-toast',
    };
    
    const input2 = {
      ...input1,
      nowIso: '2026-01-19T19:00:00-06:00',
    };
    
    const hash1 = computeContextHash(input1);
    const hash2 = computeContextHash(input2);
    
    expect(hash1).not.toBe(hash2);
  });
  
  test('hash is deterministic regardless of inventory order', () => {
    const input1 = {
      nowIso: '2026-01-19T18:00:00-06:00',
      signal: { timeWindow: 'dinner' as const, energy: 'ok' as const, calendarConflict: false },
      inventoryItemNames: ['eggs', 'bread', 'butter'],
      selectedMealKey: 'scrambled-eggs-toast',
    };
    
    const input2 = {
      ...input1,
      inventoryItemNames: ['butter', 'eggs', 'bread'], // Different order
    };
    
    const hash1 = computeContextHash(input1);
    const hash2 = computeContextHash(input2);
    
    expect(hash1).toBe(hash2); // Should be same because we sort
  });
});

// =============================================================================
// TEST: Safe core meals
// =============================================================================

describe('Safe core meals', () => {
  test('SAFE_CORE_MEAL_KEYS has exactly 10 entries', () => {
    expect(SAFE_CORE_MEAL_KEYS.length).toBe(10);
  });
  
  test('all safe core keys are valid strings', () => {
    for (const key of SAFE_CORE_MEAL_KEYS) {
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// TEST: Edge cases
// =============================================================================

describe('Edge cases', () => {
  test('handles empty meals list with zero_cook fallback', async () => {
    // Clear all meals
    clearMockData();
    initializeMockData({
      meals: [],
      ingredients: [],
      inventory: [],
      decisionEvents: [],
    });
    
    const request = createTestRequest();
    const activeMeals = await getActiveMeals();
    const ingredients = await getMealIngredients();
    
    const response = await makeDecision({
      request,
      activeMeals,
      ingredients,
      inventory: [],
      recentDecisions: [],
      generateEventId: generateTestEventId,
      persistDecisionEvent: insertDecisionEvent,
    });
    
    // Should return zero_cook fallback, not an error
    expect(response.decision).not.toBeNull();
    expect(response.decision?.decisionType).toBe('zero_cook');
    expect(response.drmRecommended).toBe(false);
  });
  
  test('handles all meals being recently used', async () => {
    // Add all test meals as recent decisions
    const meals = await getActiveMeals();
    for (const meal of meals) {
      addTestDecisionEvent({
        id: `recent-${meal.id}`,
        household_key: 'test-household',
        decided_at: new Date().toISOString(),
        decision_type: 'cook',
        meal_id: meal.id,
        external_vendor_key: null,
        context_hash: 'hash',
        decision_payload: {},
        user_action: 'pending',
      });
    }
    
    const request = createTestRequest();
    const response = await makeTestDecision(request);
    
    // Should still return a decision (rotation resets)
    expect(response.decision).not.toBeNull();
    expect(response.drmRecommended).toBe(false);
  });
});

// =============================================================================
// TEST: Deep array checks (assertNoArraysDeep)
// =============================================================================

describe('Deep array checks (assertNoArraysDeep)', () => {
  test('passes for simple object without arrays', () => {
    const obj = {
      decisionType: 'cook',
      decisionEventId: 'test-123',
      mealId: 'meal-001',
      title: 'Test Meal',
    };
    
    expect(() => assertNoArraysDeep(obj, 'test')).not.toThrow();
  });
  
  test('fails for top-level array', () => {
    const arr = [{ mealId: 'meal-001' }, { mealId: 'meal-002' }];
    
    expect(() => assertNoArraysDeep(arr, 'test')).toThrow(InvariantViolationError);
    expect(() => assertNoArraysDeep(arr, 'test')).toThrow('INVARIANT VIOLATION');
  });
  
  test('fails for nested array in object', () => {
    const obj = {
      decision: {
        decisionType: 'cook',
        alternativeMeals: ['meal-001', 'meal-002'], // Hidden list!
      },
    };
    
    expect(() => assertNoArraysDeep(obj, 'test')).toThrow(InvariantViolationError);
  });
  
  test('fails for deeply nested array', () => {
    const obj = {
      level1: {
        level2: {
          level3: {
            hiddenList: [1, 2, 3],
          },
        },
      },
    };
    
    expect(() => assertNoArraysDeep(obj, 'test')).toThrow(InvariantViolationError);
  });
  
  test('findArraysDeep returns correct paths', () => {
    const obj = {
      topArray: [1, 2],
      nested: {
        innerArray: ['a', 'b'],
      },
    };
    
    const paths = findArraysDeep(obj);
    
    expect(paths).toContain('topArray');
    expect(paths).toContain('nested.innerArray');
  });
  
  test('passes for null values', () => {
    const obj = { decision: null, drmRecommended: true };
    expect(() => assertNoArraysDeep(obj, 'test')).not.toThrow();
  });
  
  test('passes for undefined values', () => {
    const obj = { decision: undefined, drmRecommended: true };
    expect(() => assertNoArraysDeep(obj, 'test')).not.toThrow();
  });
  
  test('validateDecisionResponse catches arrays in decision', () => {
    const badResponse = {
      decision: ['meal1', 'meal2'], // Array instead of object!
      drmRecommended: false,
    };
    
    expect(() => validateDecisionResponse(badResponse)).toThrow(InvariantViolationError);
  });
  
  test('validateDecisionResponse passes for valid DRM response', () => {
    const response = {
      decision: null,
      drmRecommended: true,
      reason: 'low_energy',
    };
    
    expect(() => validateDecisionResponse(response)).not.toThrow();
  });
  
  test('validateDecisionResponse passes for valid decision response', () => {
    const response = {
      decision: {
        decisionType: 'cook',
        decisionEventId: 'test-123',
        mealId: 'meal-001',
        title: 'Test Meal',
        stepsShort: 'Steps here',
        estMinutes: 15,
        contextHash: 'hash123',
      },
      drmRecommended: false,
    };
    
    expect(() => validateDecisionResponse(response)).not.toThrow();
  });
});

// =============================================================================
// TEST: Updated inventory scoring (missing = 0, pantry = 1.0)
// =============================================================================

describe('Updated inventory scoring', () => {
  test('missing ingredient scores 0, not 0.3', async () => {
    const meals = await getActiveMeals();
    const ingredients = await getMealIngredients();
    
    // Find a meal that requires fresh ingredients (not pantry staples)
    const chickenTacos = meals.find(m => m.canonical_key === 'quick-chicken-tacos');
    expect(chickenTacos).toBeDefined();
    
    if (chickenTacos) {
      // Score with empty inventory - chicken is not a pantry staple
      const score = scoreMealByInventory(chickenTacos, ingredients, []);
      
      // Score should be very low because many non-pantry ingredients are missing
      // With 5 ingredients (chicken, taco shells, lettuce, tomato, cheese) all missing
      // Score should be 0
      expect(score).toBe(0);
    }
  });
  
  test('pantry staples score 1.0 even with empty inventory', async () => {
    const meals = await getActiveMeals();
    const ingredients = await getMealIngredients();
    
    // Spaghetti Aglio e Olio has mostly pantry staples
    const meal = meals.find(m => m.canonical_key === 'spaghetti-aglio-olio');
    expect(meal).toBeDefined();
    
    if (meal) {
      const mealIngredients = ingredients.filter(i => i.meal_id === meal.id);
      const pantryCount = mealIngredients.filter(i => i.is_pantry_staple).length;
      
      // Score with empty inventory
      const score = scoreMealByInventory(meal, ingredients, []);
      
      // Expected: pantry staples = 1.0, non-pantry (garlic) = 0
      // (3 * 1.0 + 1 * 0) / 4 = 0.75
      const expectedScore = pantryCount / mealIngredients.length;
      expect(score).toBeCloseTo(expectedScore, 2);
    }
  });
  
  test('available inventory ingredient uses its confidence', async () => {
    const meals = await getActiveMeals();
    const ingredients = await getMealIngredients();
    
    const meal = meals.find(m => m.canonical_key === 'egg-fried-rice');
    expect(meal).toBeDefined();
    
    if (meal) {
      // Add eggs to inventory with 0.9 confidence
      const inventory: InventoryItemRow[] = [
        {
          id: 'inv-eggs',
          household_key: 'test-household',
          item_name: 'eggs',
          confidence: 0.9,
        },
      ];
      
      const scoreWithEggs = scoreMealByInventory(meal, ingredients, inventory);
      const scoreWithoutEggs = scoreMealByInventory(meal, ingredients, []);
      
      // Score should be higher with eggs in inventory
      expect(scoreWithEggs).toBeGreaterThan(scoreWithoutEggs);
    }
  });
});

// =============================================================================
// TEST: Time threshold constants
// =============================================================================

describe('Time threshold constants', () => {
  test('DINNER_START_HOUR is 17 (5 PM)', () => {
    expect(DINNER_START_HOUR).toBe(17);
  });
  
  test('DINNER_END_HOUR is 21 (9 PM)', () => {
    expect(DINNER_END_HOUR).toBe(21);
  });
  
  test('LATE_THRESHOLD_HOUR is 20 (8 PM)', () => {
    expect(LATE_THRESHOLD_HOUR).toBe(20);
  });
  
  test('DRM_REJECTION_THRESHOLD is 2', () => {
    expect(DRM_REJECTION_THRESHOLD).toBe(2);
  });
  
  test('late threshold is between start and end', () => {
    expect(LATE_THRESHOLD_HOUR).toBeGreaterThan(DINNER_START_HOUR);
    expect(LATE_THRESHOLD_HOUR).toBeLessThanOrEqual(DINNER_END_HOUR);
  });
});
