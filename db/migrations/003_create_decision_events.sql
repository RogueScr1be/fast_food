-- Migration 003: Create decision_events table (APPEND-ONLY)
-- Part of Decision OS schema
--
-- IMPORTANT: This table is APPEND-ONLY. NEVER UPDATE or DELETE rows.
-- All state changes are represented as new rows with appropriate markers.

CREATE TABLE IF NOT EXISTS decision_events (
  id TEXT PRIMARY KEY,
  user_profile_id INTEGER NOT NULL REFERENCES user_profiles(id),
  decided_at TIMESTAMPTZ NOT NULL,
  actioned_at TIMESTAMPTZ,
  user_action TEXT CHECK (user_action IN ('approved', 'rejected', 'drm_triggered')),
  notes TEXT,
  decision_payload JSONB NOT NULL DEFAULT '{}',
  decision_type TEXT,
  meal_id INTEGER REFERENCES meals(id),
  context_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_decision_events_user_profile_id ON decision_events(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_decision_events_decided_at ON decision_events(decided_at);
CREATE INDEX IF NOT EXISTS idx_decision_events_context_hash ON decision_events(context_hash);
CREATE INDEX IF NOT EXISTS idx_decision_events_user_action ON decision_events(user_action);
CREATE INDEX IF NOT EXISTS idx_decision_events_notes ON decision_events(notes);

-- Comment
COMMENT ON TABLE decision_events IS 'Append-only event log for all decisions. NEVER UPDATE or DELETE rows.';
COMMENT ON COLUMN decision_events.user_action IS 'Values: approved, rejected, drm_triggered. NEVER "modified".';
COMMENT ON COLUMN decision_events.notes IS 'Markers: "autopilot" for auto-approved, "undo_autopilot" for undone decisions.';
