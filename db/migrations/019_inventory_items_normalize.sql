-- Migration 019: Normalize inventory_items and taste_signals to canonical schema
-- Forward-only migration - DO NOT edit old migrations
--
-- inventory_items: Add canonical columns (item_name, remaining_qty, last_seen_at)
-- taste_signals: Add event_id alias column

-- =============================================================================
-- PART A: INVENTORY_ITEMS NORMALIZATION
-- =============================================================================

-- STEP 1: Add canonical columns (if not exist)
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_name TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS remaining_qty NUMERIC;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- STEP 2: Backfill from legacy columns
-- item_name from name
UPDATE inventory_items 
SET item_name = COALESCE(item_name, name, 'unknown_item')
WHERE item_name IS NULL;

-- remaining_qty from quantity
UPDATE inventory_items 
SET remaining_qty = COALESCE(remaining_qty, quantity::numeric, 0)
WHERE remaining_qty IS NULL;

-- last_seen_at from updated_at or created_at
UPDATE inventory_items 
SET last_seen_at = COALESCE(last_seen_at, updated_at, created_at, NOW())
WHERE last_seen_at IS NULL;

-- confidence: ensure it's not null
UPDATE inventory_items 
SET confidence = COALESCE(confidence, 1.0)
WHERE confidence IS NULL;

-- STEP 3: Set NOT NULL on canonical columns
ALTER TABLE inventory_items ALTER COLUMN item_name SET NOT NULL;
ALTER TABLE inventory_items ALTER COLUMN remaining_qty SET NOT NULL;
ALTER TABLE inventory_items ALTER COLUMN last_seen_at SET NOT NULL;
ALTER TABLE inventory_items ALTER COLUMN confidence SET NOT NULL;

-- STEP 4: Set defaults
ALTER TABLE inventory_items ALTER COLUMN remaining_qty SET DEFAULT 0;
ALTER TABLE inventory_items ALTER COLUMN confidence SET DEFAULT 1.0;
ALTER TABLE inventory_items ALTER COLUMN last_seen_at SET DEFAULT NOW();

-- =============================================================================
-- PART B: TASTE_SIGNALS - Add event_id alias
-- =============================================================================

-- The codebase expects 'event_id' but table has 'decision_event_id'
-- Add event_id as an alias column that mirrors decision_event_id

ALTER TABLE taste_signals ADD COLUMN IF NOT EXISTS event_id TEXT;

-- Backfill event_id from decision_event_id
UPDATE taste_signals 
SET event_id = decision_event_id
WHERE event_id IS NULL AND decision_event_id IS NOT NULL;

-- For any rows without decision_event_id, set a placeholder
UPDATE taste_signals 
SET event_id = 'legacy-' || id
WHERE event_id IS NULL;

-- Note: We don't enforce NOT NULL on event_id yet because decision_event_id may be nullable
-- The codebase should write to both columns going forward

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON COLUMN inventory_items.item_name IS 'Canonical item name (normalized from legacy "name" column)';
COMMENT ON COLUMN inventory_items.remaining_qty IS 'Remaining quantity (normalized from legacy "quantity" column)';
COMMENT ON COLUMN inventory_items.last_seen_at IS 'Last time this item was seen/updated';
COMMENT ON COLUMN taste_signals.event_id IS 'Reference to decision_events.id (alias for decision_event_id)';
