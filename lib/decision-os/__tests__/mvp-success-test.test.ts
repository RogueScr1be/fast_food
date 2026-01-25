/**
 * MVP Success Test — Per Contract
 * 
 * SUCCESS TEST (MUST PASS):
 * 1. User opens app at 5–6pm
 * 2. Taps one intent button
 * 3. Receives ONE decision
 * 4. Approves OR rejects twice
 * 5. DRM executes without asking
 * 6. Dinner happens
 */

import { decide, buildContextFromIntent } from '../arbiter';
import { 
  shouldTriggerDrm, 
  executeDrmOverride, 
  getFallbackConfig,
  DEFAULT_FALLBACK_CONFIG,
} from '../drm/fallback';
import type { 
  ArbiterInput, 
  ArbiterOutput, 
  Meal,
  FallbackConfig,
} from '../../../types/decision-os';

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
      { step: 3, instruction: 'Add sauce and simmer', duration_minutes: 5 },
      { step: 4, instruction: 'Combine and serve', duration_minutes: 2 },
    ],
  },
  {
    id: 2,
    name: 'Quick Salad',
    category: 'dinner',
    prep_time_minutes: 15,
    tags: ['salad', 'quick', 'healthy'],
    estimated_cost_cents: 600,
    difficulty: 'easy',
    mode: 'cook',
    cook_steps: [
      { step: 1, instruction: 'Chop vegetables', duration_minutes: 5 },
      { step: 2, instruction: 'Add dressing', duration_minutes: 2 },
      { step: 3, instruction: 'Toss and serve', duration_minutes: 1 },
    ],
  },
  {
    id: 3,
    name: 'Gourmet Steak',
    category: 'dinner',
    prep_time_minutes: 45,
    tags: ['steak', 'protein', 'gourmet'],
    estimated_cost_cents: 2500,
    difficulty: 'hard',
    mode: 'cook',
    cook_steps: [
      { step: 1, instruction: 'Season steak', duration_minutes: 5 },
      { step: 2, instruction: 'Sear on high heat', duration_minutes: 10 },
      { step: 3, instruction: 'Rest and slice', duration_minutes: 5 },
    ],
  },
  {
    id: 4,
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
// SUCCESS TEST 1: User opens app at 5-6pm
// =============================================================================

describe('SUCCESS TEST 1: User opens app at 5-6pm', () => {
  it('context is correctly set for dinner time (5pm)', () => {
    const context = buildContextFromIntent(
      { selected: [] },
      2000,
      17 // 5pm
    );
    
    expect(context.timeCategory).toBe('dinner');
  });
  
  it('context is correctly set for dinner time (6pm)', () => {
    const context = buildContextFromIntent(
      { selected: [] },
      2000,
      18 // 6pm
    );
    
    expect(context.timeCategory).toBe('dinner');
  });
});

// =============================================================================
// SUCCESS TEST 2: Taps one intent button
// =============================================================================

describe('SUCCESS TEST 2: Taps one intent button', () => {
  it('easy intent maps to correct constraints', () => {
    const context = buildContextFromIntent(
      { selected: ['easy'] },
      2000,
      18
    );
    
    expect(context.wantsNoCook).toBe(true);
  });
  
  it('cheap intent maps to correct constraints', () => {
    const context = buildContextFromIntent(
      { selected: ['cheap'] },
      2000,
      18
    );
    
    expect(context.wantsCheap).toBe(true);
  });
  
  it('quick intent maps to correct constraints', () => {
    const context = buildContextFromIntent(
      { selected: ['quick'] },
      2000,
      18
    );
    
    expect(context.wantsQuick).toBe(true);
  });
  
  it('no_energy intent maps to low energy level', () => {
    const context = buildContextFromIntent(
      { selected: ['no_energy'] },
      2000,
      18
    );
    
    expect(context.energyLevel).toBe('low');
    expect(context.wantsNoCook).toBe(true);
  });
});

// =============================================================================
// SUCCESS TEST 3: Receives ONE decision
// =============================================================================

describe('SUCCESS TEST 3: Receives ONE decision', () => {
  it('returns exactly one decision (not null, not array)', () => {
    const input = createArbiterInput();
    const result = decide(input, TEST_MEALS, 'test-session');
    
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(false);
    expect(typeof result).toBe('object');
  });
  
  it('decision has all required fields per contract', () => {
    const input = createArbiterInput();
    const result = decide(input, TEST_MEALS, 'test-session');
    
    expect(result).not.toBeNull();
    expect(result!.decision_id).toBeDefined();
    expect(result!.mode).toBeDefined();
    expect(result!.meal).toBeDefined();
    expect(result!.meal_id).toBeDefined();
    expect(result!.confidence).toBeDefined();
    expect(result!.estimated_time).toBeDefined();
    expect(result!.estimated_cost).toBeDefined();
    expect(result!.execution_payload).toBeDefined();
  });
  
  it('execution_payload is mandatory (never undefined)', () => {
    const input = createArbiterInput();
    const result = decide(input, TEST_MEALS, 'test-session');
    
    expect(result).not.toBeNull();
    expect(result!.execution_payload).toBeDefined();
    expect(result!.execution_payload.steps).toBeDefined();
    expect(result!.execution_payload.steps.length).toBeGreaterThan(0);
  });
  
  it('execution_payload.steps has max 7 items (Miller\'s Law)', () => {
    const input = createArbiterInput();
    const result = decide(input, TEST_MEALS, 'test-session');
    
    expect(result).not.toBeNull();
    expect(result!.execution_payload.steps.length).toBeLessThanOrEqual(7);
  });
});

// =============================================================================
// SUCCESS TEST 4: Approves OR rejects twice
// =============================================================================

describe('SUCCESS TEST 4: Approves OR rejects twice', () => {
  it('approve path: single decision is accepted', () => {
    const input = createArbiterInput();
    const result = decide(input, TEST_MEALS, 'test-session');
    
    expect(result).not.toBeNull();
    // User approves - session ends with outcome='accepted'
    // This is validated in the UI flow, here we just confirm decision exists
    expect(result!.meal).toBeDefined();
  });
  
  it('reject path: second rejection triggers DRM', () => {
    const rejectionCount = 2;
    const currentTime = '17:00'; // Before time threshold
    
    // After 2 rejections, DRM should trigger
    const { trigger, reason } = shouldTriggerDrm(
      rejectionCount,
      currentTime,
      { decision_id: 'test', mode: 'cook', meal: 'Test', meal_id: 1, confidence: 0.8, estimated_time: '25 min', estimated_cost: '$12', execution_payload: { steps: [], ingredients_needed: [], substitutions: [] } },
      false
    );
    
    expect(trigger).toBe(true);
    expect(reason).toBe('rejection_threshold');
  });
  
  it('single rejection does not trigger DRM', () => {
    const rejectionCount = 1;
    const currentTime = '17:00';
    
    const { trigger } = shouldTriggerDrm(
      rejectionCount,
      currentTime,
      { decision_id: 'test', mode: 'cook', meal: 'Test', meal_id: 1, confidence: 0.8, estimated_time: '25 min', estimated_cost: '$12', execution_payload: { steps: [], ingredients_needed: [], substitutions: [] } },
      false
    );
    
    expect(trigger).toBe(false);
  });
});

// =============================================================================
// SUCCESS TEST 5: DRM executes without asking
// =============================================================================

describe('SUCCESS TEST 5: DRM executes without asking', () => {
  it('DRM returns fallback immediately (no questions)', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const result = executeDrmOverride('test-session', fallbackConfig, 'rejection_threshold');
    
    expect(result).not.toBeNull();
    expect(result!.is_rescue).toBe(true);
    expect(result!.meal).toBeDefined();
    expect(result!.execution_payload).toBeDefined();
  });
  
  it('DRM selects first fallback (no optimization)', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const result = executeDrmOverride('test-session', fallbackConfig, 'rejection_threshold');
    
    expect(result).not.toBeNull();
    // First fallback in DEFAULT_FALLBACK_CONFIG is "Cereal with Milk"
    expect(result!.meal).toBe('Cereal with Milk');
  });
  
  it('DRM has mandatory execution_payload', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const result = executeDrmOverride('test-session', fallbackConfig, 'rejection_threshold');
    
    expect(result).not.toBeNull();
    expect(result!.execution_payload).toBeDefined();
    expect(result!.execution_payload.steps).toBeDefined();
    expect(result!.execution_payload.steps.length).toBeGreaterThan(0);
  });
  
  it('DRM confidence is always 1.0 (no hesitation)', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const result = executeDrmOverride('test-session', fallbackConfig, 'rejection_threshold');
    
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(1.0);
  });
});

// =============================================================================
// SUCCESS TEST 6: Dinner happens
// =============================================================================

describe('SUCCESS TEST 6: Dinner happens', () => {
  it('happy path: decision has actionable steps', () => {
    const input = createArbiterInput();
    const result = decide(input, TEST_MEALS, 'test-session');
    
    expect(result).not.toBeNull();
    expect(result!.execution_payload.steps.length).toBeGreaterThan(0);
    
    // Steps should be strings (actionable instructions)
    for (const step of result!.execution_payload.steps) {
      expect(typeof step).toBe('string');
      expect(step.length).toBeGreaterThan(0);
    }
  });
  
  it('rescue path: fallback has actionable instructions', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const result = executeDrmOverride('test-session', fallbackConfig, 'rejection_threshold');
    
    expect(result).not.toBeNull();
    expect(result!.execution_payload.steps.length).toBeGreaterThan(0);
    
    // Fallback instruction should be actionable
    const instruction = result!.execution_payload.steps[0];
    expect(typeof instruction).toBe('string');
    expect(instruction.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// CONTRACT ENFORCEMENT: Forbidden Behaviors
// =============================================================================

describe('CONTRACT ENFORCEMENT: Forbidden Behaviors', () => {
  it('Arbiter NEVER returns multiple options', () => {
    const input = createArbiterInput();
    const result = decide(input, TEST_MEALS, 'test-session');
    
    // Result is a single object or null, never an array
    expect(Array.isArray(result)).toBe(false);
  });
  
  it('Arbiter NEVER asks follow-up questions (no question fields)', () => {
    const input = createArbiterInput();
    const result = decide(input, TEST_MEALS, 'test-session');
    
    if (result) {
      // Should not have any question-like fields
      expect((result as any).question).toBeUndefined();
      expect((result as any).followUp).toBeUndefined();
      expect((result as any).options).toBeUndefined();
      expect((result as any).alternatives).toBeUndefined();
    }
  });
  
  it('DRM NEVER asks permission (no confirmation fields)', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const result = executeDrmOverride('test-session', fallbackConfig, 'rejection_threshold');
    
    if (result) {
      // Should not have any confirmation-like fields
      expect((result as any).confirm).toBeUndefined();
      expect((result as any).askPermission).toBeUndefined();
      expect((result as any).choices).toBeUndefined();
    }
  });
  
  it('Decision is locked (same input = same output)', () => {
    const input = createArbiterInput();
    const sessionId = 'deterministic-test';
    
    const result1 = decide(input, TEST_MEALS, sessionId);
    const result2 = decide(input, TEST_MEALS, sessionId);
    
    // Same meal should be selected (deterministic)
    expect(result1?.meal).toBe(result2?.meal);
    expect(result1?.meal_id).toBe(result2?.meal_id);
  });
});

// =============================================================================
// FULL END-TO-END FLOW
// =============================================================================

describe('FULL END-TO-END FLOW', () => {
  it('complete happy path: intent → decision → execution', () => {
    // Step 1: User at 5pm
    const context = buildContextFromIntent(
      { selected: ['easy'] },
      2000,
      17
    );
    expect(context.timeCategory).toBe('dinner');
    
    // Step 2: Get decision
    const input: ArbiterInput = {
      context,
      tasteSignals: { acceptedMeals: [], rejectedMeals: [] },
      inventoryEstimate: [],
      householdFallbacks: DEFAULT_FALLBACK_CONFIG,
    };
    
    const decision = decide(input, TEST_MEALS, 'e2e-session');
    expect(decision).not.toBeNull();
    
    // Step 3: Decision has execution payload
    expect(decision!.execution_payload.steps.length).toBeGreaterThan(0);
    
    // Success: Dinner can happen
  });
  
  it('complete rescue path: intent → reject → reject → DRM', () => {
    // Step 1: User at 5pm
    const context = buildContextFromIntent(
      { selected: [] },
      2000,
      17
    );
    
    // Step 2: Get decision
    const input: ArbiterInput = {
      context,
      tasteSignals: { acceptedMeals: [], rejectedMeals: [] },
      inventoryEstimate: [],
      householdFallbacks: DEFAULT_FALLBACK_CONFIG,
    };
    
    const decision1 = decide(input, TEST_MEALS, 'e2e-session');
    expect(decision1).not.toBeNull();
    
    // Step 3: User rejects (1)
    const rejectedInput: ArbiterInput = {
      ...input,
      tasteSignals: { acceptedMeals: [], rejectedMeals: [decision1!.meal] },
    };
    
    // Check DRM status after 1 rejection
    let { trigger } = shouldTriggerDrm(1, '17:00', decision1, false);
    expect(trigger).toBe(false);
    
    // Step 4: User rejects (2) - DRM triggers
    ({ trigger } = shouldTriggerDrm(2, '17:00', decision1, false));
    expect(trigger).toBe(true);
    
    // Step 5: DRM executes
    const rescue = executeDrmOverride('e2e-session', DEFAULT_FALLBACK_CONFIG, 'rejection_threshold');
    expect(rescue).not.toBeNull();
    expect(rescue!.is_rescue).toBe(true);
    expect(rescue!.execution_payload.steps.length).toBeGreaterThan(0);
    
    // Success: Dinner can happen via rescue
  });
});
