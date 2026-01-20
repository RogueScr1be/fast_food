/**
 * Decision OS Type Definitions
 */

export type UserAction = 'approved' | 'rejected' | 'modified';
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
}

export interface FeedbackRequest {
  eventId: string;
  userAction: UserAction;
  modifiedPayload?: Record<string, unknown>;
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
