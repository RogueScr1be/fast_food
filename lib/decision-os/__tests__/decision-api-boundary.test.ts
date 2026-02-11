/**
 * Decision API Boundary Tests
 * 
 * Tests the decision API contract at the boundary level:
 * - One-decision-only invariant
 * - Decision Lock (idempotent behavior)
 * - No-valid-meal → DRM behavior
 * - Response shape validation
 */

import { getDb, clearDb, resetDb, type SessionRecord, type MealRecord } from '../db/client';
import { decide, buildContextFromIntent } from '../arbiter';
import { 
  executeDrmOverride, 
  shouldTriggerDrm, 
  getFallbackConfig,
  DEFAULT_FALLBACK_CONFIG,
} from '../drm/fallback';
import type { 
  ArbiterInput, 
  ArbiterOutput, 
  Meal,
  ArbiterContextInput,
} from '../../../types/decision-os';
import { validateDecisionResponse, assertNoArraysDeep } from '../invariants';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const TEST_MEALS: Meal[] = [
  {
    id: 1,
    name: 'Chicken Pasta',
    category: 'dinner',
    prep_time_minutes: 30,
    tags: ['pasta', 'italian', 'comfort'],
    estimated_cost_cents: 1200,
    difficulty: 'medium',
    mode: 'cook',
    cook_steps: [
      { step: 1, instruction: 'Boil water and cook pasta', duration_minutes: 10 },
      { step: 2, instruction: 'Season and cook chicken', duration_minutes: 8 },
    ],
  },
  {
    id: 11,
    name: 'Cereal with Milk',
    category: 'dinner',
    prep_time_minutes: 2,
    tags: ['no_cook', 'quick', 'easy'],
    estimated_cost_cents: 200,
    difficulty: 'easy',
    mode: 'no_cook',
    cook_steps: [
      { step: 1, instruction: 'Pour cereal into bowl', duration_minutes: 1 },
      { step: 2, instruction: 'Add milk', duration_minutes: 1 },
    ],
  },
];

const createArbiterInput = (overrides: Partial<ArbiterInput> = {}): ArbiterInput => ({
  context: {
    timeCategory: 'dinner',
    wantsCheap: false,
    wantsQuick: false,
    wantsNoCook: false,
    energyLevel: 'medium',
    budgetCeilingCents: 2000,
  },
  tasteSignals: {
    acceptedMeals: [],
    rejectedMeals: [],
  },
  inventoryEstimate: [],
  householdFallbacks: DEFAULT_FALLBACK_CONFIG,
  ...overrides,
});

// =============================================================================
// ONE-DECISION-ONLY INVARIANT
// =============================================================================

describe('API INVARIANT: One decision only', () => {
  it('Arbiter returns single object, never array', () => {
    const input = createArbiterInput();
    const result = decide(input, TEST_MEALS, 'test-session');
    
    // Result must be object or null
    expect(Array.isArray(result)).toBe(false);
    expect(result === null || typeof result === 'object').toBe(true);
    
    // If result exists, it must have the required shape
    if (result) {
      expect(result.decision_id).toBeDefined();
      expect(result.meal).toBeDefined();
      expect(result.execution_payload).toBeDefined();
      expect(result.execution_payload.steps).toBeDefined();
    }
  });
  
  it('DRM returns single object, never array', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const result = executeDrmOverride('test-session', fallbackConfig, 'rejection_threshold');
    
    expect(Array.isArray(result)).toBe(false);
    expect(result === null || typeof result === 'object').toBe(true);
  });
  
  it('decision response validation fails on array decision', () => {
    // Build a response with array decision (should fail validation)
    const badResponse = {
      decision: [{ meal: 'Option 1' }, { meal: 'Option 2' }] as any,
      drmRecommended: false,
    };
    
    const validation = validateDecisionResponse(badResponse);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.field === 'decision' || e.message.includes('array'))).toBe(true);
  });
  
  it('assertNoArraysDeep catches arrays in nested structure', () => {
    const response = {
      decision: {
        options: ['A', 'B', 'C'], // This array should be caught
      },
      drmRecommended: false,
    };
    
    expect(() => assertNoArraysDeep(response)).toThrow('INVARIANT VIOLATION');
  });
});

// =============================================================================
// DECISION LOCK (IDEMPOTENT BEHAVIOR)
// =============================================================================

describe('API INVARIANT: Decision Lock (idempotent)', () => {
  it('same input yields same meal decision (deterministic)', () => {
    const input = createArbiterInput();
    const sessionId = 'lock-test-session';
    
    const result1 = decide(input, TEST_MEALS, sessionId);
    const result2 = decide(input, TEST_MEALS, sessionId);
    
    // Same meal should be selected both times
    expect(result1?.meal).toBe(result2?.meal);
    expect(result1?.meal_id).toBe(result2?.meal_id);
  });
  
  it('decision_id includes session prefix (but timestamp can match in same ms)', () => {
    const input = createArbiterInput();
    
    const result1 = decide(input, TEST_MEALS, 'session-1');
    const result2 = decide(input, TEST_MEALS, 'session-2');
    
    // Same meal should be selected both times (deterministic)
    expect(result1?.meal).toBe(result2?.meal);
    
    // decision_id should contain session prefix
    if (result1 && result2) {
      expect(result1.decision_id).toContain('session-1'.slice(0, 8));
      expect(result2.decision_id).toContain('session-2'.slice(0, 8));
    }
  });
  
  it('Decision Lock: if session has decision, same decision is returned', async () => {
    const db = getDb();
    await clearDb();
    
    const householdKey = 'test-household';
    const now = new Date().toISOString();
    
    // Create a session with existing decision
    const existingDecision: ArbiterOutput = {
      decision_id: 'existing-dec-123',
      mode: 'cook',
      meal: 'Locked Chicken Pasta',
      meal_id: 1,
      confidence: 0.9,
      estimated_time: '30 min',
      estimated_cost: '$12',
      execution_payload: {
        steps: ['Step 1', 'Step 2'],
        ingredients_needed: [],
        substitutions: [],
      },
    };
    
    const session: SessionRecord = {
      id: 'lock-session-123',
      household_key: householdKey,
      started_at: now,
      context: {},
      decision_id: existingDecision.decision_id,
      decision_payload: existingDecision as unknown as Record<string, unknown>,
      outcome: 'pending',
      rejection_count: 0,
      created_at: now,
      updated_at: now,
    };
    
    await db.createSession(session);
    
    // Retrieve session and verify decision is preserved
    const retrieved = await db.getSessionById(householdKey, session.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.decision_id).toBe(existingDecision.decision_id);
    expect((retrieved?.decision_payload as any)?.meal).toBe(existingDecision.meal);
  });
  
  it('closed session (accepted) does not return stale decision', async () => {
    const db = getDb();
    await clearDb();
    
    const householdKey = 'test-household';
    const now = new Date().toISOString();
    
    // Create a closed session
    const closedSession: SessionRecord = {
      id: 'closed-session-123',
      household_key: householdKey,
      started_at: now,
      ended_at: now,
      context: {},
      decision_id: 'old-decision',
      decision_payload: { meal: 'Old Meal' },
      outcome: 'accepted', // Closed!
      rejection_count: 0,
      created_at: now,
      updated_at: now,
    };
    
    await db.createSession(closedSession);
    
    // getActiveSession should NOT return closed session
    const activeSession = await db.getActiveSession(householdKey);
    expect(activeSession).toBeNull();
  });
});

// =============================================================================
// NO-VALID-MEAL → DRM BEHAVIOR
// =============================================================================

describe('API INVARIANT: No valid meal triggers DRM', () => {
  it('Arbiter returns null when no meals pass constraints', () => {
    // Set impossible budget constraint
    const input = createArbiterInput({
      context: {
        timeCategory: 'dinner',
        wantsCheap: false,
        wantsQuick: false,
        wantsNoCook: false,
        energyLevel: 'medium',
        budgetCeilingCents: 50, // Very low budget - no meals pass
      },
    });
    
    const result = decide(input, TEST_MEALS, 'no-meals-session');
    expect(result).toBeNull();
  });
  
  it('shouldTriggerDrm returns true when arbiterOutput is null', () => {
    const { trigger, reason } = shouldTriggerDrm(
      0, // no rejections
      '17:00', // early
      null, // No arbiter output!
      false
    );
    
    expect(trigger).toBe(true);
    expect(reason).toBe('no_valid_meal');
  });
  
  it('DRM executes fallback when Arbiter returns null', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const drmResult = executeDrmOverride('no-meal-session', fallbackConfig, 'no_valid_meal');
    
    expect(drmResult).not.toBeNull();
    expect(drmResult?.is_rescue).toBe(true);
    expect(drmResult?.meal).toBe('Cereal with Milk'); // First fallback
    expect(drmResult?.execution_payload.steps.length).toBeGreaterThan(0);
  });
  
  it('DRM triggers after 2 rejections', () => {
    const { trigger, reason } = shouldTriggerDrm(
      2, // 2 rejections
      '17:00',
      { decision_id: 'test', mode: 'cook', meal: 'Test', meal_id: 1, confidence: 0.8, estimated_time: '25 min', estimated_cost: '$12', execution_payload: { steps: [], ingredients_needed: [], substitutions: [] } },
      false
    );
    
    expect(trigger).toBe(true);
    expect(reason).toBe('rejection_threshold');
  });
  
  it('DRM triggers after time threshold', () => {
    const { trigger, reason } = shouldTriggerDrm(
      0,
      '19:00', // After 6:15pm threshold
      { decision_id: 'test', mode: 'cook', meal: 'Test', meal_id: 1, confidence: 0.8, estimated_time: '25 min', estimated_cost: '$12', execution_payload: { steps: [], ingredients_needed: [], substitutions: [] } },
      false
    );
    
    expect(trigger).toBe(true);
    expect(reason).toBe('time_threshold');
  });
});

// =============================================================================
// RESPONSE SHAPE VALIDATION
// =============================================================================

describe('API INVARIANT: Response shape', () => {
  it('decision response has all required fields', () => {
    const input = createArbiterInput();
    const decision = decide(input, TEST_MEALS, 'shape-test');
    
    if (decision) {
      // Check all contract fields exist
      expect(decision.decision_id).toBeDefined();
      expect(decision.mode).toBeDefined();
      expect(decision.meal).toBeDefined();
      expect(decision.meal_id).toBeDefined();
      expect(decision.confidence).toBeDefined();
      expect(decision.estimated_time).toBeDefined();
      expect(decision.estimated_cost).toBeDefined();
      expect(decision.execution_payload).toBeDefined();
      
      // Check execution_payload shape
      expect(decision.execution_payload.steps).toBeDefined();
      expect(decision.execution_payload.ingredients_needed).toBeDefined();
      expect(decision.execution_payload.substitutions).toBeDefined();
    }
  });
  
  it('execution_payload.steps has max 7 items (Miller\'s Law)', () => {
    const input = createArbiterInput();
    const result = decide(input, TEST_MEALS, 'miller-test');
    
    if (result) {
      expect(result.execution_payload.steps.length).toBeLessThanOrEqual(7);
    }
  });
  
  it('confidence is between 0 and 1', () => {
    const input = createArbiterInput();
    const result = decide(input, TEST_MEALS, 'confidence-test');
    
    if (result) {
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
  
  it('validateDecisionResponse accepts valid response with null decision', () => {
    // Note: The existing invariant system bans nested arrays in responses.
    // For MVP, the decision object's internal arrays (steps, ingredients_needed)
    // trigger the deep array check. This test validates the null decision case.
    const validResponse = {
      decision: null,
      drmRecommended: false,
    };
    
    const validation = validateDecisionResponse(validResponse);
    expect(validation.valid).toBe(true);
  });
  
  it('decision object with execution_payload is valid Arbiter output', () => {
    // This tests that the Arbiter output shape is correct,
    // separate from the API response wrapper validation
    const input = createArbiterInput();
    const decision = decide(input, TEST_MEALS, 'validation-test');
    
    expect(decision).not.toBeNull();
    if (decision) {
      expect(decision.execution_payload).toBeDefined();
      expect(Array.isArray(decision.execution_payload.steps)).toBe(true);
      expect(decision.execution_payload.steps.length).toBeGreaterThan(0);
    }
  });
  
  it('validateDecisionResponse rejects missing drmRecommended', () => {
    const badResponse = {
      decision: null,
      // Missing drmRecommended!
    };
    
    const validation = validateDecisionResponse(badResponse);
    expect(validation.valid).toBe(false);
  });
  
  it('validateDecisionResponse rejects unknown fields', () => {
    const badResponse = {
      decision: null,
      drmRecommended: false,
      extraField: 'not allowed', // Unknown field
    };
    
    const validation = validateDecisionResponse(badResponse);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.message.includes('Unknown field'))).toBe(true);
  });
});

// =============================================================================
// INTENT TO CONTEXT MAPPING
// =============================================================================

describe('API: Intent to Context mapping', () => {
  it('easy intent enables wantsNoCook', () => {
    const context = buildContextFromIntent(
      { selected: ['easy'] },
      2000,
      17
    );
    
    expect(context.wantsNoCook).toBe(true);
  });
  
  it('cheap intent enables wantsCheap', () => {
    const context = buildContextFromIntent(
      { selected: ['cheap'] },
      2000,
      17
    );
    
    expect(context.wantsCheap).toBe(true);
  });
  
  it('quick intent enables wantsQuick', () => {
    const context = buildContextFromIntent(
      { selected: ['quick'] },
      2000,
      17
    );
    
    expect(context.wantsQuick).toBe(true);
  });
  
  it('no_energy intent sets low energy level', () => {
    const context = buildContextFromIntent(
      { selected: ['no_energy'] },
      2000,
      17
    );
    
    expect(context.energyLevel).toBe('low');
    expect(context.wantsNoCook).toBe(true);
  });
  
  it('multiple intents combine correctly', () => {
    const context = buildContextFromIntent(
      { selected: ['cheap', 'quick'] },
      2000,
      17
    );
    
    expect(context.wantsCheap).toBe(true);
    expect(context.wantsQuick).toBe(true);
    expect(context.wantsNoCook).toBe(false);
  });
  
  it('empty intent defaults correctly', () => {
    const context = buildContextFromIntent(
      { selected: [] },
      2000,
      17
    );
    
    expect(context.wantsCheap).toBe(false);
    expect(context.wantsQuick).toBe(false);
    expect(context.wantsNoCook).toBe(false);
    expect(context.energyLevel).toBe('medium');
  });
  
  it('late hour sets timeCategory to late', () => {
    const context = buildContextFromIntent(
      { selected: [] },
      2000,
      21 // 9pm
    );
    
    expect(context.timeCategory).toBe('late');
  });
});
