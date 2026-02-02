/**
 * FAST FOOD: Decision OS DRM Types
 * 
 * Types for Dinner Rescue Mode (DRM) API.
 * DRM is a hard override - bypasses normal arbiter logic.
 * 
 * INVARIANTS:
 * - rescue is ONE object or null, NEVER an array
 * - No arrays anywhere in payloads
 * - No browsing, no lists, no alternatives
 */

// =============================================================================
// TRIGGER TYPES
// =============================================================================

/**
 * How DRM was triggered
 */
export type DrmTriggerType = 'explicit' | 'implicit';

/**
 * Why DRM was triggered
 * 
 * explicit triggers (user initiated):
 * - handle_it: User pressed "Just handle it" button
 * - im_done: User pressed "I'm done deciding" button
 * 
 * implicit triggers (system detected):
 * - late_no_action: Past late threshold with no decision
 * - two_rejections: User rejected 2+ decisions
 * - calendar_conflict: User has calendar conflict
 * - low_energy: User reported low energy
 */
export type DrmTriggerReason = 
  | 'handle_it'
  | 'im_done'
  | 'late_no_action'
  | 'two_rejections'
  | 'calendar_conflict'
  | 'low_energy';

// =============================================================================
// REQUEST
// =============================================================================

export interface DrmRequest {
  householdKey: string;
  nowIso: string;
  triggerType: DrmTriggerType;
  triggerReason: DrmTriggerReason;
}

// =============================================================================
// RESCUE ACTIONS (SINGLE OBJECT, NEVER ARRAY)
// =============================================================================

/**
 * Order rescue - deep link to food delivery
 */
export interface OrderRescue {
  rescueType: 'order';
  drmEventId: string;
  title: string;
  vendorKey: string;
  deepLinkUrl: string;
  estMinutes: number;
  contextHash: string;
}

/**
 * Zero-cook rescue - minimal effort assembly
 */
export interface ZeroCookRescue {
  rescueType: 'zero_cook';
  drmEventId: string;
  title: string;
  stepsShort: string;
  estMinutes: number;
  contextHash: string;
}

/**
 * Single rescue action union
 * INVARIANT: Always ONE object, never an array
 */
export type SingleRescue = OrderRescue | ZeroCookRescue;

// =============================================================================
// RESPONSE
// =============================================================================

/**
 * Success response with rescue action
 */
export interface DrmSuccessResponse {
  rescue: SingleRescue;
  exhausted: false;
}

/**
 * Exhausted response (no rescue available)
 */
export interface DrmExhaustedResponse {
  rescue: null;
  exhausted: true;
}

/**
 * DRM response union
 */
export type DrmResponse = DrmSuccessResponse | DrmExhaustedResponse;

// =============================================================================
// DATABASE ROW TYPES
// =============================================================================

/**
 * drm_events table row
 */
export interface DrmEventRow {
  id: string;
  household_key: string;
  triggered_at: string;
  trigger_type: DrmTriggerType;
  trigger_reason: DrmTriggerReason;
  rescue_type: 'order' | 'zero_cook' | null;
  rescue_payload: Record<string, unknown> | null;
  exhausted: boolean;
  created_at?: string;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Runtime validation for DRM request
 */
export function isValidDrmRequest(body: unknown): body is DrmRequest {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  
  const req = body as Record<string, unknown>;
  
  // Required fields
  if (typeof req.householdKey !== 'string') return false;
  if (typeof req.nowIso !== 'string') return false;
  if (typeof req.triggerType !== 'string') return false;
  if (typeof req.triggerReason !== 'string') return false;
  
  // Validate trigger type
  if (!['explicit', 'implicit'].includes(req.triggerType)) {
    return false;
  }
  
  // Validate trigger reason
  const validReasons: DrmTriggerReason[] = [
    'handle_it',
    'im_done',
    'late_no_action',
    'two_rejections',
    'calendar_conflict',
    'low_energy',
  ];
  if (!validReasons.includes(req.triggerReason as DrmTriggerReason)) {
    return false;
  }
  
  return true;
}

/**
 * Type guard for OrderRescue
 */
export function isOrderRescue(rescue: SingleRescue): rescue is OrderRescue {
  return rescue.rescueType === 'order';
}

/**
 * Type guard for ZeroCookRescue
 */
export function isZeroCookRescue(rescue: SingleRescue): rescue is ZeroCookRescue {
  return rescue.rescueType === 'zero_cook';
}
