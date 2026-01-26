/**
 * FAST FOOD: DRM Service
 * 
 * Dinner Rescue Mode (DRM) is a HARD OVERRIDE.
 * It bypasses normal arbiter logic entirely.
 * 
 * INVARIANTS:
 * - Returns EXACTLY ONE rescue action or null + exhausted
 * - Never calls arbiter for meal selection
 * - No arrays anywhere
 * - No browsing, no lists, no alternatives
 */

import { createHash } from 'crypto';
import type {
  DrmRequest,
  DrmResponse,
  SingleRescue,
  OrderRescue,
  ZeroCookRescue,
  DrmTriggerReason,
  DrmEventRow,
} from '@/types/decision-os/drm';
import type { DecisionEventRow } from '@/types/decision-os/decision';
import { assertNoArraysDeep, validateSingleRescue, validateRescuePayload } from './invariants';
import { DINNER_START_HOUR, DINNER_END_HOUR } from './arbiter';

// =============================================================================
// TIME THRESHOLD FOR ORDERING
// =============================================================================

/**
 * Order cutoff hour (8:00 PM / 20:00)
 * After this, ordering may be too slow; prefer zero_cook
 */
export const ORDER_CUTOFF_HOUR = 20;

// =============================================================================
// PREAPPROVED VENDORS (hardcoded for v1)
// These are placeholder deep links - in production would be configurable
// =============================================================================

interface PreapprovedVendor {
  vendorKey: string;
  title: string;
  deepLinkUrl: string;
  estMinutes: number;
}

/**
 * Preapproved delivery vendors for DRM order rescue
 * 
 * In v1, these are hardcoded. In production:
 * - Would be user-configurable
 * - Would check availability/hours
 * - Would support multiple per household
 * 
 * INVARIANT: This is a constant, not exposed to client
 */
export const PREAPPROVED_VENDORS: readonly PreapprovedVendor[] = [
  {
    vendorKey: 'doordash-local',
    title: 'Quick Delivery (DoorDash)',
    deepLinkUrl: 'doordash://store/nearby-quick',
    estMinutes: 30,
  },
  {
    vendorKey: 'ubereats-fast',
    title: 'Fast Food Pickup (Uber Eats)',
    deepLinkUrl: 'ubereats://checkout?type=pickup',
    estMinutes: 20,
  },
  {
    vendorKey: 'grubhub-pizza',
    title: 'Pizza Delivery (Grubhub)',
    deepLinkUrl: 'grubhub://restaurant/pizza-nearby',
    estMinutes: 35,
  },
] as const;

// =============================================================================
// ZERO-COOK RESCUE MOVES (canned fallbacks)
// =============================================================================

interface ZeroCookMove {
  title: string;
  stepsShort: string;
  estMinutes: number;
}

/**
 * Canned zero-cook rescue moves
 * 
 * These are ultra-minimal effort meals that require no real cooking.
 * Selection is deterministic based on trigger reason.
 * 
 * INVARIANT: Max 3 moves, ONE is chosen, never exposed as list
 */
export const ZERO_COOK_MOVES: readonly ZeroCookMove[] = [
  {
    title: 'Cheese Board Assembly',
    stepsShort: 'Grab crackers, cheese, and deli meat from fridge. Arrange on plate. Add pickles, olives, or fruit if available.',
    estMinutes: 5,
  },
  {
    title: 'Cereal Dinner',
    stepsShort: 'Pour favorite cereal into bowl. Add milk. Done. No judgment.',
    estMinutes: 2,
  },
  {
    title: 'Peanut Butter Toast',
    stepsShort: 'Toast bread. Spread peanut butter. Slice banana on top if you have one. Add honey drizzle.',
    estMinutes: 3,
  },
] as const;

// =============================================================================
// TIME PARSING (reuse from arbiter)
// =============================================================================

/**
 * Parse hour from ISO string respecting timezone offset
 */
function parseLocalHour(isoString: string): number {
  const timeMatch = isoString.match(/T(\d{2}):/);
  if (timeMatch) {
    return parseInt(timeMatch[1], 10);
  }
  return new Date(isoString).getHours();
}

// =============================================================================
// CONTEXT HASH FOR DRM
// =============================================================================

export interface DrmContextHashInput {
  nowIso: string;
  triggerType: string;
  triggerReason: string;
  rescueType: string | null;
}

/**
 * Compute deterministic hash for DRM context
 */
export function computeDrmContextHash(input: DrmContextHashInput): string {
  const normalized = {
    t: input.nowIso,
    tt: input.triggerType,
    tr: input.triggerReason,
    rt: input.rescueType,
  };
  
  const json = JSON.stringify(normalized);
  return createHash('sha256').update(json).digest('hex').substring(0, 16);
}

// =============================================================================
// DRM LOGIC - VENDOR SELECTION
// =============================================================================

/**
 * Check if ordering is appropriate for current time
 */
function isWithinOrderWindow(nowIso: string): boolean {
  const hour = parseLocalHour(nowIso);
  return hour >= DINNER_START_HOUR && hour < ORDER_CUTOFF_HOUR;
}

/**
 * Determine if trigger reason indicates high stress
 * High stress = user needs immediate relief, prefer ordering
 */
function isHighStressTrigger(reason: DrmTriggerReason): boolean {
  const highStressReasons: DrmTriggerReason[] = [
    'handle_it',
    'im_done',
    'late_no_action',
    'calendar_conflict',
    'low_energy',
  ];
  return highStressReasons.includes(reason);
}

/**
 * Select order vendor deterministically
 * Returns the first preapproved vendor (could be enhanced with user preferences)
 */
function selectOrderVendor(): PreapprovedVendor {
  // In v1, just return the first vendor
  // In production, could rotate or use user preferences
  return PREAPPROVED_VENDORS[0];
}

/**
 * Select zero-cook move deterministically based on trigger reason
 */
function selectZeroCookMove(reason: DrmTriggerReason): ZeroCookMove {
  // Deterministic selection based on reason
  // This ensures consistent behavior for testing
  switch (reason) {
    case 'handle_it':
    case 'im_done':
      // User is frustrated - give them the easiest option
      return ZERO_COOK_MOVES[1]; // Cereal Dinner
    case 'low_energy':
      // Low energy - minimal effort
      return ZERO_COOK_MOVES[2]; // Peanut Butter Toast
    case 'late_no_action':
    case 'two_rejections':
    case 'calendar_conflict':
    default:
      // Default to cheese board (most satisfying)
      return ZERO_COOK_MOVES[0]; // Cheese Board Assembly
  }
}

// =============================================================================
// BUILD RESCUE ACTIONS
// =============================================================================

function buildOrderRescue(
  vendor: PreapprovedVendor,
  drmEventId: string,
  contextHash: string
): OrderRescue {
  return {
    rescueType: 'order',
    drmEventId,
    title: vendor.title,
    vendorKey: vendor.vendorKey,
    deepLinkUrl: vendor.deepLinkUrl,
    estMinutes: vendor.estMinutes,
    contextHash,
  };
}

function buildZeroCookRescue(
  move: ZeroCookMove,
  drmEventId: string,
  contextHash: string
): ZeroCookRescue {
  return {
    rescueType: 'zero_cook',
    drmEventId,
    title: move.title,
    stepsShort: move.stepsShort,
    estMinutes: move.estMinutes,
    contextHash,
  };
}

// =============================================================================
// MAIN DRM FUNCTION
// =============================================================================

export interface DrmServiceInput {
  request: DrmRequest;
  generateEventId: () => string;
  persistDrmEvent: (event: DrmEventRow) => Promise<void>;
  persistDecisionEvent: (event: DecisionEventRow) => Promise<void>;
}

/**
 * Execute DRM rescue logic
 * 
 * This is a HARD OVERRIDE - does NOT call the normal arbiter.
 * Returns exactly ONE rescue action or null + exhausted.
 * 
 * INVARIANT: Never returns arrays
 */
export async function executeDrmRescue(input: DrmServiceInput): Promise<DrmResponse> {
  const {
    request,
    generateEventId,
    persistDrmEvent,
    persistDecisionEvent,
  } = input;
  
  const drmEventId = generateEventId();
  
  // Determine rescue strategy
  const isHighStress = isHighStressTrigger(request.triggerReason);
  const canOrder = isWithinOrderWindow(request.nowIso);
  
  let rescue: SingleRescue | null = null;
  
  // Decision logic: prefer order for high stress within window
  if (isHighStress && canOrder) {
    const vendor = selectOrderVendor();
    const contextHash = computeDrmContextHash({
      nowIso: request.nowIso,
      triggerType: request.triggerType,
      triggerReason: request.triggerReason,
      rescueType: 'order',
    });
    rescue = buildOrderRescue(vendor, drmEventId, contextHash);
  } else {
    // Fall back to zero-cook
    const move = selectZeroCookMove(request.triggerReason);
    const contextHash = computeDrmContextHash({
      nowIso: request.nowIso,
      triggerType: request.triggerType,
      triggerReason: request.triggerReason,
      rescueType: 'zero_cook',
    });
    rescue = buildZeroCookRescue(move, drmEventId, contextHash);
  }
  
  // Validate rescue before proceeding
  if (rescue) {
    validateSingleRescue(rescue);
  }
  
  // Prepare rescue payload for DB (must validate)
  const rescuePayload = rescue ? (rescue as unknown as Record<string, unknown>) : null;
  if (rescuePayload) {
    validateRescuePayload(rescuePayload);
    assertNoArraysDeep(rescuePayload, 'rescue_payload before DB insert');
  }
  
  // Persist DRM event (always, even if exhausted - but we always have rescue in v1)
  await persistDrmEvent({
    id: drmEventId,
    household_key: request.householdKey,
    triggered_at: request.nowIso,
    trigger_type: request.triggerType,
    trigger_reason: request.triggerReason,
    rescue_type: rescue?.rescueType ?? null,
    rescue_payload: rescuePayload,
    exhausted: false,
  });
  
  // Persist decision event for rescue (maps rescue to decision format)
  if (rescue) {
    const decisionEventId = generateEventId();
    const decisionPayload = mapRescueToDecisionPayload(rescue, decisionEventId);
    
    assertNoArraysDeep(decisionPayload, 'decision_payload before DB insert');
    
    await persistDecisionEvent({
      id: decisionEventId,
      household_key: request.householdKey,
      decided_at: request.nowIso,
      decision_type: rescue.rescueType, // 'order' | 'zero_cook'
      meal_id: null, // DRM doesn't use meal_id
      external_vendor_key: rescue.rescueType === 'order' ? (rescue as OrderRescue).vendorKey : null,
      context_hash: rescue.contextHash,
      decision_payload: decisionPayload,
      user_action: 'drm_triggered',
    });
  }
  
  // Build response
  const response: DrmResponse = rescue
    ? { rescue, exhausted: false }
    : { rescue: null, exhausted: true };
  
  // Final invariant check on response
  assertNoArraysDeep(response, 'DRM response payload');
  
  return response;
}

/**
 * Map rescue action to decision payload format
 * This creates the equivalent decision object for the decision_events table
 */
function mapRescueToDecisionPayload(
  rescue: SingleRescue,
  decisionEventId: string
): Record<string, unknown> {
  if (rescue.rescueType === 'order') {
    const orderRescue = rescue as OrderRescue;
    return {
      decisionType: 'order',
      decisionEventId,
      vendorKey: orderRescue.vendorKey,
      title: orderRescue.title,
      deepLinkUrl: orderRescue.deepLinkUrl,
      estMinutes: orderRescue.estMinutes,
      contextHash: orderRescue.contextHash,
    };
  } else {
    const zeroCookRescue = rescue as ZeroCookRescue;
    return {
      decisionType: 'zero_cook',
      decisionEventId,
      title: zeroCookRescue.title,
      stepsShort: zeroCookRescue.stepsShort,
      estMinutes: zeroCookRescue.estMinutes,
      contextHash: zeroCookRescue.contextHash,
    };
  }
}

// =============================================================================
// EXHAUSTED PATH (for completeness)
// =============================================================================

/**
 * Create an exhausted DRM response
 * In v1, this should never happen as we always have zero_cook fallback
 * Kept for API completeness and future edge cases
 */
export async function createExhaustedResponse(
  input: Omit<DrmServiceInput, 'persistDecisionEvent'>,
): Promise<DrmResponse> {
  const { request, generateEventId, persistDrmEvent } = input;
  
  const drmEventId = generateEventId();
  
  // Persist exhausted event
  await persistDrmEvent({
    id: drmEventId,
    household_key: request.householdKey,
    triggered_at: request.nowIso,
    trigger_type: request.triggerType,
    trigger_reason: request.triggerReason,
    rescue_type: null,
    rescue_payload: null,
    exhausted: true,
  });
  
  return { rescue: null, exhausted: true };
}
