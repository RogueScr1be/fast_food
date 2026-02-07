# Phase 4: Learning Loop v1 + DRM Adjustment — Plan

**Date:** 2026-02-06
**Status:** Planning only. No code.

---

## Part A — Learning Loop v1

### Current State

**Feedback data (already collected):**
- `ff:v1:feedbackLog` — append-only `FeedbackEntry[]`
- Each entry: `{ mealId, rating: -1|0|1, timestamp }`
- Logged per mealId, never duplicated, never deleted

**Meal selection (current):**
- `pickNextRecipe(mode, allergens, history, constraints)` in `lib/seeds/index.ts`
- Filters by mode → allergens → constraints → excludes seen IDs
- Final pick: `Math.floor(Math.random() * available.length)` — **uniform random**
- No weighting, no preference, no learning

**Key observation:** Selection happens in `pickNext()` at line 57-65 of `lib/seeds/index.ts`. This is the single function where randomness is applied. It takes `candidates: RecipeSeed[]` and `seenIds: string[]`, filters to unseen, picks uniformly random.

---

### Learning Model v1

#### Numeric Mapping

| Rating | Raw Value | Weight Effect |
|--------|-----------|---------------|
| Positive (+1) | +1.0 | Increase selection probability |
| Neutral (0) | +0.1 | Very slight boost (completed = mild positive signal) |
| Negative (-1) | -0.5 | Decrease probability (but never to zero) |

**Why neutral is +0.1:** Completing a meal and rating it neutral means "it was fine." This is weakly positive compared to no data at all. It's not the same as "no opinion."

**Why negative is -0.5 (not -1.0):** Asymmetric to prevent a single bad experience from permanently burying a meal. Two positive ratings overcome one negative.

#### Weight Accumulation

For each meal, compute a **preference score**:

```
score(mealId) = sum of (ratingWeight × decayFactor) for each feedback entry
```

Where:
- `ratingWeight` = the numeric mapping above (+1.0, +0.1, -0.5)
- `decayFactor` = time decay (see below)

If no feedback exists for a meal: `score = 0` (neutral baseline).

#### Time Decay

```
decayFactor = 0.5 ^ (daysSinceFeedback / halfLifeDays)
```

- `halfLifeDays = 30` (feedback halves in influence every 30 days)
- A rating from yesterday: decay ≈ 0.98 (almost full weight)
- A rating from 30 days ago: decay = 0.50
- A rating from 90 days ago: decay ≈ 0.13 (mostly faded)

This is simple exponential decay. No special casing for edge values.

#### Selection Probability (Weighted Random)

Replace uniform random with weighted random:

```
probability(meal) = softmax(score(meal) × temperature)
```

Simplified implementation (no actual softmax — just weighted):

```ts
// For each candidate meal:
const weight = Math.max(MIN_WEIGHT, 1.0 + score(mealId));
// MIN_WEIGHT = 0.15 (floor — meal always has at least 15% of baseline probability)

// Weighted random selection:
const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
const roll = Math.random() * totalWeight;
// Walk candidates, accumulate weight, pick when roll is exceeded
```

**Why `1.0 + score`:** Baseline weight is 1.0. Positive feedback adds to it. Negative subtracts from it. A meal with one negative rating (-0.5) gets weight 0.5 — half the baseline probability, but still selectable.

**MIN_WEIGHT = 0.15:** Even a heavily disliked meal retains 15% of its baseline selection chance. This enforces exploration and prevents echo chambers.

#### Exploration Guarantee

- Every 5th deal (passCount % 5 === 0), selection is **uniform random** regardless of weights. This ensures discovery and prevents the system from narrowing too aggressively.
- The 5th-deal exploration is invisible to the user — same UI, same flow.

#### Versioning

```ts
const LEARNING_MODEL_VERSION = 1;
```

- Stored alongside derived weights (not alongside raw feedback)
- If the model version changes, weights are recomputed from raw data
- Raw `feedbackLog` is never modified or versioned — it's immutable source data

---

### Integration Point

**Single function change:** `pickNext()` in `lib/seeds/index.ts`

Current:
```ts
export function pickNext(candidates: RecipeSeed[], seenIds: string[]): RecipeSeed | null {
  const available = candidates.filter(r => !seenIds.includes(r.id));
  if (available.length === 0) return null;
  const index = Math.floor(Math.random() * available.length);
  return available[index];
}
```

Proposed:
```ts
export function pickNext(
  candidates: RecipeSeed[],
  seenIds: string[],
  weights?: Map<string, number>,  // NEW optional param
): RecipeSeed | null {
  const available = candidates.filter(r => !seenIds.includes(r.id));
  if (available.length === 0) return null;

  if (!weights || weights.size === 0) {
    // No learning data — uniform random (backward compat)
    return available[Math.floor(Math.random() * available.length)];
  }

  // Weighted random selection
  return weightedPick(available, weights);
}
```

**Why this is low-risk:**
- The `weights` parameter is optional. If not provided, behavior is identical to today.
- `deal.tsx` passes weights from the learning module. If the module fails or returns empty, uniform random is the fallback.
- No changes to the filtering pipeline (mode, allergens, constraints, history). Learning only affects the final random pick among already-valid candidates.

**Caller change (`deal.tsx`):**
- On mount, load feedback log and compute weight map
- Pass weight map into `pickNextRecipe` → `pickNext`
- Weight computation is async (AsyncStorage read) but only happens once per deal session, not per card

---

### New Module: `lib/learning/weights.ts`

```ts
// Computes preference weights from raw feedback log
// Pure function: feedbackLog in → Map<mealId, weight> out
// No side effects, no storage writes
export function computeWeights(
  entries: FeedbackEntry[],
  now: number = Date.now(),
): Map<string, number> { ... }
```

- Reads `feedbackLog` entries
- Applies numeric mapping + time decay
- Returns `Map<string, number>` (mealId → weight)
- Versioned: if `LEARNING_MODEL_VERSION` changes, recompute from scratch
- Testable: pure function, no I/O

---

### Guardrails

| Guardrail | Value | Rationale |
|-----------|-------|-----------|
| MIN_WEIGHT | 0.15 | Disliked meal retains 15% baseline chance |
| Exploration deal | Every 5th card | Uniform random, prevents narrowing |
| Half-life | 30 days | Old feedback fades; tastes change |
| No-data fallback | Uniform random | Identical to today's behavior |
| Max weight cap | 3.0 | Prevents a single loved meal from dominating |

---

### Data Handling

**Raw data:** `ff:v1:feedbackLog` — immutable, append-only, never modified by learning logic.

**Derived data:** Weight map computed in-memory from raw data on each deal session start. NOT persisted. Recomputed fresh each time.

**Why not persist weights:** The weight map is small (18 recipes + 12 DRM = 30 entries max) and computation is trivial (<1ms). Persisting would introduce cache invalidation complexity with zero performance benefit.

**Reset strategy:**
- Clear `ff:v1:feedbackLog` from AsyncStorage → all weights revert to baseline
- Accessible via existing "Reset All" in Profile (already calls `clearPrefs()` — would add feedback log clearing)
- No UI needed yet; the mechanism exists

**FeedbackEntry schema extension (minimal):**

```ts
// Current
interface FeedbackEntry {
  mealId: string;
  rating: FeedbackRating;
  timestamp: number;
}

// Extended (Phase 4)
interface FeedbackEntry {
  mealId: string;
  rating: FeedbackRating;
  timestamp: number;
  mode?: Mode;           // NEW: which mode was active
  isRescue?: boolean;    // NEW: was this a DRM meal
  source?: 'chooseForMe' | 'swipeAccept';  // NEW: how was it selected
}
```

New fields are optional. Old entries without them are handled gracefully (treated as unknown mode/source). No migration needed.

---

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| User perceives "the app only shows me the same meals" | Medium | MIN_WEIGHT floor + every-5th exploration guarantee. With 6 meals per mode and mild weighting, variety remains high. |
| Feedback data is too sparse to be useful | Low | With only 18 recipes total, even 3-4 feedback entries meaningfully shape selection. No-data fallback is identical to today. |
| Weight computation has a bug that buries all meals | Medium | MAX_WEIGHT cap + MIN_WEIGHT floor + exploration deals. Worst case: weights are ignored and uniform random is used. |
| User gives negative feedback to all meals in a mode | Low | MIN_WEIGHT ensures all meals remain selectable. Exploration deals override weights. |
| Future schema change breaks old feedback entries | Low | New fields are optional. Raw data is never modified. Version number on learning math allows recomputation. |

---

### Files to Touch

| File | Change |
|------|--------|
| `lib/learning/weights.ts` | **New.** Pure function: `computeWeights(entries) → Map<string, number>` |
| `lib/seeds/index.ts` | Add optional `weights` param to `pickNext()`. Add `weightedPick()` helper. |
| `app/deal.tsx` | Load feedback log on mount, compute weights, pass to `pickNextRecipe`. |
| `lib/state/feedbackLog.ts` | Extend `FeedbackEntry` type with optional `mode`, `isRescue`, `source` fields. |
| `app/checklist/[recipeId].tsx` | Pass `mode` + `source` to `recordCompletion`. |
| `app/rescue/[mealId].tsx` | Pass `isRescue: true` to `recordCompletion`. |
| `app/tonight.tsx` | Pass `mode` + `source` to `logFeedback` (extend callback). |

**Estimated effort:** 1.5–2 days

---

### Sequencing

**Phase 4.1 — Extend feedback schema** (0.5 day)
Add optional fields to `FeedbackEntry`. Update `recordCompletion` and `logFeedback` callers to pass metadata. No behavioral change.

**Phase 4.2 — Weight computation module** (0.5 day)
Create `lib/learning/weights.ts`. Pure function, fully tested. No integration yet.

**Phase 4.3 — Integrate weighted selection** (0.5 day)
Add `weights` param to `pickNext()`. Wire `deal.tsx` to load + compute + pass. Feature-flaggable by simply not passing weights.

---

## Part B — DRM / Rescue Flow Adjustment

### Current Behavior

DRM triggers → `router.replace('/rescue/[mealId]')` → user lands directly in rescue **checklist** (steps screen). No hero image, no card view.

### New Required Behavior

DRM triggers → user sees a **full-screen Deal card** (hero image + glass overlay + accept CTA) but **cannot swipe** → user taps "Let's do this" → navigates to rescue checklist as usual.

### Proposed Navigation Flow

```
Deal (dealNextCard detects DRM)
  └── setCurrentDeal({ type: 'drm', data: drmMeal })
      └── Render DecisionCard variant="rescue" with swipeDisabled=true
          ├── Accept → router.push('/rescue/[mealId]')
          └── Back (chevron) → resume dealing (dealNextCard)
```

**Key change:** Instead of `router.replace('/rescue/[mealId]')`, the DRM trigger sets the current deal to a DRM meal and renders it as a card. The card is non-swipeable.

### Where Swipe Is Disabled

**DecisionCard prop:** Add `swipeDisabled?: boolean` (default false).

When `swipeDisabled=true`:
- The swipe gesture (`Gesture.Pan().activeOffsetX(...)`) is not created
- Only the glass overlay handle gesture is active
- The card sits stationary — no horizontal translation

**Implementation:** In `DecisionCard`, conditionally create the swipe gesture:

```ts
const composedGesture = swipeDisabled
  ? (handleGesture ?? Gesture.Tap())  // handle-only, no swipe
  : handleGesture
    ? Gesture.Exclusive(handleGesture, swipeGesture)
    : swipeGesture;
```

### Back Button Behavior

The existing glass back chevron on `deal.tsx` (top-left, visible at `overlayLevel === 0`) already exists. When showing a DRM card:

- Back should **skip the DRM card** and deal the next regular recipe: call `setDrmInserted(true)` + `dealNextCard()`
- This resumes normal dealing without navigating away from the deal screen
- If no more recipes exist, the empty state appears

### Accept Behavior

"Let's do this" on the DRM card:
- `router.push('/rescue/[mealId]')` — same as before
- User completes rescue checklist → Done → `/tonight`

### Files to Touch

| File | Change |
|------|--------|
| `app/deal.tsx` | DRM trigger: set `currentDeal` instead of `router.replace`. Pass `swipeDisabled` when `currentDeal.type === 'drm'`. Back button on DRM card skips to next recipe. |
| `components/DecisionCard.tsx` | Add `swipeDisabled?: boolean` prop. Conditionally disable swipe gesture. |

**Estimated effort:** 0.5 day

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| User trapped on DRM card with no exit | Low | Back chevron always visible at overlayLevel 0. Back skips DRM and resumes dealing. |
| DRM card looks identical to regular card except non-swipeable — user confused | Medium | Rescue badge (top-left amber "Rescue") already differentiates. Non-swipeability is intentional friction reduction, not a bug. |
| `didInitRef` / session guard blocks re-dealing after DRM skip | Low | Session counter pattern already handles re-init. `dealNextCard()` can be called directly since we're staying on the same screen. |

---

## Sequencing Summary

```
Phase 4.1 — Extend feedback schema (0.5 day)
Phase 4.2 — Weight computation module (0.5 day)
Phase 4.3 — Integrate weighted selection (0.5 day)
Phase 4.4 — DRM card view (non-swipeable) (0.5 day)
```

**Total: ~2 days**

Phases 4.1–4.3 are sequential (each depends on the prior).
Phase 4.4 is independent and can be done in parallel or before/after.

---

## Explicit Non-Goals (Confirmed)

- No ML models
- No cloud sync
- No household accounts
- No health coaching
- No grocery automation
- No share features
- No analytics/telemetry beyond existing local feedback log
