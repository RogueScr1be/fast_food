/**
 * Decision OS Types
 * Single-card execution interface types
 */

// Decision types
export type DecisionType = 'cook' | 'zero_cook' | 'order';
export type UserAction = 'approved' | 'rejected' | 'drm_triggered';

// Decision request/response
export interface DecisionRequest {
  householdKey: string;
  nowIso: string;
  signal?: {
    tired?: boolean;
    busy?: boolean;
    lowPantry?: boolean;
  };
}

export interface DecisionResponse {
  decision: Decision | null;
  drmRecommended: boolean;
  decisionEventId: string;
}

// Core decision structure (single card)
export interface Decision {
  id: string;
  type: DecisionType;
  title: string;
  estMinutes: number;
  // For cook/zero_cook
  stepsShort?: string[];
  // For order type
  vendor?: string;
  deepLinkUrl?: string;
  fallbackUrl?: string;
}

// DRM (Decision Recovery Mode) request/response
export interface DrmRequest {
  householdKey: string;
  nowIso: string;
  triggerReason: 'handle_it' | 'auto_drm' | 'rejection_cascade';
}

export interface DrmResponse {
  rescue: Decision;
  decisionEventId: string;
}

// Feedback request/response
export interface FeedbackRequest {
  householdKey: string;
  eventId: string;
  userAction: UserAction;
  nowIso: string;
}

export interface FeedbackResponse {
  recorded: boolean;
}

// Internal: Decision event for append-only storage
export interface DecisionEvent {
  id: string;
  householdKey: string;
  decisionPayload: Decision | null;
  contextHash: string;
  userAction: UserAction | null;
  actionedAt: string | null;
  createdAt: string;
  drmTriggered: boolean;
  triggerReason?: string;
}

// UI State - enforces single card only
export interface DecisionOsState {
  // Single card, not an array
  currentCard: Decision | null;
  currentEventId: string | null;
  isLoading: boolean;
  error: string | null;
  // Track rejection to enforce single re-decision
  hasRejectedOnce: boolean;
}
