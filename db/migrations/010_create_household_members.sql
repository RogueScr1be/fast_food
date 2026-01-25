-- Migration 010: Create household_members join table
-- Part of Decision OS Auth integration
--
-- Links user_profiles to households.
-- For MVP: each user belongs to exactly one household.

CREATE TABLE IF NOT EXISTS household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_profile_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each user can only belong to one household (MVP constraint)
  UNIQUE (user_profile_id)
);

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS idx_household_members_household_id ON household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_household_members_user_profile_id ON household_members(user_profile_id);

-- Add default user to default household
INSERT INTO household_members (household_id, user_profile_id, role)
SELECT 
  '00000000-0000-0000-0000-000000000000',
  1,
  'owner'
WHERE EXISTS (SELECT 1 FROM user_profiles WHERE id = 1)
ON CONFLICT (user_profile_id) DO NOTHING;

-- Comment
COMMENT ON TABLE household_members IS 'Join table linking users to households. MVP: one household per user.';
