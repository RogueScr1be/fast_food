import type { ContextSignature } from '../decision-core/types';

export interface LearningActor {
  householdKey: string;
  userProfileId: number;
}

export interface DecisionEventV1 {
  v: 1;
  event_id: string;
  household_key: string;
  user_profile_id: number;
  session_id: string;
  decision_at: string;
  decision_type: 'cook' | 'order' | 'zero_cook';
  meal_key: string;
  explanation_line: string;
  context_signature: ContextSignature;
  engine_version: string;
  weights_version: string;
  priors_version: string;
  decision_latency_ms: number;
  idempotency_key: string;
}

export interface FeedbackEventV1 {
  v: 1;
  event_id: string;
  decision_event_id: string;
  household_key: string;
  user_profile_id: number;
  feedback_at: string;
  action: 'accepted' | 'rejected' | 'skipped' | 'made';
  rating: -1 | 0 | 1 | null;
  source: 'post_meal_prompt' | 'deal_card' | 'checklist_done' | 'rescue_done';
  idempotency_key: string;
}

function sanitizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9:_-]+/g, '_');
}

export function createDecisionEventId(sessionId: string, sequence: number): string {
  return `dec_${sanitizeKey(sessionId)}_${Math.max(1, Math.floor(sequence))}`;
}

export function createFeedbackEventId(decisionEventId: string, action: string): string {
  return `fb_${sanitizeKey(decisionEventId)}_${sanitizeKey(action)}`;
}

export function isKAnonEligible(sampleSize: number, k: number): boolean {
  return Number.isFinite(sampleSize) && Number.isFinite(k) && sampleSize >= k;
}
