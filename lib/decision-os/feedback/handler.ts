/**
 * Feedback Handler
 * 
 * Handles user feedback on decisions with support for:
 * - Append-only feedback copies
 * - Undo semantics for autopilot approvals
 * - Idempotency for duplicate undo requests
 * - Autopilot double-learn prevention
 * 
 * PERSISTENCE MODEL:
 * - Undo is persisted as: user_action='rejected', notes='undo_autopilot'
 * - Autopilot approvals: user_action='approved', notes='autopilot'
 * - NO phantom DB fields: status, is_autopilot, is_feedback_copy, original_event_id
 */

import type { 
  DecisionEvent, 
  DecisionEventInsert,
  FeedbackRequest, 
  ClientUserAction,
  PersistedUserAction,
  NOTES_MARKERS,
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
 * Notes markers (re-exported for convenience)
 */
export const NOTES = {
  UNDO_AUTOPILOT: 'undo_autopilot',
  AUTOPILOT: 'autopilot',
} as const;

/**
 * Generates a unique ID for feedback copies
 */
export function generateFeedbackCopyId(originalEventId: string, action: string): string {
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
 * Checks if an event is an autopilot-approved event (via notes marker).
 * 
 * Autopilot events are identified by: user_action='approved' AND notes='autopilot'
 * This is schema-true - no phantom is_autopilot column.
 * 
 * @param event - The decision event to check
 * @returns True if this is an autopilot-approved event
 */
export function isAutopilotEvent(event: DecisionEvent): boolean {
  return event.user_action === 'approved' && event.notes === NOTES.AUTOPILOT;
}

/**
 * Checks if an event is an undo event (via notes marker).
 * 
 * Undo events are identified by: user_action='rejected' AND notes='undo_autopilot'
 * 
 * @param event - The decision event to check
 * @returns True if this is an undo event
 */
export function isUndoEvent(event: DecisionEvent): boolean {
  return event.user_action === 'rejected' && event.notes === NOTES.UNDO_AUTOPILOT;
}

/**
 * Creates a feedback copy row for DB insertion.
 * 
 * PERSISTENCE MODEL (schema-true, no phantom fields):
 * - user_action: 'approved' | 'rejected' | 'drm_triggered' (NOT 'undo')
 * - notes: 'undo_autopilot' for undo, 'autopilot' for autopilot approvals
 * - NO status, is_autopilot, is_feedback_copy, original_event_id columns
 * 
 * @param originalEvent - The original decision event
 * @param clientAction - The client's action (approved, rejected, drm_triggered, undo)
 * @param isAutopilotApproval - True if this is an autopilot-generated approval
 * @returns DecisionEventInsert ready for DB insertion
 */
export function createFeedbackCopy(
  originalEvent: DecisionEvent,
  clientAction: ClientUserAction,
  isAutopilotApproval: boolean = false
): DecisionEventInsert {
  const nowIso = new Date().toISOString();
  
  // Map client action to persisted user_action
  // 'undo' maps to 'rejected' with notes='undo_autopilot'
  const isUndo = clientAction === 'undo';
  let persistedAction: PersistedUserAction;
  
  if (isUndo) {
    persistedAction = 'rejected';
  } else if (clientAction === 'drm_triggered') {
    persistedAction = 'drm_triggered';
  } else if (clientAction === 'approved') {
    persistedAction = 'approved';
  } else {
    persistedAction = 'rejected';
  }
  
  // Determine notes marker
  let notes: string | undefined;
  if (isUndo) {
    notes = NOTES.UNDO_AUTOPILOT;
  } else if (isAutopilotApproval) {
    notes = NOTES.AUTOPILOT;
  }
  
  // Return ONLY DB columns - no phantom fields
  return {
    id: generateFeedbackCopyId(originalEvent.id, clientAction),
    user_profile_id: originalEvent.user_profile_id,
    decided_at: originalEvent.decided_at,
    actioned_at: nowIso,
    user_action: persistedAction,
    notes,
    decision_payload: originalEvent.decision_payload,
    decision_type: originalEvent.decision_type,
    meal_id: originalEvent.meal_id,
    context_hash: originalEvent.context_hash,
  };
}

/**
 * Creates an autopilot approval row for DB insertion.
 * 
 * This is called when autopilot auto-approves a decision.
 * The row is marked with notes='autopilot' for identification.
 * 
 * @param originalEvent - The original pending decision event
 * @returns DecisionEventInsert ready for DB insertion
 */
export function createAutopilotApproval(originalEvent: DecisionEvent): DecisionEventInsert {
  return createFeedbackCopy(originalEvent, 'approved', true);
}

/**
 * Checks if a duplicate feedback copy exists within the idempotency window.
 * 
 * Also handles autopilot double-learn prevention:
 * - If an autopilot approval (notes='autopilot') exists, treat later 'approved' as duplicate
 * 
 * @param existingCopies - Existing feedback copies for the original event
 * @param clientAction - The action being requested
 * @returns True if a duplicate exists within the idempotency window
 */
export function hasDuplicateFeedback(
  existingCopies: DecisionEvent[],
  clientAction: ClientUserAction
): boolean {
  const now = Date.now();
  const isUndoAction = clientAction === 'undo';
  const isApproveAction = clientAction === 'approved';
  
  // Map client action to persisted action for comparison
  let targetAction: PersistedUserAction;
  if (isUndoAction) {
    targetAction = 'rejected';
  } else if (clientAction === 'drm_triggered') {
    targetAction = 'drm_triggered';
  } else if (clientAction === 'approved') {
    targetAction = 'approved';
  } else {
    targetAction = 'rejected';
  }
  
  for (const copy of existingCopies) {
    // Check user_action matches (not status - that's a phantom field)
    if (copy.user_action !== targetAction) {
      continue;
    }
    
    // For undo, also check that notes match
    if (isUndoAction && copy.notes !== NOTES.UNDO_AUTOPILOT) {
      continue;
    }
    
    // AUTOPILOT DOUBLE-LEARN PREVENTION:
    // If client tries to approve after autopilot already approved, it's a duplicate
    // regardless of idempotency window - autopilot approval is permanent
    if (isApproveAction && copy.notes === NOTES.AUTOPILOT) {
      return true;
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
 * Checks if an autopilot approval already exists for this event.
 * Used to prevent autopilot double-learn.
 * 
 * @param existingCopies - Existing feedback copies
 * @returns True if autopilot approval exists
 */
export function hasAutopilotApproval(existingCopies: DecisionEvent[]): boolean {
  return existingCopies.some(copy => 
    copy.user_action === 'approved' && copy.notes === NOTES.AUTOPILOT
  );
}

/**
 * Result of processing feedback
 */
export interface ProcessFeedbackResult {
  recorded: boolean;
  feedbackCopy?: DecisionEventInsert;
  isDuplicate: boolean;
  reason?: 'duplicate' | 'outside_window' | 'not_autopilot' | 'success';
}

/**
 * Finds the most recent autopilot-approved event from existing copies.
 * Uses notes='autopilot' marker (schema-true, no is_autopilot field).
 * 
 * @param existingCopies - Existing feedback copies
 * @returns The most recent autopilot-approved event, or undefined
 */
export function findAutopilotApprovedCopy(existingCopies: DecisionEvent[]): DecisionEvent | undefined {
  return existingCopies
    .filter(copy => isAutopilotEvent(copy))
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
 * - For autopilot-approved events (notes='autopilot')
 * - Within the undo window (10 minutes)
 * - Idempotent: multiple undos within window create only one undo copy
 * 
 * PERSISTENCE: Undo is stored as user_action='rejected', notes='undo_autopilot'
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
  // Check if this is actually an autopilot event (notes='autopilot')
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
  // Persisted as: user_action='rejected', notes='undo_autopilot'
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
    request.userAction
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
 * - Autopilot double-learn: if already consumed, don't re-consume
 * 
 * @param event - The decision event (or insert)
 * @returns True if consumption should run
 */
export function shouldRunConsumption(event: DecisionEvent | DecisionEventInsert): boolean {
  // Only approved events trigger consumption
  if (event.user_action !== 'approved') {
    return false;
  }
  
  return true;
}

/**
 * Determines if taste graph should update for a feedback event.
 * 
 * Taste graph updates for approved, rejected, and drm_triggered events.
 * Uses user_action field (schema-true).
 * 
 * @param event - The decision event (or insert)
 * @returns True if taste graph should update
 */
export function shouldUpdateTasteGraph(event: DecisionEvent | DecisionEventInsert): boolean {
  return event.user_action === 'approved' || 
         event.user_action === 'rejected' || 
         event.user_action === 'drm_triggered';
}

/**
 * Determines if taste_meal_scores should be updated.
 * 
 * IMPORTANT: Undo events (notes='undo_autopilot') should:
 * - Insert taste_signal with -0.5 weight (autonomy penalty)
 * - NOT update taste_meal_scores (don't change score/approvals/rejections)
 * 
 * @param event - The decision event (or insert)
 * @returns True if taste_meal_scores should be updated
 */
export function shouldUpdateTasteMealScores(event: DecisionEvent | DecisionEventInsert): boolean {
  // Undo events do NOT update taste_meal_scores
  if (event.notes === NOTES.UNDO_AUTOPILOT) {
    return false;
  }
  
  // All other feedback updates taste_meal_scores
  return event.user_action === 'approved' || 
         event.user_action === 'rejected' || 
         event.user_action === 'drm_triggered';
}

/**
 * Gets the taste graph weight for a feedback event.
 * 
 * @deprecated Use computeTasteWeight from lib/decision-os/taste/weights.ts instead.
 *             This function is kept for backwards compatibility.
 * 
 * Basic weight mapping (without stress multiplier):
 * - approved: +1.0
 * - rejected: -1.0
 * - drm_triggered: -0.5
 * - undo: -0.5 (autonomy penalty, NOT taste rejection)
 * 
 * @param event - The decision event
 * @returns Weight multiplier (positive for approved, negative for rejected/undo)
 */
export function getTasteGraphWeight(event: DecisionEvent | DecisionEventInsert): number {
  // Check for undo first (notes='undo_autopilot')
  if (event.notes === NOTES.UNDO_AUTOPILOT) {
    return -0.5; // Autonomy penalty
  }
  
  if (event.user_action === 'approved') {
    return 1.0;
  } else if (event.user_action === 'rejected') {
    return -1.0;
  } else if (event.user_action === 'drm_triggered') {
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
