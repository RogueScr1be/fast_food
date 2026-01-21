-- Migration 014: Add CHECK constraints to decision_events
-- These constraints enforce data integrity at the database level

-- user_action must be one of the allowed values
-- Note: Using DO block to check if constraint exists before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'decision_events_user_action_check'
  ) THEN
    ALTER TABLE decision_events
    ADD CONSTRAINT decision_events_user_action_check
    CHECK (user_action IN ('approved', 'rejected', 'drm_triggered'));
  END IF;
END $$;

-- household_key must not be empty
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'decision_events_household_key_check'
  ) THEN
    ALTER TABLE decision_events
    ADD CONSTRAINT decision_events_household_key_check
    CHECK (household_key <> '');
  END IF;
END $$;

-- decision_type must not be empty
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'decision_events_decision_type_check'
  ) THEN
    ALTER TABLE decision_events
    ADD CONSTRAINT decision_events_decision_type_check
    CHECK (decision_type <> '');
  END IF;
END $$;

-- actioned_at and decided_at must not be null
-- (These should already be enforced by NOT NULL constraints, but adding CHECK for extra safety)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'decision_events_timestamps_check'
  ) THEN
    ALTER TABLE decision_events
    ADD CONSTRAINT decision_events_timestamps_check
    CHECK (actioned_at IS NOT NULL AND decided_at IS NOT NULL);
  END IF;
END $$;

COMMENT ON CONSTRAINT decision_events_user_action_check ON decision_events IS 'user_action must be approved, rejected, or drm_triggered';
COMMENT ON CONSTRAINT decision_events_household_key_check ON decision_events IS 'household_key must not be empty';
COMMENT ON CONSTRAINT decision_events_decision_type_check ON decision_events IS 'decision_type must not be empty';
COMMENT ON CONSTRAINT decision_events_timestamps_check ON decision_events IS 'actioned_at and decided_at must be set';
