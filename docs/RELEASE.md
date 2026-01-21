# Build and Release Guide

This document describes how to build and release the Fast Food Zero-UI app using EAS (Expo Application Services).

## CI/CD Staging Pipeline

The project uses GitHub Actions for continuous integration and deployment to staging.

### Pipeline Overview

| Job | Trigger | Description |
|-----|---------|-------------|
| `test` | All PRs and pushes | Runs `npm test` and `npm run smoke:mvp` |
| `migrate_staging` | Push to main | Runs database migrations on staging |
| `deploy_staging` | Push to main | Deploys to Vercel staging |
| `healthz_gate` | Push to main | Verifies `/api/healthz` returns 200 |
| `auth_required_gate` | Push to main | Verifies endpoints return 401 WITHOUT token |
| `auth_works_gate` | Push to main | Verifies endpoints return 200 WITH token |
| `runtime_flags_gate` | Push to main | Proves DB runtime flags change live behavior |
| `smoke_staging` | Push to main | Runs full staging smoke tests |

### Pipeline Gates

The pipeline has four gates that must pass in sequence:

#### 1. Healthz Gate

After deployment, the pipeline calls `GET /api/healthz` and fails if:
- Response is not 200
- This checks: DATABASE_URL exists, SUPABASE_JWT_SECRET exists, Postgres is reachable

#### 2. Auth Required Gate (401)

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

#### 3. Auth Works Gate (200)

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

#### 4. Runtime Flags Gate

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

#### 5. Smoke Staging

Full integration test of all Decision OS flows with authenticated requests.

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

**Note**: ENV flags take precedence. If ENV says `false`, DB cannot override to `true`.

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
