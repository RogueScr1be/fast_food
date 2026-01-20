# Fast Food: Decision OS Database

## Overview

This directory contains migrations and seeds for the `/decision-os` bounded context.

**Schema**: `decision_os`

**Tables** (Phase 1):
- `meals` - Core meal definitions (read-only in v1)
- `meal_ingredients` - Ingredients per meal
- `inventory_items` - Probabilistic inventory with confidence scores
- `decision_events` - Append-only decision log
- `drm_events` - Append-only DRM event log

**Note**: Allergies/constraints are handled via client-side local storage in Phase 1 (no DB persistence).

## Invariants Enforced

1. **Append-only events**: `decision_events` and `drm_events` have triggers that prevent UPDATE and DELETE
2. **Confidence range**: `inventory_items.confidence` must be between 0 and 1 (`CHECK (confidence >= 0 AND confidence <= 1)`)
3. **No browsing data**: No category/tag tables exposed to UI; `tags_internal` is arbiter-only
4. **DRM tags are internal-only**: The client never receives a DRM-specific meal list or tag set
5. **Decision defaults to pending**: `user_action` defaults to 'pending' until user acts or timeout

## Prerequisites

- PostgreSQL 14+ (for `gen_random_uuid()`)
- psql or compatible client
- Database created (e.g., `fastfood_dev`)

## Running Migrations

### Development (Local)

```bash
# Set database URL
export DATABASE_URL="postgresql://user:password@localhost:5432/fastfood_dev"

# Run UP migration
psql $DATABASE_URL -f db/migrations/001_create_decision_os_schema.up.sql

# Run DOWN migration (rollback)
psql $DATABASE_URL -f db/migrations/001_create_decision_os_schema.down.sql
```

### Using Docker Compose

```bash
# Start Postgres
docker compose up -d postgres

# Run migrations
docker compose exec postgres psql -U fastfood -d fastfood_dev \
  -f /app/db/migrations/001_create_decision_os_schema.up.sql
```

### Using a Migration Tool (e.g., golang-migrate)

```bash
# Install migrate
brew install golang-migrate

# Create migrate-compatible files
# Rename: 001_create_decision_os_schema.up.sql → 000001_create_decision_os_schema.up.sql

# Run migrations
migrate -database $DATABASE_URL -path db/migrations up
```

## Running Seeds

Seeds should be run **after** migrations.

```bash
# Run seed file
psql $DATABASE_URL -f db/seeds/001_meals.sql
```

**Note**: Seeds are idempotent - running them multiple times will TRUNCATE and re-insert.

## Verification

After running migrations and seeds:

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM decision_os.meals;"
# Expected: 50

psql $DATABASE_URL -c "SELECT COUNT(*) FROM decision_os.meal_ingredients;"
# Expected: 250+

psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'decision_os';"
# Expected: 4 (2 for decision_events, 2 for drm_events)

psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'decision_os';"
# Expected: 5
```

## Testing Append-Only Triggers

```sql
-- Insert a test decision (user_action defaults to 'pending')
INSERT INTO decision_os.decision_events 
  (household_key, decided_at, decision_type, context_hash, decision_payload)
VALUES ('default', NOW(), 'cook', 'test', '{}');

-- This should fail with: "UPDATE not allowed on append-only table decision_events"
UPDATE decision_os.decision_events SET user_action = 'rejected' WHERE household_key = 'default';
-- ERROR:  UPDATE not allowed on append-only table decision_events

DELETE FROM decision_os.decision_events WHERE household_key = 'default';
-- ERROR:  DELETE not allowed on append-only table decision_events
```

## Testing Defaults

```sql
-- Verify user_action defaults to 'pending'
INSERT INTO decision_os.decision_events 
  (household_key, decided_at, decision_type, context_hash, decision_payload)
VALUES ('test', NOW(), 'cook', 'hash123', '{"test": true}');

SELECT user_action FROM decision_os.decision_events WHERE household_key = 'test';
-- Expected: 'pending'

-- Verify last_seen_at defaults to NOW()
INSERT INTO decision_os.inventory_items 
  (household_key, item_name, confidence, source)
VALUES ('test', 'chicken', 0.8, 'receipt');

SELECT last_seen_at IS NOT NULL FROM decision_os.inventory_items WHERE item_name = 'chicken';
-- Expected: true
```

## Schema Diagram

```
┌─────────────────────┐       ┌─────────────────────┐
│       meals         │       │  meal_ingredients   │
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │◄──────│ meal_id (FK)        │
│ name                │       │ id (PK)             │
│ canonical_key (UK)  │       │ ingredient_name     │
│ instructions_short  │       │ qty_text            │
│ est_minutes         │       │ is_pantry_staple    │
│ est_cost_band       │       │ created_at          │
│ tags_internal       │       └─────────────────────┘
│ is_active           │
│ created_at          │
└─────────────────────┘

┌─────────────────────┐
│  inventory_items    │
├─────────────────────┤
│ id (PK)             │
│ household_key       │
│ item_name           │
│ qty_estimated       │
│ unit                │
│ confidence (0..1)   │  ← CHECK (confidence >= 0 AND confidence <= 1)
│ source              │
│ last_seen_at        │  ← DEFAULT NOW()
│ expires_at          │
│ created_at          │
└─────────────────────┘

┌─────────────────────────┐   ┌─────────────────────┐
│    decision_events      │   │     drm_events      │
│    (APPEND-ONLY)        │   │    (APPEND-ONLY)    │
├─────────────────────────┤   ├─────────────────────┤
│ id (PK)                 │   │ id (PK)             │
│ household_key           │   │ household_key       │
│ decided_at              │   │ triggered_at        │
│ decision_type           │   │ trigger_type        │
│ meal_id (FK, nullable)  │   │ trigger_reason      │
│ external_vendor_key     │   │ rescue_type         │
│ context_hash            │   │ rescue_payload      │
│ decision_payload        │   │ exhausted           │
│ user_action             │   │ created_at          │
│   ↳ DEFAULT 'pending'   │   └─────────────────────┘
│ actioned_at             │
│ notes                   │
│ created_at              │
└─────────────────────────┘

NOTE: household_constraints table REMOVED from Phase 1.
      Allergies handled via client-side local storage.
```

## user_action Allowed Values

| Value | Description |
|-------|-------------|
| `pending` | Decision presented, awaiting user action (DEFAULT) |
| `approved` | User approved the decision |
| `rejected` | User rejected the decision |
| `drm_triggered` | User triggered DRM instead of acting |
| `expired` | Decision timed out without user action |

## Rollback Strategy

If you need to rollback:

```bash
# Run DOWN migration (WARNING: destroys all data)
psql $DATABASE_URL -f db/migrations/001_create_decision_os_schema.down.sql
```

For partial rollback, manually drop specific tables:

```sql
-- Drop only events tables
DROP TABLE IF EXISTS decision_os.drm_events;
DROP TABLE IF EXISTS decision_os.decision_events;
```

## Production Considerations

1. **Backups**: Take backup before running migrations
2. **RLS**: For multi-tenant, enable Row Level Security on all tables
3. **Connection pooling**: Use PgBouncer for connection management
4. **Indexes**: Additional indexes may be needed based on query patterns
