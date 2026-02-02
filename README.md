# Fast Food — Dinner Solved in <3 Minutes

A mobile app that compresses the dinner decision process into a fast, decisive loop. No browsing, no lists, no paralysis—just one executable decision.

## MVP Success Definition

> A user can open the app at ~5pm, pick a mode (Fancy/Easy/Cheap), swipe through decision cards, and land on a checklist to execute dinner—all in under 3 minutes.

**Hard constraint:** Anything not required to satisfy the above is out of scope.

## Core Architecture

### Decision Flow (Current MVP)

```
User opens app
    ↓
Tonight screen: Tap Fancy / Easy / Cheap
    ↓
Deal screen: ONE bold decision card
    ↓
Swipe left/right = "No" → next card
    OR
Tap card → ingredients tray expands
    OR
"Let's do this" → Locked state (1s) → Checklist
    ↓
DRM triggers after 3 passes OR 45 seconds → Rescue card inserted
    ↓
Checklist: Cook/Prep toggle, step-by-step execution
    ↓
Done → Reset → Back to Tonight
```

### Key Components

| Component | Purpose |
|-----------|---------|
| **Tonight Screen** | Mode selection (Fancy/Easy/Cheap) + allergen exclusions |
| **Deal Screen** | Swipe-based card dealing from local seeds |
| **Decision Card** | Hero image + name + why whisper + ingredients tray |
| **DRM (Dinner Rescue Mode)** | Auto-inserts rescue meal after 3 passes or 45s |
| **Checklist Screen** | Cook/Prep toggles, step completion, progress bar |
| **Session State** | Persisted prefs + ephemeral deal state (`ffSession.ts`) |

### Non-Negotiable Constraints

1. **ONE card at a time** — no lists, no browsing
2. **Swipe = "No"** — both directions reject (left = "not feeling it", right = "doesn't fit")
3. **DRM is inevitable** — 3 passes OR 45 seconds without acceptance triggers rescue
4. **Allergies are hard constraints** — never show recipes with excluded allergens
5. **Local-first** — MVP works entirely offline with bundled seed data

## Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile | React Native + Expo SDK 52 |
| Routing | Expo Router (file-based) |
| State | Module singleton (`lib/state/ffSession.ts`) |
| Persistence | AsyncStorage (prefs only) |
| Data | Local seed files (`lib/seeds/`) |
| Hosting | EAS (mobile builds) |
| CI/CD | GitHub Actions |

## Project Structure

```
/workspace
├── app/                          # Expo Router pages
│   ├── (tabs)/                   # Tab navigation
│   │   ├── tonight.tsx           # Mode selection screen
│   │   └── profile.tsx           # Settings screen
│   ├── deal.tsx                  # Swipe-based decision cards
│   ├── checklist/
│   │   └── [recipeId].tsx        # Recipe checklist
│   ├── rescue/
│   │   └── [mealId].tsx          # DRM meal checklist
│   ├── index.tsx                 # Root redirect
│   └── _layout.tsx               # Root layout + route registration
├── lib/
│   ├── seeds/                    # Local recipe/DRM data
│   │   ├── types.ts              # RecipeSeed, DrmSeed, Mode, etc.
│   │   ├── recipes.ts            # 18 recipes + 12 DRM meals
│   │   ├── images.ts             # Hero image registry
│   │   └── index.ts              # Seed helpers (filter, pick, etc.)
│   ├── state/
│   │   ├── ffSession.ts          # Session state singleton
│   │   └── persist.ts            # AsyncStorage persistence
│   └── ui/
│       └── theme.ts              # Design tokens (colors, spacing, typography)
├── components/                   # Shared UI components
│   ├── DecisionCard.tsx          # Main swipe card
│   ├── RescueCard.tsx            # DRM rescue card variant
│   ├── IngredientsTray.tsx       # Expandable ingredients list
│   ├── PrimaryButton.tsx         # Consistent CTA button
│   ├── ThinProgressBar.tsx       # Progress indicator
│   ├── LockedTransition.tsx      # "Locked." micro-state
│   └── WhyWhisper.tsx            # Recipe reason text
├── assets/
│   └── recipes/                  # Hero images for cards
├── docs/                         # Documentation
└── .github/workflows/            # CI/CD workflows
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)

### Local Development

```bash
# Install dependencies
npm install

# Start Expo dev server
npm start

# Run tests
npm test

# Run build sanity check
npm run build:sanity

# Export for web (build verification)
npx expo export -p web
```

### Environment Variables

For local development, create `.env.local` (optional - MVP works without backend):

```bash
# Only needed if using backend features
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## MVP Routes

| Route | Purpose |
|-------|---------|
| `/` | Redirect to `/(tabs)/tonight` |
| `/(tabs)/tonight` | Mode selection + allergens |
| `/(tabs)/profile` | Settings + preferences |
| `/deal` | Swipe-based card dealing |
| `/checklist/[recipeId]` | Recipe execution checklist |
| `/rescue/[mealId]` | DRM meal checklist |

## Seed Data

The MVP uses bundled seed data (no backend required):

| Category | Count | Source |
|----------|-------|--------|
| Fancy recipes | 6 | `lib/seeds/recipes.ts` |
| Easy recipes | 6 | `lib/seeds/recipes.ts` |
| Cheap recipes | 6 | `lib/seeds/recipes.ts` |
| DRM meals | 12 | `lib/seeds/recipes.ts` |

Each recipe includes:
- `id`, `name`, `mode`
- `vegetarian`, `allergens`, `constraints`
- `ingredients` (with quantities)
- `steps` (for checklist)
- `whyReasons` (rotated on display)
- `estimatedTime`, `estimatedCost`
- `imageKey` (for hero image)

## Session State

State is managed by `lib/state/ffSession.ts`:

**Persisted (survives app restart):**
- `selectedMode`: fancy | easy | cheap | null
- `excludeAllergens`: AllergenTag[]
- `constraints`: ConstraintTag[]

**Ephemeral (reset on restart or "Reset Tonight"):**
- `passCount`: number of passes this session
- `dealHistory`: recipe IDs shown
- `drmInserted`: whether DRM was triggered
- `dealStartMs`: timestamp for 45s timer

## DRM (Dinner Rescue Mode)

DRM triggers when:
1. User passes 3 times, OR
2. 45 seconds elapse without acceptance

When triggered:
- Next card is a "Rescue" meal (simple panic meals)
- Distinct visual style (warmer, "RESCUE" badge)
- Only triggers once per session
- After DRM pass, normal recipes resume

## CI/CD Architecture

### Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | PR + push to main | Tests, build sanity, security gates |
| `staging-deploy.yml` | Manual | DB migration + Vercel deploy (for backend features) |
| `release-testflight.yml` | Manual (approval required) | EAS build + TestFlight submit |

### Gates

- `npm test` — All unit tests pass
- `npm run build:sanity` — TypeScript + EAS config valid
- `npx expo export -p web` — Static export succeeds
- Security gate — No `.env` or `db.js` committed

## Key Scripts

| Script | Purpose |
|--------|---------|
| `npm test` | Run all tests |
| `npm run build:sanity` | Verify TypeScript + EAS config |
| `npx expo export -p web` | Verify static export |
| `npm start` | Start Expo dev server |

## Design Principles

All UI follows [docs/design/constitution.md](docs/design/constitution.md):

- **Calm, OS-like** — No "food content vibes", no emojis on cards
- **Single decision** — ONE card at a time, no lists
- **Quiet motion** — Subtle animations, 60fps, no jank
- **Accessible** — Touch targets ≥48px, proper labels
- **Color scheme** — Blue/green accents from favicon (no orange)

## Documentation

| Document | Purpose |
|----------|---------|
| [RELEASE.md](docs/RELEASE.md) | Build, release, CI/CD guide |
| [TESTFLIGHT.md](docs/TESTFLIGHT.md) | EAS + TestFlight quick reference |
| [architecture.md](docs/architecture.md) | System architecture |
| [design/constitution.md](docs/design/constitution.md) | Design system principles |

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npx jest path/to/test.ts
```

Test coverage includes:
- Seed helpers (filtering, picking, constraints)
- Session state (DRM triggers, persistence)
- Route existence verification
- Image registry validation

## License

Private. All rights reserved.
