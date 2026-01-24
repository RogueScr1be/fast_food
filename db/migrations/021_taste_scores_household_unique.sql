-- Migration 021: Update taste_meal_scores unique constraint to be household-scoped
-- Forward-only migration - DO NOT edit old migrations
--
-- This changes the partitioning model from user-based to household-based.
-- Old constraint: UNIQUE(user_profile_id, meal_id)
-- New constraint: UNIQUE(household_key, meal_id)

-- =============================================================================
-- STEP 1: Drop the old user-based unique constraint
-- =============================================================================

-- Find and drop the existing unique constraint on (user_profile_id, meal_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'taste_meal_scores_user_profile_id_meal_id_key'
  ) THEN
    ALTER TABLE taste_meal_scores DROP CONSTRAINT taste_meal_scores_user_profile_id_meal_id_key;
  END IF;
END $$;

-- =============================================================================
-- STEP 2: Add the new household-scoped unique constraint
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'taste_meal_scores_household_meal_unique'
  ) THEN
    ALTER TABLE taste_meal_scores 
    ADD CONSTRAINT taste_meal_scores_household_meal_unique 
    UNIQUE (household_key, meal_id);
  END IF;
END $$;

-- =============================================================================
-- STEP 3: Add index for household-based lookups
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_taste_meal_scores_household_updated
ON taste_meal_scores (household_key, updated_at DESC);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON CONSTRAINT taste_meal_scores_household_meal_unique ON taste_meal_scores 
IS 'Enforces one score per meal per household (not per user)';

COMMENT ON INDEX idx_taste_meal_scores_household_updated 
IS 'Supports household-based queries sorted by update time';
