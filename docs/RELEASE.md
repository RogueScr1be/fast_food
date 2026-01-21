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
| `auth_sanity` | Push to main | Verifies auth flow works (200 or 401) |
| `smoke_staging` | Push to main | Runs full staging smoke tests |

### Pipeline Gates

The pipeline has two gates that must pass before smoke tests run:

#### Healthz Gate

After deployment, the pipeline calls `GET /api/healthz` and fails if:
- Response is not 200
- This checks: DATABASE_URL exists, SUPABASE_JWT_SECRET exists, Postgres is reachable

#### Auth Sanity Gate

Before full smoke tests, the pipeline runs `npm run auth:sanity` which:
- Calls Decision endpoint with STAGING_AUTH_TOKEN
- Expects either 200 (valid response) OR 401 (unauthorized)
- Fails on unexpected responses
- Prints only PASS/FAIL (no secrets leaked)

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
