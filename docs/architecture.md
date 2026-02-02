# Fast Food — Architecture

## Purpose

Fast Food compresses the dinner decision process into a fast, decisive loop:
**Tonight → Deal → Locked → Checklist → Done**

No browsing, no lists, no paralysis—just one executable decision in under 3 minutes.

## High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         EXPO APP                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Tonight    │───▶│    Deal      │───▶│  Checklist   │      │
│  │   Screen     │    │   Screen     │    │   Screen     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│        │                    │                    │              │
│        │                    │                    │              │
│        ▼                    ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Session State                         │   │
│  │                  (lib/state/ffSession.ts)                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │   │
│  │  │  Persisted  │  │  Ephemeral  │  │    DRM      │      │   │
│  │  │  Prefs      │  │  Deal State │  │   Trigger   │      │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │   │
│  └─────────────────────────────────────────────────────────┘   │
│        │                    │                                   │
│        ▼                    ▼                                   │
│  ┌──────────────┐    ┌──────────────┐                          │
│  │ AsyncStorage │    │  Local Seeds │                          │
│  │ (persist.ts) │    │ (recipes.ts) │                          │
│  └──────────────┘    └──────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Core Flow (MVP)

### 1. Tonight Screen
User opens app and selects dinner mode:

```
Tonight Screen
├── Mode Selection: Fancy | Easy | Cheap
├── Allergen Exclusions: Modal with checkboxes
└── CTA: "Decide for Me" (random mode if none selected)
```

### 2. Deal Screen
One card at a time, swipe-based interaction:

```
Deal Screen
├── Decision Card (recipe from seeds)
│   ├── Hero Image (60% height)
│   ├── Name + Why Whisper
│   ├── Ingredients Tray (tap to expand)
│   └── CTA: "Let's do this"
├── Swipe Handling
│   ├── Left/Right = "No" (both reject)
│   └── Threshold: 120px
├── DRM Trigger
│   ├── 3 passes → Rescue card
│   └── 45 seconds → Rescue card
└── Empty State → "Reset Tonight"
```

### 3. Locked Transition
1-second micro-state between acceptance and checklist:

```
Locked Transition
├── "Locked." text
├── Duration: 1000ms
└── Route to: /checklist/[recipeId] or /rescue/[mealId]
```

### 4. Checklist Screen
Step-by-step execution with completion tracking:

```
Checklist Screen
├── Progress Bar (thin, grows as steps complete)
├── Cook/Prep Toggle (reorders steps)
├── Step List (tap to complete)
└── Done Button → Reset Tonight → Back to Tonight
```

## Data Objects (Canonical)

### RecipeSeed (Normal Meals)

```typescript
interface RecipeSeed {
  id: string;                    // Unique identifier
  name: string;                  // Display name
  mode: 'fancy' | 'easy' | 'cheap';
  vegetarian: boolean;
  allergens: AllergenTag[];      // dairy, nuts, gluten, eggs, soy, shellfish
  constraints: ConstraintTag[];  // no_oven, kid_safe, 15_min, vegetarian, no_dairy
  ingredients: Ingredient[];     // { name, quantity }
  steps: string[];               // Checklist steps
  whyReasons: string[];          // Rotate one at display time
  estimatedTime: string;         // "25 min"
  estimatedCost: string;         // "$15"
  imageKey?: string;             // Hero image lookup key
}
```

### DrmSeed (Rescue Meals)

```typescript
interface DrmSeed {
  id: string;
  name: string;
  vegetarian: boolean;
  allergens: AllergenTag[];
  constraints: ConstraintTag[];
  ingredients: Ingredient[];
  steps: string[];
  whyReasons: string[];
  estimatedTime: string;
  imageKey?: string;
}
```

### Session State

```typescript
interface FFSessionState {
  // Persisted (survives restart)
  selectedMode: Mode | null;
  excludeAllergens: AllergenTag[];
  constraints: ConstraintTag[];
  
  // Ephemeral (reset on restart or "Reset Tonight")
  sessionStartTime: number | null;
  passCount: number;
  dealHistory: string[];
  currentDealId: string | null;
  drmInserted: boolean;
  dealStartMs: number | null;
}
```

## State Management

### Module Singleton Pattern

`lib/state/ffSession.ts` uses a module-level singleton:

```typescript
// Module-level state
let state: FFSessionState = { ... };

// Getters (return copies for immutability)
export function getSelectedMode(): Mode | null { ... }

// Setters (mutate + notify + persist)
export function setSelectedMode(mode: Mode | null): void { ... }

// Subscribers (for reactive components)
export function subscribe(listener: () => void): () => void { ... }
```

### Persistence Strategy

**Persisted via AsyncStorage:**
- `selectedMode` — User's mode preference
- `excludeAllergens` — Allergen exclusions
- `constraints` — Active constraints

**Not Persisted (ephemeral):**
- `passCount` — Reset each session
- `dealHistory` — Reset each session
- `drmInserted` — Reset each session
- `dealStartMs` — Reset each session

### Hydration

On app launch, `_layout.tsx` calls `hydrateFromStorage()`:
1. Loads prefs from AsyncStorage
2. Updates session state
3. Sets `hydrated = true`
4. Notifies listeners

## DRM (Dinner Rescue Mode)

### Trigger Conditions

DRM triggers when EITHER condition is met:
1. `passCount >= 3` — User passed 3 times
2. `elapsedMs >= 45000` — 45 seconds elapsed

### Behavior

1. Next card is a DRM meal (from `DRM_MEALS` array)
2. Visual distinction: "RESCUE" badge, warmer tone
3. `drmInserted = true` — Prevents re-triggering
4. After DRM pass, normal recipes resume

### DRM vs Normal Cards

| Aspect | Normal Card | DRM Card |
|--------|-------------|----------|
| Badge | None | "RESCUE" |
| Route | `/checklist/[recipeId]` | `/rescue/[mealId]` |
| Steps | From recipe | From DRM meal or fallback |
| Style | Blue accent | Warmer tone |

## Seed Data Pipeline

### Data Sources

All recipes are bundled in `lib/seeds/recipes.ts`:
- 6 Fancy recipes
- 6 Easy recipes
- 6 Cheap recipes
- 12 DRM rescue meals

### Filtering Pipeline

```typescript
// In lib/seeds/index.ts

getByMode(mode)           // Filter by mode
  ↓
excludeAllergens(list)    // Remove recipes with excluded allergens
  ↓
applyConstraints(list)    // Filter by active constraints
  ↓
excludeSeen(list, history) // Remove already-shown recipes
  ↓
pickNext(list)            // Random selection from remaining
```

## Component Architecture

### Screen Components

| Screen | File | Purpose |
|--------|------|---------|
| Tonight | `app/(tabs)/tonight.tsx` | Mode selection + allergens |
| Deal | `app/deal.tsx` | Card dealing + DRM logic |
| Checklist | `app/checklist/[recipeId].tsx` | Recipe execution |
| Rescue | `app/rescue/[mealId].tsx` | DRM meal execution |
| Profile | `app/(tabs)/profile.tsx` | Settings + preferences |

### Shared Components

| Component | File | Purpose |
|-----------|------|---------|
| DecisionCard | `components/DecisionCard.tsx` | Swipeable recipe card |
| RescueCard | `components/RescueCard.tsx` | DRM variant of DecisionCard |
| IngredientsTray | `components/IngredientsTray.tsx` | Expandable ingredients |
| PrimaryButton | `components/PrimaryButton.tsx` | Consistent CTA styling |
| ThinProgressBar | `components/ThinProgressBar.tsx` | Progress indicator |
| LockedTransition | `components/LockedTransition.tsx` | "Locked." micro-state |
| WhyWhisper | `components/WhyWhisper.tsx` | Subtle reason text |

## Design System

### Theme Tokens (`lib/ui/theme.ts`)

```typescript
export const colors = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#E5E5E5',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B7280',
  accentBlue: '#3B82F6',    // System actions
  accentGreen: '#10B981',   // Accept/commit actions
  // ...
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const radii = { sm: 4, md: 8, lg: 12, xl: 16, full: 9999 };
export const typography = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 };
```

### Color Semantics

| Color | Use Case |
|-------|----------|
| `accentBlue` | Navigation, system actions ("Decide for Me") |
| `accentGreen` | Acceptance, commitment ("Let's do this", "Done") |
| `textMuted` | Helper text, whispers |
| `border` | Card borders, separators |

## Non-Goals (MVP)

- Multi-user/household support
- Backend-powered recommendations
- Recipe creation/editing
- Shopping list generation
- Inventory tracking
- Meal history/analytics
- Social features

## Future Architecture (Post-MVP)

When backend integration is needed:

```
┌─────────────────────┐
│     Expo App        │
│  (Current Arch)     │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   Decision OS API   │
│  (Vercel + Supabase)│
├─────────────────────┤
│ • Decision endpoint │
│ • Feedback endpoint │
│ • DRM endpoint      │
│ • Receipt import    │
└─────────────────────┘
```

The current local-first architecture is designed to easily integrate with backend services when needed, without requiring major refactoring of the core UI flow.

---

## Dogfooding Rule: Fix Root Cause, Not Symptoms

Whenever AI makes a mistake (wrong file, wrong assumption, broke constraints, etc.):

1) **Identify the root cause:**
   - missing doc? unclear rule? ambiguous requirement? missing test?

2) **Patch the system so it never repeats:**
   - update CLAUDE.md rules / domain definitions / architecture notes
   - add validation or test
   - add a "Stop-and-Ask Trigger" if needed

3) **Record the learning** in decision-log or a short "Gotcha" section in domain.md
