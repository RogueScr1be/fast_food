/**
 * FAST FOOD: Decision Arbiter
 * 
 * Core decision logic. Returns EXACTLY ONE action or null.
 * 
 * INVARIANTS:
 * - Never returns arrays
 * - Never returns multiple options
 * - Inventory is advisory only (missing data does not block)
 * - No "suggestions" or "alternatives"
 */

import { createHash } from 'crypto';
import type {
  DecisionRequest,
  DecisionResponse,
  SingleAction,
  CookAction,
  ZeroCookAction,
  MealRow,
  InventoryItemRow,
  MealIngredientRow,
  DecisionEventRow,
  DrmReason,
} from '@/types/decision-os/decision';
import { assertNoArraysDeep, validateSingleAction } from './invariants';
import { 
  estimateRemainingQty, 
  decayConfidence,
  type InventoryItemWithDecay 
} from './inventory-model';
import { matchInventoryItem, MATCH_THRESHOLD } from './matching/matcher';
import { resetMetrics, recordMatchAttempt, logMetrics } from './matching/metrics';

// =============================================================================
// SAFE CORE MEALS (fallback when inventory is empty/unknown)
// These 10 canonical_keys are reliable pantry-friendly meals
// =============================================================================
export const SAFE_CORE_MEAL_KEYS: readonly string[] = [
  'spaghetti-aglio-olio',
  'egg-fried-rice',
  'quick-grilled-cheese',
  'scrambled-eggs-toast',
  'pasta-marinara',
  'quesadilla-cheese',
  'bean-and-cheese-burrito',
  'instant-ramen-upgrade',
  'tuna-salad-crackers',
  'pb-banana-sandwich',
] as const;

// =============================================================================
// TIME THRESHOLDS
// Exported for documentation and testing purposes
// =============================================================================

/**
 * Dinner window start hour (5:00 PM / 17:00)
 * Decisions before this are considered too early for dinner
 */
export const DINNER_START_HOUR = 17;

/**
 * Dinner window end hour (9:00 PM / 21:00)
 * Decisions after this are considered too late
 */
export const DINNER_END_HOUR = 21;

/**
 * Late threshold hour (8:00 PM / 20:00)
 * After this hour, DRM is recommended instead of normal decision
 * Rationale: Limited cooking time remaining, user should order or go simple
 */
export const LATE_THRESHOLD_HOUR = 20;

/**
 * Late no-action threshold (6:00 PM / 18:00 = DINNER_START + 1)
 * If dinner window started and no approved decision yet, recommend DRM
 */
export const LATE_NO_ACTION_THRESHOLD_HOUR = 18;

// =============================================================================
// MATCH SCORE SAFEGUARDS
// =============================================================================

/**
 * Minimum match score required for full contribution.
 * Below this, contribution is capped to prevent weak matches from
 * overly influencing decisions.
 */
export const STRONG_MATCH_THRESHOLD = 0.80;

/**
 * Maximum contribution for weak matches (score < STRONG_MATCH_THRESHOLD).
 * Even with perfect inventory confidence, a weak match cannot contribute
 * more than this value.
 */
export const WEAK_MATCH_CAP = 0.50;

/**
 * Two rejections time window in milliseconds (30 minutes)
 * If 2+ rejections occur within this window, recommend DRM
 */
export const TWO_REJECTIONS_WINDOW_MS = 30 * 60 * 1000;

/**
 * Rejection count threshold for DRM trigger
 * If user rejects this many decisions, trigger DRM
 */
export const DRM_REJECTION_THRESHOLD = 2;

// =============================================================================
// CONTEXT HASH COMPUTATION
// =============================================================================

export interface ContextHashInput {
  nowIso: string;
  signal: DecisionRequest['signal'];
  inventoryItemNames: string[];
  selectedMealKey: string | null;
}

/**
 * Compute deterministic hash of decision context
 * Used for debugging and deduplication
 */
export function computeContextHash(input: ContextHashInput): string {
  const normalized = {
    t: input.nowIso,
    s: {
      tw: input.signal.timeWindow,
      e: input.signal.energy,
      cc: input.signal.calendarConflict,
    },
    i: input.inventoryItemNames.sort(),
    m: input.selectedMealKey,
  };
  
  const json = JSON.stringify(normalized);
  return createHash('sha256').update(json).digest('hex').substring(0, 16);
}

// =============================================================================
// DRM TRIGGER EVALUATION
// =============================================================================

export interface DrmEvaluation {
  shouldTrigger: boolean;
  reason: DrmReason | null;
}

/**
 * Parse hour from ISO string, respecting the timezone in the string
 * For "2026-01-19T20:30:00-06:00", returns 20 (8 PM in the specified timezone)
 */
export function parseLocalHour(isoString: string): number {
  // Extract the time portion (HH:MM:SS) before timezone
  const match = isoString.match(/T(\d{2}):/);
  if (match) {
    return parseInt(match[1], 10);
  }
  // Fallback to Date parsing if format is unexpected
  return new Date(isoString).getUTCHours();
}

/**
 * Parse local date (YYYY-MM-DD) from ISO string, respecting timezone
 * For "2026-01-19T20:30:00-06:00", returns "2026-01-19"
 */
export function parseLocalDate(isoString: string): string {
  // Extract the date portion before 'T'
  const match = isoString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }
  // Fallback to Date parsing
  const date = new Date(isoString);
  return date.toISOString().split('T')[0];
}

/**
 * Check if two rejection events occurred within the specified time window.
 * 
 * @param events - Recent decision events (should be sorted by decided_at DESC)
 * @param windowMs - Time window in milliseconds (default: 30 minutes)
 * @returns true if 2+ consecutive rejections within window
 */
export function hasTwoRejectionsWithinWindow(
  events: DecisionEventRow[],
  windowMs: number = TWO_REJECTIONS_WINDOW_MS
): boolean {
  // Find all rejected events
  const rejectedEvents = events.filter(e => e.user_action === 'rejected');
  
  if (rejectedEvents.length < 2) {
    return false;
  }
  
  // Sort by decided_at descending (most recent first)
  const sorted = [...rejectedEvents].sort((a, b) => 
    new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime()
  );
  
  // Check if the two most recent rejections are within the window
  const mostRecent = new Date(sorted[0].decided_at).getTime();
  const secondMostRecent = new Date(sorted[1].decided_at).getTime();
  
  return (mostRecent - secondMostRecent) <= windowMs;
}

/**
 * Check if there's an approved decision for today.
 * 
 * @param events - Decision events to check
 * @param todayDate - Today's date in YYYY-MM-DD format
 * @returns true if at least one approved decision exists for today
 */
export function hasApprovedDecisionToday(
  events: DecisionEventRow[],
  todayDate: string
): boolean {
  return events.some(e => {
    const eventDate = parseLocalDate(e.decided_at);
    return eventDate === todayDate && e.user_action === 'approved';
  });
}

/**
 * Check if there's any pending, rejected, or expired decision for today.
 * This indicates the user has engaged with the decision system today.
 * 
 * @param events - Decision events to check
 * @param todayDate - Today's date in YYYY-MM-DD format
 * @returns true if at least one engagement exists for today
 */
export function hasEngagementToday(
  events: DecisionEventRow[],
  todayDate: string
): boolean {
  return events.some(e => {
    const eventDate = parseLocalDate(e.decided_at);
    return eventDate === todayDate && 
      ['pending', 'rejected', 'expired'].includes(e.user_action);
  });
}

/**
 * Evaluate if DRM should be triggered based on signal, time, and decision history.
 * 
 * IMPLICIT TRIGGER CONDITIONS (checked in priority order):
 * 1. calendar_conflict: signal.calendarConflict = true
 * 2. low_energy: signal.energy = 'low'
 * 3. two_rejections: 2+ consecutive rejections within 30 minutes
 * 4. late_no_action: 
 *    - Time >= 6 PM (LATE_NO_ACTION_THRESHOLD_HOUR)
 *    - No approved decision today
 *    - At least one engagement (pending/rejected/expired) shown today OR late hour (>= 8 PM)
 * 
 * @param request - Decision request with signal and nowIso
 * @param recentEvents - Recent decision events for this household
 * @returns DRM evaluation with shouldTrigger and reason
 */
export function evaluateDrmTrigger(
  request: DecisionRequest,
  recentEvents: DecisionEventRow[]
): DrmEvaluation {
  const { signal, nowIso } = request;
  
  // Parse the hour and date from the ISO string (respects the timezone in the string)
  const hour = parseLocalHour(nowIso);
  const todayDate = parseLocalDate(nowIso);
  
  // Check conditions in priority order
  
  // 1. Calendar conflict - immediate DRM
  if (signal.calendarConflict) {
    return { shouldTrigger: true, reason: 'calendar_conflict' };
  }
  
  // 2. Low energy - immediate DRM
  if (signal.energy === 'low') {
    return { shouldTrigger: true, reason: 'low_energy' };
  }
  
  // 3. Two rejections within 30 minutes
  if (hasTwoRejectionsWithinWindow(recentEvents)) {
    return { shouldTrigger: true, reason: 'two_rejections' };
  }
  
  // 4. Late no-action check (dinner time specific)
  if (signal.timeWindow === 'dinner') {
    // Check if we're past the late threshold (8 PM) - immediate DRM
    if (hour >= LATE_THRESHOLD_HOUR) {
      return { shouldTrigger: true, reason: 'late_no_action' };
    }
    
    // Check if we're in the late window (6 PM - 8 PM) with no approved decision
    if (hour >= LATE_NO_ACTION_THRESHOLD_HOUR) {
      const hasApproved = hasApprovedDecisionToday(recentEvents, todayDate);
      const hasEngaged = hasEngagementToday(recentEvents, todayDate);
      
      // Only trigger if no approval AND there's been engagement (shown decisions)
      if (!hasApproved && hasEngaged) {
        return { shouldTrigger: true, reason: 'late_no_action' };
      }
    }
  }
  
  return { shouldTrigger: false, reason: null };
}

// =============================================================================
// MEAL SELECTION LOGIC
// =============================================================================

/**
 * Minimum confidence threshold for inventory items to be considered
 * Items below this threshold are treated as "not in inventory"
 * 
 * INVARIANT: Inventory remains advisory - low confidence items do not contribute
 */
export const INVENTORY_CONFIDENCE_THRESHOLD = 0.60;

// =============================================================================
// TASTE-AWARE SCORING CONSTANTS (Phase 4)
// =============================================================================

/**
 * Weight for inventory score in final calculation (60%)
 * Inventory availability is the primary factor
 */
export const WEIGHT_INVENTORY = 0.60;

/**
 * Weight for taste score in final calculation (35%)
 * User preferences matter but don't override availability
 */
export const WEIGHT_TASTE = 0.35;

/**
 * Rotation penalty applied to recently used meals (-0.2)
 * Prevents repetition even if a meal is highly preferred
 */
export const ROTATION_PENALTY = -0.20;

/**
 * Number of recent decisions to consider for rotation
 */
export const ROTATION_WINDOW = 7;

/**
 * Maximum exploration noise (5%)
 * Small deterministic perturbation to allow discovery
 */
export const MAX_EXPLORATION_NOISE = 0.05;

/**
 * Divisor for sigmoid normalization of taste scores
 * Score of 5 maps to ~0.73, score of -5 maps to ~0.27
 */
export const TASTE_SIGMOID_DIVISOR = 5;

// =============================================================================
// TASTE SCORING HELPERS
// =============================================================================

/**
 * Sigmoid function to normalize raw taste scores to [0, 1]
 * 
 * Formula: 1 / (1 + exp(-x / divisor))
 * 
 * @param rawScore - Raw taste score (can be negative)
 * @param divisor - Sigmoid divisor (default: 5)
 * @returns Normalized score between 0 and 1
 */
export function sigmoidNormalize(rawScore: number, divisor: number = TASTE_SIGMOID_DIVISOR): number {
  return 1 / (1 + Math.exp(-rawScore / divisor));
}

/**
 * Compute deterministic tiny noise for exploration.
 * 
 * Uses a hash-to-float trick:
 * 1. Concatenate contextHash + mealId
 * 2. Hash the result
 * 3. Convert first 8 hex chars to a number
 * 4. Map to [0, MAX_EXPLORATION_NOISE]
 * 
 * DETERMINISTIC: Same inputs always produce same output.
 * NOT random - just spreads meals in a stable way.
 * 
 * @param contextHash - The decision context hash
 * @param mealId - The meal ID
 * @returns Noise value in [0, MAX_EXPLORATION_NOISE]
 */
export function deterministicTinyNoise(contextHash: string, mealId: string): number {
  const combined = `${contextHash}:${mealId}`;
  const hash = createHash('sha256').update(combined).digest('hex');
  
  // Take first 8 hex characters and convert to number
  const hexValue = hash.substring(0, 8);
  const numValue = parseInt(hexValue, 16);
  
  // Normalize to [0, 1] then scale to [0, MAX_EXPLORATION_NOISE]
  const normalized = numValue / 0xFFFFFFFF;
  return normalized * MAX_EXPLORATION_NOISE;
}

export interface MealWithScore {
  meal: MealRow;
  inventoryScore: number;
}

export interface MealWithFinalScore {
  meal: MealRow;
  inventoryScore: number;
  tasteScore: number;
  rotationPenalty: number;
  exploration: number;
  finalScore: number;
}

/**
 * Result of meal selection including scores for autopilot evaluation.
 */
export interface MealSelectionResult {
  meal: MealRow | null;
  /** Inventory score (0..1) for selected meal */
  inventoryScore: number;
  /** Taste score (0..1, normalized) for selected meal */
  tasteScore: number;
  /** Whether meal was in recent decisions (last ROTATION_WINDOW) */
  isRecentlyUsed: boolean;
  finalScore: number;
}

/**
 * Score a meal based on inventory availability.
 * Higher score = more ingredients likely available.
 * 
 * SCORING RULES (Updated for Phase 3):
 * - Pantry staples: always 1.0 (assumed available)
 * - Inventory match with decayed confidence >= 0.60:
 *   - If remainingQty is known and > 0: use decayed confidence
 *   - If remainingQty is known and <= 0: score 0 (used up)
 *   - If remainingQty is unknown: use decayed confidence
 * - Inventory match with decayed confidence < 0.60: treated as missing (0)
 * - No inventory match: 0 (ingredient unavailable)
 * 
 * @param meal - The meal to score
 * @param ingredients - All ingredients from database
 * @param inventory - Inventory items (will be filtered by confidence after decay)
 * @param nowIso - Current time for decay calculation (optional)
 * @returns Score between 0 and 1
 */
export function scoreMealByInventory(
  meal: MealRow,
  ingredients: MealIngredientRow[],
  inventory: InventoryItemRow[],
  nowIso?: string
): number {
  const mealIngredients = ingredients.filter(i => i.meal_id === meal.id);
  
  if (mealIngredients.length === 0) {
    return 0.5; // No ingredients listed, neutral score
  }
  
  let totalScore = 0;
  let scoredCount = 0;
  
  for (const ingredient of mealIngredients) {
    // Pantry staples: always 1.0 (assumed always available)
    if (ingredient.is_pantry_staple) {
      totalScore += 1.0;
      scoredCount++;
      continue;
    }
    
    // Find matching inventory item using token-based matcher (v2)
    const { matched: matchingItem, score: matchScore } = matchInventoryItem(
      ingredient.ingredient_name,
      inventory
    );
    
    // Record match attempt for metrics
    const matchSuccess = matchingItem !== null;
    const rejectedLowScore = matchingItem !== null && matchScore < STRONG_MATCH_THRESHOLD;
    recordMatchAttempt(matchSuccess, rejectedLowScore);
    
    if (matchingItem) {
      // Cast to extended type for decay calculations
      const itemWithDecay = matchingItem as unknown as InventoryItemWithDecay;
      
      // Calculate decayed confidence
      const decayedConf = decayConfidence(itemWithDecay, nowIso);
      
      // INVARIANT: Only count items with decayed confidence >= threshold
      if (decayedConf < INVENTORY_CONFIDENCE_THRESHOLD) {
        totalScore += 0;
        scoredCount++;
        continue;
      }
      
      // Check remaining quantity if available
      const remaining = estimateRemainingQty(itemWithDecay, nowIso);
      
      if (remaining !== null && remaining <= 0) {
        // Item is used up - score 0
        totalScore += 0;
        scoredCount++;
        continue;
      }
      
      // SAFEGUARD: Incorporate match score into contribution
      // effectiveContribution = decayedConf * matchScore
      // If matchScore < 0.80, cap at 0.50 max
      let effectiveContribution = decayedConf * matchScore;
      
      if (matchScore < STRONG_MATCH_THRESHOLD) {
        effectiveContribution = Math.min(effectiveContribution, WEAK_MATCH_CAP);
      }
      
      totalScore += effectiveContribution;
    } else {
      // Not in inventory - score 0
      // This penalizes meals requiring ingredients not in inventory
      totalScore += 0;
    }
    scoredCount++;
  }
  
  return scoredCount > 0 ? totalScore / scoredCount : 0.5;
}

/**
 * Select a single meal using inventory, taste preferences, rotation, and exploration.
 * NEVER returns multiple meals - always exactly one or null.
 * 
 * SCORING FORMULA (Phase 4):
 *   finalScore = (0.60 * inventoryScore) + (0.35 * tasteScore) + exploration + rotationPenalty
 * 
 * Where:
 *   - inventoryScore: 0..1 from scoreMealByInventory()
 *   - tasteScore: sigmoid(rawTasteScore / 5) in 0..1
 *   - rotationPenalty: -0.2 if meal in last 7 decisions, else 0
 *   - exploration: deterministic tiny noise in [0, 0.05]
 * 
 * @param activeMeals - Active meals to choose from
 * @param ingredients - All ingredients from database
 * @param inventory - Inventory items
 * @param recentMealIds - Recent meal IDs for rotation (last 7)
 * @param useSafeCoreOnly - Whether to restrict to safe core meals
 * @param nowIso - Current time for decay calculations
 * @param tasteScores - Map of meal_id to raw taste score (optional)
 * @param contextHash - Context hash for deterministic exploration (optional)
 */
export function selectMeal(
  activeMeals: MealRow[],
  ingredients: MealIngredientRow[],
  inventory: InventoryItemRow[],
  recentMealIds: string[],
  useSafeCoreOnly: boolean,
  nowIso?: string,
  tasteScores?: Map<string, number>,
  contextHash?: string
): MealSelectionResult {
  if (activeMeals.length === 0) {
    return null;
  }
  
  // Filter to safe core if inventory is empty/unknown
  let candidateMeals = activeMeals;
  if (useSafeCoreOnly) {
    candidateMeals = activeMeals.filter(m => 
      SAFE_CORE_MEAL_KEYS.includes(m.canonical_key)
    );
    // If no safe core meals found, fall back to all meals
    if (candidateMeals.length === 0) {
      candidateMeals = activeMeals;
    }
  }
  
  // STABLE ORDERING: Sort candidates by canonical_key for deterministic processing
  candidateMeals = [...candidateMeals].sort((a, b) => 
    a.canonical_key.localeCompare(b.canonical_key)
  );
  
  // Recent meal IDs for rotation penalty (use last ROTATION_WINDOW)
  const recentSet = new Set(recentMealIds.slice(0, ROTATION_WINDOW));
  
  // Score all candidate meals using the full formula
  const scored: MealWithFinalScore[] = candidateMeals.map(meal => {
    // 1. Base inventory score (0..1)
    const inventoryScore = scoreMealByInventory(meal, ingredients, inventory, nowIso);
    
    // 2. Taste score: sigmoid normalize raw score (default 0 if missing)
    const rawTaste = tasteScores?.get(meal.id) ?? 0;
    const tasteScore = sigmoidNormalize(rawTaste);
    
    // 3. Rotation penalty: -0.2 if in recent decisions
    const rotationPenalty = recentSet.has(meal.id) ? ROTATION_PENALTY : 0;
    
    // 4. Exploration: deterministic tiny noise for discovery
    const exploration = contextHash 
      ? deterministicTinyNoise(contextHash, meal.id)
      : 0;
    
    // Final score = weighted sum
    const finalScore = 
      (WEIGHT_INVENTORY * inventoryScore) +
      (WEIGHT_TASTE * tasteScore) +
      exploration +
      rotationPenalty;
    
    return {
      meal,
      inventoryScore,
      tasteScore,
      rotationPenalty,
      exploration,
      finalScore,
    };
  });
  
  // Sort by finalScore descending, then by canonical_key for deterministic tie-breaking
  scored.sort((a, b) => {
    const scoreDiff = b.finalScore - a.finalScore;
    if (Math.abs(scoreDiff) > 0.0001) {
      return scoreDiff;
    }
    // Tie-break by canonical_key (lexicographic)
    return a.meal.canonical_key.localeCompare(b.meal.canonical_key);
  });
  
  // Return the top scoring meal with scores (SINGLE meal, never a list)
  const selected = scored[0];
  if (!selected) {
    return {
      meal: null,
      inventoryScore: 0,
      tasteScore: 0,
      isRecentlyUsed: false,
    };
  }
  
  return {
    meal: selected.meal,
    inventoryScore: selected.inventoryScore,
    tasteScore: selected.tasteScore,
    isRecentlyUsed: recentSet.has(selected.meal.id),
  };
}

// =============================================================================
// ZERO-COOK FALLBACK
// =============================================================================

/**
 * Generate a zero-cook fallback action
 * Used when no meals are available (should be rare)
 */
export function createZeroCookFallback(
  decisionEventId: string,
  contextHash: string
): ZeroCookAction {
  return {
    decisionType: 'zero_cook',
    decisionEventId,
    title: 'Quick Assembly Meal',
    stepsShort: 'Grab crackers, cheese, and deli meat from the fridge. Arrange on a plate. Add pickles or olives if available.',
    estMinutes: 5,
    contextHash,
  };
}

// =============================================================================
// BUILD COOK ACTION
// =============================================================================

export function buildCookAction(
  meal: MealRow,
  decisionEventId: string,
  contextHash: string
): CookAction {
  return {
    decisionType: 'cook',
    decisionEventId,
    mealId: meal.id,
    title: meal.name,
    stepsShort: meal.instructions_short,
    estMinutes: meal.est_minutes,
    contextHash,
  };
}

// =============================================================================
// MAIN ARBITER FUNCTION
// =============================================================================

export interface ArbiterInput {
  request: DecisionRequest;
  activeMeals: MealRow[];
  ingredients: MealIngredientRow[];
  inventory: InventoryItemRow[];
  recentDecisions: DecisionEventRow[];
  generateEventId: () => string;
  persistDecisionEvent: (event: Omit<DecisionEventRow, 'id'> & { id: string }) => Promise<void>;
  /** Optional: Taste scores map (meal_id -> raw score). If not provided, taste scoring uses 0 for all. */
  tasteScores?: Map<string, number>;
}

/**
 * Extended result from makeDecision including internal context for autopilot.
 * The `response` field is the actual DecisionResponse to return to client.
 */
export interface ArbiterResult {
  response: DecisionResponse;
  /** Internal context for autopilot evaluation (not sent to client) */
  internalContext: {
    /** Selected meal ID, if any */
    selectedMealId: string | null;
    /** Inventory score (0..1) for selected meal */
    inventoryScore: number;
    /** Taste score (0..1, normalized) for selected meal */
    tasteScore: number;
    /** Whether meal was in recent decisions (last ROTATION_WINDOW) */
    isRecentlyUsed: boolean;
    /** Decision event ID */
    decisionEventId: string;
    /** Context hash for the decision */
    contextHash: string;
    /** Decision payload for potential feedback copy */
    decisionPayload: Record<string, unknown>;
  } | null;
}

/**
 * Main decision arbiter function
 * Returns EXACTLY ONE decision or null with drmRecommended
 * 
 * INVARIANT: Response never contains arrays
 * 
 * Returns ArbiterResult which includes:
 * - response: The DecisionResponse to send to client
 * - internalContext: Data for autopilot evaluation (not sent to client)
 */
export async function makeDecision(input: ArbiterInput): Promise<ArbiterResult> {
  // Reset metrics for this request
  resetMetrics();
  
  const {
    request,
    activeMeals,
    ingredients,
    inventory,
    recentDecisions,
    generateEventId,
    persistDecisionEvent,
    tasteScores,
  } = input;
  
  // Evaluate DRM triggers using full event history
  // (includes implicit triggers: two_rejections within 30min, late_no_action, etc.)
  const drmEval = evaluateDrmTrigger(request, recentDecisions);
  
  if (drmEval.shouldTrigger && drmEval.reason) {
    // Log metrics (dev-only)
    logMetrics();
    
    // Return DRM recommendation - no decision made
    return {
      response: {
        decision: null,
        drmRecommended: true,
        reason: drmEval.reason,
      },
      internalContext: null,
    };
  }
  
  // Get recent meal IDs for rotation (from most recent decisions)
  const recentMealIds = recentDecisions
    .filter(d => d.meal_id !== null)
    .map(d => d.meal_id as string);
  
  // Determine if we should use safe core only
  const useSafeCoreOnly = inventory.length === 0;
  
  // Get inventory item names for context hash
  const inventoryItemNames = inventory.map(i => i.item_name);
  
  // Compute pre-selection context hash (without meal key) for exploration noise
  // This ensures exploration is deterministic but doesn't depend on meal selection
  const preSelectionContextHash = computeContextHash({
    nowIso: request.nowIso,
    signal: request.signal,
    inventoryItemNames,
    selectedMealKey: null, // No meal selected yet - used for exploration
  });
  
  // Select a meal with taste-aware scoring (Phase 4)
  const selectionResult = selectMeal(
    activeMeals,
    ingredients,
    inventory,
    recentMealIds,
    useSafeCoreOnly,
    request.nowIso,
    tasteScores,
    preSelectionContextHash
  );
  
  const selectedMeal = selectionResult.meal;
  
  // Generate event ID
  const decisionEventId = generateEventId();
  
  // Compute final context hash (includes selected meal for audit/dedup)
  const contextHash = computeContextHash({
    nowIso: request.nowIso,
    signal: request.signal,
    inventoryItemNames,
    selectedMealKey: selectedMeal?.canonical_key ?? null,
  });
  
  // Build the action
  let action: SingleAction;
  
  if (selectedMeal) {
    action = buildCookAction(selectedMeal, decisionEventId, contextHash);
  } else {
    // Fallback to zero-cook (should be rare)
    action = createZeroCookFallback(decisionEventId, contextHash);
  }
  
  // INVARIANT CHECK: Validate single action before persistence
  validateSingleAction(action);
  
  // Persist decision event
  // Note: For v1, we only generate 'cook' or 'zero_cook' actions
  // 'order' type support is defined but not yet implemented
  const mealId = action.decisionType === 'cook' ? (action as CookAction).mealId : null;
  const vendorKey = null; // order type not implemented in v1
  
  // Create decision_payload (the action object for storage)
  const decisionPayload = action as unknown as Record<string, unknown>;
  
  // INVARIANT CHECK: Ensure no arrays in decision_payload before DB insert
  assertNoArraysDeep(decisionPayload, 'decision_payload');
  
  await persistDecisionEvent({
    id: decisionEventId,
    household_key: request.householdKey,
    decided_at: request.nowIso,
    decision_type: action.decisionType,
    meal_id: mealId,
    external_vendor_key: vendorKey,
    context_hash: contextHash,
    decision_payload: decisionPayload,
    user_action: 'pending',
  });
  
  // Log metrics (dev-only)
  logMetrics();
  
  // Return single decision with internal context for autopilot
  return {
    response: {
      decision: action,
      drmRecommended: false,
    },
    internalContext: {
      selectedMealId: mealId,
      inventoryScore: selectionResult.inventoryScore,
      tasteScore: selectionResult.tasteScore,
      isRecentlyUsed: selectionResult.isRecentlyUsed,
      decisionEventId,
      contextHash,
      decisionPayload,
    },
  };
}

// ---------------------------------------------------------------------------
// Compatibility re-exports for test and runtime import path `lib/decision-os/arbiter`
// The primary Arbiter v2 implementation lives in `lib/decision-os/arbiter/index.ts`.
// ---------------------------------------------------------------------------
export {
  decide,
  isExecutable,
  isRejectionImmune,
  getTasteSafetyScore,
  satisfiesConstraints,
  sortCandidates,
  buildContextFromIntent,
  passesTimePressureGate,
  calculateTimePressure,
} from './arbiter/index';
