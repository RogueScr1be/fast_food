/**
 * Autopilot Policy
 * 
 * Computes approval rate using LOCAL DATE windowing (not UTC timestamps).
 * This ensures consistent behavior regardless of timezone.
 */

import type { DecisionEvent, ApprovalRateResult, AutopilotConfig } from '../../../types/decision-os';

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
 * Parses an ISO timestamp string and extracts the local date portion (YYYY-MM-DD).
 * This handles timestamps with timezone offsets correctly.
 * 
 * @param isoString - ISO 8601 timestamp string
 * @returns Local date string in YYYY-MM-DD format
 */
export function parseLocalDate(isoString: string): string {
  // Parse the ISO string into a Date object
  const date = new Date(isoString);
  
  // Extract local date components
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
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
 * Computes the approval rate for a user within the local-date window.
 * 
 * Only counts events with status 'approved' or 'rejected'.
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
    // Only count approved or rejected events
    if (event.status !== 'approved' && event.status !== 'rejected') {
      continue;
    }
    
    // Get the relevant timestamp (actioned_at takes precedence)
    const eventTimestamp = getEventTimestamp(event);
    const eventLocalDate = parseLocalDate(eventTimestamp);
    
    // Check if event falls within the window
    if (!allowedDates.has(eventLocalDate)) {
      continue;
    }
    
    // Count by status
    if (event.status === 'approved') {
      approved++;
    } else if (event.status === 'rejected') {
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
  if (!config.enabled) {
    return false;
  }
  
  const result = computeApprovalRate(events, config, referenceDate);
  return result.eligible;
}
