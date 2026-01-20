-- ============================================================================
-- FAST FOOD: Decision OS Schema
-- Migration: 001_create_decision_os_schema (UP)
-- 
-- INVARIANTS ENFORCED:
-- - No browsing surfaces (no category/tag tables exposed to UI)
-- - Append-only for decision_events and drm_events
-- - Inventory confidence is probabilistic, never blocks decisions
-- - DRM tags are internal-only; the client never receives a DRM-specific meal list or tag set
-- ============================================================================

-- Create schema
CREATE SCHEMA IF NOT EXISTS decision_os;

-- ============================================================================
-- MEALS
-- Core meal definitions. Read-only in v1 (seeded).
-- tags_internal is for arbiter use only, never exposed to UI.
-- ============================================================================
CREATE TABLE decision_os.meals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    canonical_key       TEXT NOT NULL UNIQUE,  -- e.g., 'quick-chicken-tacos'
    instructions_short  TEXT NOT NULL,         -- 2-3 sentence cooking summary
    est_minutes         INTEGER NOT NULL CHECK (est_minutes > 0),
    est_cost_band       TEXT NOT NULL CHECK (est_cost_band IN ('$', '$$', '$$$')),
    tags_internal       JSONB DEFAULT '[]'::jsonb,  -- NEVER exposed to UI
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_meals_canonical_key ON decision_os.meals(canonical_key);
CREATE INDEX idx_meals_active ON decision_os.meals(is_active) WHERE is_active = true;

COMMENT ON TABLE decision_os.meals IS 'Core meal definitions. Seeded data, read-only in v1.';
COMMENT ON COLUMN decision_os.meals.tags_internal IS 'Internal arbiter tags. NEVER expose to UI.';
COMMENT ON COLUMN decision_os.meals.canonical_key IS 'URL-safe unique identifier for meal.';

-- ============================================================================
-- MEAL INGREDIENTS
-- Ingredients per meal. Denormalized for v1 simplicity.
-- ============================================================================
CREATE TABLE decision_os.meal_ingredients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_id             UUID NOT NULL REFERENCES decision_os.meals(id) ON DELETE CASCADE,
    ingredient_name     TEXT NOT NULL,
    qty_text            TEXT,                  -- "1 lb", "2 cups", nullable
    is_pantry_staple    BOOLEAN DEFAULT false, -- salt, oil, basic spices
    created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_meal_ingredients_meal ON decision_os.meal_ingredients(meal_id);
CREATE INDEX idx_meal_ingredients_name ON decision_os.meal_ingredients(ingredient_name);

COMMENT ON TABLE decision_os.meal_ingredients IS 'Ingredients per meal. Used for inventory matching.';
COMMENT ON COLUMN decision_os.meal_ingredients.is_pantry_staple IS 'If true, assumed available (salt, oil, etc.)';

-- ============================================================================
-- INVENTORY ITEMS
-- Probabilistic inventory. Confidence score 0..1.
-- MUST NEVER block decisions - low confidence just affects scoring.
-- ============================================================================
CREATE TABLE decision_os.inventory_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_key       TEXT NOT NULL DEFAULT 'default',
    item_name           TEXT NOT NULL,
    qty_estimated       NUMERIC(10,2),         -- nullable, estimated quantity
    unit                TEXT,                  -- nullable, e.g., 'lb', 'count', 'oz'
    confidence          NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    source              TEXT NOT NULL CHECK (source IN ('receipt', 'manual', 'cv')),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,           -- nullable, for perishables
    created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    UNIQUE (household_key, item_name)
);

CREATE INDEX idx_inventory_household ON decision_os.inventory_items(household_key);
CREATE INDEX idx_inventory_confidence ON decision_os.inventory_items(confidence DESC);
CREATE INDEX idx_inventory_expires ON decision_os.inventory_items(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE decision_os.inventory_items IS 'Probabilistic inventory. Confidence never blocks decisions.';
COMMENT ON COLUMN decision_os.inventory_items.confidence IS '0.0-1.0 probability item is available. Low confidence affects scoring, never blocks.';
COMMENT ON COLUMN decision_os.inventory_items.source IS 'receipt=OCR scan, manual=user input, cv=computer vision';

-- ============================================================================
-- DECISION EVENTS
-- APPEND-ONLY event log. Single source of truth for all decision learning.
-- No UPDATE or DELETE allowed.
-- user_action defaults to 'pending' until user acts or timeout expires.
-- ============================================================================
CREATE TABLE decision_os.decision_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_key       TEXT NOT NULL DEFAULT 'default',
    decided_at          TIMESTAMPTZ NOT NULL,
    decision_type       TEXT NOT NULL CHECK (decision_type IN ('cook', 'order', 'zero_cook')),
    meal_id             UUID REFERENCES decision_os.meals(id),  -- nullable for order/zero_cook
    external_vendor_key TEXT,                  -- nullable, for order type
    context_hash        TEXT NOT NULL,         -- hash of context at decision time
    decision_payload    JSONB NOT NULL,        -- full decision details
    user_action         TEXT NOT NULL DEFAULT 'pending' CHECK (user_action IN ('pending', 'approved', 'rejected', 'drm_triggered', 'expired')),
    actioned_at         TIMESTAMPTZ,           -- when user acted, nullable if pending/expired
    notes               TEXT,                  -- nullable, internal notes
    created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_decision_events_household ON decision_os.decision_events(household_key, decided_at DESC);
CREATE INDEX idx_decision_events_meal ON decision_os.decision_events(meal_id) WHERE meal_id IS NOT NULL;
CREATE INDEX idx_decision_events_action ON decision_os.decision_events(user_action);
CREATE INDEX idx_decision_events_type ON decision_os.decision_events(decision_type);
CREATE INDEX idx_decision_events_pending ON decision_os.decision_events(household_key) WHERE user_action = 'pending';

COMMENT ON TABLE decision_os.decision_events IS 'APPEND-ONLY decision log. No updates or deletes.';
COMMENT ON COLUMN decision_os.decision_events.context_hash IS 'Hash of context (time, day, inventory state) for debugging.';
COMMENT ON COLUMN decision_os.decision_events.decision_payload IS 'Full decision details including confidence, ingredients matched.';
COMMENT ON COLUMN decision_os.decision_events.user_action IS 'pending=awaiting action, approved/rejected=user acted, drm_triggered=user triggered DRM, expired=timeout';

-- ============================================================================
-- DRM EVENTS
-- APPEND-ONLY log of Dinner Rescue Mode triggers and resolutions.
-- No UPDATE or DELETE allowed.
-- ============================================================================
CREATE TABLE decision_os.drm_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_key       TEXT NOT NULL DEFAULT 'default',
    triggered_at        TIMESTAMPTZ NOT NULL,
    trigger_type        TEXT NOT NULL CHECK (trigger_type IN ('explicit', 'implicit')),
    trigger_reason      TEXT NOT NULL,         -- e.g., 'user_initiated', 'consecutive_rejections', 'late_hour'
    rescue_type         TEXT CHECK (rescue_type IN ('order', 'zero_cook')),  -- nullable until resolved
    rescue_payload      JSONB,                 -- nullable until resolved
    exhausted           BOOLEAN DEFAULT false,
    created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_drm_events_household ON decision_os.drm_events(household_key, triggered_at DESC);
CREATE INDEX idx_drm_events_exhausted ON decision_os.drm_events(exhausted) WHERE exhausted = true;

COMMENT ON TABLE decision_os.drm_events IS 'APPEND-ONLY DRM event log. No updates or deletes.';
COMMENT ON COLUMN decision_os.drm_events.trigger_type IS 'explicit=user pressed DRM, implicit=system triggered';
COMMENT ON COLUMN decision_os.drm_events.exhausted IS 'true if all rescue options were rejected';

-- ============================================================================
-- APPEND-ONLY TRIGGERS
-- Enforce immutability on decision_events and drm_events.
-- ============================================================================

-- Trigger function to prevent updates
CREATE OR REPLACE FUNCTION decision_os.prevent_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'UPDATE not allowed on append-only table %', TG_TABLE_NAME
        USING HINT = 'This table is append-only. Insert new records instead.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to prevent deletes
CREATE OR REPLACE FUNCTION decision_os.prevent_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'DELETE not allowed on append-only table %', TG_TABLE_NAME
        USING HINT = 'This table is append-only. Records cannot be deleted.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to decision_events
CREATE TRIGGER decision_events_no_update
    BEFORE UPDATE ON decision_os.decision_events
    FOR EACH ROW
    EXECUTE FUNCTION decision_os.prevent_update();

CREATE TRIGGER decision_events_no_delete
    BEFORE DELETE ON decision_os.decision_events
    FOR EACH ROW
    EXECUTE FUNCTION decision_os.prevent_delete();

-- Apply triggers to drm_events
CREATE TRIGGER drm_events_no_update
    BEFORE UPDATE ON decision_os.drm_events
    FOR EACH ROW
    EXECUTE FUNCTION decision_os.prevent_update();

CREATE TRIGGER drm_events_no_delete
    BEFORE DELETE ON decision_os.drm_events
    FOR EACH ROW
    EXECUTE FUNCTION decision_os.prevent_delete();

-- ============================================================================
-- NOTE: household_constraints REMOVED from Phase 1
-- Allergies are handled via one-time local-only prompt (client storage).
-- No DB persistence for allergies in Phase 1.
-- ============================================================================

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
    -- Verify all tables exist (5 tables: meals, meal_ingredients, inventory_items, decision_events, drm_events)
    ASSERT (SELECT COUNT(*) FROM information_schema.tables 
            WHERE table_schema = 'decision_os') = 5,
           'Expected exactly 5 tables in decision_os schema';
    
    -- Verify append-only triggers exist
    ASSERT (SELECT COUNT(*) FROM information_schema.triggers 
            WHERE trigger_schema = 'decision_os' 
            AND trigger_name LIKE '%_no_update') = 2,
           'Expected 2 no_update triggers';
    
    ASSERT (SELECT COUNT(*) FROM information_schema.triggers 
            WHERE trigger_schema = 'decision_os' 
            AND trigger_name LIKE '%_no_delete') = 2,
           'Expected 2 no_delete triggers';
    
    -- Verify user_action default is 'pending'
    ASSERT (SELECT column_default FROM information_schema.columns
            WHERE table_schema = 'decision_os' 
            AND table_name = 'decision_events'
            AND column_name = 'user_action') = '''pending''::text',
           'Expected user_action default to be pending';
    
    -- Verify last_seen_at has default
    ASSERT (SELECT column_default FROM information_schema.columns
            WHERE table_schema = 'decision_os' 
            AND table_name = 'inventory_items'
            AND column_name = 'last_seen_at') IS NOT NULL,
           'Expected last_seen_at to have a default';
    
    RAISE NOTICE 'Migration 001 verification passed';
END $$;
