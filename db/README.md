# Database Setup Guide

This document describes the database schema, migrations, and setup steps for the Decision OS system.

## Production Setup Steps

### 1. Create Schema

```sql
CREATE SCHEMA IF NOT EXISTS decision_os;
```

### 2. Run Migrations

Migrations are numbered sequentially and must be run in order.

| Migration | Description |
|-----------|-------------|
| 001 | Create `user_profiles` table |
| 002 | Create `meals` table |
| 003 | Create `decision_events` table (append-only event log) |
| 004 | Create `taste_signals` table |
| 005 | Create `taste_meal_scores` table |
| 006 | Create `receipt_imports` + `inventory_items` tables |

Run migrations using your preferred migration tool (e.g., `psql`, `flyway`, `dbmate`).

### 3. Seed Meals

Ensure the `meals` table is populated with your meal catalog before using Decision OS.

```sql
INSERT INTO meals (id, name, category, prep_time_minutes) VALUES
  (1, 'Chicken Pasta', 'dinner', 30),
  (2, 'Grilled Salmon', 'dinner', 25),
  -- ... more meals
;
```

### 4. Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `OCR_PROVIDER` | No | OCR provider: `google_vision` or `none` |
| `OCR_API_KEY` | If OCR_PROVIDER=google_vision | Google Cloud Vision API key |
| `OCR_ENDPOINT` | No | Custom OCR endpoint (defaults to Google) |

## Schema Overview

### `decision_events` (Append-Only Event Log)

The core event table. **NEVER UPDATE or DELETE rows** - this is an append-only log.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Unique event ID |
| `user_profile_id` | INTEGER FK | User who made the decision |
| `decided_at` | TIMESTAMP | When decision was presented |
| `actioned_at` | TIMESTAMP | When user/autopilot acted |
| `user_action` | TEXT | `approved`, `rejected`, `drm_triggered` |
| `notes` | TEXT | Markers: `autopilot`, `undo_autopilot` |
| `decision_payload` | JSONB | Decision context (meal, recipe, etc.) |
| `decision_type` | TEXT | Type of decision |
| `meal_id` | INTEGER FK | Associated meal |
| `context_hash` | TEXT | Hash for idempotency checks |

### Decision Event Markers

The `notes` column contains semantic markers:

| Marker | Meaning |
|--------|---------|
| `autopilot` | Event was auto-approved by autopilot |
| `undo_autopilot` | User undid an autopilot decision |
| (empty/null) | Normal user action |

### `taste_signals`

Signals from user actions that influence taste preferences.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Signal ID |
| `user_profile_id` | INTEGER FK | User |
| `meal_id` | INTEGER FK | Meal |
| `weight` | REAL | Signal weight (-1.0 to +1.0) |
| `created_at` | TIMESTAMP | Signal timestamp |

### `taste_meal_scores`

Aggregated taste scores per user per meal.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Score ID |
| `user_profile_id` | INTEGER FK | User |
| `meal_id` | INTEGER FK | Meal |
| `score` | REAL | Current score |
| `approvals` | INTEGER | Approval count |
| `rejections` | INTEGER | Rejection count |

### `receipt_imports`

Receipt import records.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Import ID |
| `user_profile_id` | INTEGER FK | User |
| `created_at` | TIMESTAMP | Import timestamp |
| `status` | TEXT | `received`, `parsed`, `failed` |
| `raw_ocr_text` | TEXT | Raw OCR output (max 50k chars) |
| `image_hash` | TEXT | Hash for deduplication |

### `inventory_items`

User's food inventory.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Item ID |
| `user_profile_id` | INTEGER FK | User |
| `name` | TEXT | Item name |
| `quantity` | INTEGER | Quantity |
| `confidence` | REAL | OCR confidence (0.0-1.0) |
| `source` | TEXT | `receipt` or `manual` |
| `receipt_import_id` | TEXT FK | Source receipt (if applicable) |

## Undo Semantics

When a user undoes an autopilot decision:

1. A **NEW** row is inserted with:
   - `user_action = 'rejected'`
   - `notes = 'undo_autopilot'`
   
2. A `taste_signal` is created with weight `-0.5` (autonomy penalty)

3. `taste_meal_scores` is **NOT** updated (undo is not a taste rejection)

4. Autopilot is throttled for 72 hours after any undo

## Invariants

- Decision events are append-only (no UPDATE/DELETE)
- API responses never contain arrays at root level
- `modified` action is banned (never used)
- Receipt import always returns `{ receiptImportId, status }`
- Decision response may include optional `autopilot: boolean`
