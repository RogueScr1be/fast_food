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
  UserAction 
} from '../../../types/decision-os';

/**
 * Idempotency window in milliseconds (10 minutes)
 */
export const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

/**
 * Undo window in milliseconds (10 minutes)
 * Undo is only allowed within this window after the autopilot action
 */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

/**
 * Generates a unique ID for feedback copies
 */
export function generateFeedbackCopyId(originalEventId: string, action: UserAction): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${originalEventId}-feedback-${action}-${timestamp}-${random}`;
}

/**
 * Checks if an event is within the undo window.
 * 
 * @param event - The decision event to check
 * @param nowMs - Current time in milliseconds (default: Date.now())
 * @returns True if within undo window
 */
export function isWithinUndoWindow(event: DecisionEvent, nowMs: number = Date.now()): boolean {
  if (!event.actioned_at) {
    return false;
  }
  
  const actionTime = new Date(event.actioned_at).getTime();
  return (nowMs - actionTime) <= UNDO_WINDOW_MS;
}

/**
 * Checks if an event is an autopilot-approved event that can be undone.
 * 
 * @param event - The decision event to check
 * @returns True if this is an undoable autopilot event
 */
export function isAutopilotEvent(event: DecisionEvent): boolean {
  return event.is_autopilot === true && event.status === 'approved';
}

/**
 * Creates a feedback copy event from an original pending event.
 * 
 * @param originalEvent - The original pending decision event
 * @param userAction - The user's action (approved, rejected, modified, undo)
 * @param modifiedPayload - Optional modified payload for 'modified' action
 * @returns New feedback copy event
 */
export function createFeedbackCopy(
  originalEvent: DecisionEvent,
  userAction: UserAction,
  modifiedPayload?: Record<string, unknown>
): DecisionEvent {
  const nowIso = new Date().toISOString();
  
  // Determine status and notes based on action
  const isUndo = userAction === 'undo';
  const status = (userAction === 'approved') ? 'approved' : 'rejected';
  const notes = isUndo ? 'undo_autopilot' : undefined;
  
  return {
    id: generateFeedbackCopyId(originalEvent.id, userAction),
    user_profile_id: originalEvent.user_profile_id,
    decided_at: originalEvent.decided_at,
    actioned_at: nowIso,
    status,
    decision_payload: modifiedPayload ?? originalEvent.decision_payload,
    is_feedback_copy: true,
    original_event_id: originalEvent.id,
    notes,
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
  const isUndoAction = userAction === 'undo';
  
  for (const copy of existingCopies) {
    if (copy.status !== targetStatus) {
      continue;
    }
    
    // For undo, also check that notes match
    if (isUndoAction && copy.notes !== 'undo_autopilot') {
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
  reason?: 'duplicate' | 'outside_window' | 'not_autopilot' | 'success';
}

/**
 * Finds the most recent autopilot-approved event from existing copies.
 * 
 * @param existingCopies - Existing feedback copies
 * @returns The most recent autopilot-approved event, or undefined
 */
export function findAutopilotApprovedCopy(existingCopies: DecisionEvent[]): DecisionEvent | undefined {
  return existingCopies
    .filter(copy => copy.is_autopilot === true && copy.status === 'approved')
    .sort((a, b) => {
      const aTime = a.actioned_at ? new Date(a.actioned_at).getTime() : 0;
      const bTime = b.actioned_at ? new Date(b.actioned_at).getTime() : 0;
      return bTime - aTime; // Most recent first
    })[0];
}

/**
 * Processes an undo request for an autopilot-approved decision.
 * 
 * Undo is only allowed:
 * - For autopilot-approved events
 * - Within the undo window (10 minutes)
 * - Idempotent: multiple undos within window create only one undo copy
 * 
 * @param autopilotEvent - The autopilot-approved event to undo
 * @param existingCopies - Existing feedback copies for this event
 * @param nowMs - Current time in milliseconds (default: Date.now())
 * @returns ProcessFeedbackResult with the outcome
 */
export function processUndo(
  autopilotEvent: DecisionEvent,
  existingCopies: DecisionEvent[],
  nowMs: number = Date.now()
): ProcessFeedbackResult {
  // Check if this is actually an autopilot event
  if (!isAutopilotEvent(autopilotEvent)) {
    return {
      recorded: true,
      isDuplicate: false,
      reason: 'not_autopilot',
    };
  }
  
  // Check if within undo window
  if (!isWithinUndoWindow(autopilotEvent, nowMs)) {
    return {
      recorded: true,
      isDuplicate: false,
      reason: 'outside_window',
    };
  }
  
  // Check for duplicate undo within idempotency window
  if (hasDuplicateFeedback(existingCopies, 'undo')) {
    return {
      recorded: true,
      isDuplicate: true,
      reason: 'duplicate',
    };
  }
  
  // Create the undo feedback copy
  const feedbackCopy = createFeedbackCopy(autopilotEvent, 'undo');
  
  return {
    recorded: true,
    feedbackCopy,
    isDuplicate: false,
    reason: 'success',
  };
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
  // Handle undo specially
  if (request.userAction === 'undo') {
    // For undo, we need to find the autopilot-approved copy
    const autopilotCopy = findAutopilotApprovedCopy(existingCopies);
    if (!autopilotCopy) {
      // Check if original event is autopilot
      if (isAutopilotEvent(originalEvent)) {
        return processUndo(originalEvent, existingCopies);
      }
      return {
        recorded: true,
        isDuplicate: false,
        reason: 'not_autopilot',
      };
    }
    return processUndo(autopilotCopy, existingCopies);
  }
  
  // Check for duplicate within idempotency window
  if (hasDuplicateFeedback(existingCopies, request.userAction)) {
    return {
      recorded: true,
      isDuplicate: true,
      reason: 'duplicate',
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
    reason: 'success',
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
 * Weight mapping:
 * - approved: +1.0
 * - rejected (manual): -0.5
 * - undo (autopilot): -0.5 (same as rejected, treat undo as mild rejection)
 * 
 * Note: Undo is treated as a mild rejection signal. We use -0.5 (not -1.0)
 * because the user may not strongly dislike the choice, just didn't want it
 * auto-applied this time.
 * 
 * @param event - The decision event
 * @returns Weight multiplier (positive for approved, negative for rejected)
 */
export function getTasteGraphWeight(event: DecisionEvent): number {
  if (event.status === 'approved') {
    return 1.0;
  } else if (event.status === 'rejected') {
    // Both manual rejection and undo (notes='undo_autopilot') get -0.5
    return -0.5;
  }
  return 0;
}

/**
 * Determines if consumption should be reversed for an undo event.
 * 
 * In v1, we do NOT reverse consumption because:
 * 1. We may not have tracked exact consumption amounts per decision
 * 2. Reversing partial consumption is complex and error-prone
 * 3. The user can manually adjust inventory if needed
 * 
 * Future versions may implement compensating +qty entries if we track
 * exact consumption per decision event.
 * 
 * @param event - The decision event
 * @returns True if consumption should be reversed (always false in v1)
 */
export function shouldReverseConsumption(_event: DecisionEvent): boolean {
  // v1: Do NOT reverse consumption
  // Reason: We don't track exact consumption per decision event
  return false;
}
