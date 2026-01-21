-- Migration 008: Add auth_user_id to user_profiles
-- Part of Decision OS Auth integration

-- Add auth_user_id column for Supabase Auth integration
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS auth_user_id TEXT;

-- Create unique index for auth lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_auth_user_id 
ON user_profiles(auth_user_id) 
WHERE auth_user_id IS NOT NULL;

-- Comment
COMMENT ON COLUMN user_profiles.auth_user_id IS 'Supabase Auth user ID (sub claim from JWT)';
