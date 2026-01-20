-- ============================================================================
-- FAST FOOD: Remove Weight CHECK Constraint from taste_signals
-- Migration: 006_add_taste_signals_weight_check (DOWN)
-- ============================================================================

-- Remove CHECK constraint for weight range
ALTER TABLE decision_os.taste_signals 
    DROP CONSTRAINT IF EXISTS taste_signals_weight_range;

-- Restore original comment (without range specification)
COMMENT ON COLUMN decision_os.taste_signals.weight IS 
    'Signal weight: positive for approvals, negative for rejections.';
