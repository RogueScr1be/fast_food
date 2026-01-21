/**
 * Decision OS Type Definitions
 */

/**
 * Client-allowed user actions for feedback endpoint.
 * - approved: User approves the decision
 * - rejected: User rejects the decision
 * - drm_triggered: User explicitly triggers DRM (e.g., "Dinner changed")
 * - undo: User undoes an autopilot-approved decision (within 10-minute window)
 * 
 * NOTE: 'modified' is BANNED - clients cannot submit modified actions.
 * NOTE: 'expired' and 'pending' are internal-only statuses, not client actions.
 */
export type UserAction = 'approved' | 'rejected' | 'drm_triggered' | 'undo';

/**
 * Internal decision status (not for client submission).
 */
export type DecisionStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'drm_triggered';

export interface DecisionEvent {
  id: string;
  user_profile_id: number;
  decided_at: string; // ISO timestamp
  actioned_at?: string; // ISO timestamp when user acted
  status: DecisionStatus; // Internal status for DB queries
  user_action?: UserAction; // The client's submitted action (DB column)
  decision_payload: Record<string, unknown>;
  is_feedback_copy?: boolean;
  original_event_id?: string; // References the original pending event for feedback copies
  is_autopilot?: boolean; // True if this was an autopilot-approved event (false/omitted for undo)
  notes?: string; // Optional notes (e.g., 'undo_autopilot')
  // Additional fields copied from original event for append-only inserts:
  decision_type?: string;
  meal_id?: number;
  context_hash?: string;
}

export interface FeedbackRequest {
  eventId: string;
  userAction: UserAction;
  // NOTE: modifiedPayload removed - 'modified' action is BANNED
}

/**
 * Decision response from the decision endpoint
 */
export interface DecisionResponse {
  drmRecommended: boolean;
  decision: Record<string, unknown> | null;
  autopilot?: boolean;
  decisionEventId?: string;
  message?: string;
}

export interface FeedbackResponse {
  recorded: boolean;
  eventId?: string;
}

export interface AutopilotConfig {
  enabled: boolean;
  minApprovalRate: number; // 0.0 to 1.0
  minDecisions: number;
  windowDays: number;
}

export interface ApprovalRateResult {
  rate: number;
  approved: number;
  rejected: number;
  total: number;
  eligible: boolean;
}
