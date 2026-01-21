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
STAGING_AUTH_TOKEN=<optional-jwt-for-smoke-tests>
```

### How to Enable Supabase Auth

1. **Enable Auth in Supabase Dashboard**:
   - Go to Authentication → Providers
   - Enable Email provider (for testing)
   - Optionally enable social providers (Google, Apple, etc.)

2. **Get Auth Config**:
   - Copy your Supabase URL and anon key from Project Settings → API
   
3. **For Client Testing** (dev only):
   - Set `EXPO_PUBLIC_SUPABASE_ACCESS_TOKEN` in your `.env.local`
   - This token will be attached to all Decision OS API requests

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
| 008 | Add `auth_user_id` column to `user_profiles` |
| 009 | Create `households` table |
| 010 | Create `household_members` join table |

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

### `user_profiles`

User profiles for Decision OS users.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | Auto-incrementing user ID |
| `external_id` | TEXT | Legacy external identifier |
| `auth_user_id` | TEXT UNIQUE | Supabase Auth user ID (sub claim) |
| `created_at` | TIMESTAMP | Profile creation time |
| `updated_at` | TIMESTAMP | Last update time |

### `households`

Household groups for multi-user support.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Household UUID |
| `household_key` | TEXT UNIQUE | Household key (partition key) |
| `name` | TEXT | Household name (optional) |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last update time |

### `household_members`

Join table linking users to households.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Membership UUID |
| `household_id` | UUID FK | Foreign key to households |
| `user_profile_id` | INTEGER FK | Foreign key to user_profiles |
| `role` | TEXT | `owner` or `member` |
| `created_at` | TIMESTAMP | Membership creation time |

**Constraint**: Each user can only belong to one household (MVP).

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

## Authentication

Decision OS uses **Supabase Auth** for authentication.

### Production Mode (NODE_ENV=production)

- All Decision OS endpoints require a valid JWT in `Authorization: Bearer <token>`
- Missing or invalid tokens return `401 { error: 'unauthorized' }`
- `userProfileId` is derived from the JWT's `sub` claim, NOT from client input

### Dev Mode (NODE_ENV !== production)

- Requests without auth fall back to the default household (`household_key='default'`)
- Valid tokens are still processed if provided
- This allows local development without auth setup

### Auth Flow

1. Client sends request with `Authorization: Bearer <jwt>` header
2. Server decodes JWT, extracts `sub` (user ID)
3. Server upserts `user_profile` with `auth_user_id = sub`
4. Server creates household + membership if user is new
5. Server derives `household_key` from user's household
6. Endpoint uses derived `household_key` for all queries

### Protected Endpoints

- `POST /api/decision-os/decision`
- `POST /api/decision-os/feedback`
- `POST /api/decision-os/drm`
- `POST /api/decision-os/receipt/import`

### Error Response (401)

```json
{ "error": "unauthorized" }
```

This is a minimal error response - does NOT match success contracts (intentional).

## Invariants

- Decision events are append-only (no UPDATE/DELETE)
- API responses never contain arrays at root level
- `modified` action is banned (never used)
- Receipt import always returns `{ receiptImportId, status }`
- Decision response may include optional `autopilot: boolean`
- Error responses use `{ error: string }` format
