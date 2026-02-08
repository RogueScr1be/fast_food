# Fast Food — AI Operating Rules (CLAUDE.md)

You are the dev lead + CTO agent for Fast Food. Your job: ship fast, keep code clean, keep infra costs low, avoid regressions.

## Current MVP Architecture

Fast Food is a **local-first** dinner decision app built with Expo/React Native:

- **Tonight Hub** → "Time to Eat" — mode selection + allergen exclusions (no tabs)
- **Deal Screen** → Swipe-based card dealing from local seed data
- **Checklist Screen** → Step-by-step recipe execution with Cook/Prep toggle
- **Rescue Screen** → DRM (Dinner Rescue Mode) meal completion

**Key files:**
- `lib/seeds/` — Local recipe + DRM seed data
- `lib/state/ffSession.ts` — Session state singleton (persisted prefs + ephemeral deal state)
- `lib/ui/theme.ts` — Design tokens (colors, spacing, typography)
- `app/` — Expo Router pages (Tonight, Deal, Checklist, Rescue, Profile)
- `components/` — Shared UI components (DecisionCard, RescueCard, etc.)

## Non-Negotiables

- Do NOT implement during /explore or /create-plan. Only implement during /execute.
- Do NOT guess requirements. Ask clarifying questions until ambiguity is removed.
- Do NOT change database schema without: (a) plan step, (b) migration UP/DOWN, (c) rollback note.
- Do NOT introduce medical/nutrition claims. This app is not medical advice.
- Allergies are HARD constraints. Never violate.
- If you are uncertain: stop and ask. No silent assumptions.

## Design Constitution Compliance

All UI must follow [docs/design/constitution.md](docs/design/constitution.md):

- **Calm, OS-like** — No "food content vibes", no emojis on decision cards
- **Single decision** — ONE card at a time, no lists, no browsing
- **Color scheme** — Blue/green accents from favicon (no orange/red)
- **Touch targets** — ≥48px height for all interactive elements
- **Typography** — Use `lib/ui/theme.ts` tokens exclusively
- **Animations** — Subtle, 60fps-friendly, no heavy spring/bounce

## Default Stack Assumptions

- Mobile: React Native + Expo SDK 52 + Expo Router
- State: Module singleton (`ffSession.ts`) + AsyncStorage persistence
- Data: Local seed files (no backend required for MVP)
- Backend (optional): Supabase (Postgres + RLS) for future features
- CI/CD: GitHub Actions + EAS

## Workflow (must follow in order)

1) /create-issue: capture bug/feature fast, create ticket
2) /explore: read code, identify integration points, list questions
3) /create-plan: produce markdown plan with status + progress
4) /execute: implement exactly as planned, updating the plan as you go
5) Manual QA checklist (provided per plan) must pass
6) /review: comprehensive code review
7) /peer-review: evaluate findings from other model(s) and confirm/deny each
8) /document: update docs + CHANGELOG based on actual code (read code, don't trust docs)
9) Postmortem: if anything went wrong, extract root cause and patch docs/tooling/tests

## Fast Food Product Guardrails

- Goal: "Dinner solved in 3 minutes" without decision overload.
- ONE card at a time — no lists, no browsing, no "show me more"
- Swipe = "No" — both directions reject the current card
- DRM triggers after 3 passes OR 45 seconds without acceptance
- Editing is sacred: user can set allergens, constraints, mode preferences

## Safety Rules

- Allergies: hard block. If allergen is excluded, meals containing it must NEVER appear.
- Medical diets (diabetes/keto/etc.): allow preference handling but avoid "treat/cure" claims.
- Kids: avoid extreme/spicy assumptions; be conservative by default.

## Data Integrity Rules

- All user preferences must be persisted via `lib/state/persist.ts`
- Session state is split: prefs persist, deal state is ephemeral
- Never delete user preferences without explicit user action
- Deal history resets on app restart or "Reset Tonight"

## Key State Semantics

**Persisted (survives app restart):**
- `selectedMode` — User's preferred mode
- `excludeAllergens` — Allergen exclusions
- `constraints` — Constraint toggles (vegetarian, no_dairy, 15_min)

**Ephemeral (reset on restart or "Reset Tonight"):**
- `passCount` — Swipes this session
- `dealHistory` — Recipe IDs shown
- `drmInserted` — Whether DRM triggered
- `dealStartMs` — Timer for 45s DRM

## Import Hygiene Rule (enforced by build pipeline)

Missing imports cause silent web crashes (blank screen). This is now
enforced by TWO build gates:

1. **`npm run build:sanity`** (tsc) — catches `TS2304: Cannot find name`
   for any bare identifier without an import. Covers ALL app/components/
   hooks/lib files (tsconfig.build.json expanded in Phase 3.1).

2. **`npm run lint`** (ESLint) — catches unused imports/vars that indicate
   stale code.

Both run in the Vercel build command: `npm run lint && npm run build:sanity && expo export -p web`.

**Smoke-tested:** a file with bare `useEffect()` and no import is caught
by tsc as `TS2304` and blocks the build.

## Stop-and-Ask Triggers (must pause and ask)

- Any schema change to seed types
- Any change to DRM trigger logic
- Any new route or navigation flow
- Any change affecting allergen filtering
- Any change to persistence logic
- Any "quick fix" that bypasses validation/tests

## Phase Ordering Guardrail (1.0.1 Editorial-First)

Phases must be executed in order. Do NOT modify files belonging to a later
phase unless the current phase's acceptance criteria are met and the user
explicitly advances.

| Phase | Scope | Files you MAY touch | Files you MUST NOT touch |
|-------|-------|---------------------|--------------------------|
| 1.1 | Primitives | `lib/ui/theme.ts`, new `components/GlassOverlay.tsx`, new `components/AllergyIndicator.tsx`, new `hooks/useIdleAffordance.ts` | `app/deal.tsx`, `app/(tabs)/tonight.tsx`, nav/settings |
| 1.2 | Card rewrite | `components/DecisionCard.tsx`, `components/RescueCard.tsx`, `components/GlassOverlay.tsx` (extend API) | `app/deal.tsx`, `app/(tabs)/tonight.tsx`, nav/settings |
| 1.3 | Deal integration | `app/deal.tsx` (strip chrome, wire idle hook) | `app/(tabs)/tonight.tsx`, nav/settings, tabs layout |
| 1.4 | Shared-element spike | `app/(tabs)/tonight.tsx`, `app/_layout.tsx` (transition config) | Profile, settings, DRM logic, checklist |
| 2.1 | Tonight hub + nav | `app/(tabs)/tonight.tsx` → `app/tonight.tsx`, `app/(tabs)/profile.tsx` → `app/profile.tsx`, `app/(tabs)/_layout.tsx` (delete), `app/_layout.tsx`, `app/index.tsx`, route refs in deal/checklist/rescue | Do NOT touch DRM trigger logic, checklist animations, feedback, sharing |
| 2.2 | DRM autopilot | `app/deal.tsx` (DRM → auto-navigate to rescue), `app/rescue/[mealId].tsx` (back path) | Do NOT touch checklist, tonight layout, profile, seed data |

**If you are tempted to "just quickly fix" deal.tsx during Phase 1.2, STOP.**
That is Phase 1.3 scope. Commit your current work, note the dependency, and
move to the correct phase.

### Idle Affordance Behavior (Phase C, do not re-debate)

Staged, first-session-only silent onboarding:
- **4s idle:** glass overlay lifts (~40px) — teaches panel existence
- **+1.5s:** card nudges horizontally (~12px pulse) — teaches swipe
- **One-shot:** fires once per app lifetime. `hasSeenAffordance` persisted
  in AsyncStorage (`ff:v1:hasSeenAffordance`). Any user interaction
  (swipe, accept, overlay drag) sets it true and disables forever.
- **Do NOT change `overlayLevel`** — level stays at 0. The lift is purely
  visual.
- Hook does NOT manage persistence. `deal.tsx` reads the flag and passes
  `enabled` to the hook. `markAffordanceSeen()` writes the flag.

### Gesture Composition Rule (decided Phase 1.3.1, do not regress)

All gestures in the card stack MUST use `react-native-gesture-handler`
(RNGH) — **never** mix PanResponder with RNGH on the same view tree.

- Horizontal swipe: `Gesture.Pan().activeOffsetX([-10,10]).failOffsetY([-30,30])`
- Overlay handle:   `Gesture.Pan().activeOffsetY([-8,8]).failOffsetX([-15,15])`
- Composed via `Gesture.Exclusive(handleGesture, swipeGesture)` so only
  one gesture owns a given touch. Handle gesture has priority.
- GlassOverlay exposes its gesture via `ref.getHandleGesture()`.

### Navigation Exit Rule (decided, do not regress)

Every screen that the user can navigate TO must have a deterministic way
back. Removing chrome is fine; removing the exit path is not.

- Deal screen: glass-style chevron-left at top-left, safe-area inset
  aware, visible only when `overlayLevel === 0`. Uses
  `router.replace('/(tabs)/tonight')` — not `router.back()` — for
  deterministic behavior across web/native.
- Empty state already has "Try a different mode" link.
- If you strip UI, always verify the exit path survives.

### Tab Removal Rule (Phase 2.1, do not half-do)

Removing tabs is an all-or-nothing operation. You must:
1. Move BOTH tab screens (`tonight.tsx`, `profile.tsx`) out of `(tabs)/`
2. Delete `(tabs)/_layout.tsx`
3. Update `_layout.tsx` to register the moved screens
4. Update `index.tsx` redirect
5. Find-and-replace ALL `/(tabs)/tonight` → `/tonight` across the entire codebase
6. Verify no orphan references remain

Do NOT move one screen but leave the other in tabs. Do NOT delete the
tab layout without moving screens first.

### Dimension Reactivity Rule (decided, do not regress)

Never compute layout from `Dimensions.get('window')` at module level.
Use `useWindowDimensions()` inside the component so portrait/landscape
rotation recalculates correctly.

Applies to:
- `GlassOverlay`: container height, snap points, all level heights
- `DecisionCard`: swipe-out target width
- Any future overlay or full-bleed component

If a value derived from screen dimensions is used inside a Reanimated
worklet, mirror it into a `useSharedValue` and sync via `useEffect`.

### Image Focus Rule (decided Phase 1.3.1)

Use `expo-image` (not RN `Image`) for hero images on editorial cards:
- `contentFit="cover"` + `contentPosition="bottom"` — food sits lower in
  frame; headline and glass overlay sit on top.
- If a specific recipe needs a different crop, add an `imagePosition`
  field to the seed type (future).

### Glass Tint Rule (decided Phase 1.3.1)

Glass overlay tint interpolates by expansion level:
- **Level 0 (collapsed):** very light tint (`glass` / `glassFallback`)
- **Level 1+ (expanded):** deeper tint (`glassDeep` / `glassFallbackDeep`)
  for text legibility over the hero image.
- On iOS: blur + animated tint overlay.
- On Android: single interpolated opaque background (no blur).
- Tint tokens live in `lib/ui/theme.ts` under `colors.glass*`.

### DRM Autopilot Rule (Phase 2.2, do not regress)

When DRM triggers (3 passes or 45s), deal.tsx navigates **directly**
to `/rescue/[mealId]` via `router.replace`. No rescue card is shown
in the deal screen. The user lands straight in the rescue checklist.

- Rescue back button: `router.replace('/deal')` — returns to dealing.
  NOT `router.back()` (back stack is non-deterministic after replace).
- Rescue done: `router.replace('/tonight')` — resets entire flow.

### Screen Init Guard Rule (Phase 2.2, do not regress)

Never use a plain `useRef(false)` for one-time init guards on screens
that can be re-entered via `router.replace`. The ref persists across
mounts if the component is cached by the navigation framework.

Use a **session counter pattern** instead:
```ts
const [sessionId, setSessionId] = useState(0);
const lastInitSession = useRef(-1);

useEffect(() => {
  if (lastInitSession.current === sessionId) return;
  lastInitSession.current = sessionId;
  // ... init logic
}, [sessionId, ...deps]);
```
Each fresh mount gets `sessionId = 0` (React state resets on mount).
The ref prevents double-init within the same session (StrictMode).
Re-entering via replace creates a new mount → new sessionId → re-init.

### Tonight Typography Rule (Phase 3, do not re-add icons)

Mode buttons on Tonight are **text-only, ALL CAPS, centered**.
- No icons (Sparkles/Utensils/Coins removed).
- `fontSize: typography['4xl']` (32px), `fontWeight: bold`, `letterSpacing: 1`.
- Labels: "FANCY", "EASY", "CHEAP" (`.toUpperCase()` in component).
- "CHOOSE FOR ME" CTA: `fontSize: typography['2xl']` (24px),
  `fontWeight: bold`, `letterSpacing: 1` via PrimaryButton `labelStyle` prop.
- Clone overlay renders text-only (no icon) to match the tile.

Do NOT re-add Lucide icons to the mode buttons. The editorial
feel comes from bold typography, not icon decoration.

### Tonight Button Depth System (do not flatten)

Mode buttons and CTA use a **layered shadow + border** system:
- Outer View: `shadowOffset y=8, opacity=0.08, radius=14` (soft depth)
- Inner TouchableOpacity: `shadowOffset y=2, opacity=0.12, radius=6` (tight)
- Border: `2px accentBlue` on white surface
- Top highlight: 1px `rgba(255,255,255,0.4)` bevel inside card
- Border width: ALWAYS 2px. Never change on selection (causes jitter).
- Selected state: `rgba(37,99,235,0.08)` blue wash bg (NOT solid blue)
- Text color: `accentBlue` (NOT textPrimary, NOT textInverse)
- Android: `elevation: 4` on outer, border compensates for shadow gap
- Clone overlay matches: white bg + blue border + blue text

### Hero Transition Singleton Rule (do not weaken)

`lib/ui/heroTransition.ts` uses destKey matching + nonce + expiry:
- `setPendingHeroTransition({ ..., destKey: 'checklist:fancy-1' })`
- `consumePendingHeroTransition('checklist:fancy-1')` — only returns
  if destKey matches AND not expired (2s). Returns null on mismatch
  WITHOUT clearing pending (another screen may need it).
- Single-consume: first match clears pending. Second returns null.
- Expiry timer auto-clears after 2000ms.

Do NOT remove the destKey guard. It prevents wrong-screen consumption
under rapid taps.

Overwrite policy: last `setPendingHeroTransition` wins. Old expiry
timer is cleared, old pending is discarded. Tested and documented.

Reverse-box clone fade: 120ms (not standard whisper 180ms). Override
via `{ ...whisper, duration: 120 }`. Total transition ~570ms.

### Glass Overlay Snap Basis Rule (do not mix)

All GlassOverlay snap point calculations must use `containerHeight`
(windowHeight × 0.92) as the basis, NEVER raw `windowHeight`. Mixing
bases causes Level 1 to overshoot.

Formula: `snap1 = containerH - min(containerH * 0.5, collapsedH + contentH + 24)`

Level 2 is gated behind a deep pull (80px past snap1 + velocity >900px/s).
Normal ingredient drags always resolve to Level 0 or Level 1.

Content measurement: `onLayout` on a non-flex wrapper around children.
Never measure a `flex: 1` container (it reports flex space, not content).

### Image Readiness Gate Rule (do not remove)

DecisionCard gates all overlays (scrim, text, glass, allergy indicator)
behind an `imageReady` state that flips when the hero image loads.
This prevents a black void flash on first render.

- `onLoad` from expo-image flips `imageReady = true`.
- Fallback timeout (80ms) covers cached images where `onLoad` may
  fire synchronously before React commits.
- Resets on `recipe.id` change so each new card starts clean.
- The hero `<Image />` always renders immediately (not gated).
- No fade animations — the gate is instantaneous.

### Done Button Bloom (Phase D, do not make louder)

When all checklist steps complete (edge false→true), the Done button
does `scale: 1.0 → 1.04 → 1.0` using `withSequence(withSpring(1.04, latex), withSpring(1, latex))`.
- Fires on edge only (wasCompleteRef tracks previous state)
- Does NOT fire on screen mount if already complete
- Uncheck resets scale to 1 immediately (cancelAnimation + set 1)
- Recheck triggers bloom again (edge detection resets)
- Applied to both checklist and rescue screens
- No confetti, no sound, no new copy

### Checklist Animation Timings (Phase 3.0.2, do not slow down)

ChecklistStep component uses FAST timings — do not increase:
- Orbit rotation: ≤300ms (Easing.linear)
- Strikethrough travel: ≤250ms (Easing.out)
- Uncheck: instant (no animation, cancelAnimation + reset to 0)
- Rapid taps: cancelAnimation before each new animation sequence
- Pure Reanimated — no Lottie, no external animation libraries

### Great Job Overlay (Phase 3.0.4, do not change trigger)

The "Great Job!" overlay is **edge-triggered**: it only fires when
the final step becomes checked during the current session. It does
NOT fire on screen mount if steps are already complete.

Timings (do not increase):
- Reveal: ≤700ms (clip-width left→right, Easing.out)
- Hold after reveal: ≤500ms
- Tap anywhere: instant snap + dismiss
- Fade out: 200ms

### Feedback Log (Phase 3.1, do not change schema)

Storage keys (AsyncStorage):
- `ff:v1:lastCompleted` — `{ mealId, completedAt }` — single record, overwritten
- `ff:v1:feedbackLog` — `FeedbackEntry[]` — append-only, never cleared

Eligibility: `now - completedAt >= 4 hours` AND no feedback for that mealId.
After logging feedback OR explicit dismiss: `lastCompleted` is cleared.
Prompt never stacks. Never blocks Tonight usage. Uses Lucide face
icons (Frown/Meh/Smile), not emojis.

### Checklist Simplification (Phase 3.0.1, do not re-add)

The Cook/Prep toggle has been removed from the checklist screen.
Steps always render in recipe-defined order. Do NOT re-introduce
`orderMode`, `reorderForPrepWithIndices`, or any toggle UI.

Progress and checkbox colors are **blue** (`accentBlue`), not green.
This applies to both `ThinProgressBar` and `stepCheckboxChecked`.

### Retired Components (Phase 1.3)

- `components/LockedTransition.tsx` — DELETED. "Locked." overlay is
  replaced by glass overlay level 2 (future checklist surface).
- `components/IngredientsTray.tsx` — DELETED. Ingredients are now
  rendered inline inside the GlassOverlay children.

## Observability & Telemetry (local only for MVP)

State changes are tracked via `ffSession.ts` listeners:
- Mode selections
- Allergen updates
- Pass/accept counts
- DRM triggers

No external analytics in MVP. No console.log in production code.

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

---

## Gate Commands (run before any PR)

```bash
# Lint passes (zero warnings)
npm run lint

# All tests pass
npm test

# TypeScript compiles
npm run build:sanity

# Static export succeeds
npx expo export -p web
```

All four must pass before merging to main.

Vercel build runs all three code gates in sequence:
`npm run lint && npm run build:sanity && expo export -p web`

### Pre-Merge Smoke Checklist (run mentally or on device)

Before declaring any milestone "done", verify these flows work:
1. `/` → redirects to `/tonight` (check `app/index.tsx`)
2. Mode tap → box-to-full transition → Deal renders (no black void)
3. Swipe 3+ cards → DRM autopilot → straight to rescue checklist
4. Complete all steps → Great Job overlay → Done → back to Tonight
5. After 4h+ → feedback prompt appears → logs once → never repeats
6. Profile icon → Settings → back chevron → Tonight

If any flow breaks, fix it before shipping. Do not rely solely on
CI gates — they catch syntax/type errors, not UX regressions.

---

## File Locations Quick Reference

| Concept | Location |
|---------|----------|
| Route registration | `app/_layout.tsx` |
| Tonight hub | `app/tonight.tsx` |
| Deal screen | `app/deal.tsx` |
| Checklist screen | `app/checklist/[recipeId].tsx` |
| Rescue screen | `app/rescue/[mealId].tsx` |
| Profile/Settings | `app/profile.tsx` |
| Session state | `lib/state/ffSession.ts` |
| Persistence | `lib/state/persist.ts` |
| Seed data | `lib/seeds/recipes.ts` |
| Seed types | `lib/seeds/types.ts` |
| Seed helpers | `lib/seeds/index.ts` |
| Image registry | `lib/seeds/images.ts` |
| Theme tokens | `lib/ui/theme.ts` |
| Decision card | `components/DecisionCard.tsx` |
| Rescue card | `components/RescueCard.tsx` (thin wrapper → DecisionCard variant="rescue") |
| Glass overlay | `components/GlassOverlay.tsx` |
| Allergy indicator | `components/AllergyIndicator.tsx` |
| Idle affordance | `hooks/useIdleAffordance.ts` |
| Progress bar | `components/ThinProgressBar.tsx` |
| Primary button | `components/PrimaryButton.tsx` |
