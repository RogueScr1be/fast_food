import { ensureAnonymousAuth } from '../supabase/auth';
import { getSupabaseClient } from '../supabase/client';
import type { LearningActor } from './contracts';
import { incrementLearningMetric, setLearningMetricGauge } from './telemetry';

interface LearningActorState {
  actor: LearningActor;
  authToken: string | null;
  source: 'auth' | 'fallback';
}

const API_BASE = process.env.EXPO_PUBLIC_DECISION_OS_API_BASE_URL?.replace(/\/+$/, '') ?? null;

let actorState: LearningActorState = {
  actor: {
    householdKey: process.env.EXPO_PUBLIC_DEFAULT_HOUSEHOLD_KEY ?? 'default',
    userProfileId: 1,
  },
  authToken: null,
  source: 'fallback',
};

let bootstrapInFlight: Promise<void> | null = null;
let consecutiveFallbacks = 0;

const FALLBACK_ALERT_THRESHOLD = Number.parseInt(
  process.env.EXPO_PUBLIC_LEARNING_ACTOR_FALLBACK_ALERT_THRESHOLD ?? '5',
  10,
);

function reportFallback(reason: string): void {
  consecutiveFallbacks += 1;
  incrementLearningMetric('learning_actor_fallback_total', 1, { reason });
  setLearningMetricGauge('learning_actor_fallback_consecutive', consecutiveFallbacks, { reason });
  console.warn(`[learning-actor] using fallback actor (${reason})`);
  if (
    Number.isFinite(FALLBACK_ALERT_THRESHOLD) &&
    FALLBACK_ALERT_THRESHOLD > 0 &&
    consecutiveFallbacks >= FALLBACK_ALERT_THRESHOLD
  ) {
    console.error(
      `[learning-alert] actor_fallback_threshold_exceeded count=${consecutiveFallbacks} threshold=${FALLBACK_ALERT_THRESHOLD} reason=${reason}`,
    );
  }
}

export function getLearningActorSync(): LearningActor {
  return actorState.actor;
}

export function getLearningAuthTokenSync(): string | null {
  return actorState.authToken;
}

export function getLearningActorSourceSync(): 'auth' | 'fallback' {
  return actorState.source;
}

export async function bootstrapLearningActor(): Promise<void> {
  if (bootstrapInFlight) return bootstrapInFlight;

  bootstrapInFlight = (async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      reportFallback('supabase_unavailable');
      return;
    }

    try {
      await ensureAnonymousAuth(supabase);
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token ?? null;
      actorState.authToken = token;

      if (!token) {
        reportFallback('missing_access_token');
        return;
      }

      if (!API_BASE) {
        reportFallback('missing_decision_os_api_base');
        return;
      }

      const response = await fetch(`${API_BASE}/api/decision-os/actor`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        reportFallback(`actor_endpoint_${response.status}`);
        return;
      }

      const payload = (await response.json()) as {
        household_key?: string;
        user_profile_id?: number;
      };

      if (
        typeof payload.household_key !== 'string' ||
        payload.household_key.length === 0 ||
        typeof payload.user_profile_id !== 'number'
      ) {
        reportFallback('invalid_actor_payload');
        return;
      }

      actorState = {
        actor: {
          householdKey: payload.household_key,
          userProfileId: payload.user_profile_id,
        },
        authToken: token,
        source: 'auth',
      };
      consecutiveFallbacks = 0;
      incrementLearningMetric('learning_actor_auth_success_total', 1);
      setLearningMetricGauge('learning_actor_fallback_consecutive', 0);
    } catch {
      reportFallback('actor_bootstrap_failed');
    }
  })();

  try {
    await bootstrapInFlight;
  } finally {
    bootstrapInFlight = null;
  }
}
