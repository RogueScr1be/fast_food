-- Migration 024: Add household-scoped unique constraint to inventory_items
-- Forward-only migration - DO NOT edit old migrations
--
-- This fixes a CRITICAL tenant isolation bug where ON CONFLICT (id) could
-- allow cross-tenant overwrites if the same UUID is used in different households.
--
-- New constraint: UNIQUE (household_key, item_name)
-- This ensures each household can only have one inventory item per unique name.

-- =============================================================================
-- STEP 1: Add the household-scoped unique constraint
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'inventory_items_household_item_unique'
  ) THEN
    ALTER TABLE inventory_items 
    ADD CONSTRAINT inventory_items_household_item_unique 
    UNIQUE (household_key, item_name);
  END IF;
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON CONSTRAINT inventory_items_household_item_unique ON inventory_items 
IS 'Enforces one inventory item per name per household - prevents cross-tenant overwrites';
