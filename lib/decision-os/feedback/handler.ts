/**
 * Feedback Handler
 * 
 * Handles user feedback on decisions with support for:
 * - Append-only feedback copies
 * - Undo semantics for autopilot approvals
 * - Idempotency for duplicate undo requests
 */

import type { 
  DecisionEvent, 
  FeedbackRequest, 
  FeedbackResponse,
  UserAction 
} from '../../../types/decision-os';

/**
 * Idempotency window in milliseconds (10 minutes)
 */
const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

/**
 * Generates a unique ID for feedback copies
 */
export function generateFeedbackCopyId(originalEventId: string, action: UserAction): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${originalEventId}-feedback-${action}-${timestamp}-${random}`;
}

/**
 * Creates a feedback copy event from an original pending event.
 * 
 * @param originalEvent - The original pending decision event
 * @param userAction - The user's action (approved, rejected, modified)
 * @param modifiedPayload - Optional modified payload for 'modified' action
 * @returns New feedback copy event
 */
export function createFeedbackCopy(
  originalEvent: DecisionEvent,
  userAction: UserAction,
  modifiedPayload?: Record<string, unknown>
): DecisionEvent {
  const nowIso = new Date().toISOString();
  
  return {
    id: generateFeedbackCopyId(originalEvent.id, userAction),
    user_profile_id: originalEvent.user_profile_id,
    decided_at: originalEvent.decided_at,
    actioned_at: nowIso,
    status: userAction === 'approved' ? 'approved' : 'rejected',
    decision_payload: modifiedPayload ?? originalEvent.decision_payload,
    is_feedback_copy: true,
    original_event_id: originalEvent.id,
  };
}

/**
 * Checks if a duplicate feedback copy exists within the idempotency window.
 * 
 * @param existingCopies - Existing feedback copies for the original event
 * @param userAction - The action being requested
 * @returns True if a duplicate exists within the idempotency window
 */
export function hasDuplicateFeedback(
  existingCopies: DecisionEvent[],
  userAction: UserAction
): boolean {
  const now = Date.now();
  const targetStatus = userAction === 'approved' ? 'approved' : 'rejected';
  
  for (const copy of existingCopies) {
    if (copy.status !== targetStatus) {
      continue;
    }
    
    if (!copy.actioned_at) {
      continue;
    }
    
    const actionTime = new Date(copy.actioned_at).getTime();
    if (now - actionTime < IDEMPOTENCY_WINDOW_MS) {
      return true;
    }
  }
  
  return false;
}

/**
 * Result of processing feedback
 */
export interface ProcessFeedbackResult {
  recorded: boolean;
  feedbackCopy?: DecisionEvent;
  isDuplicate: boolean;
}

/**
 * Processes a feedback request.
 * 
 * This function implements:
 * - Append-only feedback copy creation
 * - Undo semantics (rejected feedback after autopilot approval)
 * - Idempotency for duplicate requests
 * 
 * @param originalEvent - The original pending decision event
 * @param existingCopies - Existing feedback copies for this event
 * @param request - The feedback request
 * @returns ProcessFeedbackResult with the outcome
 */
export function processFeedback(
  originalEvent: DecisionEvent,
  existingCopies: DecisionEvent[],
  request: FeedbackRequest
): ProcessFeedbackResult {
  // Check for duplicate within idempotency window
  if (hasDuplicateFeedback(existingCopies, request.userAction)) {
    return {
      recorded: true,
      isDuplicate: true,
    };
  }
  
  // Create the feedback copy
  const feedbackCopy = createFeedbackCopy(
    originalEvent,
    request.userAction,
    request.modifiedPayload
  );
  
  return {
    recorded: true,
    feedbackCopy,
    isDuplicate: false,
  };
}

/**
 * Determines if consumption should run for a feedback event.
 * 
 * Consumption should NOT run for:
 * - Rejected feedback copies (undo doesn't consume)
 * - Only approved events trigger consumption
 * 
 * @param event - The decision event
 * @returns True if consumption should run
 */
export function shouldRunConsumption(event: DecisionEvent): boolean {
  // Only approved events trigger consumption
  if (event.status !== 'approved') {
    return false;
  }
  
  return true;
}

/**
 * Determines if taste graph should update for a feedback event.
 * 
 * Taste graph updates for both approved and rejected events,
 * but with different weights.
 * 
 * @param event - The decision event
 * @returns True if taste graph should update
 */
export function shouldUpdateTasteGraph(event: DecisionEvent): boolean {
  // Both approved and rejected update taste graph
  return event.status === 'approved' || event.status === 'rejected';
}

/**
 * Gets the taste graph weight for a feedback event.
 * 
 * @param event - The decision event
 * @returns Weight multiplier (positive for approved, negative for rejected)
 */
export function getTasteGraphWeight(event: DecisionEvent): number {
  if (event.status === 'approved') {
    return 1.0;
  } else if (event.status === 'rejected') {
    return -0.5; // Negative weight for rejection
  }
  return 0;
}
