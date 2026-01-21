/**
 * Autopilot Policy
 * 
 * Computes approval rate using LOCAL DATE windowing (not UTC timestamps).
 * This ensures consistent behavior regardless of timezone.
 * 
 * UNDO THROTTLING:
 * - Recent undo (within 72h) blocks autopilot
 * - Undo events do NOT affect approval rate calculation
 */

import type { DecisionEvent, ApprovalRateResult, AutopilotConfig } from '../../../types/decision-os';
import { NOTES } from '../feedback/handler';

/**
 * Default autopilot configuration
 */
export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  enabled: true,
  minApprovalRate: 0.8, // 80% approval rate required
  minDecisions: 5,       // Minimum 5 decisions in window
  windowDays: 7,         // 7-day rolling window
};

/**
 * Recent undo window in hours.
 * If an undo occurred within this window, autopilot is blocked.
 */
export const RECENT_UNDO_WINDOW_HOURS = 72;

/**
 * Autopilot eligibility result with detailed reason.
 */
export interface AutopilotEligibility {
  eligible: boolean;
  reason: 'enabled' | 'disabled' | 'insufficient_decisions' | 'low_approval_rate' | 'recent_undo';
  approvalRate?: ApprovalRateResult;
}

/**
 * Regex to validate ISO date format at start of string.
 * Matches: YYYY-MM-DD (with optional time portion after)
 */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}/;

/**
 * Parses an ISO timestamp string and extracts the local date portion (YYYY-MM-DD).
 * 
 * Uses deterministic substring parsing - NO Date() conversion.
 * This ensures timezone-independent behavior: the literal date in the string is used.
 * 
 * Examples:
 * - "2026-01-20T23:30:00-06:00" -> "2026-01-20"
 * - "2026-01-21T04:30:00Z" -> "2026-01-21"
 * - "2026-01-20" -> "2026-01-20"
 * 
 * @param isoString - ISO 8601 timestamp string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...)
 * @returns Local date string in YYYY-MM-DD format
 * @throws Error if string does not start with valid YYYY-MM-DD format
 */
export function parseLocalDate(isoString: string): string {
  if (!ISO_DATE_REGEX.test(isoString)) {
    throw new Error(`Invalid ISO date format: "${isoString}". Expected YYYY-MM-DD at start.`);
  }
  
  return isoString.substring(0, 10);
}

/**
 * Generates an array of local date strings for the approval window.
 * Returns dates from today back to (windowDays - 1) days ago.
 * 
 * @param windowDays - Number of days in the window (default 7)
 * @param referenceDate - Reference date (default: now)
 * @returns Set of date strings in YYYY-MM-DD format
 */
export function getWindowDates(windowDays: number = 7, referenceDate?: Date): Set<string> {
  const dates = new Set<string>();
  const now = referenceDate ?? new Date();
  
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    dates.add(`${year}-${month}-${day}`);
  }
  
  return dates;
}

/**
 * Gets the relevant timestamp for a decision event.
 * Uses actioned_at if available, otherwise falls back to decided_at.
 * 
 * @param event - Decision event
 * @returns ISO timestamp string
 */
export function getEventTimestamp(event: DecisionEvent): string {
  return event.actioned_at ?? event.decided_at;
}

/**
 * Checks if an event is an undo event (notes='undo_autopilot').
 * 
 * @param event - Decision event
 * @returns True if undo event
 */
export function isUndoEvent(event: DecisionEvent): boolean {
  return event.user_action === 'rejected' && event.notes === NOTES.UNDO_AUTOPILOT;
}

/**
 * Checks if there's a recent undo within the specified window.
 * 
 * @param events - Array of decision events
 * @param windowHours - Window in hours (default: 72)
 * @param referenceDate - Reference date (default: now)
 * @returns True if recent undo exists
 */
export function hasRecentUndo(
  events: DecisionEvent[],
  windowHours: number = RECENT_UNDO_WINDOW_HOURS,
  referenceDate?: Date
): boolean {
  const now = referenceDate ?? new Date();
  const windowMs = windowHours * 60 * 60 * 1000;
  const cutoffMs = now.getTime() - windowMs;
  
  for (const event of events) {
    if (!isUndoEvent(event)) {
      continue;
    }
    
    const eventTimestamp = getEventTimestamp(event);
    const eventTime = new Date(eventTimestamp).getTime();
    
    if (eventTime >= cutoffMs) {
      return true;
    }
  }
  
  return false;
}

/**
 * Computes the approval rate for a user within the local-date window.
 * 
 * Only counts events with user_action 'approved' or 'rejected'.
 * EXCLUDES undo events (notes='undo_autopilot') from the count.
 * Ignores 'pending', 'expired', and 'drm_triggered' statuses.
 * 
 * @param events - Array of decision events for the user
 * @param config - Autopilot configuration
 * @param referenceDate - Reference date for window calculation (default: now)
 * @returns ApprovalRateResult with rate, counts, and eligibility
 */
export function computeApprovalRate(
  events: DecisionEvent[],
  config: AutopilotConfig = DEFAULT_AUTOPILOT_CONFIG,
  referenceDate?: Date
): ApprovalRateResult {
  const allowedDates = getWindowDates(config.windowDays, referenceDate);
  
  let approved = 0;
  let rejected = 0;
  
  for (const event of events) {
    // SKIP undo events - they are autonomy penalties, not taste signals
    if (isUndoEvent(event)) {
      continue;
    }
    
    // Only count approved or rejected user_actions
    if (event.user_action !== 'approved' && event.user_action !== 'rejected') {
      continue;
    }
    
    // Get the relevant timestamp (actioned_at takes precedence)
    const eventTimestamp = getEventTimestamp(event);
    const eventLocalDate = parseLocalDate(eventTimestamp);
    
    // Check if event falls within the window
    if (!allowedDates.has(eventLocalDate)) {
      continue;
    }
    
    // Count by user_action
    if (event.user_action === 'approved') {
      approved++;
    } else if (event.user_action === 'rejected') {
      rejected++;
    }
  }
  
  const total = approved + rejected;
  
  // If no decisions in window, return 1.0 (benefit of the doubt)
  if (total === 0) {
    return {
      rate: 1.0,
      approved: 0,
      rejected: 0,
      total: 0,
      eligible: false, // Not eligible because minDecisions not met
    };
  }
  
  const rate = approved / total;
  const eligible = total >= config.minDecisions && rate >= config.minApprovalRate;
  
  return {
    rate,
    approved,
    rejected,
    total,
    eligible,
  };
}

/**
 * Determines if autopilot should be applied for a decision.
 * 
 * @param events - User's historical decision events
 * @param config - Autopilot configuration
 * @param referenceDate - Reference date for window calculation
 * @returns True if autopilot should be applied
 */
export function shouldAutopilot(
  events: DecisionEvent[],
  config: AutopilotConfig = DEFAULT_AUTOPILOT_CONFIG,
  referenceDate?: Date
): boolean {
  const eligibility = checkAutopilotEligibility(events, config, referenceDate);
  return eligibility.eligible;
}

/**
 * Checks autopilot eligibility with detailed reason.
 * 
 * Gates (in order):
 * 1. Config enabled
 * 2. No recent undo (within 72h)
 * 3. Minimum decisions met
 * 4. Minimum approval rate met
 * 
 * @param events - User's historical decision events
 * @param config - Autopilot configuration
 * @param referenceDate - Reference date for window calculation
 * @returns AutopilotEligibility with eligible flag and reason
 */
export function checkAutopilotEligibility(
  events: DecisionEvent[],
  config: AutopilotConfig = DEFAULT_AUTOPILOT_CONFIG,
  referenceDate?: Date
): AutopilotEligibility {
  // Gate 1: Config enabled
  if (!config.enabled) {
    return {
      eligible: false,
      reason: 'disabled',
    };
  }
  
  // Gate 2: No recent undo (within 72h)
  // This is the "earned autonomy" throttle
  if (hasRecentUndo(events, RECENT_UNDO_WINDOW_HOURS, referenceDate)) {
    return {
      eligible: false,
      reason: 'recent_undo',
    };
  }
  
  // Gate 3 & 4: Approval rate
  const approvalRate = computeApprovalRate(events, config, referenceDate);
  
  if (approvalRate.total < config.minDecisions) {
    return {
      eligible: false,
      reason: 'insufficient_decisions',
      approvalRate,
    };
  }
  
  if (approvalRate.rate < config.minApprovalRate) {
    return {
      eligible: false,
      reason: 'low_approval_rate',
      approvalRate,
    };
  }
  
  return {
    eligible: true,
    reason: 'enabled',
    approvalRate,
  };
}
