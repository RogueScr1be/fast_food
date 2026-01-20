/**
 * FAST FOOD: Autopilot Policy
 * 
 * Implements "approve-by-default" autopilot under strict eligibility gates.
 * Autopilot must be EARNED through consistent approval behavior.
 * 
 * INVARIANTS:
 * - Deterministic: same inputs always produce same result
 * - Conservative: all gates must pass for eligibility
 * - Reversible: user can always reject/undo
 * - No UI exposure of policy details
 */

import type { DecisionEventRow } from '@/types/decision-os/decision';

// =============================================================================
// TYPES
// =============================================================================

export interface AutopilotContext {
  /** Current time in local ISO format */
  nowIso: string;
  /** User signal */
  signal: {
    timeWindow?: 'early' | 'prime' | 'late';
    energy?: 'high' | 'normal' | 'low';
    calendarConflict?: boolean;
  };
  /** Selected meal ID */
  mealId: string;
  /** Inventory score (0..1) from arbiter */
  inventoryScore: number;
  /** Taste score (0..1) from arbiter */
  tasteScore: number;
  /** Whether meal was used recently (in last 3 local days) */
  usedInLast3Days: boolean;
  /** Recent decision events for computing approval rate */
  recentEvents: DecisionEventRow[];
}

export interface AutopilotResult {
  /** Whether autopilot is eligible */
  eligible: boolean;
  /** Human-readable reason for ineligibility (or 'all_gates_passed') */
  reason: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Autopilot window start time (5:00 PM / 17:00)
 */
export const AUTOPILOT_START_HOUR = 17;
export const AUTOPILOT_START_MINUTE = 0;

/**
 * Autopilot window end time (6:15 PM / 18:15)
 */
export const AUTOPILOT_END_HOUR = 18;
export const AUTOPILOT_END_MINUTE = 15;

/**
 * Minimum inventory score for autopilot eligibility
 */
export const MIN_INVENTORY_SCORE = 0.85;

/**
 * Minimum taste score for autopilot eligibility
 */
export const MIN_TASTE_SCORE = 0.70;

/**
 * Minimum approval rate (last 7 days) for autopilot eligibility
 */
export const MIN_APPROVAL_RATE = 0.70;

/**
 * Days to look back for approval rate calculation
 */
export const APPROVAL_RATE_WINDOW_DAYS = 7;

/**
 * Days to look back for "used recently" check
 */
export const RECENTLY_USED_WINDOW_DAYS = 3;

/**
 * Hours to look back for "rejected recently" check
 */
export const RECENT_REJECTION_WINDOW_HOURS = 24;

// =============================================================================
// TIME PARSING HELPERS
// =============================================================================

/**
 * Parse local hour and minute from ISO timestamp.
 * Uses the local time portion of the ISO string (before 'Z' or timezone offset).
 * 
 * @param isoString - ISO timestamp (e.g., "2026-01-20T17:30:00Z" or "2026-01-20T17:30:00")
 * @returns { hour, minute } in local time
 */
export function parseLocalTime(isoString: string): { hour: number; minute: number } {
  // Extract time portion: "HH:MM:SS" from "YYYY-MM-DDTHH:MM:SS..."
  const match = isoString.match(/T(\d{2}):(\d{2})/);
  if (!match) {
    return { hour: 0, minute: 0 };
  }
  return {
    hour: parseInt(match[1], 10),
    minute: parseInt(match[2], 10),
  };
}

/**
 * Parse local date (YYYY-MM-DD) from ISO timestamp.
 * 
 * @param isoString - ISO timestamp
 * @returns Date string "YYYY-MM-DD"
 */
export function parseLocalDate(isoString: string): string {
  // Extract date portion: "YYYY-MM-DD" from "YYYY-MM-DDTHH:MM:SS..."
  const match = isoString.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

/**
 * Check if time is within autopilot window (17:00 - 18:15 local).
 */
export function isWithinAutopilotWindow(hour: number, minute: number): boolean {
  const timeValue = hour * 60 + minute;
  const startValue = AUTOPILOT_START_HOUR * 60 + AUTOPILOT_START_MINUTE;
  const endValue = AUTOPILOT_END_HOUR * 60 + AUTOPILOT_END_MINUTE;
  
  return timeValue >= startValue && timeValue <= endValue;
}

// =============================================================================
// APPROVAL RATE CALCULATION
// =============================================================================

/**
 * Compute approval rate from recent events.
 * 
 * Formula: approved / (approved + rejected)
 * Ignores: pending, expired, drm_triggered
 * 
 * @param events - Decision events from last N days
 * @param nowIso - Current timestamp
 * @param windowDays - Days to look back
 * @returns Approval rate (0..1), or 1.0 if no approved/rejected events
 */
export function computeApprovalRate(
  events: DecisionEventRow[],
  nowIso: string,
  windowDays: number = APPROVAL_RATE_WINDOW_DAYS
): number {
  const nowDate = new Date(nowIso);
  const cutoffTime = nowDate.getTime() - (windowDays * 24 * 60 * 60 * 1000);
  
  let approved = 0;
  let rejected = 0;
  
  for (const event of events) {
    const eventTime = new Date(event.decided_at).getTime();
    if (eventTime < cutoffTime) continue;
    
    if (event.user_action === 'approved') {
      approved++;
    } else if (event.user_action === 'rejected') {
      rejected++;
    }
    // Ignore: pending, expired, drm_triggered
  }
  
  const total = approved + rejected;
  if (total === 0) {
    // No decisions to evaluate - give benefit of the doubt
    return 1.0;
  }
  
  return approved / total;
}

/**
 * Check if there was any rejection in the last N hours.
 * 
 * @param events - Decision events
 * @param nowIso - Current timestamp
 * @param windowHours - Hours to look back
 * @returns True if rejected in window
 */
export function hasRecentRejection(
  events: DecisionEventRow[],
  nowIso: string,
  windowHours: number = RECENT_REJECTION_WINDOW_HOURS
): boolean {
  const nowTime = new Date(nowIso).getTime();
  const cutoffTime = nowTime - (windowHours * 60 * 60 * 1000);
  
  return events.some(event => {
    if (event.user_action !== 'rejected') return false;
    const eventTime = new Date(event.decided_at).getTime();
    return eventTime >= cutoffTime;
  });
}

/**
 * Check if meal was used in the last N local days.
 * Uses local date (YYYY-MM-DD) comparison.
 * 
 * @param mealId - Meal to check
 * @param events - Decision events
 * @param nowIso - Current timestamp
 * @param windowDays - Days to look back
 * @returns True if meal was approved in window
 */
export function wasMealUsedRecently(
  mealId: string,
  events: DecisionEventRow[],
  nowIso: string,
  windowDays: number = RECENTLY_USED_WINDOW_DAYS
): boolean {
  const nowLocalDate = parseLocalDate(nowIso);
  if (!nowLocalDate) return false;
  
  // Get dates for the window (today, yesterday, day before, ...)
  const validDates = new Set<string>();
  const nowDate = new Date(nowLocalDate);
  
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(nowDate);
    d.setDate(d.getDate() - i);
    validDates.add(d.toISOString().slice(0, 10));
  }
  
  return events.some(event => {
    if (event.meal_id !== mealId) return false;
    if (event.user_action !== 'approved') return false;
    
    const eventLocalDate = parseLocalDate(event.decided_at);
    return validDates.has(eventLocalDate);
  });
}

// =============================================================================
// MAIN POLICY FUNCTION
// =============================================================================

/**
 * Evaluate autopilot eligibility.
 * 
 * ALL gates must pass for autopilot to be eligible:
 * 1. Local time between 17:00 and 18:15
 * 2. calendarConflict === false
 * 3. energy !== 'low'
 * 4. inventoryScore >= 0.85
 * 5. tasteScore >= 0.70
 * 6. Meal not used in last 3 local days
 * 7. Last 7 days approval rate >= 0.70
 * 8. No rejection in last 24 hours
 * 
 * @param context - Autopilot evaluation context
 * @returns Eligibility result with reason
 */
export function evaluateAutopilotEligibility(context: AutopilotContext): AutopilotResult {
  const { nowIso, signal, mealId, inventoryScore, tasteScore, usedInLast3Days, recentEvents } = context;
  
  // Gate 1: Time window (17:00 - 18:15 local)
  const { hour, minute } = parseLocalTime(nowIso);
  if (!isWithinAutopilotWindow(hour, minute)) {
    return { eligible: false, reason: 'outside_autopilot_window' };
  }
  
  // Gate 2: No calendar conflict
  if (signal.calendarConflict === true) {
    return { eligible: false, reason: 'calendar_conflict' };
  }
  
  // Gate 3: Energy not low
  if (signal.energy === 'low') {
    return { eligible: false, reason: 'low_energy' };
  }
  
  // Gate 4: Inventory score threshold
  if (inventoryScore < MIN_INVENTORY_SCORE) {
    return { eligible: false, reason: 'low_inventory_score' };
  }
  
  // Gate 5: Taste score threshold
  if (tasteScore < MIN_TASTE_SCORE) {
    return { eligible: false, reason: 'low_taste_score' };
  }
  
  // Gate 6: Meal not used recently
  if (usedInLast3Days) {
    return { eligible: false, reason: 'meal_used_recently' };
  }
  
  // Gate 7: Approval rate threshold
  const approvalRate = computeApprovalRate(recentEvents, nowIso);
  if (approvalRate < MIN_APPROVAL_RATE) {
    return { eligible: false, reason: 'low_approval_rate' };
  }
  
  // Gate 8: No recent rejections
  if (hasRecentRejection(recentEvents, nowIso)) {
    return { eligible: false, reason: 'recent_rejection' };
  }
  
  // All gates passed!
  return { eligible: true, reason: 'all_gates_passed' };
}
