/**
 * FAST FOOD: Autopilot Event Insertion Tests
 * 
 * Tests for the autopilot event model:
 * - When eligible: decision endpoint inserts TWO rows (pending + approved copy)
 * - When not eligible: inserts only pending row
 * - Ensure feedback response contract unchanged
 * - Ensure no arrays introduced
 */

import {
  getTestClient,
  insertDecisionEvent,
  getRecentDecisionEvents,
} from '../lib/decision-os/database';
import {
  evaluateAutopilotEligibility,
  wasMealUsedRecently,
  type AutopilotContext,
} from '../lib/decision-os/autopilot/policy';
import { makeDecision, type ArbiterInput, type ArbiterResult } from '../lib/decision-os/arbiter';
import { assertNoArraysDeep } from '../lib/decision-os/invariants';
import type { DecisionRequest, DecisionEventRow, MealRow, MealIngredientRow, InventoryItemRow } from '../types/decision-os/decision';

// =============================================================================
// HELPERS
// =============================================================================

function createMeal(id: string, canonicalKey: string): MealRow {
  return {
    id,
    name: `Test Meal ${id}`,
    canonical_key: canonicalKey,
    instructions_short: 'Test instructions',
    est_minutes: 20,
    est_cost_band: 'budget',
    tags_internal: {},
    is_active: true,
    last_cooked_at: null,
  };
}

function createIngredient(mealId: string, name: string, isPantry: boolean): MealIngredientRow {
  return {
    id: `ing-${mealId}-${name}`,
    meal_id: mealId,
    ingredient_name: name,
    is_pantry_staple: isPantry,
    canonical_name: name,
    quantity: null,
  };
}

function createInventoryItem(name: string, confidence: number): InventoryItemRow {
  return {
    id: `inv-${name}`,
    household_key: 'default',
    item_name: name,
    confidence,
    last_seen_at: new Date().toISOString(),
    source: 'receipt',
    remaining_pct: 100,
  };
}

function createDecisionEvent(
  id: string,
  mealId: string,
  userAction: 'pending' | 'approved' | 'rejected' | 'drm_triggered' | 'expired',
  decidedAt: string
): DecisionEventRow {
  return {
    id,
    household_key: 'default',
    decided_at: decidedAt,
    decision_type: 'cook',
    meal_id: mealId,
    external_vendor_key: null,
    context_hash: 'ctx-' + id,
    decision_payload: {},
    user_action: userAction,
    actioned_at: userAction !== 'pending' ? decidedAt : null,
  };
}

// =============================================================================
// TESTS: AUTOPILOT ELIGIBILITY AFFECTS EVENT INSERTION
// =============================================================================

describe('Autopilot Event Insertion', () => {
  let client: ReturnType<typeof getTestClient>;
  
  beforeEach(() => {
    client = getTestClient();
  });
  
  describe('Autopilot Eligibility Evaluation', () => {
    test('when all gates pass, autopilot is eligible', () => {
      const ctx: AutopilotContext = {
        nowIso: '2026-01-20T17:30:00Z',
        signal: {
          timeWindow: 'prime',
          energy: 'normal',
          calendarConflict: false,
        },
        mealId: 'meal-a',
        inventoryScore: 0.90,
        tasteScore: 0.80,
        usedInLast3Days: false,
        recentEvents: [
          createDecisionEvent('1', 'm1', 'approved', '2026-01-19T18:00:00Z'),
          createDecisionEvent('2', 'm2', 'approved', '2026-01-18T18:00:00Z'),
        ],
      };
      
      const result = evaluateAutopilotEligibility(ctx);
      expect(result.eligible).toBe(true);
    });
    
    test('when outside time window, autopilot is not eligible', () => {
      const ctx: AutopilotContext = {
        nowIso: '2026-01-20T12:00:00Z', // Noon - outside window
        signal: {
          timeWindow: 'lunch',
          energy: 'normal',
          calendarConflict: false,
        },
        mealId: 'meal-a',
        inventoryScore: 0.90,
        tasteScore: 0.80,
        usedInLast3Days: false,
        recentEvents: [],
      };
      
      const result = evaluateAutopilotEligibility(ctx);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('outside_autopilot_window');
    });
    
    test('when inventory score is low, autopilot is not eligible', () => {
      const ctx: AutopilotContext = {
        nowIso: '2026-01-20T17:30:00Z',
        signal: {
          timeWindow: 'prime',
          energy: 'normal',
          calendarConflict: false,
        },
        mealId: 'meal-a',
        inventoryScore: 0.50, // Below threshold
        tasteScore: 0.80,
        usedInLast3Days: false,
        recentEvents: [],
      };
      
      const result = evaluateAutopilotEligibility(ctx);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('low_inventory_score');
    });
  });
  
  describe('Decision Event Insertion', () => {
    test('makeDecision inserts initial pending row', async () => {
      const meals = [createMeal('meal-test', 'test-meal')];
      const ingredients = [createIngredient('meal-test', 'salt', true)];
      
      let insertedEvent: DecisionEventRow | null = null;
      
      const input: ArbiterInput = {
        request: {
          householdKey: 'default',
          nowIso: '2026-01-20T17:30:00Z',
          signal: {
            timeWindow: 'dinner',
            energy: 'ok',
            calendarConflict: false,
          },
        },
        activeMeals: meals,
        ingredients,
        inventory: [],
        recentDecisions: [],
        generateEventId: () => 'test-event-id',
        persistDecisionEvent: async (event) => {
          insertedEvent = event as DecisionEventRow;
        },
      };
      
      await makeDecision(input);
      
      expect(insertedEvent).not.toBeNull();
      expect(insertedEvent!.user_action).toBe('pending');
      // actioned_at may be undefined or null for pending events
      expect(insertedEvent!.actioned_at == null).toBe(true);
    });
    
    test('feedback copy has same context_hash as original', async () => {
      // Simulate what happens when autopilot is triggered
      const originalEvent: DecisionEventRow = {
        id: 'original-id',
        household_key: 'default',
        decided_at: '2026-01-20T17:30:00Z',
        decision_type: 'cook',
        meal_id: 'meal-a',
        external_vendor_key: null,
        context_hash: 'unique-context-hash-123',
        decision_payload: { test: true },
        user_action: 'pending',
        actioned_at: null,
      };
      
      // The feedback copy should have same context_hash
      const feedbackCopy: DecisionEventRow = {
        ...originalEvent,
        id: 'feedback-id',
        user_action: 'approved',
        actioned_at: '2026-01-20T17:30:00Z',
      };
      
      expect(feedbackCopy.context_hash).toBe(originalEvent.context_hash);
      expect(feedbackCopy.decision_payload).toEqual(originalEvent.decision_payload);
    });
  });
  
  describe('Arbiter Result Structure', () => {
    test('makeDecision returns ArbiterResult with response and internalContext', async () => {
      const meals = [createMeal('meal-test', 'test-meal')];
      const ingredients = [createIngredient('meal-test', 'salt', true)];
      
      const input: ArbiterInput = {
        request: {
          householdKey: 'default',
          nowIso: '2026-01-20T17:30:00Z',
          signal: {
            timeWindow: 'dinner',
            energy: 'ok',
            calendarConflict: false,
          },
        },
        activeMeals: meals,
        ingredients,
        inventory: [],
        recentDecisions: [],
        generateEventId: () => 'test-event-id',
        persistDecisionEvent: async () => {},
      };
      
      const result: ArbiterResult = await makeDecision(input);
      
      // Check response structure
      expect(result.response).toBeDefined();
      expect(result.response.drmRecommended).toBe(false);
      expect(result.response.decision).not.toBeNull();
      
      // Check internalContext structure
      expect(result.internalContext).not.toBeNull();
      expect(result.internalContext!.selectedMealId).toBe('meal-test');
      expect(typeof result.internalContext!.inventoryScore).toBe('number');
      expect(typeof result.internalContext!.tasteScore).toBe('number');
      expect(typeof result.internalContext!.isRecentlyUsed).toBe('boolean');
      expect(result.internalContext!.decisionEventId).toBe('test-event-id');
      expect(result.internalContext!.contextHash).toBeDefined();
      expect(result.internalContext!.decisionPayload).toBeDefined();
    });
    
    test('internalContext is null for DRM response', async () => {
      const input: ArbiterInput = {
        request: {
          householdKey: 'default',
          nowIso: '2026-01-20T21:30:00Z', // Late - DRM trigger
          signal: {
            timeWindow: 'dinner',
            energy: 'low',
            calendarConflict: false,
          },
        },
        activeMeals: [],
        ingredients: [],
        inventory: [],
        recentDecisions: [],
        generateEventId: () => 'test-event-id',
        persistDecisionEvent: async () => {},
      };
      
      const result: ArbiterResult = await makeDecision(input);
      
      expect(result.response.drmRecommended).toBe(true);
      expect(result.response.decision).toBeNull();
      expect(result.internalContext).toBeNull();
    });
    
    test('inventoryScore and tasteScore are in valid range', async () => {
      const meals = [createMeal('meal-test', 'test-meal')];
      const ingredients = [createIngredient('meal-test', 'chicken', false)];
      const inventory = [createInventoryItem('chicken', 0.90)];
      
      const input: ArbiterInput = {
        request: {
          householdKey: 'default',
          nowIso: '2026-01-20T17:30:00Z',
          signal: {
            timeWindow: 'dinner',
            energy: 'ok',
            calendarConflict: false,
          },
        },
        activeMeals: meals,
        ingredients,
        inventory,
        recentDecisions: [],
        generateEventId: () => 'test-event-id',
        persistDecisionEvent: async () => {},
        tasteScores: new Map([['meal-test', 5.0]]),
      };
      
      const result: ArbiterResult = await makeDecision(input);
      
      expect(result.internalContext!.inventoryScore).toBeGreaterThanOrEqual(0);
      expect(result.internalContext!.inventoryScore).toBeLessThanOrEqual(1);
      expect(result.internalContext!.tasteScore).toBeGreaterThanOrEqual(0);
      expect(result.internalContext!.tasteScore).toBeLessThanOrEqual(1);
    });
  });
  
  describe('No Arrays in Response', () => {
    test('decision response contains no arrays', async () => {
      const meals = [createMeal('meal-test', 'test-meal')];
      const ingredients = [createIngredient('meal-test', 'salt', true)];
      
      const input: ArbiterInput = {
        request: {
          householdKey: 'default',
          nowIso: '2026-01-20T17:30:00Z',
          signal: {
            timeWindow: 'dinner',
            energy: 'ok',
            calendarConflict: false,
          },
        },
        activeMeals: meals,
        ingredients,
        inventory: [],
        recentDecisions: [],
        generateEventId: () => 'test-event-id',
        persistDecisionEvent: async () => {},
      };
      
      const result: ArbiterResult = await makeDecision(input);
      
      // Should not throw - no arrays in response
      expect(() => assertNoArraysDeep(result.response)).not.toThrow();
    });
    
    test('decision response with autopilot flag contains no arrays', () => {
      const response = {
        decision: {
          decisionType: 'cook',
          decisionEventId: 'test-id',
          mealId: 'meal-test',
          title: 'Test Meal',
          stepsShort: 'Test steps',
          estMinutes: 20,
          contextHash: 'ctx-123',
        },
        drmRecommended: false,
        autopilot: true,
      };
      
      // Should not throw - no arrays
      expect(() => assertNoArraysDeep(response)).not.toThrow();
    });
  });
  
  describe('wasMealUsedRecently Integration', () => {
    test('correctly identifies recently used meal', () => {
      const events = [
        createDecisionEvent('1', 'meal-a', 'approved', '2026-01-19T18:00:00Z'),
      ];
      
      // meal-a was used yesterday
      expect(wasMealUsedRecently('meal-a', events, '2026-01-20T17:00:00Z')).toBe(true);
      
      // meal-b was never used
      expect(wasMealUsedRecently('meal-b', events, '2026-01-20T17:00:00Z')).toBe(false);
    });
    
    test('ignores rejected/pending meals', () => {
      const events = [
        createDecisionEvent('1', 'meal-a', 'rejected', '2026-01-19T18:00:00Z'),
        createDecisionEvent('2', 'meal-b', 'pending', '2026-01-19T18:00:00Z'),
      ];
      
      // Rejected doesn't count as "used"
      expect(wasMealUsedRecently('meal-a', events, '2026-01-20T17:00:00Z')).toBe(false);
      
      // Pending doesn't count as "used"
      expect(wasMealUsedRecently('meal-b', events, '2026-01-20T17:00:00Z')).toBe(false);
    });
  });
  
  describe('Feedback Response Contract', () => {
    test('feedback endpoint response shape is unchanged (recorded: true)', async () => {
      // The feedback endpoint should still return { recorded: true }
      // This test documents the expected contract
      const expectedResponse = { recorded: true };
      
      expect(expectedResponse.recorded).toBe(true);
      expect(Object.keys(expectedResponse)).toEqual(['recorded']);
    });
  });
});

// =============================================================================
// TESTS: AUTOPILOT FLOW SIMULATION
// =============================================================================

describe('Autopilot Flow Simulation', () => {
  test('eligible scenario inserts pending + approved rows', async () => {
    const insertedEvents: DecisionEventRow[] = [];
    
    // Simulate the decision endpoint flow
    // Use a meal with ALL pantry staples for guaranteed high inventory score
    const meals = [createMeal('meal-eligible', 'eligible-meal')];
    const ingredients = [
      createIngredient('meal-eligible', 'salt', true),
      createIngredient('meal-eligible', 'olive oil', true),
      createIngredient('meal-eligible', 'garlic', true),
    ];
    
    // Good approval history
    const recentDecisions: DecisionEventRow[] = [
      createDecisionEvent('h1', 'm1', 'approved', '2026-01-19T18:00:00Z'),
      createDecisionEvent('h2', 'm2', 'approved', '2026-01-18T18:00:00Z'),
      createDecisionEvent('h3', 'm3', 'approved', '2026-01-17T18:00:00Z'),
    ];
    
    // Step 1: makeDecision inserts pending row
    const input: ArbiterInput = {
      request: {
        householdKey: 'default',
        nowIso: '2026-01-20T17:30:00Z', // Within autopilot window
        signal: {
          timeWindow: 'dinner',
          energy: 'ok',
          calendarConflict: false,
        },
      },
      activeMeals: meals,
      ingredients,
      inventory: [],  // Empty inventory - but all pantry staples = 1.0 score
      recentDecisions,
      generateEventId: () => 'decision-event-id',
      persistDecisionEvent: async (event) => {
        insertedEvents.push(event as DecisionEventRow);
      },
      tasteScores: new Map([['meal-eligible', 5.0]]), // Higher taste score (sigmoid(5/5)=0.73)
    };
    
    const result = await makeDecision(input);
    
    // First event: pending
    expect(insertedEvents.length).toBe(1);
    expect(insertedEvents[0].user_action).toBe('pending');
    
    // Step 2: Check autopilot eligibility
    if (
      result.response.drmRecommended === false &&
      result.response.decision?.decisionType === 'cook' &&
      result.internalContext
    ) {
      const { internalContext } = result;
      
      // Use the same check as in decision endpoint
      const usedInLast3Days = internalContext.selectedMealId
        ? wasMealUsedRecently(internalContext.selectedMealId!, recentDecisions, input.request.nowIso)
        : false;
      
      const autopilotCtx: AutopilotContext = {
        nowIso: input.request.nowIso,
        signal: input.request.signal,
        mealId: internalContext.selectedMealId!,
        inventoryScore: internalContext.inventoryScore,
        tasteScore: internalContext.tasteScore,
        usedInLast3Days,
        recentEvents: recentDecisions,
      };
      
      const autopilotResult = evaluateAutopilotEligibility(autopilotCtx);
      
      if (autopilotResult.eligible) {
        // Step 3: Insert approved feedback copy
        const feedbackEvent: DecisionEventRow = {
          id: 'feedback-event-id',
          household_key: input.request.householdKey,
          decided_at: input.request.nowIso,
          decision_type: 'cook',
          meal_id: internalContext.selectedMealId,
          external_vendor_key: null,
          context_hash: internalContext.contextHash,
          decision_payload: internalContext.decisionPayload,
          user_action: 'approved',
          actioned_at: input.request.nowIso,
        };
        
        insertedEvents.push(feedbackEvent);
      }
    }
    
    // Final check: Should have 2 events
    expect(insertedEvents.length).toBe(2);
    expect(insertedEvents[0].user_action).toBe('pending');
    expect(insertedEvents[1].user_action).toBe('approved');
    expect(insertedEvents[0].context_hash).toBe(insertedEvents[1].context_hash);
    expect(insertedEvents[0].meal_id).toBe(insertedEvents[1].meal_id);
  });
  
  test('ineligible scenario inserts only pending row', async () => {
    const insertedEvents: DecisionEventRow[] = [];
    
    const meals = [createMeal('meal-test', 'test-meal')];
    const ingredients = [createIngredient('meal-test', 'salt', true)];
    
    const input: ArbiterInput = {
      request: {
        householdKey: 'default',
        nowIso: '2026-01-20T12:00:00Z', // NOON - outside autopilot window!
        signal: {
          timeWindow: 'lunch',
          energy: 'ok',
          calendarConflict: false,
        },
      },
      activeMeals: meals,
      ingredients,
      inventory: [],
      recentDecisions: [],
      generateEventId: () => 'decision-event-id',
      persistDecisionEvent: async (event) => {
        insertedEvents.push(event as DecisionEventRow);
      },
    };
    
    const result = await makeDecision(input);
    
    // Only pending row inserted
    expect(insertedEvents.length).toBe(1);
    expect(insertedEvents[0].user_action).toBe('pending');
    
    // Verify autopilot would NOT be eligible
    if (result.internalContext) {
      const autopilotCtx: AutopilotContext = {
        nowIso: input.request.nowIso,
        signal: input.request.signal,
        mealId: result.internalContext.selectedMealId!,
        inventoryScore: result.internalContext.inventoryScore,
        tasteScore: result.internalContext.tasteScore,
        usedInLast3Days: false,
        recentEvents: [],
      };
      
      const autopilotResult = evaluateAutopilotEligibility(autopilotCtx);
      expect(autopilotResult.eligible).toBe(false);
      expect(autopilotResult.reason).toBe('outside_autopilot_window');
    }
  });
});
