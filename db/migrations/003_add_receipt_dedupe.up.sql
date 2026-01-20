-- ============================================================================
-- Migration 003: Receipt Deduplication Support
-- ============================================================================
-- 
-- PURPOSE:
-- Prevent duplicate imports from inflating inventory or creating noisy data.
-- 
-- INVARIANTS:
-- - Never delete receipt_imports (preserve audit trail)
-- - Dedupe is safe: false positives mark as duplicate, don't delete
-- - Only one "canonical" import per household per content hash
-- ============================================================================

-- Add dedupe columns to receipt_imports
ALTER TABLE decision_os.receipt_imports 
ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';

ALTER TABLE decision_os.receipt_imports 
ADD COLUMN is_duplicate BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE decision_os.receipt_imports 
ADD COLUMN duplicate_of_receipt_import_id UUID NULL 
REFERENCES decision_os.receipt_imports(id) ON DELETE SET NULL;

-- Create comment for documentation
COMMENT ON COLUMN decision_os.receipt_imports.content_hash IS 
'SHA256 hex of normalized OCR text + vendor + date. Used for deduplication.';

COMMENT ON COLUMN decision_os.receipt_imports.is_duplicate IS 
'True if this import is a duplicate of another canonical import.';

COMMENT ON COLUMN decision_os.receipt_imports.duplicate_of_receipt_import_id IS 
'Points to the canonical import this is a duplicate of.';

-- Create partial unique index: only one canonical (is_duplicate=false) per household+hash
-- This allows multiple duplicate rows with the same hash, but only ONE canonical
CREATE UNIQUE INDEX idx_receipt_imports_canonical_hash 
ON decision_os.receipt_imports(household_key, content_hash) 
WHERE is_duplicate = false AND content_hash != '';

-- Index for looking up duplicates efficiently
CREATE INDEX idx_receipt_imports_content_hash 
ON decision_os.receipt_imports(household_key, content_hash);

-- ============================================================================
-- Verification
-- ============================================================================
DO $$ 
BEGIN
  -- Verify columns exist
  ASSERT (
    SELECT COUNT(*) = 3 
    FROM information_schema.columns 
    WHERE table_schema = 'decision_os' 
      AND table_name = 'receipt_imports'
      AND column_name IN ('content_hash', 'is_duplicate', 'duplicate_of_receipt_import_id')
  ), 'Missing dedupe columns in receipt_imports';
  
  -- Verify partial unique index exists
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'decision_os' 
      AND indexname = 'idx_receipt_imports_canonical_hash'
  ), 'Missing canonical hash unique index';
  
  RAISE NOTICE 'Migration 003 verification passed';
END $$;
