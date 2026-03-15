#!/usr/bin/env node
/**
 * Tier 1 Learning Loop staging smoke.
 *
 * Validates:
 * - Auth boundary on actor/sync endpoints (401 without token)
 * - Authenticated actor identity bootstrap
 * - Sync idempotency via duplicate idempotency keys
 * - user_weights readability after feedback sync
 * - global_priors k-anon floor enforcement
 *
 * Usage:
 *   STAGING_WEB_URL=https://... STAGING_API_URL=https://... STAGING_AUTH_TOKEN=... npm run smoke:tier1:staging
 *   STAGING_URL=https://... STAGING_AUTH_TOKEN=... npm run smoke:tier1:staging
 */

const STAGING_WEB_URL = (
  process.env.STAGING_WEB_URL ??
  process.env.STAGING_URL ??
  process.env.STAGING_API_URL ??
  ''
).replace(/\/+$/, '');
const STAGING_API_URL = (process.env.STAGING_API_URL ?? process.env.STAGING_URL ?? '').replace(/\/+$/, '');
const STAGING_AUTH_TOKEN = process.env.STAGING_AUTH_TOKEN ?? '';
const MIN_HOUSEHOLDS = Number.parseInt(process.env.GLOBAL_PRIORS_MIN_HOUSEHOLDS ?? '30', 10);
const MIN_EVENTS = Number.parseInt(process.env.GLOBAL_PRIORS_MIN_EVENTS ?? '200', 10);

type Result = {
  name: string;
  passed: boolean;
  detail?: string;
};

const results: Result[] = [];

function log(name: string, passed: boolean, detail?: string): void {
  const status = passed ? 'PASS' : 'FAIL';
  const suffix = detail ? ` (${detail})` : '';
  console.log(`${status} ${name}${suffix}`);
  results.push({ name, passed, detail });
}

function authHeaders(withAuth: boolean): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth) headers.Authorization = `Bearer ${STAGING_AUTH_TOKEN}`;
  return headers;
}

async function readJson<T>(path: string, withAuth: boolean): Promise<{ status: number; data: T | null }> {
  try {
    const baseUrl = path === '/healthz.json' ? STAGING_WEB_URL : STAGING_API_URL;
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: authHeaders(withAuth),
    });
    const data = (await response.json().catch(() => null)) as T | null;
    return { status: response.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

async function postJson<T>(
  path: string,
  body: unknown,
  withAuth: boolean,
): Promise<{ status: number; data: T | null }> {
  try {
    const response = await fetch(`${STAGING_API_URL}${path}`, {
      method: 'POST',
      headers: authHeaders(withAuth),
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as T | null;
    return { status: response.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeIds(): { sessionId: string; decisionId: string; feedbackId: string } {
  const seed = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = `ses_tier1_${seed}`;
  const decisionId = `dec_tier1_${seed}`;
  const feedbackId = `fb_tier1_${seed}`;
  return { sessionId, decisionId, feedbackId };
}

async function main(): Promise<void> {
  if (!STAGING_WEB_URL) {
    console.error('FAIL setup (missing STAGING_WEB_URL or STAGING_URL)');
    process.exit(1);
  }
  if (!STAGING_API_URL) {
    console.error('FAIL setup (missing STAGING_API_URL or STAGING_URL)');
    process.exit(1);
  }
  if (!STAGING_AUTH_TOKEN) {
    console.error('FAIL setup (missing STAGING_AUTH_TOKEN)');
    process.exit(1);
  }
  if (!Number.isFinite(MIN_HOUSEHOLDS) || MIN_HOUSEHOLDS <= 0) {
    console.error('FAIL setup (invalid GLOBAL_PRIORS_MIN_HOUSEHOLDS)');
    process.exit(1);
  }
  if (!Number.isFinite(MIN_EVENTS) || MIN_EVENTS <= 0) {
    console.error('FAIL setup (invalid GLOBAL_PRIORS_MIN_EVENTS)');
    process.exit(1);
  }

  console.log('--- Tier 1 Staging Smoke ---');
  console.log(`web_target=${STAGING_WEB_URL}`);
  console.log(`api_target=${STAGING_API_URL}`);
  console.log(`k_anon_floor_households=${MIN_HOUSEHOLDS} k_anon_floor_events=${MIN_EVENTS}`);

  const health = await readJson<{ ok?: boolean }>('/healthz.json', false);
  log('healthz_200', health.status === 200 && health.data?.ok === true, `status=${health.status}`);

  const actorUnauthorized = await readJson('/api/decision-os/actor', false);
  log('actor_401_without_auth', actorUnauthorized.status === 401, `status=${actorUnauthorized.status}`);

  const actorAuthorized = await readJson<{
    household_key?: string;
    user_profile_id?: number;
  }>('/api/decision-os/actor', true);
  const actorOk =
    actorAuthorized.status === 200 &&
    typeof actorAuthorized.data?.household_key === 'string' &&
    actorAuthorized.data.household_key.length > 0 &&
    typeof actorAuthorized.data?.user_profile_id === 'number';
  log('actor_200_with_auth', actorOk, `status=${actorAuthorized.status}`);

  const weightsBefore = await readJson<{ v?: number; updated_at?: string; meal_weights?: unknown }>(
    '/api/decision-os/user-weights',
    true,
  );
  log('user_weights_200_before', weightsBefore.status === 200, `status=${weightsBefore.status}`);
  const beforeVersion = typeof weightsBefore.data?.v === 'number' ? weightsBefore.data.v : 0;
  const beforeUpdatedAt = Date.parse(weightsBefore.data?.updated_at ?? '');

  const syncUnauthorized = await postJson('/api/decision-os/sync/events', { v: 1, records: [] }, false);
  log('sync_401_without_auth', syncUnauthorized.status === 401, `status=${syncUnauthorized.status}`);

  const ids = makeIds();
  const badHousehold = 'hh_client_spoofed';
  const badUser = 999999;
  const decisionRecord = {
    kind: 'decision_event',
    idempotency_key: `${ids.decisionId}:1`,
    payload: {
      v: 1,
      event_id: ids.decisionId,
      household_key: badHousehold,
      user_profile_id: badUser,
      session_id: ids.sessionId,
      decision_at: nowIso(),
      decision_type: 'cook',
      meal_key: '1',
      explanation_line: 'Tier 1 smoke decision.',
      context_signature: {
        v: 1,
        weekday: 2,
        hour_block: 'evening',
        season: 'winter',
        temp_bucket: 'cold',
        geo_bucket: 'geo:dr5r',
        energy: 'unknown',
        weather_source: 'cache',
        computed_at: nowIso(),
        mode: 'easy',
        constraints: {
          exclude_allergens: [],
          include_constraints: [],
        },
      },
      engine_version: 'local_ranker_v1',
      weights_version: 'weights_v1',
      priors_version: 'global_priors_v1',
      decision_latency_ms: 8,
      idempotency_key: `${ids.decisionId}:1`,
    },
  };
  const feedbackRecord = {
    kind: 'feedback_event',
    idempotency_key: `${ids.feedbackId}:accepted`,
    payload: {
      v: 1,
      event_id: ids.feedbackId,
      decision_event_id: ids.decisionId,
      household_key: badHousehold,
      user_profile_id: badUser,
      feedback_at: nowIso(),
      action: 'accepted',
      rating: 1,
      source: 'deal_card',
      idempotency_key: `${ids.feedbackId}:accepted`,
    },
  };
  const syncBody = {
    v: 1,
    records: [decisionRecord, feedbackRecord],
  };

  const syncFirst = await postJson<{
    accepted?: number;
    results?: Array<{ idempotency_key?: string; status?: string }>;
  }>('/api/decision-os/sync/events', syncBody, true);
  const firstStatuses = new Map(
    (syncFirst.data?.results ?? []).map((row) => [row.idempotency_key ?? '', row.status ?? '']),
  );
  const firstOk =
    syncFirst.status === 200 &&
    (firstStatuses.get(decisionRecord.idempotency_key) === 'stored' ||
      firstStatuses.get(decisionRecord.idempotency_key) === 'duplicate') &&
    (firstStatuses.get(feedbackRecord.idempotency_key) === 'stored' ||
      firstStatuses.get(feedbackRecord.idempotency_key) === 'duplicate');
  log('sync_first_accepted', firstOk, `status=${syncFirst.status}`);

  const syncSecond = await postJson<{
    results?: Array<{ idempotency_key?: string; status?: string }>;
  }>('/api/decision-os/sync/events', syncBody, true);
  const secondStatuses = new Map(
    (syncSecond.data?.results ?? []).map((row) => [row.idempotency_key ?? '', row.status ?? '']),
  );
  const duplicateOk =
    syncSecond.status === 200 &&
    secondStatuses.get(decisionRecord.idempotency_key) === 'duplicate' &&
    secondStatuses.get(feedbackRecord.idempotency_key) === 'duplicate';
  log('sync_duplicate_idempotency', duplicateOk, `status=${syncSecond.status}`);

  const weightsAfter = await readJson<{ v?: number; updated_at?: string; meal_weights?: unknown }>(
    '/api/decision-os/user-weights',
    true,
  );
  const afterVersion = typeof weightsAfter.data?.v === 'number' ? weightsAfter.data.v : 0;
  const afterUpdatedAt = Date.parse(weightsAfter.data?.updated_at ?? '');
  const weightSnapshotAdvanced =
    (Number.isFinite(afterUpdatedAt) &&
      Number.isFinite(beforeUpdatedAt) &&
      afterUpdatedAt > beforeUpdatedAt) ||
    afterVersion > beforeVersion;
  const weightsAfterOk =
    weightsAfter.status === 200 &&
    typeof weightsAfter.data?.v === 'number' &&
    typeof weightsAfter.data?.updated_at === 'string' &&
    typeof weightsAfter.data?.meal_weights === 'object' &&
    weightSnapshotAdvanced;
  log(
    'user_weights_200_after',
    weightsAfterOk,
    `status=${weightsAfter.status} before_v=${beforeVersion} after_v=${afterVersion}`,
  );

  const priors = await readJson<{
    thresholds?: { min_events?: number; min_households?: number };
    priors?: Array<{ sample_count?: number; household_count?: number }>;
  }>('/api/decision-os/global-priors?minEvents=1&minHouseholds=1', true);
  const thresholdEchoOk =
    priors.status === 200 &&
    typeof priors.data?.thresholds?.min_events === 'number' &&
    typeof priors.data?.thresholds?.min_households === 'number' &&
    (priors.data?.thresholds?.min_events ?? 0) >= MIN_EVENTS &&
    (priors.data?.thresholds?.min_households ?? 0) >= MIN_HOUSEHOLDS;
  log('global_priors_threshold_floor', thresholdEchoOk, `status=${priors.status}`);

  const allPriorsMeetFloor = (priors.data?.priors ?? []).every(
    (row) =>
      (row.sample_count ?? 0) >= MIN_EVENTS && (row.household_count ?? 0) >= MIN_HOUSEHOLDS,
  );
  log(
    'global_priors_rows_k_anon_safe',
    priors.status === 200 && allPriorsMeetFloor,
    `rows=${priors.data?.priors?.length ?? 0}`,
  );

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    console.log(`FAILED ${failed.length}/${results.length}`);
    process.exit(1);
  }

  console.log(`PASSED ${results.length}/${results.length}`);
  process.exit(0);
}

void main();
