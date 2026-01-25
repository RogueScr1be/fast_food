-- Migration 009: Create households table
-- Part of Decision OS Auth integration
--
-- household_key is the primary identifier used across all tables.
-- This table provides a stable mapping from UUIDs to household_keys.

CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_key TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for household_key lookups
CREATE INDEX IF NOT EXISTS idx_households_household_key ON households(household_key);

-- Create default household for dev/test
INSERT INTO households (id, household_key, name)
VALUES ('00000000-0000-0000-0000-000000000000', 'default', 'Default Household')
ON CONFLICT (household_key) DO NOTHING;

-- Comment
COMMENT ON TABLE households IS 'Households for multi-user support. household_key is the partition key used by other tables.';
