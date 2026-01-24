-- Migration 005: Create taste_meal_scores table
-- Part of Decision OS schema

CREATE TABLE IF NOT EXISTS taste_meal_scores (
  id TEXT PRIMARY KEY,
  user_profile_id INTEGER NOT NULL REFERENCES user_profiles(id),
  meal_id INTEGER NOT NULL REFERENCES meals(id),
  score REAL NOT NULL DEFAULT 0,
  approvals INTEGER NOT NULL DEFAULT 0,
  rejections INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint for user+meal combination
  UNIQUE (user_profile_id, meal_id)
);

-- Indexes for ranking queries
CREATE INDEX IF NOT EXISTS idx_taste_meal_scores_user_profile_id ON taste_meal_scores(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_taste_meal_scores_meal_id ON taste_meal_scores(meal_id);
CREATE INDEX IF NOT EXISTS idx_taste_meal_scores_score ON taste_meal_scores(score DESC);

-- Comment
COMMENT ON TABLE taste_meal_scores IS 'Aggregated taste scores per user per meal. Updated on explicit actions, NOT on undo.';
