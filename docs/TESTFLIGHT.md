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
# Apple credentials for TestFlight submission
eas secret:create --scope project --name APPLE_ID --value "your@email.com"
eas secret:create --scope project --name ASC_APP_ID --value "1234567890"
eas secret:create --scope project --name APPLE_TEAM_ID --value "ABCD1234"
```

### For Preview Builds (Internal Testing)

No additional secrets required for MVP. The app works offline with local seed data.

## Build Commands

### Preview Build (Internal TestFlight)

```bash
# Run sanity check first
npm run build:sanity

# Build for preview
eas build --profile preview --platform ios
```

### Production Build (Public TestFlight)

```bash
# Run sanity check first
npm run build:sanity

# Build for production
eas build --profile production --platform ios
```

### Submit to TestFlight

```bash
# Submit latest build
eas submit --platform ios --latest
```

### One Command: Build + Submit

```bash
eas build --profile production --platform ios --auto-submit
```

## Pre-Build Checklist

- [ ] Run `npm test` — all tests pass
- [ ] Run `npm run build:sanity` — no errors
- [ ] Run `npx expo export -p web` — static export succeeds
- [ ] All changes committed
- [ ] EAS secrets configured (Apple credentials)

## TestFlight Cut Sequence

**Exact sequence for cutting a TestFlight build:**

```bash
# Step 1: Run all tests
npm test
# Must pass: all tests

# Step 2: Build configuration sanity check
npm run build:sanity
# Must pass: TypeScript compiles

# Step 3: Verify static export
npx expo export -p web
# Must pass: export completes without errors

# Step 4: Cut the build
eas build --profile production --platform ios --auto-submit
# Builds + submits to TestFlight in one command
```

**If any step fails:**
1. Fix the issue
2. Start from Step 1 again
3. Do NOT skip steps even if "nothing changed"

**After submission:**
1. Wait for Apple processing (10-30 min)
2. Install TestFlight build
3. Run post-build verification (see below)

## Build Profiles

| Profile | Distribution | Use Case |
|---------|--------------|----------|
| development | Simulator | Local dev |
| preview | Internal | QA testing |
| production | Store | TestFlight release |

## MVP Routes Verification

Before release, verify these routes work:

| Route | Test |
|-------|------|
| `/` | Redirects to Tonight |
| `/(tabs)/tonight` | Mode selection visible |
| `/(tabs)/profile` | Settings visible |
| `/deal` | Cards appear after mode selection |
| `/checklist/[id]` | Steps appear after "Let's do this" |
| `/rescue/[id]` | DRM checklist appears |

## Post-Build Verification

After installing TestFlight build:

### Core Flow
- [ ] **Launch test** — App opens without crash
- [ ] **Tonight screen** — Mode buttons (Fancy/Easy/Cheap) visible
- [ ] **Mode tap** — Tapping a mode navigates to Deal
- [ ] **Deal screen** — Card appears with hero image
- [ ] **Swipe test** — Swipe left/right shows next card
- [ ] **Accept test** — "Let's do this" shows "Locked." then Checklist
- [ ] **Checklist** — Steps are tappable, progress bar works
- [ ] **Done test** — "Done" returns to Tonight

### DRM (Dinner Rescue Mode)
- [ ] **Pass 3 times** — Rescue card appears (distinct "RESCUE" badge)
- [ ] **Or wait 45s** — Rescue card appears
- [ ] **Rescue checklist** — `/rescue/[mealId]` loads correctly

### Settings
- [ ] **Allergen modal** — "I'm allergic" opens modal
- [ ] **Save allergens** — Exclusions persist
- [ ] **Profile screen** — Shows current allergens/constraints
- [ ] **Reset Tonight** — Clears deal state, keeps preferences

### Persistence
- [ ] **Kill app** — Force close
- [ ] **Relaunch** — Mode preference restored
- [ ] **Allergens** — Exclusions still active

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
2. Verify all routes registered in `_layout.tsx`
3. Test with development build first
4. Check for missing assets

### Navigation Not Working

Common causes:
- Route not registered in `app/_layout.tsx`
- File doesn't exist at expected path
- Typo in `router.push()` path

Verify routes:
```bash
# Check all route files exist
ls -la app/
ls -la app/(tabs)/
ls -la app/checklist/
ls -la app/rescue/
```

### TestFlight Processing Stuck

Apple processing can take 10-30 minutes. Check App Store Connect for status.

## Required Credentials

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

## Quick Reference

```bash
# Login
eas login

# Build for preview (internal testing)
eas build --profile preview --platform ios

# Build for production (TestFlight)
eas build --profile production --platform ios

# Submit latest build to TestFlight
eas submit --platform ios --latest

# Build AND submit to TestFlight
eas build --profile production --platform ios --auto-submit

# Check build status
eas build:list

# View secrets
eas secret:list

# Add a secret
eas secret:create --scope project --name VAR_NAME --value "value"
```

## Related Docs

- [RELEASE.md](./RELEASE.md) — Full CI/CD documentation
- [architecture.md](./architecture.md) — System architecture
- [design/constitution.md](./design/constitution.md) — Design system principles
