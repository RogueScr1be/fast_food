# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### MVP Core Flow (Phases 0-5)
- **Tonight Screen**: Mode selection (Fancy/Easy/Cheap) with allergen exclusions modal
- **Deal Screen**: Swipe-based card dealing with hero images
- **Decision Cards**: Hero image + name + why whisper + expandable ingredients tray
- **Rescue Cards**: DRM variant with distinct "RESCUE" badge and warmer tone
- **Checklist Screen**: Step-by-step recipe execution with Cook/Prep toggle
- **Rescue Screen**: Simplified DRM meal checklist route (`/rescue/[mealId]`)
- **Locked Transition**: 1-second "Locked." micro-state between accept and checklist

#### Seed Data System
- Local recipe seeds: 6 Fancy, 6 Easy, 6 Cheap (18 total)
- DRM panic meals: 12 rescue meals for dinner collapse scenarios
- Seed types: `RecipeSeed`, `DrmSeed`, `Mode`, `AllergenTag`, `ConstraintTag`
- Seed helpers: `getByMode()`, `excludeAllergens()`, `applyConstraints()`, `pickNext()`
- Hero image registry: `lib/seeds/images.ts` with fallback support

#### State Management
- Session state singleton: `lib/state/ffSession.ts`
- Persisted preferences: mode, allergens, constraints (via AsyncStorage)
- Ephemeral deal state: passCount, dealHistory, drmInserted, dealStartMs
- Hydration on app launch with timeout protection

#### DRM (Dinner Rescue Mode)
- Triggers after 3 passes OR 45 seconds without acceptance
- Inserts rescue meal as next card (distinct visual style)
- Only triggers once per session
- Separate route for DRM meals: `/rescue/[mealId]`

#### UI Components
- `DecisionCard`: Swipeable recipe card with hero image
- `RescueCard`: DRM variant with rescue badge
- `IngredientsTray`: Expandable ingredients list
- `PrimaryButton`: Consistent CTA with tone variants (primary/accept)
- `ThinProgressBar`: Quiet progress indicator
- `LockedTransition`: Acceptance micro-state
- `WhyWhisper`: Subtle recipe reason text

#### Design System
- Theme tokens: `lib/ui/theme.ts` (colors, spacing, typography, radii)
- Color semantics: Blue for navigation, Green for acceptance
- Constitution compliance: calm, OS-like, no emojis on cards

### Changed

- **Route Registration**: All MVP routes explicitly registered in `app/_layout.tsx`
- **Tonight Screen**: Mode tap immediately navigates to Deal (no separate CTA required)
- **"Decide for Me"**: Works even without mode selection (randomly picks)
- **Settings Screen**: Replaced legacy profile with editable preferences

### Fixed

- Session hydration hardening to prevent persisted prefs overwriting active session
- Concurrency-safe hydration with `hydratingPromise` guard
- Web double-mount fix: `didInitRef` guards initial effects in Deal screen
- Prep reorder bug: stable index mapping instead of `indexOf(text)`
- Hero image fallback: uses `_fallback.png` instead of `icon.png`

### Security

- CI gate to fail if `.env` or `db.js` committed
- Secret pattern scanning in CI (supabase URLs, anon keys, JWT tokens)
- Git history scrub: removed `.env` and `db.js` from all history

### Removed

- **Chat/AI feature**: Deleted `app/(tabs)/chat.tsx`, `ChatMessage`, `MagicalParticles`, `TypingIndicator`, `SmartSuggestions`, `VoiceInput`
- **Legacy routes**: Cleaned up disconnected routes
- **Chat API**: Removed `app/api/chat+api.ts` and `ChatService`

---

## Earlier Changes (Pre-MVP)

### Added
- SQL Style Contract v1 with 11 enforcement rules for tenant isolation
- Golden SQL contract tests (validates all runtime SQL)
- CI grep gate (`npm run sql:contract:gate`) to prevent raw SQL drift
- CTE and subquery detection helpers (`hasAnySubquery`, `hasCte`)
- SQL helper functions (`tenantWhere`, `tenantAnd`, `tenantConflict`, `tenantUpdateWhere`)
- Bypass-proof contract tests for schema-qualified and quoted identifiers
- String literal stripping to prevent false positives in contract checks
- Project documentation: CLAUDE.md, architecture.md, domain.md, decision-log.md

### Changed
- UPDATE queries now use `$1` for household_key (contract compliance)
- `assertTenantSafe()` now performs 3-level checking (style contract + tenant safety + ON CONFLICT)
- `extractTableReferences()` now handles schema-qualified and quoted table names
- `checkSqlStyleContract()` enforces `$1` parameter position for all tenant predicates

### Fixed
- `updateReceiptImportStatus` SQL now uses correct parameter order (`$1` = household_key)
- Harden session hydration to prevent persisted prefs overwriting active session
- Make hydration concurrency-safe (concurrent calls return same promise)

### Security
- Rule 11: CTEs and subqueries banned for tenant SQL (prevents hidden predicates)
- Literal tenant predicates banned (must use parameterized `$1`)
- `ON CONFLICT ON CONSTRAINT` banned (must use column-based conflicts)
- Multi-statement SQL rejected after string literal stripping
