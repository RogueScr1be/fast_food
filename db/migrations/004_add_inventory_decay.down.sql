-- ============================================================================
-- FAST FOOD: Inventory Decay + Consumption Tracking
-- Migration: 004_add_inventory_decay (DOWN)
-- ============================================================================

-- Drop index first
DROP INDEX IF EXISTS decision_os.idx_inventory_items_last_used;

-- Drop columns in reverse order
ALTER TABLE decision_os.inventory_items DROP COLUMN IF EXISTS decay_rate_per_day;
ALTER TABLE decision_os.inventory_items DROP COLUMN IF EXISTS last_used_at;
ALTER TABLE decision_os.inventory_items DROP COLUMN IF EXISTS qty_used_estimated;
