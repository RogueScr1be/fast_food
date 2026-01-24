/**
 * Decision Arbiter Tests
 * 
 * Verifies contract compliance:
 * 1. Exactly ONE decision per session
 * 2. ZERO user questions
 * 3. ZERO alternative options
 * 4. Execution payload is mandatory
 * 5. DRM can override without appeal
 */

import {
  decide,
  isExecutable,
  isRejectionImmune,
  getTasteSafetyScore,
  satisfiesConstraints,
  sortCandidates,
  buildContextFromIntent,
  passesTimePressureGate,
  calculateTimePressure,
} from '../arbiter';
import type {
  ArbiterInput,
  ArbiterContextInput,
  Meal,
} from '../../../types/decision-os';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createMeal = (overrides: Partial<Meal> = {}): Meal => ({
  id: 1,
  name: 'Test Meal',
  category: 'dinner',
  prep_time_minutes: 25,
  tags: ['test'],
  estimated_cost_cents: 1000,
  difficulty: 'medium',
  mode: 'cook',
  cook_steps: [
    { step: 1, instruction: 'Do step 1', duration_minutes: 10 },
    { step: 2, instruction: 'Do step 2', duration_minutes: 15 },
  ],
  ...overrides,
});

const createContext = (overrides: Partial<ArbiterContextInput> = {}): ArbiterContextInput => ({
  timeCategory: 'dinner',
  wantsCheap: false,
  wantsQuick: false,
  wantsNoCook: false,
  energyLevel: 'medium',
  budgetCeilingCents: 2000,
  ...overrides,
});

const createInput = (overrides: Partial<ArbiterInput> = {}): ArbiterInput => ({
  context: createContext(),
  tasteSignals: {
    acceptedMeals: [],
    rejectedMeals: [],
  },
  inventoryEstimate: [],
  householdFallbacks: {
    hierarchy: [],
    drm_time_threshold: '18:15',
    rejection_threshold: 2,
  },
  ...overrides,
});

// =============================================================================
// RULE 1: EXECUTABILITY GATE
// =============================================================================

describe('RULE 1: Executability Gate', () => {
  it('passes meal within time window', () => {
    const meal = createMeal({ prep_time_minutes: 30 });
    const context = createContext();
    const inventory = new Map<string, number>();
    
    expect(isExecutable(meal, context, inventory)).toBe(true);
  });
  
  it('rejects meal exceeding time window (60 min)', () => {
    const meal = createMeal({ prep_time_minutes: 90 });
    const context = createContext();
    const inventory = new Map<string, number>();
    
    expect(isExecutable(meal, context, inventory)).toBe(false);
  });
  
  it('passes meal within budget', () => {
    const meal = createMeal({ estimated_cost_cents: 1500 });
    const context = createContext({ budgetCeilingCents: 2000 });
    const inventory = new Map<string, number>();
    
    expect(isExecutable(meal, context, inventory)).toBe(true);
  });
  
  it('rejects meal exceeding budget ceiling', () => {
    const meal = createMeal({ estimated_cost_cents: 2500 });
    const context = createContext({ budgetCeilingCents: 2000 });
    const inventory = new Map<string, number>();
    
    expect(isExecutable(meal, context, inventory)).toBe(false);
  });
});

// =============================================================================
// RULE 2: REJECTION IMMUNITY
// =============================================================================

describe('RULE 2: Rejection Immunity', () => {
  it('passes meal not in rejected list', () => {
    const meal = createMeal({ name: 'Good Meal' });
    
    expect(isRejectionImmune(meal, ['Bad Meal'])).toBe(false);
  });
  
  it('rejects meal in rejected list', () => {
    const meal = createMeal({ name: 'Bad Meal' });
    
    expect(isRejectionImmune(meal, ['Bad Meal'])).toBe(true);
  });
  
  it('rejects meal that triggered DRM recently', () => {
    const meal = createMeal({ id: 5 });
    
    expect(isRejectionImmune(meal, [], [5, 6, 7])).toBe(true);
  });
  
  it('passes meal not in DRM history', () => {
    const meal = createMeal({ id: 1 });
    
    expect(isRejectionImmune(meal, [], [5, 6, 7])).toBe(false);
  });
});

// =============================================================================
// RULE 3: TASTE SAFETY
// =============================================================================

describe('RULE 3: Taste Safety', () => {
  it('returns 2 for meal in acceptedMeals (known safe)', () => {
    const meal = createMeal({ name: 'Favorite Meal' });
    const acceptedTags = new Set<string>();
    
    expect(getTasteSafetyScore(meal, ['Favorite Meal'], acceptedTags)).toBe(2);
  });
  
  it('returns 1 for meal sharing tags with accepted meals', () => {
    const meal = createMeal({ name: 'New Meal', tags: ['italian', 'pasta'] });
    const acceptedTags = new Set(['italian', 'comfort']);
    
    expect(getTasteSafetyScore(meal, [], acceptedTags)).toBe(1);
  });
  
  it('returns 0 for novel meal (penalty)', () => {
    const meal = createMeal({ name: 'Novel Meal', tags: ['exotic'] });
    const acceptedTags = new Set(['italian']);
    
    expect(getTasteSafetyScore(meal, [], acceptedTags)).toBe(0);
  });
});

// =============================================================================
// RULE 4: CONSTRAINT SATISFACTION (BOOLEAN ONLY)
// =============================================================================

describe('RULE 4: Constraint Satisfaction', () => {
  it('passes when no constraints active', () => {
    const meal = createMeal({ estimated_cost_cents: 1500, prep_time_minutes: 45 });
    const context = createContext();
    
    expect(satisfiesConstraints(meal, context)).toBe(true);
  });
  
  describe('wantsCheap', () => {
    it('passes cheap meal when wantsCheap', () => {
      const meal = createMeal({ estimated_cost_cents: 1000 });
      const context = createContext({ wantsCheap: true });
      
      expect(satisfiesConstraints(meal, context, 1200)).toBe(true);
    });
    
    it('fails expensive meal when wantsCheap', () => {
      const meal = createMeal({ estimated_cost_cents: 1500 });
      const context = createContext({ wantsCheap: true });
      
      expect(satisfiesConstraints(meal, context, 1200)).toBe(false);
    });
  });
  
  describe('wantsQuick', () => {
    it('passes quick meal (≤30 min) when wantsQuick', () => {
      const meal = createMeal({ prep_time_minutes: 25 });
      const context = createContext({ wantsQuick: true });
      
      expect(satisfiesConstraints(meal, context)).toBe(true);
    });
    
    it('fails slow meal (>30 min) when wantsQuick', () => {
      const meal = createMeal({ prep_time_minutes: 45 });
      const context = createContext({ wantsQuick: true });
      
      expect(satisfiesConstraints(meal, context)).toBe(false);
    });
  });
  
  describe('wantsNoCook', () => {
    it('passes no_cook meal when wantsNoCook', () => {
      const meal = createMeal({ mode: 'no_cook' });
      const context = createContext({ wantsNoCook: true });
      
      expect(satisfiesConstraints(meal, context)).toBe(true);
    });
    
    it('fails cook meal when wantsNoCook', () => {
      const meal = createMeal({ mode: 'cook' });
      const context = createContext({ wantsNoCook: true });
      
      expect(satisfiesConstraints(meal, context)).toBe(false);
    });
  });
  
  describe('low energy', () => {
    it('passes easy meal when low energy', () => {
      const meal = createMeal({ difficulty: 'easy' });
      const context = createContext({ energyLevel: 'low' });
      
      expect(satisfiesConstraints(meal, context)).toBe(true);
    });
    
    it('fails hard meal when low energy', () => {
      const meal = createMeal({ difficulty: 'hard' });
      const context = createContext({ energyLevel: 'low' });
      
      expect(satisfiesConstraints(meal, context)).toBe(false);
    });
  });
});

// =============================================================================
// RULE 5: DEFAULT SELECTION (DETERMINISTIC)
// =============================================================================

describe('RULE 5: Default Selection', () => {
  it('sorts by taste safety (known-safe first)', () => {
    const candidates = [
      { meal: createMeal({ id: 1 }), tasteSafety: 0 },
      { meal: createMeal({ id: 2 }), tasteSafety: 2 },
      { meal: createMeal({ id: 3 }), tasteSafety: 1 },
    ];
    
    const sorted = sortCandidates(candidates);
    
    expect(sorted[0].tasteSafety).toBe(2);
    expect(sorted[1].tasteSafety).toBe(1);
    expect(sorted[2].tasteSafety).toBe(0);
  });
  
  it('sorts by difficulty when taste safety equal (easy first)', () => {
    const candidates = [
      { meal: createMeal({ id: 1, difficulty: 'hard' }), tasteSafety: 1 },
      { meal: createMeal({ id: 2, difficulty: 'easy' }), tasteSafety: 1 },
      { meal: createMeal({ id: 3, difficulty: 'medium' }), tasteSafety: 1 },
    ];
    
    const sorted = sortCandidates(candidates);
    
    expect(sorted[0].meal.difficulty).toBe('easy');
    expect(sorted[1].meal.difficulty).toBe('medium');
    expect(sorted[2].meal.difficulty).toBe('hard');
  });
  
  it('sorts by prep time when taste and difficulty equal (faster first)', () => {
    const candidates = [
      { meal: createMeal({ id: 1, difficulty: 'easy', prep_time_minutes: 30 }), tasteSafety: 1 },
      { meal: createMeal({ id: 2, difficulty: 'easy', prep_time_minutes: 15 }), tasteSafety: 1 },
      { meal: createMeal({ id: 3, difficulty: 'easy', prep_time_minutes: 45 }), tasteSafety: 1 },
    ];
    
    const sorted = sortCandidates(candidates);
    
    expect(sorted[0].meal.prep_time_minutes).toBe(15);
    expect(sorted[1].meal.prep_time_minutes).toBe(30);
    expect(sorted[2].meal.prep_time_minutes).toBe(45);
  });
  
  it('uses meal ID as deterministic tie-breaker', () => {
    const candidates = [
      { meal: createMeal({ id: 5, difficulty: 'easy', prep_time_minutes: 20 }), tasteSafety: 1 },
      { meal: createMeal({ id: 2, difficulty: 'easy', prep_time_minutes: 20 }), tasteSafety: 1 },
      { meal: createMeal({ id: 8, difficulty: 'easy', prep_time_minutes: 20 }), tasteSafety: 1 },
    ];
    
    const sorted = sortCandidates(candidates);
    
    expect(sorted[0].meal.id).toBe(2);
    expect(sorted[1].meal.id).toBe(5);
    expect(sorted[2].meal.id).toBe(8);
  });
});

// =============================================================================
// MAIN ARBITER FUNCTION
// =============================================================================

describe('decide() - Main Arbiter', () => {
  const testMeals: Meal[] = [
    createMeal({ id: 1, name: 'Chicken Pasta', estimated_cost_cents: 1200, prep_time_minutes: 30, difficulty: 'medium' }),
    createMeal({ id: 2, name: 'Quick Salad', estimated_cost_cents: 600, prep_time_minutes: 15, difficulty: 'easy' }),
    createMeal({ id: 3, name: 'Gourmet Steak', estimated_cost_cents: 2500, prep_time_minutes: 45, difficulty: 'hard' }),
  ];
  
  it('returns exactly ONE decision', () => {
    const input = createInput();
    const result = decide(input, testMeals, 'test-session');
    
    expect(result).not.toBeNull();
    // Verify it's a single object, not an array
    expect(Array.isArray(result)).toBe(false);
  });
  
  it('returns null when no meals pass rules (triggers DRM)', () => {
    const input = createInput({
      context: createContext({ budgetCeilingCents: 100 }), // Very low budget
    });
    
    const result = decide(input, testMeals, 'test-session');
    
    expect(result).toBeNull();
  });
  
  it('execution payload is mandatory (never undefined)', () => {
    const input = createInput();
    const result = decide(input, testMeals, 'test-session');
    
    expect(result).not.toBeNull();
    expect(result!.execution_payload).toBeDefined();
    expect(result!.execution_payload.steps).toBeDefined();
    expect(Array.isArray(result!.execution_payload.steps)).toBe(true);
  });
  
  it('respects rejection immunity', () => {
    const input = createInput({
      tasteSignals: {
        acceptedMeals: [],
        rejectedMeals: ['Chicken Pasta', 'Quick Salad'],
      },
    });
    
    const result = decide(input, testMeals, 'test-session');
    
    // Should return Gourmet Steak if budget allows, or null
    // With default 2000 budget ceiling, Gourmet Steak (2500) is too expensive
    // So result should be null
    expect(result).toBeNull();
  });
  
  it('respects budget constraint', () => {
    const input = createInput({
      context: createContext({ budgetCeilingCents: 1000 }),
    });
    
    const result = decide(input, testMeals, 'test-session');
    
    // Only Quick Salad (600) fits budget
    expect(result).not.toBeNull();
    expect(result!.meal).toBe('Quick Salad');
  });
  
  it('prefers known-safe meals (taste safety)', () => {
    const input = createInput({
      tasteSignals: {
        acceptedMeals: ['Quick Salad'],
        rejectedMeals: [],
      },
    });
    
    const result = decide(input, testMeals, 'test-session');
    
    // Quick Salad is known-safe, should be selected
    expect(result).not.toBeNull();
    expect(result!.meal).toBe('Quick Salad');
  });
  
  it('output shape matches contract', () => {
    const input = createInput();
    const result = decide(input, testMeals, 'test-session');
    
    expect(result).not.toBeNull();
    
    // Verify all required fields per contract
    expect(typeof result!.decision_id).toBe('string');
    expect(['cook', 'pickup', 'delivery', 'no_cook']).toContain(result!.mode);
    expect(typeof result!.meal).toBe('string');
    expect(typeof result!.meal_id).toBe('number');
    expect(typeof result!.confidence).toBe('number');
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
    expect(typeof result!.estimated_time).toBe('string');
    expect(typeof result!.estimated_cost).toBe('string');
    expect(result!.execution_payload).toBeDefined();
  });
});

// =============================================================================
// CONTEXT BUILDER
// =============================================================================

describe('buildContextFromIntent', () => {
  it('maps "cheap" intent to wantsCheap', () => {
    const context = buildContextFromIntent(
      { selected: ['cheap'] },
      2000,
      18
    );
    
    expect(context.wantsCheap).toBe(true);
    expect(context.wantsQuick).toBe(false);
  });
  
  it('maps "quick" intent to wantsQuick', () => {
    const context = buildContextFromIntent(
      { selected: ['quick'] },
      2000,
      18
    );
    
    expect(context.wantsQuick).toBe(true);
  });
  
  it('maps "no_energy" intent to wantsNoCook and low energy', () => {
    const context = buildContextFromIntent(
      { selected: ['no_energy'] },
      2000,
      18
    );
    
    expect(context.wantsNoCook).toBe(true);
    expect(context.energyLevel).toBe('low');
  });
  
  it('sets timeCategory to "late" after 8pm', () => {
    const context = buildContextFromIntent(
      { selected: [] },
      2000,
      21 // 9pm
    );
    
    expect(context.timeCategory).toBe('late');
  });
  
  it('sets timeCategory to "dinner" before 8pm', () => {
    const context = buildContextFromIntent(
      { selected: [] },
      2000,
      18 // 6pm
    );
    
    expect(context.timeCategory).toBe('dinner');
  });
  
  // Time Pressure Tests (Phase 7)
  it('sets timePressure to "high" at 18:00 or later', () => {
    const context = buildContextFromIntent(
      { selected: [] },
      2000,
      18 // 6pm
    );
    
    expect(context.timePressure).toBe('high');
  });
  
  it('sets timePressure to "normal" before 18:00', () => {
    const context = buildContextFromIntent(
      { selected: [] },
      2000,
      17 // 5pm
    );
    
    expect(context.timePressure).toBe('normal');
  });
  
  it('sets timePressure to "high" at 19:00', () => {
    const context = buildContextFromIntent(
      { selected: [] },
      2000,
      19 // 7pm
    );
    
    expect(context.timePressure).toBe('high');
  });
});

// =============================================================================
// TIME PRESSURE GATE TESTS (Phase 7)
// =============================================================================

describe('Time Pressure Gate', () => {
  it('normal pressure allows all meals', () => {
    const meal = createMeal({ prep_time_minutes: 45, difficulty: 'hard' });
    expect(passesTimePressureGate(meal, 'normal')).toBe(true);
  });
  
  it('undefined pressure allows all meals', () => {
    const meal = createMeal({ prep_time_minutes: 45, difficulty: 'hard' });
    expect(passesTimePressureGate(meal, undefined)).toBe(true);
  });
  
  it('high pressure discards meals with prep > 25 min', () => {
    const longPrepMeal = createMeal({ prep_time_minutes: 30 });
    expect(passesTimePressureGate(longPrepMeal, 'high')).toBe(false);
  });
  
  it('high pressure allows meals with prep <= 25 min', () => {
    const shortPrepMeal = createMeal({ prep_time_minutes: 25, difficulty: 'medium' });
    expect(passesTimePressureGate(shortPrepMeal, 'high')).toBe(true);
  });
  
  it('high pressure discards hard difficulty meals', () => {
    const hardMeal = createMeal({ prep_time_minutes: 20, difficulty: 'hard' });
    expect(passesTimePressureGate(hardMeal, 'high')).toBe(false);
  });
  
  it('high pressure allows easy and medium difficulty meals', () => {
    const easyMeal = createMeal({ prep_time_minutes: 15, difficulty: 'easy' });
    const mediumMeal = createMeal({ prep_time_minutes: 20, difficulty: 'medium' });
    
    expect(passesTimePressureGate(easyMeal, 'high')).toBe(true);
    expect(passesTimePressureGate(mediumMeal, 'high')).toBe(true);
  });
});

describe('Calculate Time Pressure', () => {
  it('returns "high" at hour 18', () => {
    expect(calculateTimePressure(18)).toBe('high');
  });
  
  it('returns "high" at hour 19', () => {
    expect(calculateTimePressure(19)).toBe('high');
  });
  
  it('returns "high" at hour 23', () => {
    expect(calculateTimePressure(23)).toBe('high');
  });
  
  it('returns "normal" at hour 17', () => {
    expect(calculateTimePressure(17)).toBe('normal');
  });
  
  it('returns "normal" at hour 12', () => {
    expect(calculateTimePressure(12)).toBe('normal');
  });
  
  it('returns "normal" at hour 0', () => {
    expect(calculateTimePressure(0)).toBe('normal');
  });
});
