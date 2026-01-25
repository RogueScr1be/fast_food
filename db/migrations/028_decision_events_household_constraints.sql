-- Migration 028: Add household_key constraints and indexes to decision_events
-- 
-- This migration adds constraints and indexes that depend on the household_key column.
-- The column is added in migration 017, so these must come after.
--
-- Originally these were in migrations 014 and 015, but were moved here to fix
-- the migration ordering issue (household_key didn't exist when 014/015 ran).

-- =============================================================================
-- CONSTRAINTS
-- =============================================================================

-- household_key must not be empty
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'decision_events_household_key_check'
  ) THEN
    ALTER TABLE decision_events
    ADD CONSTRAINT decision_events_household_key_check
    CHECK (household_key <> '');
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- Constraint already exists, ignore
    NULL;
END $$;

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Index for household-based queries sorted by time (most common query pattern)
-- Used by: autopilot eligibility checks, DRM recommendation, recent event lookups
CREATE INDEX IF NOT EXISTS idx_decision_events_household_actioned
ON decision_events (household_key, actioned_at DESC);

-- =============================================================================
-- COMMENTS
-- =============================================================================

-- Add comment for constraint (may fail if constraint doesn't exist, which is fine)
DO $$
BEGIN
  COMMENT ON CONSTRAINT decision_events_household_key_check ON decision_events 
    IS 'household_key must not be empty';
EXCEPTION
  WHEN undefined_object THEN
    -- Constraint doesn't exist, skip comment
    NULL;
END $$;

COMMENT ON INDEX idx_decision_events_household_actioned 
  IS 'Supports household-based queries sorted by time';
