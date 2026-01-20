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
function parseLocalHour(isoString: string): number {
  // Extract the time portion (HH:MM:SS) before timezone
  const match = isoString.match(/T(\d{2}):/);
  if (match) {
    return parseInt(match[1], 10);
  }
  // Fallback to Date parsing if format is unexpected
  return new Date(isoString).getUTCHours();
}

/**
 * Evaluate if DRM should be triggered based on signal and time
 * Returns reason if DRM should trigger, null otherwise
 */
export function evaluateDrmTrigger(
  request: DecisionRequest,
  recentRejectionCount: number
): DrmEvaluation {
  const { signal, nowIso } = request;
  
  // Parse the hour from the ISO string (respects the timezone in the string)
  const hour = parseLocalHour(nowIso);
  
  // Check conditions in priority order
  
  // 1. Calendar conflict - immediate DRM
  if (signal.calendarConflict) {
    return { shouldTrigger: true, reason: 'calendar_conflict' };
  }
  
  // 2. Low energy - immediate DRM
  if (signal.energy === 'low') {
    return { shouldTrigger: true, reason: 'low_energy' };
  }
  
  // 3. Two or more rejections in recent history
  if (recentRejectionCount >= DRM_REJECTION_THRESHOLD) {
    return { shouldTrigger: true, reason: 'two_rejections' };
  }
  
  // 4. Late hour (past 8 PM for dinner)
  if (signal.timeWindow === 'dinner' && hour >= LATE_THRESHOLD_HOUR) {
    return { shouldTrigger: true, reason: 'late_no_action' };
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

export interface MealWithScore {
  meal: MealRow;
  inventoryScore: number;
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
    
    // Find matching inventory item (case-insensitive contains match)
    const ingredientLower = ingredient.ingredient_name.toLowerCase();
    const matchingItem = inventory.find(inv => {
      const invLower = inv.item_name.toLowerCase();
      return invLower.includes(ingredientLower) || ingredientLower.includes(invLower);
    });
    
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
      
      if (remaining !== null) {
        // We have quantity info - check if any remains
        if (remaining <= 0) {
          // Item is used up - score 0
          totalScore += 0;
        } else {
          // Item has remaining quantity - use decayed confidence
          totalScore += decayedConf;
        }
      } else {
        // No quantity info - just use decayed confidence
        totalScore += decayedConf;
      }
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
 * Select a single meal using rotation and inventory heuristics
 * NEVER returns multiple meals - always exactly one or null
 * 
 * @param activeMeals - Active meals to choose from
 * @param ingredients - All ingredients from database
 * @param inventory - Inventory items
 * @param recentMealIds - Recent meal IDs for rotation
 * @param useSafeCoreOnly - Whether to restrict to safe core meals
 * @param nowIso - Current time for decay calculations (optional)
 */
export function selectMeal(
  activeMeals: MealRow[],
  ingredients: MealIngredientRow[],
  inventory: InventoryItemRow[],
  recentMealIds: string[],
  useSafeCoreOnly: boolean,
  nowIso?: string
): MealRow | null {
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
  
  // Exclude recently used meals (rotation)
  const availableMeals = candidateMeals.filter(m => !recentMealIds.includes(m.id));
  
  // If all meals were recently used, reset rotation
  const mealsToScore = availableMeals.length > 0 ? availableMeals : candidateMeals;
  
  // Score remaining meals by inventory (with decay)
  const scored: MealWithScore[] = mealsToScore.map(meal => ({
    meal,
    inventoryScore: scoreMealByInventory(meal, ingredients, inventory, nowIso),
  }));
  
  // Sort by score descending
  scored.sort((a, b) => b.inventoryScore - a.inventoryScore);
  
  // Return the top scoring meal (SINGLE meal, never a list)
  return scored[0]?.meal ?? null;
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
}

/**
 * Main decision arbiter function
 * Returns EXACTLY ONE decision or null with drmRecommended
 * 
 * INVARIANT: Response never contains arrays
 */
export async function makeDecision(input: ArbiterInput): Promise<DecisionResponse> {
  const {
    request,
    activeMeals,
    ingredients,
    inventory,
    recentDecisions,
    generateEventId,
    persistDecisionEvent,
  } = input;
  
  // Count recent rejections (last 7 decisions)
  const recentRejectionCount = recentDecisions.filter(
    d => d.user_action === 'rejected'
  ).length;
  
  // Evaluate DRM triggers
  const drmEval = evaluateDrmTrigger(request, recentRejectionCount);
  
  if (drmEval.shouldTrigger && drmEval.reason) {
    // Return DRM recommendation - no decision made
    return {
      decision: null,
      drmRecommended: true,
      reason: drmEval.reason,
    };
  }
  
  // Get recent meal IDs for rotation
  const recentMealIds = recentDecisions
    .filter(d => d.meal_id !== null)
    .map(d => d.meal_id as string);
  
  // Determine if we should use safe core only
  const useSafeCoreOnly = inventory.length === 0;
  
  // Get inventory item names for context hash
  const inventoryItemNames = inventory.map(i => i.item_name);
  
  // Select a meal (pass nowIso for decay calculations)
  const selectedMeal = selectMeal(
    activeMeals,
    ingredients,
    inventory,
    recentMealIds,
    useSafeCoreOnly,
    request.nowIso
  );
  
  // Generate event ID
  const decisionEventId = generateEventId();
  
  // Compute context hash
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
  
  // Return single decision
  return {
    decision: action,
    drmRecommended: false,
  };
}
