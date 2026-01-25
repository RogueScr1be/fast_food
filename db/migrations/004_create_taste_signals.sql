-- Migration 004: Create taste_signals table
-- Part of Decision OS schema

CREATE TABLE IF NOT EXISTS taste_signals (
  id TEXT PRIMARY KEY,
  user_profile_id INTEGER NOT NULL REFERENCES user_profiles(id),
  meal_id INTEGER NOT NULL REFERENCES meals(id),
  weight REAL NOT NULL CHECK (weight >= -1.0 AND weight <= 1.0),
  decision_event_id TEXT REFERENCES decision_events(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for taste graph queries
CREATE INDEX IF NOT EXISTS idx_taste_signals_user_profile_id ON taste_signals(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_taste_signals_meal_id ON taste_signals(meal_id);
CREATE INDEX IF NOT EXISTS idx_taste_signals_created_at ON taste_signals(created_at);

-- Comment
COMMENT ON TABLE taste_signals IS 'Individual taste signals from user decisions. Used to compute taste preferences.';
COMMENT ON COLUMN taste_signals.weight IS 'Signal weight: +1.0 approved, -1.0 rejected, -0.5 drm/undo, -0.2 expired';
