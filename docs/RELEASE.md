# Build and Release Guide

This document describes how to build and release the Fast Food Zero-UI app using EAS (Expo Application Services).

## CI/CD Staging Pipeline

The project uses GitHub Actions for continuous integration and deployment to staging.

### Pipeline Overview

| Job | Trigger | Description |
|-----|---------|-------------|
| `test` | All PRs and pushes | Runs `npm test` and `npm run smoke:mvp` |
| `db_migration_test` | All PRs and pushes | Ephemeral Postgres: runs migrations + schema verify + write smoke |
| `deploy_freeze_gate` | Push to main | Checks if deploys are frozen (emergency brake) |
| `migrate_staging` | Push to main | Runs database migrations on staging |
| `schema_gate` | Push to main | Verifies DB schema matches required structure |
| `deploy_staging` | Push to main | Deploys to Vercel staging |
| `healthz_gate` | Push to main | Verifies `/api/healthz` returns 200 |
| `metrics_gate` | Push to main | Verifies runtime_metrics_daily table is healthy |
| `alerts_gate` | Push to main | Checks durable metrics for alert thresholds |
| `auth_required_gate` | Push to main | Verifies endpoints return 401 WITHOUT token |
| `auth_works_gate` | Push to main | Verifies endpoints return 200 WITH token |
| `runtime_flags_gate` | Push to main | Proves DB runtime flags change live behavior |
| `readonly_gate` | Push to main | Proves readonly mode prevents DB writes |
| `smoke_staging` | Push to main | Runs full staging smoke tests |
| `record_last_green` | Push to main | Records deployment to runtime_deployments_log |
| `provenance_gate` | Push to main | Verifies recorded deployment matches actual |
| `metrics_prune` | Weekly (Sunday 03:00 UTC) | Deletes old metrics to prevent unbounded growth |

### Pipeline Gates

The pipeline has multiple gates that must pass in sequence:

#### 0. Deploy Freeze Gate

**Emergency brake for all deployments.**

This is the first gate after tests pass. If `STAGING_DEPLOY_ENABLED` secret is set to anything other than `"true"`, all deployments will halt.

**To freeze deploys:**
1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Set `STAGING_DEPLOY_ENABLED` to `"false"`
3. All subsequent pushes to main will fail at the deploy freeze gate

**To unfreeze deploys:**
1. Set `STAGING_DEPLOY_ENABLED` back to `"true"` (or delete the secret)
2. Deploys will resume on the next push to main

**Note:** If the secret is not set, deploys are enabled by default.

#### 0a. DB Migration Test (CI Truth Gate)

**Runs on all PRs and pushes** - catches migration/schema drift before it reaches staging.

This gate spins up an **ephemeral Postgres 15** service container and:

1. **Runs migrations** (`npm run db:migrate`) against a fresh database
2. **Verifies schema** - tables, columns, types, NOT NULL constraints, CHECK constraints
3. **Tests DB writes** - inserts and reads back a user_profile, household, and decision_event

**Why this matters:**
- Migrations may apply correctly to staging (existing data) but fail on a fresh DB
- Schema verification catches column/type mismatches before deploy
- Write test catches constraint violations that unit tests might miss

**If this gate fails:**
- Check the migration files for syntax errors
- Verify REQUIRED_TABLES, REQUIRED_COLUMNS, REQUIRED_COLUMN_TYPES match actual migrations
- Run migrations locally against a fresh Postgres to reproduce

**Local testing:**
```bash
# Start local Postgres (e.g., via Docker)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=test postgres:15

# Set DATABASE_URL and run migrations
DATABASE_URL=postgresql://postgres:test@localhost:5432/postgres npm run db:migrate
npm run db:verify:staging
```

#### 1. Schema Gate (Pre-Deploy)

After migrations, verifies the staging DB schema matches required structure:
- Required tables exist (user_profiles, decision_events, runtime_flags, etc.)
- Required columns exist per table
- Column types are correct (runtime_flags.enabled is boolean, etc.)
- NOT NULL constraints are in place

```bash
npm run db:verify:staging
# Expected output:
# PASS db_connected
# PASS tables_verified (12 tables)
# PASS columns_verified (11 tables checked)
# PASS column_types_verified (5 columns)
# PASS not_null_verified (3 columns)
# === SCHEMA VERIFICATION PASSED ===
```

This gate runs BEFORE deployment to catch schema drift early.

#### 2. Healthz Gate

After deployment, the pipeline calls `GET /api/healthz` and fails if:
- Response is not 200
- This checks: DATABASE_URL exists, SUPABASE_JWT_SECRET exists, Postgres is reachable

#### 3. Metrics Health Gate

Verifies the `runtime_metrics_daily` table exists and is queryable:

```bash
npm run metrics:health
# Expected output:
# PASS db_connected
# PASS table_exists
# PASS query_succeeded (N metrics for today)
```

This ensures metrics persistence is working before checking alert thresholds.

#### 4. Alerts Gate

Reads today's metrics from `runtime_metrics_daily` and fails if alert thresholds are exceeded:

| Metric | Threshold | Meaning |
|--------|-----------|---------|
| `healthz_ok_false` | > 0 | Healthz returned false at least once today |
| `metrics_db_failed` | >= 1 | Metrics DB write failed |
| `ocr_provider_failed` | >= 5 | OCR provider failed multiple times |

```bash
npm run metrics:alerts
# Expected output:
# PASS healthz_ok_false (count=0, threshold=0)
# PASS metrics_db_failed (count=0, threshold=1)
# PASS ocr_provider_failed (count=2, threshold=5)
```

This catches infrastructure issues before they escalate.

#### 5. Auth Required Gate (401)

Verifies protected endpoints correctly REJECT unauthenticated requests:
- Calls all Decision OS endpoints WITHOUT auth token
- All must return 401 `{ error: 'unauthorized' }`
- Prevents silent auth bypass bugs

```bash
npm run auth:sanity:require401
# Expected output:
# PASS healthz
# PASS decision_401
# PASS receipt_401
# PASS feedback_401
# PASS drm_401
```

#### 6. Auth Works Gate (200)

Verifies protected endpoints correctly ACCEPT authenticated requests:
- **Preflight**: Decodes JWT and fails if token expires within 5 minutes
- Calls all Decision OS endpoints WITH auth token
- All must return 200 with canonical shapes
- Prevents "green now, red later" token expiration issues

```bash
npm run auth:sanity:require200
# Expected output:
# PASS token_preflight
# PASS healthz
# PASS decision_200
# PASS receipt_200
# PASS feedback_200
# PASS drm_200
```

#### 7. Runtime Flags Gate

Proves that DB-backed runtime flags actually change live behavior:

1. Sets `decision_drm_enabled = false` in staging DB
2. Calls DRM endpoint → expects `{ drmActivated: false }` (forced by flag)
3. Sets `decision_drm_enabled = true` in staging DB
4. Calls DRM endpoint → expects canonical response (not forced false)
5. Restores flag to `true` (cleanup)

```bash
npm run flags:proof
# Expected output:
# PASS env_vars_present
# PASS db_connected
# PASS set_flag_false
# PASS drm_returns_false_when_disabled
# PASS set_flag_true
# PASS drm_returns_canonical_when_enabled
# PASS flag_restored
# === RUNTIME FLAG PROOF PASSED ===
```

This gate proves that ops can flip flags from Supabase UI to immediately disable features without redeploying.

#### 8. Readonly Gate

Proves that readonly mode (emergency freeze) prevents all DB writes:

1. Counts rows in `decision_events`, `taste_signals`, `inventory_items`, `receipt_imports`
2. Sets `decision_os_readonly = true` in staging DB
3. Calls all Decision OS endpoints (decision, feedback, drm, receipt)
4. Verifies canonical responses returned (200 OK)
5. Verifies row counts UNCHANGED (no DB writes occurred)
6. Restores `readonly = false` (cleanup)

```bash
npm run readonly:proof
# Expected output:
# PASS env_vars_present
# PASS db_connected
# PASS initial_counts_captured
# PASS set_readonly_true
# PASS decision_returns_200
# PASS receipt_returns_200
# PASS feedback_returns_200
# PASS drm_returns_200
# PASS decision_events_unchanged
# PASS taste_signals_unchanged
# PASS inventory_items_unchanged
# PASS receipt_imports_unchanged
# PASS readonly_restored
# === READONLY PROOF PASSED ===
```

#### 9. Smoke Staging

Full integration test of all Decision OS flows with authenticated requests.

### Weekly Metrics Prune

A scheduled job runs weekly (Sunday at 03:00 UTC) to delete old metrics:

```bash
METRICS_RETENTION_DAYS=90 npm run metrics:prune
# Expected output:
# === Metrics Prune ===
# Retention: 90 days
# PASS db_connected
# PASS pruned X rows older than YYYY-MM-DD
# PASS total_rows: Y (was Z)
# === METRICS PRUNE COMPLETED ===
```

**Configuration**:
- `METRICS_RETENTION_DAYS`: Number of days to retain (default: 90 for staging, 365 for production)
- Runs automatically via GitHub Actions schedule
- Prevents unbounded growth of `runtime_metrics_daily` table

---

## Required GitHub Secrets (Canonical List)

| Secret | Required | Description |
|--------|----------|-------------|
| `DATABASE_URL_STAGING` | Yes | Postgres connection string (Supabase) |
| `VERCEL_TOKEN` | Yes | Vercel deployment token |
| `VERCEL_ORG_ID` | Yes | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Yes | Vercel project ID |
| `STAGING_URL` | Yes | Deployed staging URL (e.g., `https://your-app.vercel.app`) |
| `STAGING_AUTH_TOKEN` | Yes | Supabase JWT for authenticated tests |

### How to Set Up Secrets

1. **DATABASE_URL_STAGING**: 
   - Supabase dashboard → Project Settings → Database → Connection string
   - Format: `postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres`

2. **Vercel Secrets**:
   ```bash
   # Get Vercel token from https://vercel.com/account/tokens
   # Get org/project IDs from .vercel/project.json after running:
   vercel link
   ```

3. **STAGING_URL**: Your Vercel deployment URL (e.g., `https://fast-food-staging.vercel.app`)

4. **STAGING_AUTH_TOKEN**: Supabase JWT for a test user (see below)

### How to Rotate STAGING_AUTH_TOKEN

1. Log into Supabase dashboard
2. Go to Authentication → Users
3. Find or create a staging test user (e.g., `staging-test@example.com`)
4. Generate a new access token:
   ```javascript
   // Via Supabase client
   const { data } = await supabase.auth.signInWithPassword({
     email: 'staging-test@example.com',
     password: 'your-password'
   });
   console.log(data.session.access_token);
   ```
5. Update GitHub secret: Settings → Secrets → Actions → `STAGING_AUTH_TOKEN`

**Note**: Tokens expire. If auth_sanity fails with unexpected responses, rotate the token.

---

## Required Vercel Environment Variables

Set these in Vercel project settings (Settings → Environment Variables):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres connection string |
| `NODE_ENV` | Yes | `production` |
| `SUPABASE_JWT_SECRET` | Yes | JWT secret for auth verification |
| `OCR_PROVIDER` | No | `none` or `google_vision` |
| `OCR_API_KEY` | If OCR enabled | Google Vision API key |

### Decision OS Kill Switches (Feature Flags)

Hard kill switches with fail-closed behavior. All default to `"false"` in production when not set.

| Variable | Default (prod) | Default (dev) | Description |
|----------|----------------|---------------|-------------|
| `DECISION_OS_ENABLED` | `false` | `true` | Master kill switch - disables all Decision OS endpoints |
| `DECISION_AUTOPILOT_ENABLED` | `false` | `true` | Autopilot feature - automatic meal approvals |
| `DECISION_OCR_ENABLED` | `false` | `false` | OCR feature - receipt scanning (always defaults false) |
| `DECISION_DRM_ENABLED` | `false` | `true` | DRM feature - Dinner Rescue Mode |

**Values**: Use string `"true"` or `"false"`. Case-insensitive.

**Behavior when disabled**:

| Flag | Disabled Behavior |
|------|-------------------|
| `DECISION_OS_ENABLED=false` | All Decision OS endpoints return `401 { error: 'unauthorized' }` |
| `DECISION_AUTOPILOT_ENABLED=false` | Autopilot evaluation skipped; no autopilot copies inserted |
| `DECISION_OCR_ENABLED=false` | Receipt import returns `{ receiptImportId, status: 'failed' }` (200 OK) |
| `DECISION_DRM_ENABLED=false` | DRM endpoint returns `{ drmActivated: false }` (200 OK) |

**Production recommendations**:

```bash
# Minimum viable production (fail-closed):
DECISION_OS_ENABLED=true
DECISION_AUTOPILOT_ENABLED=true
DECISION_DRM_ENABLED=true
# OCR_ENABLED only if OCR_API_KEY is configured
DECISION_OCR_ENABLED=false

# Emergency shutdown (all features off):
DECISION_OS_ENABLED=false
```

**Cascade behavior**: Feature flags (`autopilot`, `ocr`, `drm`) are only effective when `DECISION_OS_ENABLED=true`. If master is disabled, all features are disabled regardless of their individual settings.

### Runtime Flags (DB-backed Kill Switches)

In addition to ENV flags, Decision OS supports DB-backed runtime flags that can be flipped instantly from Supabase UI without redeploying.

**How it works**:
1. Set `RUNTIME_FLAGS_ENABLED=true` in Vercel env vars
2. DB flags are AND'd with ENV flags (both must be `true` for feature to be enabled)
3. Flags are cached for 30 seconds per process
4. If DB read fails in production, all features are disabled (fail-closed)

**How to flip runtime flags from Supabase UI**:

1. Open Supabase dashboard → Table Editor → `runtime_flags`
2. Find the flag you want to change (e.g., `decision_drm_enabled`)
3. Toggle the `enabled` column to `true` or `false`
4. Click Save
5. Changes take effect within 30 seconds (cache TTL)

| Flag Key | Controls |
|----------|----------|
| `decision_os_enabled` | Master switch (all endpoints) |
| `decision_autopilot_enabled` | Autopilot feature |
| `decision_ocr_enabled` | OCR/receipt scanning |
| `decision_drm_enabled` | Dinner Rescue Mode |
| `decision_os_readonly` | Emergency freeze (read-only mode) |

**Note**: ENV flags take precedence. If ENV says `false`, DB cannot override to `true`.

### Emergency Freeze (Read-only Mode)

When `decision_os_readonly=true` in the `runtime_flags` table:

- All Decision OS endpoints continue to return canonical responses
- **No database writes** occur (decision_events, taste_signals, inventory_items, receipt_imports unchanged)
- Useful for emergency situations where you need to stop all writes instantly
- Can be toggled from Supabase UI without redeploying

**Behavior when readonly**:

| Endpoint | Returns | DB Write |
|----------|---------|----------|
| `/api/decision-os/decision` | Normal decision response | **Skipped** |
| `/api/decision-os/feedback` | `{ recorded: true }` | **Skipped** |
| `/api/decision-os/drm` | `{ drmActivated: true }` | **Skipped** |
| `/api/decision-os/receipt/import` | `{ receiptImportId, status: 'received' }` | **Skipped** |

**Important**: Readonly mode requires `decision_os_enabled=true` (AND logic). It doesn't bypass auth.

**DB-Layer Enforcement (Hard Backstop)**:

Readonly mode is enforced at two levels:
1. **API Layer**: Endpoints check `flags.readonlyMode` and skip DB writes
2. **DB Client Layer**: The database adapter blocks all write operations (INSERT/UPDATE/DELETE) and throws `Error('readonly_mode')`

This double-layer protection ensures writes cannot accidentally occur even if API-layer checks are bypassed:

```typescript
// DB adapter blocks writes when readonly
if (this._readonlyMode && isWriteStatement(sql)) {
  throw new Error('readonly_mode');
}
```

Endpoints catch this error gracefully and return canonical responses (no crashes, no shape drift).

### Internal Metrics Endpoint (Dev/Staging Only)

View runtime metrics at:
```
GET /api/decision-os/_internal/metrics
```

**Security**:
- Production: Always returns 401 (blocked completely)
- Dev/Staging: Requires auth if `SUPABASE_JWT_SECRET` is set

**Response**:
```json
{
  "ok": true,
  "counters": {
    "decision_called": 42,
    "receipt_called": 10,
    "healthz_hit": 100
  }
}
```

**Available metrics**:
| Metric | Description |
|--------|-------------|
| `healthz_hit` | Health check endpoint calls |
| `decision_called` | Decision endpoint calls |
| `decision_unauthorized` | Unauthorized decision attempts |
| `receipt_called` | Receipt import calls |
| `feedback_called` | Feedback endpoint calls |
| `drm_called` | DRM endpoint calls |
| `autopilot_inserted` | Autopilot approvals created |
| `undo_received` | Undo actions received |
| `ocr_provider_failed` | OCR failures |

**Privacy**: Metrics are counters only - no user IDs, tokens, meal names, or sensitive data.

### Durable Metrics (DB-backed)

In production (or when `METRICS_DB_ENABLED=true`), metrics are also persisted to the `runtime_metrics_daily` table.

**Table structure**:
```sql
runtime_metrics_daily (
  day DATE,        -- UTC date
  metric_key TEXT, -- Metric name (e.g., 'decision_called')
  count BIGINT,    -- Cumulative count for this day
  PRIMARY KEY (day, metric_key)
)
```

**Behavior**:
- Each `record()` call increments both in-memory counter and DB row
- DB writes are fire-and-forget (non-blocking)
- DB failures increment `metrics_db_failed` counter (fail-safe)
- No sensitive data stored (privacy-safe)

**Querying metrics** (from Supabase SQL editor):
```sql
-- Today's metrics
SELECT * FROM runtime_metrics_daily WHERE day = CURRENT_DATE;

-- Last 7 days
SELECT * FROM runtime_metrics_daily 
WHERE day >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY day DESC, metric_key;
```

### How to Get SUPABASE_JWT_SECRET

1. Supabase dashboard → Project Settings → API
2. Copy "JWT Secret" (under "JWT Settings")
3. Add to Vercel env vars

---

## Prerequisites

### 1. Install EAS CLI

```bash
npm install -g eas-cli
```

### 2. Login to EAS

```bash
eas login
```

You'll need an Expo account. Create one at [expo.dev](https://expo.dev) if you don't have one.

### 3. Apple Developer Account (for iOS)

- Apple Developer Program membership ($99/year)
- App Store Connect access
- Certificates and provisioning profiles (EAS handles this automatically)

### 4. Configure Project

First-time setup:

```bash
eas build:configure
```

This links your project to EAS.

---

## Build Profiles

| Profile | Purpose | Distribution | Auth Token |
|---------|---------|--------------|------------|
| `development` | Local dev with Expo Dev Client | Internal (simulator) | None |
| `preview` | Internal QA testing | Internal (device) | Optional staging token |
| `production` | TestFlight / App Store | Store | **NEVER** |

### Environment Variables by Profile

| Variable | development | preview | production |
|----------|-------------|---------|------------|
| `EXPO_PUBLIC_DECISION_OS_BASE_URL` | localhost:8081 | Vercel staging | Vercel staging |
| `EXPO_PUBLIC_APP_VARIANT` | development | preview | production |
| `EXPO_PUBLIC_STAGING_AUTH_TOKEN` | - | Set in EAS secrets | **NEVER SET** |

---

## Required Secrets Setup

### EAS Secrets (for preview builds)

Set secrets in EAS dashboard or via CLI:

```bash
# Decision OS staging URL
eas secret:create --scope project --name EXPO_PUBLIC_DECISION_OS_BASE_URL --value "https://your-app.vercel.app"

# Staging auth token (PREVIEW ONLY - never for production)
eas secret:create --scope project --name EXPO_PUBLIC_STAGING_AUTH_TOKEN --value "eyJ..."
```

**WARNING**: Never set `EXPO_PUBLIC_STAGING_AUTH_TOKEN` for production builds.

### Apple Credentials (for TestFlight)

EAS needs these environment variables or will prompt interactively:

| Variable | Description | Where to find |
|----------|-------------|---------------|
| `APPLE_ID` | Your Apple ID email | Your Apple Developer account |
| `ASC_APP_ID` | App Store Connect App ID | App Store Connect → App → General → App Information |
| `APPLE_TEAM_ID` | Apple Developer Team ID | Apple Developer → Membership → Team ID |

Set in EAS:

```bash
eas secret:create --scope project --name APPLE_ID --value "your@email.com"
eas secret:create --scope project --name ASC_APP_ID --value "1234567890"
eas secret:create --scope project --name APPLE_TEAM_ID --value "ABCD1234"
```

Or in your environment:

```bash
export APPLE_ID="your@email.com"
export ASC_APP_ID="1234567890"
export APPLE_TEAM_ID="ABCD1234"
```

---

## Build Commands

### Development Build (Simulator)

```bash
npm run eas:build:dev
# or
eas build --profile development --platform ios
```

### Preview Build (Internal Testing)

```bash
npm run eas:build:preview
# or
eas build --profile preview --platform ios
```

After build completes:
1. Download the `.ipa` from EAS dashboard
2. Install via TestFlight (internal) or direct install (Ad Hoc)

### Production Build (TestFlight)

```bash
npm run eas:build:prod
# or
eas build --profile production --platform ios
```

### Submit to TestFlight

After production build completes:

```bash
npm run eas:submit:prod
# or
eas submit --platform ios --latest
```

### Build + Submit in One Command

```bash
npm run release:testflight
# or
eas build --profile production --platform ios --auto-submit
```

---

## Release Checklist

### Before Building

- [ ] Run tests: `npm test`
- [ ] Run smoke tests: `npm run smoke:mvp`
- [ ] Verify staging API: `npm run smoke:staging`
- [ ] Check version in `app.json` (bump if needed)
- [ ] Commit all changes
- [ ] Ensure EAS secrets are configured

### Build Verification

- [ ] Build completes successfully in EAS dashboard
- [ ] Download and install on test device
- [ ] Test critical flows:
  - [ ] App launches without crash
  - [ ] Decision OS endpoints respond (or return 401 gracefully)
  - [ ] Receipt import works (or fails gracefully with OCR disabled)

### TestFlight Submission

- [ ] Submit build to TestFlight
- [ ] Wait for Apple processing (10-30 minutes)
- [ ] Verify build appears in TestFlight
- [ ] Add test notes for testers
- [ ] Invite testers

---

## Versioning Strategy

### Version Number (`version` in app.json)

Semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes, major feature releases
- **MINOR**: New features, significant improvements
- **PATCH**: Bug fixes, small improvements

### Build Number (`ios.buildNumber`)

- Auto-incremented by EAS with `"autoIncrement": true` in production profile
- Alternatively, increment manually before each TestFlight submission

### Updating Version

1. Update `version` in `app.json`:
   ```json
   {
     "expo": {
       "version": "1.1.0"
     }
   }
   ```

2. Commit the change:
   ```bash
   git add app.json
   git commit -m "chore: bump version to 1.1.0"
   ```

3. Build will auto-increment `buildNumber`

---

## Troubleshooting

### Build Fails

1. Check EAS build logs in dashboard
2. Verify all secrets are set correctly
3. Ensure Apple credentials are valid
4. Run `eas build:inspect` for detailed info

### Submission Fails

1. Verify Apple credentials (APPLE_ID, ASC_APP_ID, APPLE_TEAM_ID)
2. Check App Store Connect for app status
3. Ensure bundle identifier matches (`com.fastfood.zeroui`)
4. Verify no pending compliance questionnaires in ASC

### App Crashes on Launch

1. Check for missing environment variables
2. Verify API base URL is accessible
3. Test with Expo Go first
4. Check Sentry/Crashlytics for crash reports

### 401 Errors in Production

This is **expected** until login UI is implemented:
- Production builds have no baked-in auth token
- App should handle 401 gracefully (not crash)
- Decision OS endpoints will return `{ error: 'unauthorized' }`

---

## Staging Smoke Verification

Before releasing, verify staging:

```bash
# Set staging URL
export STAGING_URL="https://your-app.vercel.app"

# Optional: Set auth token for full test coverage
export STAGING_AUTH_TOKEN="eyJ..."

# Run smoke tests
npm run smoke:staging
```

Expected output:
```
=== Staging Smoke Tests (Canonical Contract Validation) ===
Target: https://your-app.vercel.app
Auth: Token provided (production mode)

[1/5] Receipt Import: PASS
[2/5] Decision: PASS
[3/5] Feedback: PASS
[4/5] DRM Recommendation: PASS
[5/5] DRM Endpoint: PASS

✓ STAGING SMOKE PASSED
```

---

## Quick Reference

```bash
# Login
eas login

# Build for preview (internal testing)
npm run eas:build:preview

# Build for production (TestFlight)
npm run eas:build:prod

# Submit latest build to TestFlight
npm run eas:submit:prod

# Build AND submit to TestFlight
npm run release:testflight

# Check build status
eas build:list

# View secrets
eas secret:list

# Add a secret
eas secret:create --scope project --name VAR_NAME --value "value"
```

---

## Security Notes

1. **Never commit secrets** to git
2. **Never set `EXPO_PUBLIC_STAGING_AUTH_TOKEN` for production** - it would bake a real auth token into the app bundle
3. **Use EAS secrets** for all sensitive values
4. **Review secrets periodically** and rotate if needed
5. **Production app requires login** - users will see 401 until they authenticate (login UI is a future feature)

---

## Emergency Procedures

### Emergency: Freeze Deploys

**When to use:** Infrastructure issues, security incidents, or when you need to halt all deployments immediately.

**To freeze all staging deployments:**

1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Add or update secret: `STAGING_DEPLOY_ENABLED` = `false`
3. All subsequent pushes to `main` will fail at the `deploy_freeze_gate` job
4. Error message: "Deploys frozen by STAGING_DEPLOY_ENABLED"

**To unfreeze:**

1. Set `STAGING_DEPLOY_ENABLED` = `true` (or delete the secret)
2. Deploys resume on the next push to `main`

**Notes:**
- Tests still run even when deploys are frozen
- PRs are unaffected (they only run tests, not deploy)
- If the secret is not set, deploys are **enabled** by default
- This is a CI/CD level freeze, separate from runtime readonly mode

### Emergency: Readonly Mode (Runtime)

To prevent all DB writes at runtime (without freezing deploys):

1. Go to Supabase → SQL Editor
2. Run: `UPDATE runtime_flags SET enabled = true WHERE key = 'decision_os_readonly'`
3. All Decision OS endpoints will return canonical responses but skip DB writes
4. To restore: `UPDATE runtime_flags SET enabled = false WHERE key = 'decision_os_readonly'`

### Alert Thresholds

The `alerts_gate` job in CI checks these thresholds daily:

| Metric | Threshold | Action When Exceeded |
|--------|-----------|---------------------|
| `healthz_ok_false` | > 0 | Investigate healthz failures |
| `metrics_db_failed` | >= 1 | Check Supabase connectivity |
| `ocr_provider_failed` | >= 5 | Check OCR provider status |

If any threshold is exceeded, the pipeline fails and you should investigate before proceeding.

### Emergency: Rollback Staging

**When to use:** Bad deployment caused issues but deploy freeze wasn't set in time.

**Automated rollback (recommended):**

1. Go to GitHub repo → Actions → "Rollback Staging" workflow
2. Click "Run workflow"
3. Type `rollback` in the confirmation field
4. Click "Run workflow"

The workflow will:
- Query `runtime_deployments_log` for the previous green deployment
- Re-alias `STAGING_URL` to that deployment
- Verify healthz returns 200

**Manual rollback (if needed):**

```bash
# Set required env vars
export DATABASE_URL_STAGING="postgres://..."
export VERCEL_TOKEN="..."
export STAGING_URL="https://your-app.vercel.app"

# Execute rollback
npm run staging:rollback
```

**Query deployment history:**

```sql
SELECT env, deployment_url, git_sha, run_id, recorded_at
FROM runtime_deployments_log
WHERE env = 'staging'
ORDER BY recorded_at DESC
LIMIT 5;
```

### Deployment Provenance

Every successful staging pipeline run records to `runtime_deployments_log`:
- `env`: Environment name (staging)
- `deployment_url`: Vercel deployment URL
- `git_sha`: Git commit SHA
- `run_id`: GitHub Actions run ID
- `recorded_at`: Timestamp

The `provenance_gate` job verifies that the recorded deployment URL matches the actual deployment.

---

## SQL Style Contract v1 (Tenant-Safe Dialect)

All SQL executed through `lib/decision-os/db/client.ts` adapters MUST follow this contract.

### The $1 Rule

**`$1` is ALWAYS `household_key` for tenant-scoped queries.**

Other parameters start at `$2`. This is non-negotiable.

```sql
-- Reads: $1 = household_key, $2+ = other params
SELECT * FROM decision_events de WHERE de.household_key = $1 AND de.id = $2

-- Updates: $1 = household_key, $2+ = values/conditions
UPDATE receipt_imports SET status = $2 WHERE household_key = $1 AND id = $3
```

### Tenant Tables

These tables require `household_key` predicate in ALL queries:

- `decision_events`
- `receipt_imports`
- `inventory_items`
- `taste_signals`
- `taste_meal_scores`

### Required Patterns

#### SELECT (Single Table)
```sql
SELECT * FROM decision_events de WHERE de.household_key = $1
```

#### SELECT (JOIN) - BOTH tables need predicates
```sql
SELECT * FROM decision_events de 
JOIN receipt_imports ri ON ri.id = de.receipt_id
WHERE de.household_key = $1 AND ri.household_key = $1
```

#### INSERT with UPSERT
```sql
INSERT INTO inventory_items (household_key, item_name, ...)
VALUES ($1, $2, ...)
ON CONFLICT (household_key, item_name) DO UPDATE SET ...
```

#### UPDATE
```sql
UPDATE receipt_imports SET status = $2 
WHERE household_key = $1 AND id = $3
```

### Banned Patterns (CI Fails)

| Pattern | Why Banned |
|---------|------------|
| `WHERE household_key = $1` (unqualified in multi-table) | Ambiguous in JOINs |
| `$1 = de.household_key` (reversed) | Non-standard, hard to parse |
| `WHERE de.household_key = $2` (wrong param) | $1 MUST be household_key |
| `WHERE de.household_key = 'literal'` | No literals for tenant key |
| `WHERE de.household_key IN ($1, $2)` | Multi-tenant leak risk |
| `WHERE de.household_key = $1 OR ...` | Tenant in OR = leak |
| `ON CONFLICT (id)` on tenant table | Cross-tenant overwrite |
| `ON CONFLICT ON CONSTRAINT ...` | Banned entirely (use columns) |
| `UPDATE ... WHERE id = $1` (no household_key) | Cross-tenant mutation |
| `DELETE FROM tenant_table` | Banned entirely |
| SQL with `;` (multi-statement) | Injection risk |
| DDL (`ALTER`, `CREATE`, `DROP`) | Not allowed at runtime |

### Schema/Quote Handling

The contract detects tenant tables even when schema-qualified or quoted:

```sql
-- All detected as 'receipt_imports':
FROM receipt_imports ri
FROM public.receipt_imports ri
FROM "receipt_imports" ri
FROM "public"."receipt_imports" ri
UPDATE public.receipt_imports SET ...
INSERT INTO "inventory_items" ...
```

### False Positive Prevention

String literals are stripped before banned token scanning:

```sql
-- ALLOWED (semicolon/DROP are in string literals):
SELECT ';' as semi FROM users
SELECT 'DROP TABLE users' as note FROM users

-- REJECTED (semicolon outside strings):
SELECT 'ok'; DELETE FROM users
```

### Helper Functions

Use `lib/decision-os/db/sql.ts` helpers for consistent SQL:

```typescript
import { tenantWhere, tenantAnd, tenantConflict, TABLE_ALIASES } from '../db/sql';

// Single table
const sql = `SELECT * FROM decision_events de WHERE ${tenantWhere('de')}`;
// -> SELECT * FROM decision_events de WHERE de.household_key = $1

// JOIN
const sql = `
  SELECT * FROM decision_events de 
  JOIN receipt_imports ri ON ri.id = de.id
  WHERE ${tenantWhere('de')} ${tenantAnd('ri')}
`;
// -> ... WHERE de.household_key = $1 AND ri.household_key = $1

// UPSERT
const sql = `
  INSERT INTO inventory_items (...)
  VALUES (...)
  ${tenantConflict('item_name')} DO UPDATE SET ...
`;
// -> ON CONFLICT (household_key, item_name) DO UPDATE SET ...
```

### Standard Table Aliases

| Table | Alias |
|-------|-------|
| decision_events | `de` |
| receipt_imports | `ri` |
| inventory_items | `ii` |
| taste_signals | `ts` |
| taste_meal_scores | `tms` |

### Enforcement

Contract violations are caught by:
1. `assertSqlStyleContract()` - Checks banned patterns
2. `checkTenantSafety()` - Verifies JOIN predicates
3. `checkOnConflictSafety()` - Verifies UPSERT safety

All three run automatically in `assertTenantSafe()` which is called by both adapters.

**Violations are bugs. CI fails. Blocked merge.**
