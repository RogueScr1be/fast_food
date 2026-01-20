/**
 * FAST FOOD: Decision OS Types
 * 
 * INVARIANTS:
 * - No arrays of meals/decisions anywhere
 * - singleAction is always ONE object or null
 * - No "suggestions", "options", "alternatives" language
 */

// =============================================================================
// REQUEST TYPES
// =============================================================================

export interface DecisionSignal {
  timeWindow: 'dinner' | 'lunch' | 'breakfast';
  energy: 'unknown' | 'low' | 'ok';
  calendarConflict: boolean;
}

export interface DecisionRequest {
  householdKey: string;
  nowIso: string; // ISO 8601 timestamp
  signal: DecisionSignal;
}

// =============================================================================
// SINGLE ACTION TYPES (union - NEVER an array)
// =============================================================================

export interface CookAction {
  decisionType: 'cook';
  decisionEventId: string;
  mealId: string;
  title: string;
  stepsShort: string;
  estMinutes: number;
  contextHash: string;
}

export interface OrderAction {
  decisionType: 'order';
  decisionEventId: string;
  vendorKey: string;
  title: string;
  deepLinkUrl: string;
  estMinutes: number;
  contextHash: string;
}

export interface ZeroCookAction {
  decisionType: 'zero_cook';
  decisionEventId: string;
  title: string;
  stepsShort: string;
  estMinutes: number;
  contextHash: string;
}

// The union type - ALWAYS a single object, NEVER an array
export type SingleAction = CookAction | OrderAction | ZeroCookAction;

// =============================================================================
// RESPONSE TYPES
// =============================================================================

export type DrmReason = 
  | 'late_no_action' 
  | 'two_rejections' 
  | 'calendar_conflict' 
  | 'low_energy';

// Response when a decision is made
export interface DecisionSuccessResponse {
  decision: SingleAction;
  drmRecommended: false;
}

// Response when DRM is recommended (no decision)
export interface DecisionDrmResponse {
  decision: null;
  drmRecommended: true;
  reason: DrmReason;
}

// Union of possible responses - NEVER contains arrays
export type DecisionResponse = DecisionSuccessResponse | DecisionDrmResponse;

// =============================================================================
// INTERNAL TYPES (not exposed to client)
// =============================================================================

export interface MealRow {
  id: string;
  name: string;
  canonical_key: string;
  instructions_short: string;
  est_minutes: number;
  est_cost_band: string;
  tags_internal: unknown; // NEVER exposed to client
  is_active: boolean;
}

export interface InventoryItemRow {
  id: string;
  household_key: string;
  item_name: string;
  qty_estimated: number | null;
  qty_used_estimated: number | null;
  unit: string | null;
  confidence: number;
  source: string;
  last_seen_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  decay_rate_per_day: number | null;
  created_at: string;
}

export interface MealIngredientRow {
  meal_id: string;
  ingredient_name: string;
  is_pantry_staple: boolean;
}

export interface DecisionEventRow {
  id: string;
  household_key: string;
  decided_at: string;
  decision_type: 'cook' | 'order' | 'zero_cook';
  meal_id: string | null;
  external_vendor_key: string | null;
  context_hash: string;
  decision_payload: Record<string, unknown>;
  user_action: 'pending' | 'approved' | 'rejected' | 'drm_triggered' | 'expired';
  actioned_at?: string; // ISO timestamp when user took action (feedback copy only)
}

// =============================================================================
// VALIDATION
// =============================================================================

export function isValidDecisionRequest(body: unknown): body is DecisionRequest {
  if (typeof body !== 'object' || body === null) return false;
  
  const req = body as Record<string, unknown>;
  
  if (typeof req.householdKey !== 'string') return false;
  if (typeof req.nowIso !== 'string') return false;
  if (typeof req.signal !== 'object' || req.signal === null) return false;
  
  const signal = req.signal as Record<string, unknown>;
  
  if (!['dinner', 'lunch', 'breakfast'].includes(signal.timeWindow as string)) return false;
  if (!['unknown', 'low', 'ok'].includes(signal.energy as string)) return false;
  if (typeof signal.calendarConflict !== 'boolean') return false;
  
  return true;
}

/**
 * Type guard to ensure response is valid and contains no arrays
 * This is a compile-time and runtime check
 */
export function assertNoArraysInResponse(response: DecisionResponse): void {
  if (response.decision !== null) {
    // Verify no hidden arrays in the decision object
    const action = response.decision;
    for (const [key, value] of Object.entries(action)) {
      if (Array.isArray(value)) {
        throw new Error(`INVARIANT VIOLATION: Array found in decision.${key}`);
      }
    }
  }
}
