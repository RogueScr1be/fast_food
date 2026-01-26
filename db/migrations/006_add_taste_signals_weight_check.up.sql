-- ============================================================================
-- FAST FOOD: Add Weight CHECK Constraint to taste_signals
-- Migration: 006_add_taste_signals_weight_check (UP)
-- 
-- Purpose: Enforce weight range constraint (-2.0 to 2.0) on taste_signals
-- 
-- Weight values:
--   approved:       +1.0
--   rejected:       -1.0
--   drm_triggered:  -0.5
--   expired:        -0.2
-- 
-- Range (-2.0 to 2.0) provides buffer for future weight adjustments.
-- ============================================================================

-- Add CHECK constraint for weight range
ALTER TABLE decision_os.taste_signals 
    ADD CONSTRAINT taste_signals_weight_range 
    CHECK (weight >= -2.0 AND weight <= 2.0);

-- Update comment to reflect correct weights
COMMENT ON COLUMN decision_os.taste_signals.weight IS 
    'Signal weight: approved +1.0, rejected -1.0, drm_triggered -0.5, expired -0.2. Range: -2.0 to 2.0.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
    -- Verify CHECK constraint exists
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = 'decision_os'
        AND constraint_name = 'taste_signals_weight_range'
    )), 'Weight CHECK constraint not created';
    
    RAISE NOTICE 'Migration 006 verification passed: weight CHECK constraint added';
END $$;
