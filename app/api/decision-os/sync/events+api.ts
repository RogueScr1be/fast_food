import { buildContextBucketKey } from '@/lib/decision-core/evaluate';
import type { DecisionEventV1, FeedbackEventV1 } from '@/lib/learning/contracts';
import { computeWeightsV1, mapToObject } from '@/lib/learning/weights-v1';
import { authenticateRequest } from '@/lib/decision-os/auth/helper';
import { getDb } from '@/lib/decision-os/db/client';

type SyncRecord =
  | {
      kind: 'decision_event';
      idempotency_key: string;
      payload: DecisionEventV1;
    }
  | {
      kind: 'feedback_event';
      idempotency_key: string;
      payload: FeedbackEventV1;
    };

interface SyncRequest {
  v: 1;
  records: SyncRecord[];
}

interface SyncResult {
  idempotency_key: string;
  status: 'stored' | 'duplicate' | 'error';
}

function isSyncRequest(body: unknown): body is SyncRequest {
  if (!body || typeof body !== 'object') return false;
  const req = body as Partial<SyncRequest>;
  return req.v === 1 && Array.isArray(req.records);
}

async function persistDecisionRecord(event: DecisionEventV1): Promise<'stored' | 'duplicate'> {
  const db = getDb();
  const parsedMealId = Number.parseInt(event.meal_key, 10);
  const mealId = Number.isFinite(parsedMealId) ? parsedMealId : null;
  const contextHash = buildContextBucketKey(event.context_signature);

  const rows = await db.query<{ id: string }>(
    `INSERT INTO decision_events
      (id, event_version, session_id, user_profile_id, household_key, decided_at, actioned_at, user_action, notes,
       decision_payload, decision_type, meal_id, context_hash, context_signature, explanation_line, engine_version,
       local_latency_ms, idempotency_key)
     VALUES
      ($1, $2, $3, $4, $5, $6, NULL, 'pending', 'local_decision_v1',
       $7::jsonb, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
     ON CONFLICT (household_key, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      event.event_id,
      event.v,
      event.session_id,
      event.user_profile_id,
      event.household_key,
      event.decision_at,
      JSON.stringify({
        v: event.v,
        meal_id: event.meal_key,
        decision_type: event.decision_type,
        explanation_line: event.explanation_line,
        context_signature: event.context_signature,
        engine_version: event.engine_version,
        weights_version: event.weights_version,
        priors_version: event.priors_version,
        decision_latency_ms: event.decision_latency_ms,
        idempotency_key: event.idempotency_key,
        session_id: event.session_id,
      }),
      event.decision_type,
      mealId,
      contextHash,
      JSON.stringify(event.context_signature),
      event.explanation_line,
      event.engine_version,
      event.decision_latency_ms,
      event.idempotency_key,
    ],
  );
  return rows.length > 0 ? 'stored' : 'duplicate';
}

async function persistFeedbackRecord(event: FeedbackEventV1): Promise<'stored' | 'duplicate'> {
  const db = getDb();
  const feedbackType =
    event.action === 'made'
      ? 'completed'
      : event.action === 'skipped'
        ? 'rating'
        : event.action;
  const rows = await db.query<{ id: string }>(
    `INSERT INTO feedback_events
      (id, decision_event_id, household_key, user_profile_id, feedback_type, rating, source, idempotency_key, created_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (household_key, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      event.event_id,
      event.decision_event_id,
      event.household_key,
      event.user_profile_id,
      feedbackType,
      event.rating,
      event.source,
      event.idempotency_key,
      event.feedback_at,
    ],
  );

  return rows.length > 0 ? 'stored' : 'duplicate';
}

function mapFeedbackToRating(
  feedbackType: string,
  rating: number | null,
): -1 | 0 | 1 | null {
  if (feedbackType === 'accepted' || feedbackType === 'completed') return 1;
  if (feedbackType === 'rejected' || feedbackType === 'undo') return -1;
  if (feedbackType === 'rating') {
    if (rating === -1 || rating === 0 || rating === 1) return rating;
    return 0;
  }
  return null;
}

async function refreshUserWeightsSnapshot(params: {
  householdKey: string;
  userProfileId: number;
  updatedByEventId: string;
}): Promise<void> {
  const db = getDb();
  const rows = await db.query<{
    feedback_type: string;
    rating: number | null;
    created_at: string;
    meal_id: number | null;
    decision_payload: Record<string, unknown> | null;
  }>(
    `SELECT
       fe.feedback_type,
       fe.rating,
       fe.created_at,
       de.meal_id,
       de.decision_payload
     FROM feedback_events fe
     JOIN decision_events de ON de.id = fe.decision_event_id
     WHERE fe.household_key = $1
       AND fe.user_profile_id = $2
     ORDER BY fe.created_at DESC
     LIMIT 2000`,
    [params.householdKey, params.userProfileId],
  );

  const entries: Array<{
    mealId: string;
    rating: -1 | 0 | 1;
    timestamp: number;
  }> = [];

  for (const row of rows) {
    const mappedRating = mapFeedbackToRating(row.feedback_type, row.rating);
    if (mappedRating === null) continue;

    const payloadMeal =
      typeof row.decision_payload?.meal_id === 'string'
        ? row.decision_payload.meal_id
        : typeof row.decision_payload?.mealId === 'string'
          ? row.decision_payload.mealId
          : null;
    const mealKey = payloadMeal ?? (row.meal_id !== null ? String(row.meal_id) : null);
    if (!mealKey) continue;

    const ts = new Date(row.created_at).getTime();
    if (!Number.isFinite(ts)) continue;

    entries.push({
      mealId: mealKey,
      rating: mappedRating,
      timestamp: ts,
    });
  }

  const learnedWeights = computeWeightsV1(entries, [], Date.now());
  const weightsPayload = {
    v: 1,
    meal_weights: mapToObject(learnedWeights),
    meal_weights_model: 'weights_v1',
    meal_weights_updated_at: new Date().toISOString(),
  };

  await db.query(
    `INSERT INTO user_weights
      (household_key, user_profile_id, weights, model_version, version, updated_at, updated_by_event_id)
     VALUES
      ($1, $2, $3::jsonb, 1, 1, NOW(), $4)
     ON CONFLICT (household_key, user_profile_id)
     DO UPDATE SET
      weights = user_weights.weights || EXCLUDED.weights,
      updated_at = NOW(),
      version = COALESCE(user_weights.version, 1) + 1,
      updated_by_event_id = EXCLUDED.updated_by_event_id`,
    [params.householdKey, params.userProfileId, JSON.stringify(weightsPayload), params.updatedByEventId],
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(request.headers.get('Authorization'));
    if (!auth.success) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!isSyncRequest(body)) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }

    const householdKey = auth.context.householdKey;
    const userProfileId = auth.context.userProfileId;
    const results: SyncResult[] = [];
    let accepted = 0;
    let rejected = 0;

    for (const record of body.records.slice(0, 100)) {
      try {
        const payload = {
          ...record.payload,
          household_key: householdKey,
          user_profile_id: userProfileId,
        };

        const status =
          record.kind === 'decision_event'
            ? await persistDecisionRecord(payload as DecisionEventV1)
            : await persistFeedbackRecord(payload as FeedbackEventV1);
        if (record.kind === 'feedback_event' && status === 'stored') {
          await refreshUserWeightsSnapshot({
            householdKey,
            userProfileId,
            updatedByEventId: payload.event_id,
          });
        }
        accepted += 1;
        results.push({ idempotency_key: record.idempotency_key, status });
      } catch {
        rejected += 1;
        results.push({
          idempotency_key: record.idempotency_key,
          status: 'error',
        });
      }
    }

    return Response.json({
      accepted,
      rejected,
      results,
    });
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
