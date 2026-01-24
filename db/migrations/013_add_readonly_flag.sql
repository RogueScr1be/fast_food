-- Migration 013: Add decision_os_readonly flag for emergency freeze mode
-- When enabled, no writes to decision_events, taste_signals, inventory_items, receipt_imports

INSERT INTO runtime_flags (key, enabled, updated_at) VALUES
  ('decision_os_readonly', false, NOW())
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN runtime_flags.enabled IS 'Whether the feature is enabled. decision_os_readonly=true puts system in read-only mode.';
