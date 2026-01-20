# Fast Food: Decision OS Database

## Overview

This directory contains migrations and seeds for the `/decision-os` bounded context.

**Schema**: `decision_os`

**Tables**:
- `meals` - Core meal definitions (read-only in v1)
- `meal_ingredients` - Ingredients per meal
- `inventory_items` - Probabilistic inventory with confidence scores
- `decision_events` - Append-only decision log
- `drm_events` - Append-only DRM event log
- `household_constraints` - Safety-critical allergy constraints
- `receipt_imports` - Receipt OCR ingestion events (Phase 2)
- `receipt_line_items` - Parsed line items from receipts (Phase 2)

## Invariants Enforced

1. **Append-only events**: `decision_events` and `drm_events` have triggers that prevent UPDATE and DELETE
2. **Confidence range**: `inventory_items.confidence` must be between 0 and 1
3. **No browsing data**: No category/tag tables exposed to UI; `tags_internal` is arbiter-only

## Prerequisites

- PostgreSQL 14+ (for `gen_random_uuid()`)
- psql or compatible client
- Database created (e.g., `fastfood_dev`)

## Running Migrations

### Development (Local)

```bash
# Set database URL
export DATABASE_URL="postgresql://user:password@localhost:5432/fastfood_dev"

# Run ALL migrations (in order)
psql $DATABASE_URL -f db/migrations/001_create_decision_os_schema.up.sql
psql $DATABASE_URL -f db/migrations/002_create_receipt_ingestion_tables.up.sql

# Run SINGLE migration
psql $DATABASE_URL -f db/migrations/001_create_decision_os_schema.up.sql

# Run DOWN migrations (rollback - reverse order)
psql $DATABASE_URL -f db/migrations/002_create_receipt_ingestion_tables.down.sql
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

# Verify receipt ingestion tables (after migration 002)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'decision_os' AND table_name LIKE 'receipt%';"
# Expected: 2 (receipt_imports, receipt_line_items)
```

## Testing Append-Only Triggers

```sql
-- This should fail with: "UPDATE not allowed on append-only table decision_events"
INSERT INTO decision_os.decision_events 
  (household_key, decided_at, decision_type, context_hash, decision_payload, user_action)
VALUES ('default', NOW(), 'cook', 'test', '{}', 'approved');

UPDATE decision_os.decision_events SET user_action = 'rejected' WHERE household_key = 'default';
-- ERROR:  UPDATE not allowed on append-only table decision_events

DELETE FROM decision_os.decision_events WHERE household_key = 'default';
-- ERROR:  DELETE not allowed on append-only table decision_events
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

┌─────────────────────┐       ┌─────────────────────┐
│  inventory_items    │       │ household_constraints│
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │       │ id (PK)             │
│ household_key       │       │ household_key (UK)  │
│ item_name           │       │ has_gluten_allergy  │
│ qty_estimated       │       │ has_dairy_allergy   │
│ unit                │       │ has_nut_allergy     │
│ confidence (0..1)   │       │ has_shellfish_allergy│
│ source              │       │ has_egg_allergy     │
│ last_seen_at        │       │ is_vegetarian       │
│ expires_at          │       │ is_vegan            │
│ created_at          │       │ created_at          │
└─────────────────────┘       │ updated_at          │
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
│ actioned_at             │   └─────────────────────┘
│ notes                   │
│ created_at              │
└─────────────────────────┘

┌─────────────────────────┐   ┌─────────────────────────┐
│    receipt_imports      │   │   receipt_line_items    │
│    (Phase 2)            │   │       (Phase 2)         │
├─────────────────────────┤   ├─────────────────────────┤
│ id (PK)                 │◄──│ receipt_import_id (FK)  │
│ household_key           │   │ id (PK)                 │
│ source                  │   │ raw_line                │
│ vendor_name             │   │ raw_item_name           │
│ purchased_at            │   │ raw_qty_text            │
│ ocr_provider            │   │ raw_price               │
│ ocr_raw_text            │   │ normalized_item_name    │
│ status                  │   │ normalized_unit         │
│ error_message           │   │ normalized_qty_estimated│
│ created_at              │   │ confidence (0..1)       │
└─────────────────────────┘   │ created_at              │
                              └─────────────────────────┘
```

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

## Receipt Ingestion (Phase 2)

Migration 002 adds support for receipt OCR ingestion into inventory.

### Invariants

1. **Advisory only**: Receipt data updates `inventory_items.confidence` but NEVER blocks decisions
2. **Idempotent-safe**: Same receipt can be re-imported without duplicating inventory
3. **Auditable**: Raw OCR text stored in `ocr_raw_text` for debugging/reprocessing

### Pipeline Flow

```
1. Image/Email/Text → receipt_imports (status='received')
2. OCR processing → receipt_imports.ocr_raw_text updated
3. Line parsing → receipt_line_items created (status='parsed')
4. Normalization → normalized_* fields populated
5. Inventory update → inventory_items updated with confidence boost
```

### Running Migration 002

```bash
# Apply receipt ingestion tables
psql $DATABASE_URL -f db/migrations/002_create_receipt_ingestion_tables.up.sql

# Verify
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_schema='decision_os' AND table_name LIKE 'receipt%';"
# Expected: receipt_imports, receipt_line_items

# Rollback (if needed)
psql $DATABASE_URL -f db/migrations/002_create_receipt_ingestion_tables.down.sql
```

## Production Considerations

1. **Backups**: Take backup before running migrations
2. **RLS**: For multi-tenant, enable Row Level Security on all tables
3. **Connection pooling**: Use PgBouncer for connection management
4. **Indexes**: Additional indexes may be needed based on query patterns
5. **Receipt OCR storage**: `ocr_raw_text` can be large; consider archiving old imports
