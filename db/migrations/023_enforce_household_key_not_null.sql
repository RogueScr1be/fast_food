-- Migration 023: Enforce NOT NULL household_key across all tenant tables
-- Forward-only migration - DO NOT edit old migrations
--
-- This migration ensures household_key is NOT NULL on all tenant tables.
-- If any rows exist without household_key, this migration will FAIL.
-- That's intentional - it catches data integrity issues early.

-- =============================================================================
-- STEP 1: Verify no NULL household_key values exist
-- (These should have been backfilled in migration 017)
-- =============================================================================

DO $$
DECLARE
  null_count INTEGER;
BEGIN
  -- Check decision_events
  SELECT COUNT(*) INTO null_count FROM decision_events WHERE household_key IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'decision_events has % rows with NULL household_key', null_count;
  END IF;
  
  -- Check taste_signals
  SELECT COUNT(*) INTO null_count FROM taste_signals WHERE household_key IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'taste_signals has % rows with NULL household_key', null_count;
  END IF;
  
  -- Check taste_meal_scores
  SELECT COUNT(*) INTO null_count FROM taste_meal_scores WHERE household_key IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'taste_meal_scores has % rows with NULL household_key', null_count;
  END IF;
  
  -- Check inventory_items
  SELECT COUNT(*) INTO null_count FROM inventory_items WHERE household_key IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'inventory_items has % rows with NULL household_key', null_count;
  END IF;
  
  -- Check receipt_imports
  SELECT COUNT(*) INTO null_count FROM receipt_imports WHERE household_key IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'receipt_imports has % rows with NULL household_key', null_count;
  END IF;
END $$;

-- =============================================================================
-- STEP 2: Enforce NOT NULL (idempotent - safe if already NOT NULL)
-- =============================================================================

-- decision_events (should already be NOT NULL from 017/018, but ensure)
ALTER TABLE decision_events ALTER COLUMN household_key SET NOT NULL;

-- taste_signals
ALTER TABLE taste_signals ALTER COLUMN household_key SET NOT NULL;

-- taste_meal_scores
ALTER TABLE taste_meal_scores ALTER COLUMN household_key SET NOT NULL;

-- inventory_items
ALTER TABLE inventory_items ALTER COLUMN household_key SET NOT NULL;

-- receipt_imports
ALTER TABLE receipt_imports ALTER COLUMN household_key SET NOT NULL;

-- =============================================================================
-- STEP 3: Add non-empty CHECK constraints (idempotent)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'taste_signals_household_key_nonempty') THEN
    ALTER TABLE taste_signals ADD CONSTRAINT taste_signals_household_key_nonempty CHECK (household_key <> '');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'taste_meal_scores_household_key_nonempty') THEN
    ALTER TABLE taste_meal_scores ADD CONSTRAINT taste_meal_scores_household_key_nonempty CHECK (household_key <> '');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_household_key_nonempty') THEN
    ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_household_key_nonempty CHECK (household_key <> '');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipt_imports_household_key_nonempty') THEN
    ALTER TABLE receipt_imports ADD CONSTRAINT receipt_imports_household_key_nonempty CHECK (household_key <> '');
  END IF;
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON CONSTRAINT taste_signals_household_key_nonempty ON taste_signals 
IS 'household_key must not be empty string';

COMMENT ON CONSTRAINT taste_meal_scores_household_key_nonempty ON taste_meal_scores 
IS 'household_key must not be empty string';

COMMENT ON CONSTRAINT inventory_items_household_key_nonempty ON inventory_items 
IS 'household_key must not be empty string';

COMMENT ON CONSTRAINT receipt_imports_household_key_nonempty ON receipt_imports 
IS 'household_key must not be empty string';
