-- Migration 027: Create sessions table for MVP
-- Tracks dinner decision sessions per contract

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  household_key TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  
  -- Context input (from intent capture)
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Decision output (from Arbiter)
  decision_id TEXT,
  decision_payload JSONB,
  
  -- Session outcome
  outcome TEXT,
  rejection_count INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Outcome must be one of the valid states
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_outcome_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_outcome_check 
  CHECK (outcome IS NULL OR outcome IN ('pending', 'accepted', 'rescued', 'abandoned'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_household_key ON sessions(household_key);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_outcome ON sessions(outcome);

-- Foreign key to households (soft reference via household_key)
-- Not enforced as FK to allow flexibility

-- Add NOT NULL constraint for household_key
ALTER TABLE sessions ALTER COLUMN household_key SET NOT NULL;

-- Add CHECK for rejection_count
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_rejection_count_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_rejection_count_check 
  CHECK (rejection_count >= 0 AND rejection_count <= 10);

-- Comment
COMMENT ON TABLE sessions IS 'Dinner decision sessions - tracks intent to outcome per MVP contract';
COMMENT ON COLUMN sessions.context IS 'Processed context from Context Agent';
COMMENT ON COLUMN sessions.outcome IS 'Session outcome: accepted (user approved), rescued (DRM override), abandoned (gave up)';
COMMENT ON COLUMN sessions.rejection_count IS 'Number of rejections in session - 2+ triggers DRM';
