-- Migration 017: Add household_key partition column to all core tables
-- Forward-only migration - DO NOT edit old migrations
--
-- This adds household_key to enable household-based data partitioning.
-- After this migration, all core tables will have household_key column.

-- =============================================================================
-- STEP 1: Add household_key column to each table (nullable initially)
-- =============================================================================

-- decision_events: add household_key
ALTER TABLE decision_events ADD COLUMN IF NOT EXISTS household_key TEXT;

-- taste_signals: add household_key
ALTER TABLE taste_signals ADD COLUMN IF NOT EXISTS household_key TEXT;

-- taste_meal_scores: add household_key
ALTER TABLE taste_meal_scores ADD COLUMN IF NOT EXISTS household_key TEXT;

-- receipt_imports: add household_key
ALTER TABLE receipt_imports ADD COLUMN IF NOT EXISTS household_key TEXT;

-- inventory_items: add household_key
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS household_key TEXT;

-- =============================================================================
-- STEP 2: Backfill household_key from user_profile_id -> household_members -> households
-- For rows that already exist, derive household_key from user membership
-- =============================================================================

-- Backfill decision_events
UPDATE decision_events de
SET household_key = COALESCE(
  (SELECT h.household_key 
   FROM household_members hm 
   JOIN households h ON hm.household_id = h.id 
   WHERE hm.user_profile_id = de.user_profile_id 
   LIMIT 1),
  'default'
)
WHERE household_key IS NULL;

-- Backfill taste_signals
UPDATE taste_signals ts
SET household_key = COALESCE(
  (SELECT h.household_key 
   FROM household_members hm 
   JOIN households h ON hm.household_id = h.id 
   WHERE hm.user_profile_id = ts.user_profile_id 
   LIMIT 1),
  'default'
)
WHERE household_key IS NULL;

-- Backfill taste_meal_scores
UPDATE taste_meal_scores tms
SET household_key = COALESCE(
  (SELECT h.household_key 
   FROM household_members hm 
   JOIN households h ON hm.household_id = h.id 
   WHERE hm.user_profile_id = tms.user_profile_id 
   LIMIT 1),
  'default'
)
WHERE household_key IS NULL;

-- Backfill receipt_imports
UPDATE receipt_imports ri
SET household_key = COALESCE(
  (SELECT h.household_key 
   FROM household_members hm 
   JOIN households h ON hm.household_id = h.id 
   WHERE hm.user_profile_id = ri.user_profile_id 
   LIMIT 1),
  'default'
)
WHERE household_key IS NULL;

-- Backfill inventory_items
UPDATE inventory_items ii
SET household_key = COALESCE(
  (SELECT h.household_key 
   FROM household_members hm 
   JOIN households h ON hm.household_id = h.id 
   WHERE hm.user_profile_id = ii.user_profile_id 
   LIMIT 1),
  'default'
)
WHERE household_key IS NULL;

-- =============================================================================
-- STEP 3: Set NOT NULL after backfill
-- =============================================================================

ALTER TABLE decision_events ALTER COLUMN household_key SET NOT NULL;
ALTER TABLE taste_signals ALTER COLUMN household_key SET NOT NULL;
ALTER TABLE taste_meal_scores ALTER COLUMN household_key SET NOT NULL;
ALTER TABLE receipt_imports ALTER COLUMN household_key SET NOT NULL;
ALTER TABLE inventory_items ALTER COLUMN household_key SET NOT NULL;

-- =============================================================================
-- STEP 4: Add CHECK constraint for non-empty household_key
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_events_household_key_nonempty') THEN
    ALTER TABLE decision_events ADD CONSTRAINT decision_events_household_key_nonempty CHECK (household_key <> '');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'taste_signals_household_key_nonempty') THEN
    ALTER TABLE taste_signals ADD CONSTRAINT taste_signals_household_key_nonempty CHECK (household_key <> '');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'taste_meal_scores_household_key_nonempty') THEN
    ALTER TABLE taste_meal_scores ADD CONSTRAINT taste_meal_scores_household_key_nonempty CHECK (household_key <> '');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipt_imports_household_key_nonempty') THEN
    ALTER TABLE receipt_imports ADD CONSTRAINT receipt_imports_household_key_nonempty CHECK (household_key <> '');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_household_key_nonempty') THEN
    ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_household_key_nonempty CHECK (household_key <> '');
  END IF;
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON COLUMN decision_events.household_key IS 'Household partition key for multi-tenant isolation';
COMMENT ON COLUMN taste_signals.household_key IS 'Household partition key for multi-tenant isolation';
COMMENT ON COLUMN taste_meal_scores.household_key IS 'Household partition key for multi-tenant isolation';
COMMENT ON COLUMN receipt_imports.household_key IS 'Household partition key for multi-tenant isolation';
COMMENT ON COLUMN inventory_items.household_key IS 'Household partition key for multi-tenant isolation';
