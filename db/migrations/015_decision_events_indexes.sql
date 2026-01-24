-- Migration 015: Add performance indexes to decision_events
-- These indexes support common query patterns
--
-- NOTE: household_key index moved to migration 028 (after column is added in 017)

-- Index for user-based queries sorted by time
-- Used by: user-specific event history, profile-level aggregations
CREATE INDEX IF NOT EXISTS idx_decision_events_user_actioned
ON decision_events (user_profile_id, actioned_at DESC);

-- Index for user_action filtering (useful for counting approvals/rejections)
-- Note: This index may already exist from 003, but IF NOT EXISTS makes it safe
CREATE INDEX IF NOT EXISTS idx_decision_events_user_action
ON decision_events (user_action);

COMMENT ON INDEX idx_decision_events_user_actioned IS 'Supports user-based queries sorted by time';
COMMENT ON INDEX idx_decision_events_user_action IS 'Supports filtering by user_action type';
