/**
 * Decision OS Type Definitions
 */

export type UserAction = 'approved' | 'rejected' | 'modified' | 'undo';
export type DecisionStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'drm_triggered';

export interface DecisionEvent {
  id: string;
  user_profile_id: number;
  decided_at: string; // ISO timestamp
  actioned_at?: string; // ISO timestamp when user acted
  status: DecisionStatus;
  decision_payload: Record<string, unknown>;
  is_feedback_copy?: boolean;
  original_event_id?: string; // References the original pending event for feedback copies
  is_autopilot?: boolean; // True if this was an autopilot-approved event
  notes?: string; // Optional notes (e.g., 'undo_autopilot')
}

export interface FeedbackRequest {
  eventId: string;
  userAction: UserAction;
  modifiedPayload?: Record<string, unknown>;
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
