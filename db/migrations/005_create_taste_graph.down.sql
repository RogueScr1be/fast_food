-- ============================================================================
-- FAST FOOD: Taste Graph v1 Schema
-- Migration: 005_create_taste_graph (DOWN)
-- ============================================================================

-- Drop indexes first
DROP INDEX IF EXISTS decision_os.idx_taste_meal_scores_household_score;
DROP INDEX IF EXISTS decision_os.idx_taste_signals_decision_event;
DROP INDEX IF EXISTS decision_os.idx_taste_signals_household_meal_created;
DROP INDEX IF EXISTS decision_os.idx_taste_signals_household_created;

-- Drop triggers
DROP TRIGGER IF EXISTS taste_signals_no_delete ON decision_os.taste_signals;
DROP TRIGGER IF EXISTS taste_signals_no_update ON decision_os.taste_signals;

-- Drop trigger functions
DROP FUNCTION IF EXISTS decision_os.taste_signals_prevent_delete();
DROP FUNCTION IF EXISTS decision_os.taste_signals_prevent_update();

-- Drop tables (taste_meal_scores first due to no dependencies, then taste_signals)
DROP TABLE IF EXISTS decision_os.taste_meal_scores;
DROP TABLE IF EXISTS decision_os.taste_signals;
