# Phase 4 Plan v2 — Learning Loop v1 + DRM Card View

**Date:** 2026-02-06
**Status:** Plan only. No code.

---

## Code Audit Findings

### Where selection randomness happens

**`lib/seeds/index.ts` — `pickNext()` (line 57–65)**
```ts
const available = candidates.filter(r => !seenIds.includes(r.id));
const index = Math.floor(Math.random() * available.length);
return available[index];
```
Uniform random from filtered candidates. This is the single insertion point for weighted selection.

**`lib/seeds/index.ts` — `pickDrm()` (line 88–97)**
Same pattern for DRM meals. Uniform random from allergen-filtered, unseen candidates.

### Where feedback is logged and stored

**`lib/state/feedbackLog.ts`**
- `ff:v1:feedbackLog` — `FeedbackEntry[]` in AsyncStorage (append-only)
- Each entry: `{ mealId, rating: -1|0|1, timestamp }`
- `logFeedback(mealId, rating)` — appends, idempotent per mealId
- `getFeedbackLog()` — reads all entries
- `recordCompletion(mealId)` — persists last completed meal for delayed prompt

### How Deal chooses the next meal

**`app/deal.tsx` — `dealNextCard()` (line 142–188)**
1. Check DRM trigger (3 passes or 45s timer)
2. If DRM: `pickDrmMeal()` → `router.replace('/rescue/[mealId]')` (auto-navigate)
3. Else: `pickNextRecipe(mode, allergens, history, constraints)` → uniform random
4. Progressive fallback: drop constraints, then drop allergens

### Current DRM trigger and navigation

**`app/deal.tsx` (line 148–163)**
- Trigger: `passCount >= 3 || drmTimerTriggered (45s)`
- Action: `router.replace('/rescue/[mealId]')` — skips card view entirely
- User lands in rescue checklist with no hero image preview

---

## Phase 4.1 — Extend Feedback Schema

### What changes

Add optional contextual metadata to `FeedbackEntry` so the learning model can differentiate signals by context.

### Schema

```ts
// lib/state/feedbackLog.ts
interface FeedbackEntry {
  mealId: string;
  rating: FeedbackRating;    // -1 | 0 | 1
  timestamp: number;
  // Phase 4.1 additions (all optional, backward-compat)
  mode?: Mode;               // 'fancy' | 'easy' | 'cheap'
  isRescue?: boolean;        // true if DRM meal
  source?: 'chooseForMe' | 'swipeAccept';
}
```

Old entries without new fields are handled gracefully (treated as unknown context).

### Files to touch

| File | Change |
|------|--------|
| `lib/state/feedbackLog.ts` | Extend `FeedbackEntry` type. Extend `logFeedback()` signature to accept optional metadata. Extend `recordCompletion()` to accept optional metadata for pass-through. |
| `app/checklist/[recipeId].tsx` | Pass `mode` from session state + `source: 'swipeAccept'` to `recordCompletion`. |
| `app/rescue/[mealId].tsx` | Pass `isRescue: true` to `recordCompletion`. |
| `app/tonight.tsx` | Pass metadata through to `logFeedback` when feedback is submitted. |

### Acceptance criteria

- Old feedback entries (no metadata) still load and process without error
- New entries include `mode`, `isRescue`, `source` when available
- No UI changes
- All tests pass

### Rollback

Revert the type extension. Old entries are unaffected. New entries with extra fields are silently ignored by old code.

---

## Phase 4.2 — Weight Computation Module

### Architecture

New pure module: **`lib/learning/weights.ts`**

No I/O. No AsyncStorage reads. Takes `FeedbackEntry[]` in, returns `Map<string, number>` out. Fully testable.

### Weight Model v1

**Versioning:**
```ts
export const LEARNING_MODEL_VERSION = 1;
```

**Rating mapping:**

| Rating | Semantic | Weight delta |
|--------|----------|-------------|
| +1 (positive) | "Loved it" | +1.0 |
| 0 (neutral) | "It was fine" | 0.0 (baseline — neutral is NOT positive) |
| -1 (negative) | "Not great" | -0.6 |
| (no feedback) | Never rated | missing — no weight entry in map |

**Key distinction:** Neutral (0) = "I tried this and it was fine" = baseline, no boost, no penalty. Missing = "never tried / never rated" = not in the weight map at all. The selection logic treats missing differently from 0 (see Phase 4.3).

**Time decay:**
```
decayFactor = 0.5 ^ (daysSinceRating / 30)
```
- 30-day half-life
- Yesterday: ~0.98
- 30 days ago: 0.50
- 90 days ago: ~0.13

**Per-meal score:**
```
score(mealId) = Σ (ratingWeight × decayFactor) for each feedback entry with that mealId
```

Note: `logFeedback` is currently idempotent per mealId (one entry per meal). So in practice each meal has at most one entry. But the model supports multiple entries per meal for future extensibility (e.g., if we allow re-rating).

**Weight from score:**
```ts
const weight = Math.max(MIN_WEIGHT, 1.0 + score);
// MIN_WEIGHT = 0.15 (floor clamp on weight, not on probability)
// MAX_WEIGHT = 3.0 (cap to prevent domination)
```

**Cooldown penalty (repeat suppression):**
```ts
function applyCooldown(
  weight: number,
  mealId: string,
  recentDeals: string[],  // last N deal IDs from dealHistory
): number {
  const COOLDOWN_WINDOW = 3;  // look back 3 deals
  const COOLDOWN_FACTOR = 0.3; // reduce weight to 30% if recently shown

  if (recentDeals.slice(-COOLDOWN_WINDOW).includes(mealId)) {
    return weight * COOLDOWN_FACTOR;
  }
  return weight;
}
```

This is cheap and high-impact: meals shown in the last 3 deals get their weight slashed to 30%, making repeats unlikely but not impossible.

### Function signature

```ts
export function computeWeights(
  entries: FeedbackEntry[],
  recentDeals: string[],
  now?: number,
): Map<string, number>
```

Returns a map of `mealId → weight`. Meals with no feedback are NOT in the map (missing, not 0).

### Files to touch

| File | Change |
|------|--------|
| `lib/learning/weights.ts` | **New.** `computeWeights()`, `applyCooldown()`, constants. |
| `lib/learning/__tests__/weights.test.ts` | **New.** Unit tests for weight computation, decay, cooldown, edge cases. |

### Acceptance criteria

- `computeWeights([])` returns empty map
- Positive rating produces weight > 1.0
- Negative rating produces weight < 1.0 but ≥ MIN_WEIGHT
- Neutral rating produces weight = 1.0 (no change from baseline)
- Decay reduces old ratings toward 0
- Cooldown reduces weight of recently-dealt meals
- MAX_WEIGHT cap enforced
- Pure function: same inputs → same outputs (deterministic)

### Rollback

Delete `lib/learning/weights.ts`. No other files affected.

---

## Phase 4.3 — Integrate Weighted Selection

### Architecture

Modify `pickNext()` to accept an optional weight map and use weighted random selection instead of uniform random.

### Selection algorithm

```ts
function pickNext(
  candidates: RecipeSeed[],
  seenIds: string[],
  weights?: Map<string, number>,
): RecipeSeed | null {
  const available = candidates.filter(r => !seenIds.includes(r.id));
  if (available.length === 0) return null;

  // No weights or empty → uniform random (backward compat)
  if (!weights || weights.size === 0) {
    return available[Math.floor(Math.random() * available.length)];
  }

  // Probabilistic exploration: ~15% chance of uniform random per draw
  if (Math.random() < EXPLORE_RATE) {
    return available[Math.floor(Math.random() * available.length)];
  }

  // Weighted random
  return weightedPick(available, weights);
}
```

**Exploration rate:** `EXPLORE_RATE = 0.15` (15% per draw). This is probabilistic, not cadence-based ("every 5th"). On any given draw there's a 15% chance the system ignores weights and picks uniformly. This prevents echo chambers without deterministic patterns.

**`weightedPick()` implementation:**

```ts
function weightedPick(
  candidates: RecipeSeed[],
  weights: Map<string, number>,
): RecipeSeed {
  const DEFAULT_WEIGHT = 1.0; // for meals with no feedback (missing)

  const weighted = candidates.map(c => ({
    recipe: c,
    weight: weights.get(c.id) ?? DEFAULT_WEIGHT,
  }));

  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * total;

  for (const { recipe, weight } of weighted) {
    roll -= weight;
    if (roll <= 0) return recipe;
  }

  return weighted[weighted.length - 1].recipe; // fallback
}
```

**Key: missing vs neutral.**
- Missing (not in weight map): gets `DEFAULT_WEIGHT = 1.0` — full baseline probability. Untried meals are not penalized.
- Neutral (in weight map with score 0): gets `1.0 + 0.0 = 1.0` — same as default. Neutral and missing end up at the same weight, but neutral is explicitly tracked.
- Positive: gets `1.0 + score > 1.0` — boosted.
- Negative: gets `1.0 + score < 1.0` but ≥ `MIN_WEIGHT` — deprioritized but selectable.

### Caller change (deal.tsx)

```ts
// On deal session mount: load feedback + compute weights
const [mealWeights, setMealWeights] = useState<Map<string, number>>(new Map());

useEffect(() => {
  getFeedbackLog().then(entries => {
    const dealHistory = getDealHistory();
    setMealWeights(computeWeights(entries, dealHistory));
  });
}, [sessionId]);

// In dealNextCard:
let recipe = pickNextRecipe(mode, excludeAllergens, dealHistory, constraints, mealWeights);
```

`pickNextRecipe` passes `mealWeights` through to `pickNext`.

### Files to touch

| File | Change |
|------|--------|
| `lib/seeds/index.ts` | Add `weights` param to `pickNext()` and `pickNextRecipe()`. Add `weightedPick()` helper. Add `EXPLORE_RATE` constant. |
| `app/deal.tsx` | Load feedback on mount, compute weights, pass to `pickNextRecipe`. |

### Acceptance criteria

- With no feedback data: selection is uniform random (identical to today)
- With feedback data: positively rated meals appear more often (statistical test over 100+ draws)
- Negatively rated meals still appear occasionally (never hard-banned)
- ~15% of draws are exploration (uniform random regardless of weights)
- Recently dealt meals (last 3) have reduced probability via cooldown
- All existing tests pass
- New unit tests for `weightedPick` and exploration rate

### Rollback

Remove `weights` param from `pickNext`/`pickNextRecipe`. Remove weight loading from `deal.tsx`. Selection reverts to uniform random.

---

## Phase 4.4 — DRM Card View (Non-Swipeable)

### Current behavior

DRM triggers → `router.replace('/rescue/[mealId]')` → user lands in rescue checklist. No hero image preview.

### New behavior

DRM triggers → `setCurrentDeal({ type: 'drm', data: drmMeal })` → user sees full-screen hero card with "Rescue" badge, glass overlay, accept CTA. Card is **non-swipeable**. Accept navigates to rescue checklist. Back exits DRM and resumes dealing.

### Implementation

**DecisionCard: new prop `swipeDisabled?: boolean`**

When `true`:
- The horizontal swipe `Gesture.Pan()` is not created
- `composedGesture` falls back to handle-only (or just a `Gesture.Tap()` passthrough)
- Card sits stationary — no horizontal translation possible

```ts
const composedGesture = swipeDisabled
  ? (handleGesture ?? Gesture.Tap())
  : handleGesture
    ? Gesture.Exclusive(handleGesture, swipeGesture)
    : swipeGesture;
```

**deal.tsx: DRM trigger change**

Current:
```ts
if (triggerDrm) {
  const drmMeal = pickDrmMeal(...);
  if (drmMeal) {
    router.replace('/rescue/[mealId]', { mealId: drmMeal.id });
    return;
  }
}
```

New:
```ts
if (triggerDrm) {
  const drmMeal = pickDrmMeal(...);
  if (drmMeal) {
    setCurrentDeal({ type: 'drm', data: drmMeal });
    setWhyText(getRandomWhy(drmMeal));
    setCurrentDealId(drmMeal.id);
    setDrmInserted(true);
    // No navigation — card renders in deal screen
    return;
  }
}
```

**deal.tsx: card render**

Pass `swipeDisabled={currentDeal?.type === 'drm'}` to `DecisionCard`:

```tsx
<DecisionCard
  recipe={currentDeal.data}
  variant={currentDeal.type === 'drm' ? 'rescue' : 'default'}
  swipeDisabled={currentDeal.type === 'drm'}
  ...
/>
```

**deal.tsx: back button behavior on DRM card**

When `currentDeal.type === 'drm'` and user taps back:
- Skip the DRM card: call `dealNextCard()` (which won't re-trigger DRM since `drmInserted = true`)
- User sees the next regular recipe card
- If no more recipes: empty state

**deal.tsx: accept behavior on DRM card**

`handleAccept` already handles DRM: `router.push('/rescue/[mealId]')`. No change needed.

### Files to touch

| File | Change |
|------|--------|
| `components/DecisionCard.tsx` | Add `swipeDisabled?: boolean` prop. Conditionally create swipe gesture. |
| `app/deal.tsx` | DRM trigger: set `currentDeal` instead of `router.replace`. Pass `swipeDisabled`. Back on DRM card: skip to next recipe. Remove `RescueCard` render (DRM now uses DecisionCard variant='rescue'). |

### Acceptance criteria

- DRM triggers → hero card appears with "Rescue" badge, no swiping possible
- Glass overlay handle still works (drag up/down for ingredients)
- Accept → rescue checklist
- Back → skips DRM, deals next regular recipe
- If no more recipes → empty state
- No changes to rescue checklist screen
- Normal (non-DRM) dealing is unaffected

### Rollback

Remove `swipeDisabled` prop. Revert DRM trigger to `router.replace`. Behavior returns to auto-navigate-to-checklist.

---

## Risks and Mitigations

| Risk | Phase | Severity | Mitigation |
|------|-------|----------|------------|
| Weight computation has a bug that buries all meals | 4.3 | Medium | MIN_WEIGHT floor + 15% exploration rate. Worst case: all weights ≥ 0.15, exploration still picks uniformly 15% of the time. |
| User perceives "same meals over and over" | 4.3 | Medium | Cooldown penalty (30% weight for last-3 meals) + 15% exploration rate + MIN_WEIGHT floor. With 6 meals per mode, variety is inherent. |
| Feedback data too sparse to matter | 4.2 | Low | No-data fallback is uniform random (identical to today). Even 1-2 entries create measurable weight differences across 6 meals. |
| Async weight loading delays first card | 4.3 | Low | `getFeedbackLog()` reads a single AsyncStorage key (~1ms). Weight computation is O(n) on at most ~30 entries (<1ms). Total latency negligible. |
| DRM card traps user | 4.4 | Low | Back chevron always visible. Tapping back calls `dealNextCard()` which skips DRM (already inserted). |
| `swipeDisabled` breaks gesture composition | 4.4 | Low | When disabled, only handle gesture (or Gesture.Tap passthrough) is active. No composition conflict. |

---

## Sequencing

```
Phase 4.1 — Extend feedback schema (0.5 day)
  └── depends on: nothing
Phase 4.2 — Weight computation module (0.5 day)
  └── depends on: 4.1 (uses extended FeedbackEntry type)
Phase 4.3 — Integrate weighted selection (0.5 day)
  └── depends on: 4.2 (uses computeWeights)
Phase 4.4 — DRM card view (0.5 day)
  └── depends on: nothing (independent)
```

4.4 can be done before, after, or in parallel with 4.1–4.3.

**Total: ~2 days**
