-- ============================================================================
-- FAST FOOD: Taste Graph v1 Schema
-- Migration: 005_create_taste_graph (UP)
-- 
-- INVARIANTS ENFORCED:
-- - Behavioral-only learning: No user preference UI, no toggles, no questionnaires
-- - Learning only from approve/reject/drm_triggered events
-- - taste_signals is APPEND-ONLY (triggers prevent update/delete)
-- - taste_meal_scores is a derived cache table (mutable for recomputation)
-- - Features are internal-only; never sent to client
-- - Decision endpoint still returns exactly one action
-- ============================================================================

-- ============================================================================
-- TASTE SIGNALS (APPEND-ONLY)
-- Records behavioral signals from user decisions.
-- Each row captures a decision-feedback event with extracted features.
-- 
-- DESIGN DECISION: decision_event_id references the FEEDBACK COPY row 
-- (the row with user_action != 'pending'), not the original pending row.
-- Rationale:
-- 1. Feedback copy has the actual user_action ('approved'/'rejected'/'drm_triggered')
-- 2. Feedback copy has actioned_at timestamp
-- 3. Represents the complete decision-feedback cycle
-- ============================================================================
CREATE TABLE decision_os.taste_signals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_key       TEXT NOT NULL DEFAULT 'default',
    
    -- Timing
    decided_at          TIMESTAMPTZ NOT NULL,  -- when decision was presented
    actioned_at         TIMESTAMPTZ NULL,      -- when user acted (null if expired)
    
    -- Decision reference (FK to feedback copy row in decision_events)
    decision_event_id   UUID NOT NULL REFERENCES decision_os.decision_events(id),
    
    -- What was decided
    meal_id             UUID NULL REFERENCES decision_os.meals(id),
    decision_type       TEXT NOT NULL CHECK (decision_type IN ('cook', 'order', 'zero_cook')),
    user_action         TEXT NOT NULL CHECK (user_action IN ('approved', 'rejected', 'drm_triggered', 'expired')),
    context_hash        TEXT NOT NULL,
    
    -- Learning features (INTERNAL ONLY - never sent to client)
    -- Contains: { tags: [], cuisine_guess: string, ingredients: [], time_of_day: string, day_of_week: string }
    features            JSONB NOT NULL,
    
    -- Computed signal weight
    -- Positive for approvals, negative for rejections
    -- Example weights: approved=+1.0, rejected=-0.5, drm_triggered=-0.3, expired=-0.1
    weight              NUMERIC(6,3) NOT NULL,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comments for documentation
COMMENT ON TABLE decision_os.taste_signals IS 
    'APPEND-ONLY behavioral taste signals from user decisions. Features are internal-only.';
COMMENT ON COLUMN decision_os.taste_signals.decision_event_id IS 
    'References the FEEDBACK COPY row in decision_events (where user_action != pending).';
COMMENT ON COLUMN decision_os.taste_signals.features IS 
    'Internal learning features (tags, cuisine, ingredients). NEVER send to client.';
COMMENT ON COLUMN decision_os.taste_signals.weight IS 
    'Signal weight: positive for approvals (+1.0), negative for rejections (-0.5).';

-- ============================================================================
-- TASTE MEAL SCORES (DERIVED CACHE - MUTABLE)
-- Aggregated scores per meal per household for quick arbiter lookups.
-- Can be recomputed from taste_signals; mutable for efficiency.
-- ============================================================================
CREATE TABLE decision_os.taste_meal_scores (
    household_key       TEXT NOT NULL DEFAULT 'default',
    meal_id             UUID NOT NULL REFERENCES decision_os.meals(id),
    
    -- Aggregated score (sum of weights from taste_signals)
    score               NUMERIC(10,4) NOT NULL DEFAULT 0,
    
    -- Counters for analysis
    approvals           INT NOT NULL DEFAULT 0,
    rejections          INT NOT NULL DEFAULT 0,
    
    -- Recency tracking
    last_seen_at        TIMESTAMPTZ NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (household_key, meal_id)
);

COMMENT ON TABLE decision_os.taste_meal_scores IS 
    'Derived cache of meal scores per household. Mutable for recomputation.';
COMMENT ON COLUMN decision_os.taste_meal_scores.score IS 
    'Aggregated score from taste_signals weights. Higher = more preferred.';

-- ============================================================================
-- APPEND-ONLY TRIGGERS FOR taste_signals
-- Prevent UPDATE and DELETE to maintain audit trail integrity.
-- ============================================================================

-- Trigger function to prevent updates on taste_signals
CREATE OR REPLACE FUNCTION decision_os.taste_signals_prevent_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'UPDATE not allowed on append-only table taste_signals'
        USING HINT = 'taste_signals is append-only. Insert new records instead.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to prevent deletes on taste_signals
CREATE OR REPLACE FUNCTION decision_os.taste_signals_prevent_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'DELETE not allowed on append-only table taste_signals'
        USING HINT = 'taste_signals is append-only. Records cannot be deleted.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to taste_signals
CREATE TRIGGER taste_signals_no_update
    BEFORE UPDATE ON decision_os.taste_signals
    FOR EACH ROW
    EXECUTE FUNCTION decision_os.taste_signals_prevent_update();

CREATE TRIGGER taste_signals_no_delete
    BEFORE DELETE ON decision_os.taste_signals
    FOR EACH ROW
    EXECUTE FUNCTION decision_os.taste_signals_prevent_delete();

-- ============================================================================
-- INDEXES
-- ============================================================================

-- taste_signals: lookup by household + recency (for learning queries)
CREATE INDEX idx_taste_signals_household_created 
    ON decision_os.taste_signals(household_key, created_at DESC);

-- taste_signals: lookup by household + meal + recency (for meal-specific learning)
CREATE INDEX idx_taste_signals_household_meal_created 
    ON decision_os.taste_signals(household_key, meal_id, created_at DESC)
    WHERE meal_id IS NOT NULL;

-- taste_signals: lookup by decision_event_id (for deduplication)
CREATE UNIQUE INDEX idx_taste_signals_decision_event 
    ON decision_os.taste_signals(decision_event_id);

-- taste_meal_scores: lookup by household + score (for arbiter scoring)
CREATE INDEX idx_taste_meal_scores_household_score 
    ON decision_os.taste_meal_scores(household_key, score DESC);

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
    -- Verify taste_signals table exists
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'decision_os' 
        AND table_name = 'taste_signals'
    )), 'taste_signals table not created';
    
    -- Verify taste_meal_scores table exists
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'decision_os' 
        AND table_name = 'taste_meal_scores'
    )), 'taste_meal_scores table not created';
    
    -- Verify append-only triggers exist on taste_signals
    ASSERT (SELECT COUNT(*) = 2 FROM information_schema.triggers 
            WHERE trigger_schema = 'decision_os' 
            AND event_object_table = 'taste_signals'
            AND trigger_name LIKE 'taste_signals_no_%'),
           'Expected 2 append-only triggers on taste_signals';
    
    -- Verify indexes exist
    ASSERT (SELECT COUNT(*) >= 3 FROM pg_indexes 
            WHERE schemaname = 'decision_os' 
            AND tablename = 'taste_signals'),
           'Expected at least 3 indexes on taste_signals';
    
    RAISE NOTICE 'Migration 005 verification passed';
END $$;
