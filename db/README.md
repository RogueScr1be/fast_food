# Database Setup Guide

This document describes the database schema, migrations, and setup steps for the Decision OS system.

## Staging Database: Supabase (Recommended)

Decision OS uses **Supabase Postgres** for staging and production.

### Why Supabase?

- Free tier sufficient for staging
- Managed Postgres with automatic backups
- Built-in connection pooling
- No infrastructure management required

### How to Provision the Staging DB

1. **Create Supabase Account**: Go to [supabase.com](https://supabase.com) and sign up
2. **Create New Project**: 
   - Choose a project name (e.g., `decision-os-staging`)
   - Set a strong database password (save it!)
   - Select a region close to your deployment target
3. **Get Connection String**:
   - Go to Project Settings → Database
   - Copy the "Connection string" (URI format)
   - It looks like: `postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres`

### How to Set Environment Variables

Create a `.env.staging` file (never commit to git):

```bash
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres
NODE_ENV=production
OCR_PROVIDER=none
STAGING_URL=https://your-app.vercel.app
```

### How to Run Migrations

```bash
# Set DATABASE_URL first
export DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"

# Run migrations
npm run db:migrate:staging
```

### How to Verify Tables Exist

After running migrations, verify in Supabase:

1. Go to Database → Tables in Supabase dashboard
2. You should see these tables:
   - `user_profiles`
   - `meals`
   - `decision_events`
   - `taste_signals`
   - `taste_meal_scores`
   - `receipt_imports`
   - `inventory_items`

Or run this SQL in Supabase SQL Editor:

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

## Alternative: Neon Postgres

If you prefer Neon over Supabase:

1. Create account at [neon.tech](https://neon.tech)
2. Create a project
3. Copy the connection string
4. Use the same migration process

## Production Setup Steps

### 1. Create Schema (Optional)

Supabase uses the default `public` schema. No need to create a separate schema:

```sql
-- Not needed for Supabase, but available if you want isolation:
-- CREATE SCHEMA IF NOT EXISTS decision_os;
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
| 007 | Seed initial data (test user + meals) |

**Run all migrations:**

```bash
npm run db:migrate:staging
```

This runs `db/migrate.ts` which executes all SQL files in `db/migrations/` in order.

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

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Staging/Prod | - | PostgreSQL connection string |
| `NODE_ENV` | No | `development` | Environment: `test`, `development`, `production` |
| `OCR_PROVIDER` | No | `none` | OCR provider: `google_vision` or `none` |
| `OCR_API_KEY` | If google_vision | - | Google Cloud Vision API key |
| `OCR_ENDPOINT` | No | Google default | Custom OCR endpoint |
| `STAGING_URL` | For smoke tests | - | Base URL for staging smoke tests |

### 5. Verify Deployment

Run the staging smoke test:

```bash
STAGING_URL=https://your-app.vercel.app npm run smoke:staging
```

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
