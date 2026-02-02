-- ============================================================================
-- FAST FOOD: Inventory Decay + Consumption Tracking
-- Migration: 004_add_inventory_decay (UP)
-- 
-- INVARIANTS ENFORCED:
-- - Inventory remains probabilistic and advisory; NEVER blocks dinner decisions
-- - Consumption tracking is best-effort; missing data does not break decisions
-- - Decay is simple linear model: starting - used - (time * decay_rate)
-- ============================================================================

-- ============================================================================
-- ADD COLUMNS TO inventory_items
-- ============================================================================

-- qty_used_estimated: tracks how much has been consumed via approved cook decisions
-- Separate from qty_estimated to maintain audit trail
ALTER TABLE decision_os.inventory_items 
    ADD COLUMN qty_used_estimated NUMERIC(10,2) NULL DEFAULT 0;

-- last_used_at: when item was last consumed (via approved cook decision)
-- Distinct from last_seen_at (when item was last observed/added)
ALTER TABLE decision_os.inventory_items 
    ADD COLUMN last_used_at TIMESTAMPTZ NULL;

-- decay_rate_per_day: daily decay multiplier for confidence/quantity
-- Default 0.05 = 5% decay per day (item loses relevance over ~20 days)
-- Can be customized per item (perishables decay faster)
ALTER TABLE decision_os.inventory_items 
    ADD COLUMN decay_rate_per_day NUMERIC(10,4) NULL DEFAULT 0.0500;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN decision_os.inventory_items.qty_used_estimated IS 
    'Cumulative consumption from approved cook decisions. NULL treated as 0.';

COMMENT ON COLUMN decision_os.inventory_items.last_used_at IS 
    'When this item was last consumed via approved cook decision. NULL if never used.';

COMMENT ON COLUMN decision_os.inventory_items.decay_rate_per_day IS 
    'Daily decay rate for confidence (0.05 = 5% per day). Higher for perishables.';

-- ============================================================================
-- INDEX for consumption tracking queries
-- ============================================================================

-- Index for finding items by last_used_at (for identifying stale inventory)
CREATE INDEX idx_inventory_items_last_used 
    ON decision_os.inventory_items(household_key, last_used_at DESC) 
    WHERE last_used_at IS NOT NULL;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
    -- Verify new columns exist
    ASSERT (
        SELECT COUNT(*) = 3 
        FROM information_schema.columns 
        WHERE table_schema = 'decision_os' 
        AND table_name = 'inventory_items' 
        AND column_name IN ('qty_used_estimated', 'last_used_at', 'decay_rate_per_day')
    ), 'Missing consumption/decay columns in inventory_items';
    
    -- Verify index exists
    ASSERT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'decision_os' 
        AND indexname = 'idx_inventory_items_last_used'
    ), 'Missing last_used index';
    
    RAISE NOTICE 'Migration 004 verification passed';
END $$;
