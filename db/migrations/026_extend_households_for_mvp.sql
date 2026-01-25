-- Migration 026: Extend households table for MVP
-- Adds budget ceiling and fallback config for DRM

-- Add new columns
ALTER TABLE households ADD COLUMN IF NOT EXISTS budget_ceiling_cents INTEGER DEFAULT 2000;
ALTER TABLE households ADD COLUMN IF NOT EXISTS fallback_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE households ADD COLUMN IF NOT EXISTS members JSONB DEFAULT '[]'::jsonb;

-- Update default household with hardcoded fallback hierarchy
-- Per contract: DRM selects first valid fallback, never asks permission
UPDATE households SET 
  budget_ceiling_cents = 2000,
  fallback_config = '{
    "hierarchy": [
      {
        "type": "no_cook",
        "meal_id": 11,
        "meal_name": "Cereal with Milk",
        "instructions": "Pour cereal into bowl, add milk"
      },
      {
        "type": "no_cook", 
        "meal_id": 12,
        "meal_name": "PB&J Sandwich",
        "instructions": "Make a peanut butter and jelly sandwich"
      },
      {
        "type": "no_cook",
        "meal_id": 13,
        "meal_name": "Cheese and Crackers",
        "instructions": "Slice cheese, arrange with crackers"
      }
    ],
    "drm_time_threshold": "18:15",
    "rejection_threshold": 2
  }'::jsonb,
  members = '[
    {"name": "Default User", "role": "adult"}
  ]'::jsonb
WHERE household_key = 'default';

-- Add CHECK constraint for budget
ALTER TABLE households DROP CONSTRAINT IF EXISTS households_budget_positive;
ALTER TABLE households ADD CONSTRAINT households_budget_positive 
  CHECK (budget_ceiling_cents > 0);

-- Comment
COMMENT ON COLUMN households.budget_ceiling_cents IS 'Maximum dinner budget in cents - meals exceeding this are discarded by Arbiter';
COMMENT ON COLUMN households.fallback_config IS 'DRM fallback hierarchy - first valid fallback is selected without asking';
COMMENT ON COLUMN households.members IS 'Household member list for future per-person taste tracking';
