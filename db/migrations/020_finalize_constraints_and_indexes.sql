-- Migration 020: Finalize constraints and indexes
-- Forward-only migration - DO NOT edit old migrations
--
-- This migration adds/ensures all constraints and indexes that the codebase expects.
-- Run AFTER 017-019 have made schema reality match expectations.

-- =============================================================================
-- PART A: DECISION_EVENTS CONSTRAINTS
-- =============================================================================

-- CHECK: user_action must be one of allowed values
-- Note: We use NOT VALID + VALIDATE to avoid full table scan blocking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_events_user_action_check') THEN
    ALTER TABLE decision_events 
    ADD CONSTRAINT decision_events_user_action_check 
    CHECK (user_action IN ('approved', 'rejected', 'drm_triggered'))
    NOT VALID;
  END IF;
END $$;

-- Validate the constraint (non-blocking for existing rows)
ALTER TABLE decision_events VALIDATE CONSTRAINT decision_events_user_action_check;

-- CHECK: household_key not empty (should exist from 017, but ensure)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_events_household_key_check') THEN
    ALTER TABLE decision_events 
    ADD CONSTRAINT decision_events_household_key_check 
    CHECK (household_key <> '')
    NOT VALID;
  END IF;
END $$;

ALTER TABLE decision_events VALIDATE CONSTRAINT decision_events_household_key_check;

-- CHECK: decision_type not empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_events_decision_type_check') THEN
    ALTER TABLE decision_events 
    ADD CONSTRAINT decision_events_decision_type_check 
    CHECK (decision_type <> '')
    NOT VALID;
  END IF;
END $$;

ALTER TABLE decision_events VALIDATE CONSTRAINT decision_events_decision_type_check;

-- CHECK: timestamps not null (already enforced by NOT NULL, but explicit check)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_events_timestamps_check') THEN
    ALTER TABLE decision_events 
    ADD CONSTRAINT decision_events_timestamps_check 
    CHECK (actioned_at IS NOT NULL AND decided_at IS NOT NULL)
    NOT VALID;
  END IF;
END $$;

ALTER TABLE decision_events VALIDATE CONSTRAINT decision_events_timestamps_check;

-- =============================================================================
-- PART B: PERFORMANCE INDEXES FOR DECISION_EVENTS
-- =============================================================================

-- Index: household-based queries sorted by time (most common pattern)
CREATE INDEX IF NOT EXISTS idx_decision_events_household_actioned 
ON decision_events (household_key, actioned_at DESC);

-- Index: user-based queries sorted by time
CREATE INDEX IF NOT EXISTS idx_decision_events_user_actioned 
ON decision_events (user_profile_id, actioned_at DESC);

-- Index: user_action filtering (for counting approvals/rejections)
-- Note: This may already exist from 003, but IF NOT EXISTS handles it
CREATE INDEX IF NOT EXISTS idx_decision_events_user_action 
ON decision_events (user_action);

-- =============================================================================
-- PART C: INDEXES FOR OTHER TABLES
-- =============================================================================

-- taste_signals: household-based queries
CREATE INDEX IF NOT EXISTS idx_taste_signals_household 
ON taste_signals (household_key, created_at DESC);

-- taste_meal_scores: household-based queries
CREATE INDEX IF NOT EXISTS idx_taste_meal_scores_household 
ON taste_meal_scores (household_key, meal_id);

-- receipt_imports: household-based queries
CREATE INDEX IF NOT EXISTS idx_receipt_imports_household 
ON receipt_imports (household_key, created_at DESC);

-- inventory_items: household-based queries
CREATE INDEX IF NOT EXISTS idx_inventory_items_household 
ON inventory_items (household_key, item_name);

-- =============================================================================
-- PART D: COMMENTS
-- =============================================================================

COMMENT ON CONSTRAINT decision_events_user_action_check ON decision_events 
IS 'user_action must be approved, rejected, or drm_triggered';

COMMENT ON CONSTRAINT decision_events_household_key_check ON decision_events 
IS 'household_key must not be empty';

COMMENT ON CONSTRAINT decision_events_decision_type_check ON decision_events 
IS 'decision_type must not be empty';

COMMENT ON CONSTRAINT decision_events_timestamps_check ON decision_events 
IS 'actioned_at and decided_at must be set';

COMMENT ON INDEX idx_decision_events_household_actioned 
IS 'Supports household-based queries sorted by action time';

COMMENT ON INDEX idx_decision_events_user_actioned 
IS 'Supports user-based queries sorted by action time';
