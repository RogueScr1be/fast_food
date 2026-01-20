/**
 * FAST FOOD: Taste Graph - Signal Weighting
 * 
 * Computes weight for taste signals based on user action.
 * 
 * WEIGHT VALUES:
 * - approved:       +1.0
 * - rejected:       -1.0
 * - drm_triggered:  -0.5
 * - expired:        -0.2
 * 
 * OPTIONAL FACTORS:
 * - Late hour (>= 8 PM): multiply magnitude by 1.10 (stress factor)
 * 
 * INVARIANTS:
 * - Deterministic
 * - Weight clamped to [-2.0, +2.0] per DB CHECK constraint
 */

// =============================================================================
// WEIGHT CONSTANTS
// =============================================================================

/**
 * Base weight for approved decision
 * Positive signal - user liked the meal
 */
export const WEIGHT_APPROVED = 1.0;

/**
 * Base weight for rejected decision
 * Negative signal - user explicitly rejected
 */
export const WEIGHT_REJECTED = -1.0;

/**
 * Base weight for DRM triggered
 * Soft negative - meal was shown but user triggered DRM
 * Less negative than explicit rejection
 */
export const WEIGHT_DRM_TRIGGERED = -0.5;

/**
 * Base weight for expired decision
 * Weak negative - user didn't act (timeout)
 * Least negative - could be external factors
 */
export const WEIGHT_EXPIRED = -0.2;

/**
 * Stress hour threshold (8 PM / 20:00)
 * Actions at or after this hour get stress multiplier
 */
export const STRESS_HOUR_THRESHOLD = 20;

/**
 * Stress multiplier for late-hour decisions
 * Applied to weight magnitude when hour >= STRESS_HOUR_THRESHOLD
 */
export const STRESS_MULTIPLIER = 1.10;

/**
 * Minimum allowed weight (DB CHECK constraint)
 */
export const MIN_WEIGHT = -2.0;

/**
 * Maximum allowed weight (DB CHECK constraint)
 */
export const MAX_WEIGHT = 2.0;

// =============================================================================
// TYPES
// =============================================================================

export type UserActionForWeight = 'approved' | 'rejected' | 'drm_triggered' | 'expired';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Clamp value to range
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Parse hour from ISO string (respects timezone in string)
 * For "2026-01-19T20:30:00-06:00", returns 20
 */
export function parseHourFromIso(isoString: string | null | undefined): number {
  if (!isoString) {
    return 0;
  }
  
  // Extract the time portion (HH:MM:SS) before timezone
  const match = isoString.match(/T(\d{2}):/);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  // Fallback to Date parsing if format is unexpected
  return new Date(isoString).getHours();
}

// =============================================================================
// MAIN WEIGHT COMPUTATION
// =============================================================================

/**
 * Get the base weight for a user action.
 * 
 * @param userAction - The user action
 * @returns Base weight value
 */
export function getBaseWeight(userAction: UserActionForWeight): number {
  switch (userAction) {
    case 'approved':
      return WEIGHT_APPROVED;
    case 'rejected':
      return WEIGHT_REJECTED;
    case 'drm_triggered':
      return WEIGHT_DRM_TRIGGERED;
    case 'expired':
      return WEIGHT_EXPIRED;
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = userAction;
      throw new Error(`Unknown user action: ${_exhaustive}`);
  }
}

/**
 * Compute the final weight for a taste signal.
 * 
 * Applies:
 * 1. Base weight from user action
 * 2. Optional stress multiplier if actioned_at hour >= 20 (8 PM)
 * 3. Clamps to [-2.0, +2.0] to satisfy DB constraint
 * 
 * @param userAction - The user action (approved/rejected/drm_triggered/expired)
 * @param actionedAt - ISO timestamp when user acted (null for expired)
 * @returns Clamped weight value
 */
export function computeWeight(
  userAction: UserActionForWeight,
  actionedAt: string | null | undefined
): number {
  let weight = getBaseWeight(userAction);
  
  // Apply stress multiplier if late hour
  const hour = parseHourFromIso(actionedAt);
  if (hour >= STRESS_HOUR_THRESHOLD) {
    // Multiply magnitude (preserve sign)
    weight = weight * STRESS_MULTIPLIER;
  }
  
  // Clamp to DB constraint range
  return clamp(weight, MIN_WEIGHT, MAX_WEIGHT);
}

/**
 * Check if a given hour qualifies for stress multiplier
 */
export function isStressHour(hour: number): boolean {
  return hour >= STRESS_HOUR_THRESHOLD;
}
