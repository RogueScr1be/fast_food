-- ============================================================================
-- FAST FOOD: Receipt OCR Ingestion Schema
-- Migration: 002_create_receipt_ingestion_tables (DOWN)
-- 
-- ROLLBACK: Removes receipt ingestion tables and related indexes.
-- WARNING: This will delete all receipt import data.
-- ============================================================================

-- Drop indexes first (some may have been added to existing tables)
DROP INDEX IF EXISTS decision_os.idx_inventory_items_household_name;
DROP INDEX IF EXISTS decision_os.idx_receipt_line_items_normalized_name;
DROP INDEX IF EXISTS decision_os.idx_receipt_line_items_receipt;
DROP INDEX IF EXISTS decision_os.idx_receipt_imports_status;
DROP INDEX IF EXISTS decision_os.idx_receipt_imports_household_created;

-- Drop tables (cascade handles FK constraints)
DROP TABLE IF EXISTS decision_os.receipt_line_items;
DROP TABLE IF EXISTS decision_os.receipt_imports;

-- Verification
DO $$
BEGIN
    -- Verify tables are dropped
    ASSERT NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'decision_os' 
        AND table_name = 'receipt_imports'
    ), 'receipt_imports table still exists';
    
    ASSERT NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'decision_os' 
        AND table_name = 'receipt_line_items'
    ), 'receipt_line_items table still exists';
    
    RAISE NOTICE 'Migration 002 rollback verification passed';
END $$;
