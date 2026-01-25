-- Migration 011: Create runtime_flags table for DB-backed kill switches
-- These flags can be flipped instantly from Supabase UI without redeploy

CREATE TABLE IF NOT EXISTS runtime_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_runtime_flags_key ON runtime_flags(key);

-- Seed initial flag rows (all default to false for production safety)
INSERT INTO runtime_flags (key, enabled, updated_at) VALUES
  ('decision_os_enabled', false, NOW()),
  ('decision_autopilot_enabled', false, NOW()),
  ('decision_ocr_enabled', false, NOW()),
  ('decision_drm_enabled', false, NOW())
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE runtime_flags IS 'Runtime feature flags that can be toggled without redeploy. Default all false for production safety.';
COMMENT ON COLUMN runtime_flags.key IS 'Flag identifier (e.g., decision_os_enabled)';
COMMENT ON COLUMN runtime_flags.enabled IS 'Whether the feature is enabled (AND with ENV flags)';
COMMENT ON COLUMN runtime_flags.updated_at IS 'Last update timestamp';
