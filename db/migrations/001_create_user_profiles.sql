-- Migration 001: Create user_profiles table
-- Part of Decision OS schema

CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  external_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for external ID lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_external_id ON user_profiles(external_id);

-- Comment
COMMENT ON TABLE user_profiles IS 'User profiles for Decision OS';
