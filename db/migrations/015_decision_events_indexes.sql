-- Migration 015: Add performance indexes to decision_events
-- These indexes support common query patterns

-- Index for household-based queries sorted by time (most common query pattern)
-- Used by: autopilot eligibility checks, DRM recommendation, recent event lookups
CREATE INDEX IF NOT EXISTS idx_decision_events_household_actioned
ON decision_events (household_key, actioned_at DESC);

-- Index for user-based queries sorted by time
-- Used by: user-specific event history, profile-level aggregations
CREATE INDEX IF NOT EXISTS idx_decision_events_user_actioned
ON decision_events (user_profile_id, actioned_at DESC);

-- Index for user_action filtering (useful for counting approvals/rejections)
CREATE INDEX IF NOT EXISTS idx_decision_events_user_action
ON decision_events (user_action);

COMMENT ON INDEX idx_decision_events_household_actioned IS 'Supports household-based queries sorted by time';
COMMENT ON INDEX idx_decision_events_user_actioned IS 'Supports user-based queries sorted by time';
COMMENT ON INDEX idx_decision_events_user_action IS 'Supports filtering by user_action type';
