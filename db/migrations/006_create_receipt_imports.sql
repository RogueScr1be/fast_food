-- Migration 006: Create receipt_imports and inventory_items tables
-- Part of Decision OS schema

-- Receipt imports table
CREATE TABLE IF NOT EXISTS receipt_imports (
  id TEXT PRIMARY KEY,
  user_profile_id INTEGER NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('received', 'parsed', 'failed')),
  raw_ocr_text TEXT,
  error_message TEXT,
  image_hash TEXT
);

-- Indexes for receipt queries
CREATE INDEX IF NOT EXISTS idx_receipt_imports_user_profile_id ON receipt_imports(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_receipt_imports_created_at ON receipt_imports(created_at);
CREATE INDEX IF NOT EXISTS idx_receipt_imports_image_hash ON receipt_imports(image_hash);

-- Inventory items table
CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  user_profile_id INTEGER NOT NULL REFERENCES user_profiles(id),
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('receipt', 'manual')),
  receipt_import_id TEXT REFERENCES receipt_imports(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for inventory queries
CREATE INDEX IF NOT EXISTS idx_inventory_items_user_profile_id ON inventory_items(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name);
CREATE INDEX IF NOT EXISTS idx_inventory_items_receipt_import_id ON inventory_items(receipt_import_id);

-- Comments
COMMENT ON TABLE receipt_imports IS 'Receipt import audit trail. Always creates a row even on OCR failure.';
COMMENT ON TABLE inventory_items IS 'User food inventory populated from receipts or manual entry.';
