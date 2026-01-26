-- ============================================================================
-- FAST FOOD: Receipt OCR Ingestion Schema
-- Migration: 002_create_receipt_ingestion_tables (UP)
-- 
-- INVARIANTS ENFORCED:
-- - Inventory is probabilistic and advisory; ingestion NEVER blocks dinner decisions
-- - No browsing UX (no arrays/lists returned to clients as "choices")
-- - Ingestion is idempotent-safe and auditable (append-only events preferred)
-- - receipt_imports and receipt_line_items support audit/debug via raw data storage
-- ============================================================================

-- ============================================================================
-- RECEIPT IMPORTS
-- Primary ingestion event record. Tracks OCR processing pipeline status.
-- One import can have many line items.
-- ============================================================================
CREATE TABLE decision_os.receipt_imports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_key       TEXT NOT NULL DEFAULT 'default',
    source              TEXT NOT NULL DEFAULT 'image_upload' 
                            CHECK (source IN ('image_upload', 'email_forward', 'manual_text')),
    vendor_name         TEXT,                      -- nullable, store name if detected
    purchased_at        TIMESTAMPTZ,               -- nullable, receipt date if detected
    ocr_provider        TEXT,                      -- nullable, e.g., 'google_vision', 'aws_textract'
    ocr_raw_text        TEXT,                      -- nullable, raw OCR output for audit/debug
    status              TEXT NOT NULL DEFAULT 'received' 
                            CHECK (status IN ('received', 'parsed', 'failed')),
    error_message       TEXT,                      -- nullable, for failed status
    created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index: lookup by household + recency (for debugging/audit)
CREATE INDEX idx_receipt_imports_household_created 
    ON decision_os.receipt_imports(household_key, created_at DESC);

-- Index: filter by status (for retry/monitoring)
CREATE INDEX idx_receipt_imports_status 
    ON decision_os.receipt_imports(status) 
    WHERE status IN ('received', 'failed');

COMMENT ON TABLE decision_os.receipt_imports IS 
    'Receipt OCR ingestion events. Stores raw OCR for audit. NEVER blocks decisions.';
COMMENT ON COLUMN decision_os.receipt_imports.source IS 
    'image_upload=camera/photo, email_forward=forwarded receipt, manual_text=typed input';
COMMENT ON COLUMN decision_os.receipt_imports.ocr_raw_text IS 
    'Raw OCR text for debugging and reprocessing. May be large.';
COMMENT ON COLUMN decision_os.receipt_imports.status IS 
    'received=awaiting parse, parsed=items extracted, failed=OCR/parse error';

-- ============================================================================
-- RECEIPT LINE ITEMS
-- Individual items parsed from receipts. Links to receipt_imports.
-- Stores both raw and normalized data for audit and learning.
-- ============================================================================
CREATE TABLE decision_os.receipt_line_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_import_id       UUID NOT NULL 
                                REFERENCES decision_os.receipt_imports(id) 
                                ON DELETE CASCADE,
    
    -- Raw data (as extracted from OCR)
    raw_line                TEXT NOT NULL,             -- full line text from OCR
    raw_item_name           TEXT,                      -- nullable, extracted item name
    raw_qty_text            TEXT,                      -- nullable, e.g., "2 LB", "3 CT"
    raw_price               NUMERIC(10,2),             -- nullable, price if detected
    
    -- Normalized data (after processing/matching)
    normalized_item_name    TEXT,                      -- nullable, canonical ingredient name
    normalized_unit         TEXT,                      -- nullable, standardized unit (lb, oz, count)
    normalized_qty_estimated NUMERIC(10,2),            -- nullable, numeric quantity
    
    -- Confidence score for inventory updates
    confidence              NUMERIC(3,2) NOT NULL DEFAULT 0.50 
                                CHECK (confidence >= 0 AND confidence <= 1),
    
    created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index: lookup items by receipt (for displaying parsed results)
CREATE INDEX idx_receipt_line_items_receipt 
    ON decision_os.receipt_line_items(receipt_import_id);

-- Index: search by normalized name (for deduplication/matching)
CREATE INDEX idx_receipt_line_items_normalized_name 
    ON decision_os.receipt_line_items(normalized_item_name) 
    WHERE normalized_item_name IS NOT NULL;

COMMENT ON TABLE decision_os.receipt_line_items IS 
    'Parsed line items from receipts. Both raw and normalized data for audit.';
COMMENT ON COLUMN decision_os.receipt_line_items.raw_line IS 
    'Full OCR line text. Preserved for debugging and reprocessing.';
COMMENT ON COLUMN decision_os.receipt_line_items.confidence IS 
    '0.0-1.0 confidence in item identification. Affects inventory_items.confidence.';
COMMENT ON COLUMN decision_os.receipt_line_items.normalized_item_name IS 
    'Canonical ingredient name matching meal_ingredients. NULL if not matched.';

-- ============================================================================
-- ADDITIONAL INDEX: inventory_items(household_key, item_name)
-- Required for efficient inventory lookups and deduplication during ingestion.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_inventory_items_household_name 
    ON decision_os.inventory_items(household_key, item_name);

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
    -- Verify receipt_imports table exists
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'decision_os' 
        AND table_name = 'receipt_imports'
    )), 'receipt_imports table not created';
    
    -- Verify receipt_line_items table exists
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'decision_os' 
        AND table_name = 'receipt_line_items'
    )), 'receipt_line_items table not created';
    
    -- Verify indexes exist
    ASSERT (SELECT COUNT(*) >= 3 FROM pg_indexes 
            WHERE schemaname = 'decision_os' 
            AND tablename IN ('receipt_imports', 'receipt_line_items')),
           'Expected at least 3 indexes on receipt tables';
    
    -- Verify FK constraint
    ASSERT (SELECT COUNT(*) > 0 FROM information_schema.table_constraints 
            WHERE table_schema = 'decision_os' 
            AND table_name = 'receipt_line_items' 
            AND constraint_type = 'FOREIGN KEY'),
           'FK constraint missing on receipt_line_items';
    
    RAISE NOTICE 'Migration 002 verification passed';
END $$;
