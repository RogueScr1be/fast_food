-- ============================================================================
-- Migration 003 DOWN: Remove Receipt Deduplication Support
-- ============================================================================

-- Drop indexes first
DROP INDEX IF EXISTS decision_os.idx_receipt_imports_canonical_hash;
DROP INDEX IF EXISTS decision_os.idx_receipt_imports_content_hash;

-- Remove columns
ALTER TABLE decision_os.receipt_imports 
DROP COLUMN IF EXISTS duplicate_of_receipt_import_id;

ALTER TABLE decision_os.receipt_imports 
DROP COLUMN IF EXISTS is_duplicate;

ALTER TABLE decision_os.receipt_imports 
DROP COLUMN IF EXISTS content_hash;
