-- Migration 002: Create meals table
-- Part of Decision OS schema

CREATE TABLE IF NOT EXISTS meals (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  prep_time_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for category lookups
CREATE INDEX IF NOT EXISTS idx_meals_category ON meals(category);

-- Comment
COMMENT ON TABLE meals IS 'Meal catalog for Decision OS';
