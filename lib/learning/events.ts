import type { ContextSignature } from '../decision-core/types';
import type { FeedbackEventV1, DecisionEventV1, LearningActor } from './contracts';
import { createDecisionEventId, createFeedbackEventId } from './contracts';

function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim().slice(0, 140);
}

export function buildDecisionEvent(params: {
  actor: LearningActor;
  sessionId: string;
  sequence: number;
  mealId: string;
  decisionType: 'cook' | 'order' | 'zero_cook';
  explanationLine: string;
  contextSignature: ContextSignature;
  localLatencyMs: number;
  engineVersion: string;
  weightsVersion: string;
  priorsVersion: string;
}): DecisionEventV1 {
  const eventId = createDecisionEventId(params.sessionId, params.sequence);
  const decisionAt = new Date().toISOString();
  const idempotencyKey = `${params.actor.householdKey}:${params.sessionId}:${Math.max(1, Math.floor(params.sequence))}`;

  return {
    v: 1,
    event_id: eventId,
    household_key: params.actor.householdKey,
    user_profile_id: params.actor.userProfileId,
    session_id: params.sessionId,
    decision_at: decisionAt,
    decision_type: params.decisionType,
    meal_key: params.mealId,
    explanation_line: oneLine(params.explanationLine),
    context_signature: params.contextSignature,
    engine_version: params.engineVersion,
    weights_version: params.weightsVersion,
    priors_version: params.priorsVersion,
    decision_latency_ms: Math.max(0, Math.round(params.localLatencyMs)),
    idempotency_key: idempotencyKey,
  };
}

export function buildFeedbackEvent(params: {
  actor: LearningActor;
  decisionEventId: string;
  action: FeedbackEventV1['action'];
  source: FeedbackEventV1['source'];
  rating?: FeedbackEventV1['rating'];
}): FeedbackEventV1 {
  const eventId = createFeedbackEventId(params.decisionEventId, params.action);

  return {
    v: 1,
    event_id: eventId,
    decision_event_id: params.decisionEventId,
    household_key: params.actor.householdKey,
    user_profile_id: params.actor.userProfileId,
    feedback_at: new Date().toISOString(),
    action: params.action,
    rating: params.rating ?? null,
    source: params.source,
    idempotency_key: `${params.decisionEventId}:${params.action}`,
  };
}
