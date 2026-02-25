-- Migration 029: Tier 1 learning loop tables + decision_events contract alignment
--
-- Adds/aligns contract-required columns for decision_events and creates
-- feedback_events, user_weights, and global_priors for Tier 1 learning.

-- =============================================================================
-- decision_events contract alignment
-- =============================================================================

ALTER TABLE decision_events
  ADD COLUMN IF NOT EXISTS event_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS context_signature JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS explanation_line TEXT,
  ADD COLUMN IF NOT EXISTS engine_version TEXT NOT NULL DEFAULT 'local_ranker_v1',
  ADD COLUMN IF NOT EXISTS local_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE decision_events DROP CONSTRAINT IF EXISTS decision_events_user_action_check;
ALTER TABLE decision_events ADD CONSTRAINT decision_events_user_action_check
  CHECK (user_action IN ('pending', 'approved', 'rejected', 'drm_triggered', 'expired'));

ALTER TABLE decision_events DROP CONSTRAINT IF EXISTS decision_events_timestamps_check;
ALTER TABLE decision_events ADD CONSTRAINT decision_events_timestamps_check
  CHECK (
    decided_at IS NOT NULL AND
    (
      (user_action = 'pending' AND actioned_at IS NULL) OR
      (user_action <> 'pending' AND actioned_at IS NOT NULL)
    )
  );

ALTER TABLE decision_events DROP CONSTRAINT IF EXISTS decision_events_explanation_line_check;
ALTER TABLE decision_events ADD CONSTRAINT decision_events_explanation_line_check
  CHECK (explanation_line IS NULL OR explanation_line !~ E'[\\n\\r]');

ALTER TABLE decision_events DROP CONSTRAINT IF EXISTS decision_events_local_latency_ms_check;
ALTER TABLE decision_events ADD CONSTRAINT decision_events_local_latency_ms_check
  CHECK (local_latency_ms IS NULL OR local_latency_ms >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_events_household_idempotency
  ON decision_events(household_key, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- =============================================================================
-- feedback_events
-- =============================================================================

CREATE TABLE IF NOT EXISTS feedback_events (
  id TEXT PRIMARY KEY,
  decision_event_id TEXT NOT NULL REFERENCES decision_events(id) ON DELETE CASCADE,
  household_key TEXT NOT NULL,
  user_profile_id INTEGER REFERENCES user_profiles(id),
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('accepted', 'rejected', 'completed', 'undo', 'rating')),
  rating SMALLINT CHECK (rating IN (-1, 0, 1) OR rating IS NULL),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'post_meal_prompt',
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (household_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_feedback_events_household_created
  ON feedback_events(household_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_events_decision_event
  ON feedback_events(decision_event_id);

-- =============================================================================
-- user_weights
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_weights (
  household_key TEXT NOT NULL,
  user_profile_id INTEGER NOT NULL REFERENCES user_profiles(id),
  weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_version SMALLINT NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_event_id TEXT,
  PRIMARY KEY (household_key, user_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_user_weights_household_updated
  ON user_weights(household_key, updated_at DESC);

-- =============================================================================
-- global_priors
-- =============================================================================

CREATE TABLE IF NOT EXISTS global_priors (
  bucket_key TEXT NOT NULL,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  hour_block TEXT NOT NULL CHECK (hour_block IN ('morning', 'lunch', 'afternoon', 'evening', 'late')),
  season TEXT NOT NULL CHECK (season IN ('winter', 'spring', 'summer', 'fall')),
  temp_bucket TEXT NOT NULL CHECK (temp_bucket IN ('cold', 'mild', 'hot', 'unknown')),
  geo_bucket TEXT NOT NULL,
  meal_key TEXT NOT NULL,
  meal_id INTEGER,
  prior_score DOUBLE PRECISION NOT NULL,
  sample_count INTEGER,
  sample_size INTEGER,
  positive_count INTEGER NOT NULL DEFAULT 0,
  negative_count INTEGER NOT NULL DEFAULT 0,
  household_count INTEGER,
  approval_rate NUMERIC(6, 5),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bucket_key, meal_key)
);

CREATE INDEX IF NOT EXISTS idx_global_priors_bucket
  ON global_priors(bucket_key);

CREATE INDEX IF NOT EXISTS idx_global_priors_meal
  ON global_priors(meal_key);

-- =============================================================================
-- refresh function (k-anonymous publish)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_global_priors(
  p_min_households INTEGER DEFAULT 30,
  p_min_events INTEGER DEFAULT 200
) RETURNS VOID
LANGUAGE SQL
AS $$
  WITH joined AS (
    SELECT
      CASE
        WHEN (de.context_signature->>'weekday') ~ '^[0-6]$'
          THEN (de.context_signature->>'weekday')::SMALLINT
        ELSE EXTRACT(DOW FROM de.decided_at)::SMALLINT
      END AS weekday,
      CASE
        WHEN de.context_signature->>'hour_block' IN ('morning', 'lunch', 'afternoon', 'evening', 'late')
          THEN de.context_signature->>'hour_block'
        ELSE 'evening'
      END AS hour_block,
      CASE
        WHEN de.context_signature->>'season' IN ('winter', 'spring', 'summer', 'fall')
          THEN de.context_signature->>'season'
        ELSE 'winter'
      END AS season,
      CASE
        WHEN de.context_signature->>'temp_bucket' IN ('cold', 'mild', 'hot', 'unknown')
          THEN de.context_signature->>'temp_bucket'
        ELSE 'unknown'
      END AS temp_bucket,
      COALESCE(NULLIF(de.context_signature->>'geo_bucket', ''), 'unknown') AS geo_bucket,
      COALESCE(
        NULLIF(de.decision_payload->>'meal_id', ''),
        NULLIF(de.decision_payload->>'mealId', ''),
        de.meal_id::TEXT
      ) AS meal_key,
      de.household_key,
      fe.feedback_type,
      fe.rating
    FROM decision_events de
    JOIN feedback_events fe ON fe.decision_event_id = de.id
    WHERE de.event_version = 1
  ),
  scored AS (
    SELECT
      weekday,
      hour_block,
      season,
      temp_bucket,
      geo_bucket,
      meal_key,
      household_key,
      CASE
        WHEN feedback_type IN ('accepted', 'completed') THEN 1
        WHEN feedback_type = 'rating' AND rating = 1 THEN 1
        ELSE 0
      END AS positive,
      CASE
        WHEN feedback_type IN ('rejected', 'undo') THEN 1
        WHEN feedback_type = 'rating' AND rating = -1 THEN 1
        ELSE 0
      END AS negative
    FROM joined
    WHERE meal_key IS NOT NULL
  ),
  agg AS (
    SELECT
      weekday,
      hour_block,
      season,
      temp_bucket,
      geo_bucket,
      meal_key,
      COUNT(*)::INTEGER AS sample_count,
      COUNT(*)::INTEGER AS sample_size,
      SUM(positive)::INTEGER AS positive_count,
      SUM(negative)::INTEGER AS negative_count,
      COUNT(DISTINCT household_key)::INTEGER AS household_count,
      CASE
        WHEN COUNT(*) = 0 THEN 0::NUMERIC
        ELSE SUM(positive)::NUMERIC / COUNT(*)::NUMERIC
      END AS approval_rate
    FROM scored
    GROUP BY 1,2,3,4,5,6
    HAVING COUNT(*) >= p_min_events
      AND COUNT(DISTINCT household_key) >= p_min_households
  )
  INSERT INTO global_priors (
    bucket_key,
    weekday,
    hour_block,
    season,
    temp_bucket,
    geo_bucket,
    meal_key,
    meal_id,
    prior_score,
    sample_count,
    sample_size,
    positive_count,
    negative_count,
    household_count,
    approval_rate,
    computed_at
  )
  SELECT
    'v1|wd' || weekday::TEXT || '|hb_' || hour_block || '|se_' || season || '|tb_' || temp_bucket || '|geo_' || geo_bucket,
    weekday,
    hour_block,
    season,
    temp_bucket,
    geo_bucket,
    meal_key,
    CASE WHEN meal_key ~ '^[0-9]+$' THEN meal_key::INTEGER ELSE NULL END,
    approval_rate::DOUBLE PRECISION,
    sample_count,
    sample_size,
    positive_count,
    negative_count,
    household_count,
    approval_rate,
    NOW()
  FROM agg
  ON CONFLICT (bucket_key, meal_key)
  DO UPDATE SET
    weekday = EXCLUDED.weekday,
    hour_block = EXCLUDED.hour_block,
    season = EXCLUDED.season,
    temp_bucket = EXCLUDED.temp_bucket,
    geo_bucket = EXCLUDED.geo_bucket,
    meal_id = EXCLUDED.meal_id,
    prior_score = EXCLUDED.prior_score,
    sample_count = EXCLUDED.sample_count,
    sample_size = EXCLUDED.sample_size,
    positive_count = EXCLUDED.positive_count,
    negative_count = EXCLUDED.negative_count,
    household_count = EXCLUDED.household_count,
    approval_rate = EXCLUDED.approval_rate,
    computed_at = NOW();
$$;
