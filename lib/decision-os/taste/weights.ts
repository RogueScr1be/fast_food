/**
 * Taste Graph Weight Computation
 * 
 * Weight semantics:
 * - approved:      +1.0  (positive taste signal)
 * - rejected:      -1.0  (negative taste signal)
 * - drm_triggered: -0.5  (mild negative, user changed plans)
 * - expired:       -0.2  (very mild negative, user didn't engage)
 * - undo:          -0.5  (AUTONOMY PENALTY, not a taste rejection)
 * 
 * Stress multiplier:
 * - After 8pm local time, magnitude is multiplied by 1.10
 * - This reflects that decisions made under dinner-time stress carry more weight
 * 
 * Clamping:
 * - Final weight is clamped to [-2, 2] to prevent outliers
 * 
 * IMPORTANT: Undo is an autonomy penalty signal (-0.5), NOT a taste rejection.
 * The user may actually like the food; they just didn't want it auto-applied.
 */

import type { DecisionEvent } from '../../../types/decision-os';

/**
 * Base weights for each action/status.
 */
export const BASE_WEIGHTS = {
  approved: 1.0,
  rejected: -1.0,
  drm_triggered: -0.5,
  expired: -0.2,
  undo: -0.5, // Autonomy penalty, NOT taste rejection
} as const;

/**
 * Stress multiplier applied after 8pm (20:00) local time.
 * Magnitude is multiplied by this factor.
 */
export const STRESS_MULTIPLIER = 1.10;

/**
 * Hour threshold for stress multiplier (8pm = 20).
 */
export const STRESS_HOUR_THRESHOLD = 20;

/**
 * Weight clamp bounds.
 */
export const WEIGHT_MIN = -2;
export const WEIGHT_MAX = 2;

/**
 * Checks if the given timestamp is after 8pm local time.
 * 
 * @param isoTimestamp - ISO timestamp string
 * @returns True if after 8pm
 */
export function isAfter8pm(isoTimestamp: string): boolean {
  const date = new Date(isoTimestamp);
  return date.getHours() >= STRESS_HOUR_THRESHOLD;
}

/**
 * Gets the base weight for an event based on its status/action.
 * 
 * @param event - The decision event
 * @returns Base weight before stress multiplier
 */
export function getBaseWeight(event: DecisionEvent): number {
  // Check for undo first (notes='undo_autopilot')
  if (event.notes === 'undo_autopilot') {
    return BASE_WEIGHTS.undo;
  }
  
  // Use user_action if available, otherwise fall back to status
  const action = event.user_action ?? event.status;
  
  switch (action) {
    case 'approved':
      return BASE_WEIGHTS.approved;
    case 'rejected':
      return BASE_WEIGHTS.rejected;
    case 'drm_triggered':
      return BASE_WEIGHTS.drm_triggered;
    case 'undo':
      return BASE_WEIGHTS.undo;
    default:
      break;
  }
  
  // Check status for expired
  if (event.status === 'expired') {
    return BASE_WEIGHTS.expired;
  }
  
  // pending or unknown status
  return 0;
}

/**
 * Clamps a value to the specified range.
 * 
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Computes the taste graph weight for a decision event.
 * 
 * Weight semantics:
 * - approved:      +1.0  (positive taste signal)
 * - rejected:      -1.0  (negative taste signal)
 * - drm_triggered: -0.5  (mild negative, user changed plans)
 * - expired:       -0.2  (very mild negative, user didn't engage)
 * - undo:          -0.5  (AUTONOMY PENALTY, not taste rejection)
 * 
 * After 8pm, magnitude is multiplied by 1.10 (stress multiplier).
 * Final weight is clamped to [-2, 2].
 * 
 * @param event - The decision event
 * @param nowIso - Optional current ISO timestamp for testing (defaults to event.actioned_at)
 * @returns Computed weight, clamped to [-2, 2]
 */
export function computeTasteWeight(
  event: DecisionEvent,
  nowIso?: string
): number {
  const baseWeight = getBaseWeight(event);
  
  if (baseWeight === 0) {
    return 0;
  }
  
  // Determine if stress multiplier applies
  const timestamp = nowIso ?? event.actioned_at ?? event.decided_at;
  const shouldApplyStress = isAfter8pm(timestamp);
  
  // Apply stress multiplier to magnitude
  let weight = baseWeight;
  if (shouldApplyStress) {
    // Multiply magnitude, preserving sign
    weight = baseWeight * STRESS_MULTIPLIER;
  }
  
  // Clamp to bounds
  return clamp(weight, WEIGHT_MIN, WEIGHT_MAX);
}
