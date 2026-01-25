-- Migration 018: Expand decision_events to canonical schema
-- Forward-only migration - DO NOT edit old migrations
--
-- This ensures decision_events has all columns the codebase expects,
-- with proper NOT NULL constraints and defaults.

-- =============================================================================
-- STEP 1: Ensure all canonical columns exist
-- (Most should already exist from 003, but this is defensive)
-- =============================================================================

-- user_action should exist but ensure it does
ALTER TABLE decision_events ADD COLUMN IF NOT EXISTS user_action TEXT;

-- actioned_at should exist
ALTER TABLE decision_events ADD COLUMN IF NOT EXISTS actioned_at TIMESTAMPTZ;

-- decided_at should exist
ALTER TABLE decision_events ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

-- decision_type should exist
ALTER TABLE decision_events ADD COLUMN IF NOT EXISTS decision_type TEXT;

-- notes should exist
ALTER TABLE decision_events ADD COLUMN IF NOT EXISTS notes TEXT;

-- decision_payload should exist
ALTER TABLE decision_events ADD COLUMN IF NOT EXISTS decision_payload JSONB;

-- context_hash should exist
ALTER TABLE decision_events ADD COLUMN IF NOT EXISTS context_hash TEXT;

-- =============================================================================
-- STEP 2: Backfill any NULL values with sensible defaults
-- =============================================================================

-- user_action: default to 'approved' for legacy rows without action
UPDATE decision_events 
SET user_action = 'approved' 
WHERE user_action IS NULL;

-- actioned_at: use decided_at or created_at as fallback
UPDATE decision_events 
SET actioned_at = COALESCE(decided_at, created_at, NOW()) 
WHERE actioned_at IS NULL;

-- decided_at: use actioned_at or created_at as fallback
UPDATE decision_events 
SET decided_at = COALESCE(actioned_at, created_at, NOW()) 
WHERE decided_at IS NULL;

-- decision_type: default to 'meal_decision' for legacy rows
UPDATE decision_events 
SET decision_type = 'meal_decision' 
WHERE decision_type IS NULL OR decision_type = '';

-- decision_payload: default to empty object
UPDATE decision_events 
SET decision_payload = '{}'::jsonb 
WHERE decision_payload IS NULL;

-- =============================================================================
-- STEP 3: Enforce NOT NULL on critical columns
-- =============================================================================

ALTER TABLE decision_events ALTER COLUMN user_action SET NOT NULL;
ALTER TABLE decision_events ALTER COLUMN actioned_at SET NOT NULL;
ALTER TABLE decision_events ALTER COLUMN decided_at SET NOT NULL;
ALTER TABLE decision_events ALTER COLUMN decision_type SET NOT NULL;
ALTER TABLE decision_events ALTER COLUMN decision_payload SET NOT NULL;

-- Set default for decision_payload
ALTER TABLE decision_events ALTER COLUMN decision_payload SET DEFAULT '{}'::jsonb;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON COLUMN decision_events.user_action IS 'Values: approved, rejected, drm_triggered. NEVER "modified".';
COMMENT ON COLUMN decision_events.actioned_at IS 'When user took action on this decision';
COMMENT ON COLUMN decision_events.decided_at IS 'When system made the decision';
COMMENT ON COLUMN decision_events.decision_type IS 'Type of decision (meal_decision, drm, etc.)';
COMMENT ON COLUMN decision_events.notes IS 'Markers: "autopilot" for auto-approved, "undo_autopilot" for undone';
