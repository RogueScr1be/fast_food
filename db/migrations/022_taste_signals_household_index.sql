-- Migration 022: Add household-scoped indexes to taste_signals
-- Forward-only migration - DO NOT edit old migrations
--
-- taste_signals is partitioned by household_key (added in 017).
-- This migration adds the proper indexes for household-based lookups.

-- =============================================================================
-- STEP 1: Add household-based index for efficient lookups
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_taste_signals_household_created
ON taste_signals (household_key, created_at DESC);

-- Index for event_id lookups (also household-scoped for safety)
CREATE INDEX IF NOT EXISTS idx_taste_signals_household_event
ON taste_signals (household_key, event_id);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON INDEX idx_taste_signals_household_created 
IS 'Supports household-based queries sorted by creation time';

COMMENT ON INDEX idx_taste_signals_household_event 
IS 'Supports event lookups within a household';
