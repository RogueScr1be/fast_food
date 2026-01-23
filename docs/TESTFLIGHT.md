# TestFlight Build Guide

Quick reference for building and deploying to TestFlight.

## Prerequisites

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project (first time only)
eas build:configure
```

## Required Environment Setup

### EAS Secrets (set once)

```bash
# Staging API URL
eas secret:create --scope project --name EXPO_PUBLIC_DECISION_OS_BASE_URL --value "https://your-app.vercel.app"

# Apple credentials
eas secret:create --scope project --name APPLE_ID --value "your@email.com"
eas secret:create --scope project --name ASC_APP_ID --value "1234567890"
eas secret:create --scope project --name APPLE_TEAM_ID --value "ABCD1234"
```

### For Preview Builds (Internal Testing)

```bash
# Optional: Staging auth token (NEVER set for production)
eas secret:create --scope project --name EXPO_PUBLIC_STAGING_AUTH_TOKEN --value "eyJ..."
```

## Build Commands

### Preview Build (Internal TestFlight)

```bash
# Run sanity check first
npm run build:sanity preview

# Build for preview
npm run eas:build:preview
# or: eas build --profile preview --platform ios
```

### Production Build (Public TestFlight)

```bash
# Run sanity check first
npm run build:sanity production

# Build for production
npm run eas:build:prod
# or: eas build --profile production --platform ios
```

### Submit to TestFlight

```bash
# Submit latest build
npm run eas:submit:prod
# or: eas submit --platform ios --latest
```

### One Command: Build + Submit

```bash
npm run release:testflight
# or: eas build --profile production --platform ios --auto-submit
```

## Pre-Build Checklist

- [ ] Run `npm test` — all tests pass
- [ ] Run `npm run smoke:mvp` — smoke tests pass
- [ ] Run `npm run build:sanity` — no errors
- [ ] Version bumped in `app.json` if needed
- [ ] All changes committed
- [ ] EAS secrets configured

## Build Profiles

| Profile | Distribution | API URL | Auth Token | Use Case |
|---------|--------------|---------|------------|----------|
| development | Simulator | localhost | None | Local dev |
| preview | Internal | Staging | Optional via EAS secret | QA testing |
| production | Store | Staging | **NEVER** | TestFlight release |

## Kill Switch

The MVP has a client-side kill switch:

| Flag | Default | Effect |
|------|---------|--------|
| `EXPO_PUBLIC_FF_MVP_ENABLED` | `true` | If `false`, app shows "temporarily unavailable" |

### To Disable MVP (Emergency)

**Option 1: Server-side (preferred)**
1. Go to Supabase → Table Editor → `runtime_flags`
2. Set `ff_mvp_enabled` = `false`
3. Takes effect within 30 seconds

**Option 2: Client-side (requires rebuild)**
1. Set `EXPO_PUBLIC_FF_MVP_ENABLED=false` in EAS secrets
2. Rebuild and redeploy

## QA Panel Access

Hidden QA panel for device testing:

1. On Tonight screen
2. Long-press "What sounds good tonight?" for 2 seconds
3. QA Panel opens

Features:
- Environment info (API URL, build profile)
- Force DRM trigger
- Reset session
- View last 10 API events

## Post-Build Verification

After installing TestFlight build:

1. **Launch test** — App opens without crash
2. **Kill switch test** — If enabled, normal flow works
3. **Decision flow** — Can tap intent, get decision, approve
4. **Reject flow** — Can reject twice, DRM triggers
5. **QA panel** — Long-press works, panel opens

## Troubleshooting

### Build Fails

```bash
# Check EAS logs
eas build:list

# View build details
eas build:view

# Check credentials
eas credentials
```

### App Crashes on Launch

1. Check Expo errors in console
2. Verify API URL is reachable
3. Check EAS secrets are set correctly
4. Test with development build first

### 401 Errors

Expected until login UI is implemented. App should handle gracefully (show error, not crash).

### TestFlight Processing Stuck

Apple processing can take 10-30 minutes. Check App Store Connect for status.

## Related Docs

- [RELEASE.md](./RELEASE.md) — Full CI/CD documentation
- [DOGFOOD_FIRST_20_DINNERS.md](./DOGFOOD_FIRST_20_DINNERS.md) — Testing protocol
