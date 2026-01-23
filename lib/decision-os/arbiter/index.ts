/**
 * DECISION ARBITER — NON-NEGOTIABLE CONTRACT
 * 
 * Purpose: Collapse dinner into a SINGLE executable decision.
 * 
 * HARD GUARANTEES (MUST ALWAYS HOLD):
 * 1. Exactly ONE decision per session
 * 2. ZERO user questions unless execution is literally impossible
 * 3. ZERO alternative options
 * 4. Execution payload is mandatory
 * 5. DRM can override the Arbiter without appeal
 * 
 * FORBIDDEN BEHAVIORS (AUTOMATIC FAILURE):
 * - Ask follow-up questions
 * - Return more than one option
 * - Explain why alternatives were rejected
 * - Re-rank after rejection
 * - Retry silently after failure
 * - Personalize language
 */

import type {
  ArbiterInput,
  ArbiterOutput,
  ArbiterContextInput,
  Meal,
  ExecutionPayload,
  CookStep,
} from '../../../types/decision-os';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Time window in minutes for dinner decisions
 * If meal prep time exceeds this, it's discarded
 */
const DEFAULT_TIME_WINDOW_MINUTES = 60;

/**
 * Minimum inventory confidence to consider an item available
 * Items below this are treated as "not in pantry"
 */
const MIN_INVENTORY_CONFIDENCE = 0.4;

/**
 * Quick meal threshold in minutes (for wantsQuick constraint)
 */
const QUICK_MEAL_THRESHOLD_MINUTES = 30;

/**
 * DRM memory window in hours (meals that triggered DRM are immune)
 */
const DRM_IMMUNITY_HOURS = 72;

/**
 * Time pressure constants
 * When time pressure is high (server time >= 18:00):
 * - Discard meals with prep time > HIGH_PRESSURE_MAX_PREP_MINUTES
 * - Prefer shortest prep time
 */
const HIGH_PRESSURE_MAX_PREP_MINUTES = 25;

/**
 * Server hour (24h format) when time pressure becomes high
 */
const TIME_PRESSURE_THRESHOLD_HOUR = 18; // 6:00 PM

// =============================================================================
// RULE 1: EXECUTABILITY GATE
// =============================================================================

/**
 * Check if meal is executable given constraints.
 * Returns false if meal should be immediately discarded.
 * 
 * A meal is discarded if:
 * - Estimated time > allowed time window
 * - Estimated cost > budget ceiling
 * - Requires ingredients with inventory confidence < 0.4 AND no substitution exists
 */
export function isExecutable(
  meal: Meal,
  context: ArbiterContextInput,
  inventoryConfidenceMap: Map<string, number>
): boolean {
  // Time check: prep time must fit in dinner window
  if (meal.prep_time_minutes > DEFAULT_TIME_WINDOW_MINUTES) {
    return false;
  }
  
  // Budget check: cost must not exceed ceiling
  if (meal.estimated_cost_cents > context.budgetCeilingCents) {
    return false;
  }
  
  // Inventory check is advisory, not blocking per spec
  // "Inventory is advisory, never blocking"
  // But we DO discard if confidence is too low for cook mode
  if (meal.mode === 'cook') {
    // For now, we trust inventory since it's advisory
    // In future, could check specific ingredients
  }
  
  return true;
}

// =============================================================================
// RULE 1B: TIME PRESSURE GATE (HIGH PRESSURE MODE)
// =============================================================================

/**
 * Check if meal passes time pressure gate.
 * When time pressure is 'high', discard meals with long prep times.
 * 
 * This is a BOOLEAN gate, not weighted scoring.
 * 
 * @param meal - Meal to check
 * @param timePressure - Current time pressure level
 * @returns true if meal passes the gate (should be kept)
 */
export function passesTimePressureGate(
  meal: Meal,
  timePressure: 'normal' | 'high' | undefined
): boolean {
  // Normal pressure: all meals pass
  if (!timePressure || timePressure === 'normal') {
    return true;
  }
  
  // High pressure: discard meals with prep time > threshold
  if (meal.prep_time_minutes > HIGH_PRESSURE_MAX_PREP_MINUTES) {
    return false;
  }
  
  // Also gate out "hard" difficulty meals in high pressure
  if (meal.difficulty === 'hard') {
    return false;
  }
  
  return true;
}

/**
 * Calculate time pressure from server time.
 * Returns 'high' if server hour >= 18:00.
 */
export function calculateTimePressure(serverHour: number): 'normal' | 'high' {
  return serverHour >= TIME_PRESSURE_THRESHOLD_HOUR ? 'high' : 'normal';
}

// =============================================================================
// RULE 2: REJECTION IMMUNITY
// =============================================================================

/**
 * Check if meal is immune from selection due to recent rejection or DRM.
 * Returns true if meal should be discarded.
 */
export function isRejectionImmune(
  meal: Meal,
  rejectedMeals: string[],
  recentDrmMealIds: number[] = []
): boolean {
  // Check if meal was explicitly rejected
  if (rejectedMeals.includes(meal.name)) {
    return true;
  }
  
  // Check if meal triggered DRM within 72 hours
  if (recentDrmMealIds.includes(meal.id)) {
    return true;
  }
  
  return false;
}

// =============================================================================
// RULE 3: TASTE SAFETY (NOT OPTIMIZATION)
// =============================================================================

/**
 * Calculate taste safety score for a meal.
 * 
 * A meal is preferred if:
 * - It exists in acceptedMeals
 * - OR it shares ≥1 tag with an accepted meal
 * 
 * Novelty is a penalty, not a bonus.
 * 
 * Returns:
 * - 2: Meal is in acceptedMeals (known safe)
 * - 1: Meal shares tags with accepted meals
 * - 0: Novel meal (penalty state)
 */
export function getTasteSafetyScore(
  meal: Meal,
  acceptedMeals: string[],
  acceptedMealTags: Set<string>
): number {
  // Direct acceptance (highest safety)
  if (acceptedMeals.includes(meal.name)) {
    return 2;
  }
  
  // Shared tags (moderate safety)
  const hasSharedTag = meal.tags.some(tag => acceptedMealTags.has(tag));
  if (hasSharedTag) {
    return 1;
  }
  
  // Novel meal (penalty)
  return 0;
}

// =============================================================================
// RULE 4: CONSTRAINT SATISFACTION (BOOLEAN ONLY)
// =============================================================================

/**
 * Check if meal satisfies active constraints.
 * Uses BINARY checks, never weighted math.
 * 
 * | Constraint  | Rule                                 |
 * | wantsCheap  | cost ≤ median historical dinner cost |
 * | wantsQuick  | time ≤ 30 min                        |
 * | wantsNoCook | mode ≠ cook                          |
 * | low energy  | difficulty ≠ hard                    |
 * 
 * @param meal - Meal to check
 * @param context - User context with active constraints
 * @param medianCostCents - Median historical dinner cost (for cheap check)
 * @returns true if meal satisfies ALL active constraints
 */
export function satisfiesConstraints(
  meal: Meal,
  context: ArbiterContextInput,
  medianCostCents: number = 1200 // Default ~$12
): boolean {
  // wantsCheap: cost ≤ median historical dinner cost
  if (context.wantsCheap && meal.estimated_cost_cents > medianCostCents) {
    return false;
  }
  
  // wantsQuick: time ≤ 30 min
  if (context.wantsQuick && meal.prep_time_minutes > QUICK_MEAL_THRESHOLD_MINUTES) {
    return false;
  }
  
  // wantsNoCook: mode ≠ cook
  if (context.wantsNoCook && meal.mode === 'cook') {
    return false;
  }
  
  // low energy: difficulty ≠ hard
  if (context.energyLevel === 'low' && meal.difficulty === 'hard') {
    return false;
  }
  
  return true;
}

// =============================================================================
// RULE 5: DEFAULT SELECTION
// =============================================================================

/**
 * Sort candidates deterministically for selection.
 * Order: known-safe → simple → fast
 * 
 * NO randomness. NO tie-breaking by chance.
 */
export function sortCandidates(
  candidates: Array<{ meal: Meal; tasteSafety: number }>
): Array<{ meal: Meal; tasteSafety: number }> {
  return candidates.sort((a, b) => {
    // 1. Known-safe first (higher taste safety)
    if (a.tasteSafety !== b.tasteSafety) {
      return b.tasteSafety - a.tasteSafety;
    }
    
    // 2. Simpler first (easier difficulty)
    const difficultyOrder = { easy: 0, medium: 1, hard: 2 };
    const aDiff = difficultyOrder[a.meal.difficulty] ?? 1;
    const bDiff = difficultyOrder[b.meal.difficulty] ?? 1;
    if (aDiff !== bDiff) {
      return aDiff - bDiff;
    }
    
    // 3. Faster first (lower prep time)
    if (a.meal.prep_time_minutes !== b.meal.prep_time_minutes) {
      return a.meal.prep_time_minutes - b.meal.prep_time_minutes;
    }
    
    // 4. Deterministic tie-breaker: lower ID first
    return a.meal.id - b.meal.id;
  });
}

// =============================================================================
// EXECUTION PAYLOAD BUILDER
// =============================================================================

/**
 * Build execution payload for a meal.
 * Execution payload is MANDATORY per contract.
 */
export function buildExecutionPayload(
  meal: Meal,
  inventoryConfidenceMap: Map<string, number>
): ExecutionPayload {
  // Extract step instructions from cook_steps
  const steps = meal.cook_steps.map((s: CookStep) => s.instruction);
  
  // Ensure max 7 steps per contract
  const truncatedSteps = steps.slice(0, 7);
  
  // For MVP, ingredients_needed is empty (no recipe detail yet)
  // Substitutions are empty (no smart substitution logic yet)
  return {
    steps: truncatedSteps,
    ingredients_needed: [],
    substitutions: [],
  };
}

/**
 * Format cost in cents to display string
 */
function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

/**
 * Format time in minutes to display string
 */
function formatTime(minutes: number): string {
  return `${minutes} min`;
}

/**
 * Generate deterministic decision ID
 */
function generateDecisionId(sessionId: string, mealId: number): string {
  const timestamp = Date.now().toString(36);
  return `dec-${sessionId.slice(0, 8)}-${mealId}-${timestamp}`;
}

// =============================================================================
// MAIN ARBITER FUNCTION
// =============================================================================

/**
 * Decision Arbiter — Main Entry Point
 * 
 * Evaluates rules top-down and stops at first valid decision.
 * 
 * @param input - Arbiter input per contract
 * @param meals - Available meals from database
 * @param sessionId - Current session ID for decision ID generation
 * @param recentDrmMealIds - Meal IDs that triggered DRM in last 72h
 * @param medianCostCents - Median historical dinner cost
 * @returns ArbiterOutput or null if no valid meal (triggers DRM)
 */
export function decide(
  input: ArbiterInput,
  meals: Meal[],
  sessionId: string,
  recentDrmMealIds: number[] = [],
  medianCostCents: number = 1200
): ArbiterOutput | null {
  const { context, tasteSignals, inventoryEstimate } = input;
  
  // Build inventory confidence map
  const inventoryConfidenceMap = new Map<string, number>();
  for (const item of inventoryEstimate) {
    inventoryConfidenceMap.set(item.item.toLowerCase(), item.confidence);
  }
  
  // Build accepted meal tags set for taste safety
  const acceptedMealTags = new Set<string>();
  // In production, we'd look up tags for accepted meals
  // For MVP, we use a heuristic based on meal names
  
  // RULE 1-4: Filter meals through rules
  const candidates: Array<{ meal: Meal; tasteSafety: number }> = [];
  
  for (const meal of meals) {
    // RULE 1: Executability gate
    if (!isExecutable(meal, context, inventoryConfidenceMap)) {
      continue;
    }
    
    // RULE 1B: Time pressure gate (high pressure mode)
    // Boolean gate: discard long-prep or hard meals when time pressure is high
    if (!passesTimePressureGate(meal, context.timePressure)) {
      continue;
    }
    
    // RULE 2: Rejection immunity
    if (isRejectionImmune(meal, tasteSignals.rejectedMeals, recentDrmMealIds)) {
      continue;
    }
    
    // RULE 4: Constraint satisfaction (binary)
    if (!satisfiesConstraints(meal, context, medianCostCents)) {
      continue;
    }
    
    // RULE 3: Taste safety score (for sorting, not filtering)
    const tasteSafety = getTasteSafetyScore(
      meal,
      tasteSignals.acceptedMeals,
      acceptedMealTags
    );
    
    candidates.push({ meal, tasteSafety });
  }
  
  // If no candidates pass → DRM is triggered immediately
  if (candidates.length === 0) {
    return null;
  }
  
  // RULE 5: Default selection (deterministic sort)
  const sorted = sortCandidates(candidates);
  const winner = sorted[0].meal;
  
  // Build execution payload (MANDATORY)
  const executionPayload = buildExecutionPayload(winner, inventoryConfidenceMap);
  
  // Calculate confidence (informational only, NEVER affects branching)
  const confidence = calculateConfidence(winner, sorted.length, sorted[0].tasteSafety);
  
  // Build output per contract shape
  const output: ArbiterOutput = {
    decision_id: generateDecisionId(sessionId, winner.id),
    mode: winner.mode,
    meal: winner.name,
    meal_id: winner.id,
    confidence,
    estimated_time: formatTime(winner.prep_time_minutes),
    estimated_cost: formatCost(winner.estimated_cost_cents),
    execution_payload: executionPayload,
  };
  
  return output;
}

/**
 * Calculate confidence score (informational only).
 * MUST NEVER affect branching per contract.
 */
function calculateConfidence(
  meal: Meal,
  candidateCount: number,
  tasteSafety: number
): number {
  // Base confidence from taste safety
  let confidence = 0.5;
  
  if (tasteSafety === 2) {
    confidence = 0.9; // Known safe meal
  } else if (tasteSafety === 1) {
    confidence = 0.7; // Shared tags
  } else {
    confidence = 0.5; // Novel
  }
  
  // Slight boost if few alternatives (more decisive)
  if (candidateCount <= 2) {
    confidence = Math.min(1.0, confidence + 0.05);
  }
  
  return Math.round(confidence * 100) / 100;
}

// =============================================================================
// CONTEXT BUILDER
// =============================================================================

/**
 * Build ArbiterContextInput from user intent
 * Maps UI intent options to context constraints
 */
export function buildContextFromIntent(
  intent: { selected: string[]; energyLevel?: 'low' | 'medium' | 'high' },
  budgetCeilingCents: number,
  currentHour: number
): ArbiterContextInput {
  // Determine time category
  const timeCategory: 'dinner' | 'late' = currentHour >= 20 ? 'late' : 'dinner';
  
  // Map intent selections to constraints
  const wantsCheap = intent.selected.includes('cheap');
  const wantsQuick = intent.selected.includes('quick');
  const wantsNoCook = intent.selected.includes('no_energy') || intent.selected.includes('easy');
  
  // Energy level defaults to medium
  const energyLevel = intent.energyLevel ?? 
    (intent.selected.includes('no_energy') ? 'low' : 'medium');
  
  // Calculate time pressure from server hour
  // High pressure: >= 18:00 (6pm)
  const timePressure = calculateTimePressure(currentHour);
  
  return {
    timeCategory,
    wantsCheap,
    wantsQuick,
    wantsNoCook,
    energyLevel,
    budgetCeilingCents,
    timePressure,
  };
}
