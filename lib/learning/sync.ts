import { buildContextBucketKey } from '../decision-core/evaluate';
import {
  bootstrapLearningActor,
  getLearningActorSourceSync,
  getLearningActorSync,
  getLearningAuthTokenSync,
} from './actor';
import { featureFlags } from '../runtime/featureFlags';
import { ensureAnonymousAuth } from '../supabase/auth';
import { getSupabaseClient } from '../supabase/client';
import type { DecisionEventV1, FeedbackEventV1, LearningActor } from './contracts';
import {
  enqueueLearningRecord,
  getReadyLearningRecords,
  markLearningRecordFailure,
  markLearningRecordSuccess,
  type LearningRecord,
} from './queue';

let flushInFlight: Promise<void> | null = null;

const API_BASE = process.env.EXPO_PUBLIC_DECISION_OS_API_BASE_URL?.replace(/\/+$/, '') ?? null;

interface SyncEventsResponse {
  accepted: number;
  rejected: number;
  results: Array<{
    idempotency_key: string;
    status: 'stored' | 'duplicate' | 'error';
  }>;
}

type SyncFailureCode = 'auth' | 'validation' | 'transient';

interface ApiSyncResult {
  accepted: Set<string>;
  rejected: Set<string>;
  failureCode: SyncFailureCode;
}

function classifyByStatus(status: number): SyncFailureCode {
  if (status === 401 || status === 403) return 'auth';
  if (status >= 400 && status < 500) return 'validation';
  return 'transient';
}

function classifyError(error: unknown): SyncFailureCode {
  if (!error || typeof error !== 'object') return 'transient';
  const msg = String((error as { message?: string }).message ?? '').toLowerCase();
  if (msg.includes('unauthorized') || msg.includes('jwt') || msg.includes('auth')) return 'auth';
  if (msg.includes('validation') || msg.includes('invalid')) return 'validation';
  return 'transient';
}

export function getDefaultLearningActor(): LearningActor {
  return getLearningActorSync();
}

export async function enqueueDecisionEvent(event: DecisionEventV1): Promise<void> {
  await enqueueLearningRecord({
    kind: 'decision_event',
    payload: event,
    idempotencyKey: event.idempotency_key,
    attempt: 0,
    nextRetryAt: Date.now(),
  });

  if (featureFlags.learningSyncEnabled) {
    void flushLearningQueue();
  }
}

export async function enqueueFeedbackEvent(event: FeedbackEventV1): Promise<void> {
  await enqueueLearningRecord({
    kind: 'feedback_event',
    payload: event,
    idempotencyKey: event.idempotency_key,
    attempt: 0,
    nextRetryAt: Date.now(),
  });

  if (featureFlags.learningSyncEnabled) {
    void flushLearningQueue();
  }
}

async function writeDecisionEventDirect(event: DecisionEventV1): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('supabase_unavailable');

  await ensureAnonymousAuth(supabase);

  const parsedMealId = Number.parseInt(event.meal_key, 10);
  const mealId = Number.isFinite(parsedMealId) ? parsedMealId : null;
  const contextHash = buildContextBucketKey(event.context_signature);

  const payload = {
    id: event.event_id,
    event_version: event.v,
    session_id: event.session_id,
    user_profile_id: event.user_profile_id,
    household_key: event.household_key,
    decided_at: event.decision_at,
    actioned_at: null,
    user_action: 'pending',
    notes: 'local_decision_v1',
    decision_type: event.decision_type,
    meal_id: mealId,
    context_hash: contextHash,
    context_signature: event.context_signature,
    explanation_line: event.explanation_line,
    engine_version: event.engine_version,
    local_latency_ms: event.decision_latency_ms,
    idempotency_key: event.idempotency_key,
    decision_payload: {
      v: event.v,
      meal_id: event.meal_key,
      explanation_line: event.explanation_line,
      context_signature: event.context_signature,
      engine_version: event.engine_version,
      weights_version: event.weights_version,
      priors_version: event.priors_version,
      decision_latency_ms: event.decision_latency_ms,
      idempotency_key: event.idempotency_key,
      session_id: event.session_id,
    },
  };

  const { error } = await supabase
    .from('decision_events')
    .upsert(payload, { onConflict: 'household_key,idempotency_key', ignoreDuplicates: true });
  if (error) throw error;
}

async function writeFeedbackEventDirect(event: FeedbackEventV1): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('supabase_unavailable');

  await ensureAnonymousAuth(supabase);

  const feedbackType =
    event.action === 'made'
      ? 'completed'
      : event.action === 'skipped'
        ? 'rating'
        : event.action;
  const { error } = await supabase
    .from('feedback_events')
    .upsert(
      {
        id: event.event_id,
        decision_event_id: event.decision_event_id,
        household_key: event.household_key,
        user_profile_id: event.user_profile_id,
        feedback_type: feedbackType,
        rating: event.rating,
        metadata: { idempotency_key: event.idempotency_key, v: event.v, source: event.source },
        idempotency_key: event.idempotency_key,
        created_at: event.feedback_at,
      },
      { onConflict: 'household_key,idempotency_key', ignoreDuplicates: true },
    );

  if (error) throw error;
}

async function syncBatchViaApi(records: LearningRecord[]): Promise<ApiSyncResult | null> {
  if (!API_BASE || records.length === 0) return null;
  await bootstrapLearningActor();
  const authToken = getLearningAuthTokenSync();
  if (!authToken) return null;

  const body = {
    v: 1,
    records: records.map((record) => ({
      kind: record.kind,
      idempotency_key: record.idempotencyKey,
      payload: record.payload,
    })),
  };

  try {
    const response = await fetch(`${API_BASE}/api/decision-os/sync/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const code = classifyByStatus(response.status);
      return {
        accepted: new Set<string>(),
        rejected: new Set<string>(records.map((r) => r.idempotencyKey)),
        failureCode: code,
      };
    }

    const parsed = (await response.json()) as SyncEventsResponse;
    const accepted = new Set<string>();
    const rejected = new Set<string>();
    for (const row of parsed.results ?? []) {
      if (row.status === 'stored' || row.status === 'duplicate') {
        accepted.add(row.idempotency_key);
      } else {
        rejected.add(row.idempotency_key);
      }
    }
    return {
      accepted,
      rejected,
      failureCode: 'validation',
    };
  } catch {
    return null;
  }
}

async function syncRecordDirect(record: LearningRecord): Promise<void> {
  if (record.kind === 'decision_event') {
    await writeDecisionEventDirect(record.payload as DecisionEventV1);
    return;
  }
  await writeFeedbackEventDirect(record.payload as FeedbackEventV1);
}

export async function flushLearningQueue(): Promise<void> {
  if (!featureFlags.learningSyncEnabled) return;
  if (flushInFlight) return flushInFlight;
  if (getLearningActorSourceSync() === 'fallback') {
    await bootstrapLearningActor();
  }

  flushInFlight = (async () => {
    const records = await getReadyLearningRecords(25);
    if (records.length === 0) return;

    const apiResult = await syncBatchViaApi(records);
    if (apiResult) {
      for (const record of records) {
        if (apiResult.accepted.has(record.idempotencyKey)) {
          await markLearningRecordSuccess(record.idempotencyKey);
          continue;
        }
        if (apiResult.rejected.has(record.idempotencyKey)) {
          await markLearningRecordFailure(record.idempotencyKey, apiResult.failureCode);
          continue;
        }
        await markLearningRecordFailure(record.idempotencyKey, 'transient');
      }
      return;
    }

    for (const record of records) {
      try {
        await syncRecordDirect(record);
        await markLearningRecordSuccess(record.idempotencyKey);
      } catch (error) {
        await markLearningRecordFailure(record.idempotencyKey, classifyError(error));
      }
    }
  })();

  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}
