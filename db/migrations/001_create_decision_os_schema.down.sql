-- ============================================================================
-- FAST FOOD: Decision OS Schema
-- Migration: 001_create_decision_os_schema (DOWN)
-- 
-- WARNING: This will delete ALL data in the decision_os schema.
-- Use with caution in production.
-- ============================================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS drm_events_no_delete ON decision_os.drm_events;
DROP TRIGGER IF EXISTS drm_events_no_update ON decision_os.drm_events;
DROP TRIGGER IF EXISTS decision_events_no_delete ON decision_os.decision_events;
DROP TRIGGER IF EXISTS decision_events_no_update ON decision_os.decision_events;

-- Drop trigger functions
DROP FUNCTION IF EXISTS decision_os.prevent_delete();
DROP FUNCTION IF EXISTS decision_os.prevent_update();

-- Drop tables in dependency order
DROP TABLE IF EXISTS decision_os.drm_events;
DROP TABLE IF EXISTS decision_os.decision_events;
DROP TABLE IF EXISTS decision_os.inventory_items;
DROP TABLE IF EXISTS decision_os.meal_ingredients;
DROP TABLE IF EXISTS decision_os.meals;
DROP TABLE IF EXISTS decision_os.household_constraints;

-- Drop schema
DROP SCHEMA IF EXISTS decision_os;

-- Verification
DO $$
BEGIN
    ASSERT (SELECT COUNT(*) FROM information_schema.schemata 
            WHERE schema_name = 'decision_os') = 0,
           'Schema decision_os should be dropped';
    
    RAISE NOTICE 'Migration 001 rollback completed';
END $$;
