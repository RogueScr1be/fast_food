# Phase 4.3 — Integration Points and Data Flow

**Status:** Plan only. No code.

---

## Functions to Modify

### 1. `lib/seeds/index.ts` — `pickNext()`

**Current signature:**
```ts
function pickNext(candidates: RecipeSeed[], seenIds: string[]): RecipeSeed | null
```

**Proposed signature:**
```ts
function pickNext(
  candidates: RecipeSeed[],
  seenIds: string[],
  weights?: Map<string, number>,
): RecipeSeed | null
```

**Change:** Add optional `weights` parameter. If absent or empty map, uniform random (today's behavior). If present, apply exploration check then weighted random.

**New helper in same file:**
```ts
function weightedPick(
  candidates: RecipeSeed[],
  weights: Map<string, number>,
): RecipeSeed
```

Takes filtered candidates + weight map. Assigns `DEFAULT_WEIGHT = 1.0` for meals absent from the map. Performs a single weighted random roll. No side effects.

**Also add:** `EXPLORE_RATE = 0.15` constant.

---

### 2. `lib/seeds/index.ts` — `pickNextRecipe()`

**Current signature:**
```ts
function pickNextRecipe(
  mode: Mode,
  excludeAllergensList: AllergenTag[],
  dealHistory: string[],
  constraints: ConstraintTag[],
): RecipeSeed | null
```

**Proposed signature:**
```ts
function pickNextRecipe(
  mode: Mode,
  excludeAllergensList: AllergenTag[],
  dealHistory: string[],
  constraints: ConstraintTag[],
  weights?: Map<string, number>,  // NEW: pass-through to pickNext
): RecipeSeed | null
```

**Change:** Pass `weights` through to `pickNext()`. No other logic changes. The filter pipeline (mode → allergens → constraints → history) remains unchanged. Weights only affect the final random pick among already-valid candidates.

---

### 3. `app/deal.tsx` — session init + `dealNextCard()`

**Where weights are loaded:**

Inside the session init effect (the one guarded by `sessionId` / `lastInitSession`), after `markDealStart()`:

```
Session init sequence (existing):
  1. markDealStart()
  2. Start DRM timer
  3. dealNextCard()

Proposed:
  1. markDealStart()
  2. Start DRM timer
  3. Load feedback → compute weights → store in ref → dealNextCard()
```

**Storage mechanism:** `useRef<Map<string, number>>` — NOT state.

A ref avoids re-renders. The weight map is computed once at session start and remains stable for the entire deal session. It doesn't need to trigger re-renders because it's only read inside `dealNextCard()`, not used in JSX.

**Loading sequence:**

```ts
// In session init effect:
getFeedbackLog().then(entries => {
  const dealHistory = getDealHistory();
  weightsRef.current = computeWeights(entries, dealHistory);
  dealNextCard();  // deal first card AFTER weights are ready
});
```

**Key decision: async loading before first card.**

Currently `dealNextCard()` is called synchronously in the init effect. With weights, we must wait for `getFeedbackLog()` (AsyncStorage read, ~1ms). This introduces a trivially small async gap. The loading state (`isLoading = true`) already covers this — the spinner shows until `dealNextCard()` sets `isLoading = false`. No user-visible delay.

**Where `dealNextCard()` uses weights:**

```ts
// Current:
let recipe = pickNextRecipe(mode, excludeAllergens, dealHistory, constraints);

// Proposed:
let recipe = pickNextRecipe(mode, excludeAllergens, dealHistory, constraints, weightsRef.current);
```

The progressive fallback (drop constraints, drop allergens) also passes `weightsRef.current`. If weights are empty (no feedback), `pickNext` uses uniform random — identical to today.

---

### 4. `lib/state/feedbackLog.ts` — no changes to core functions

`getFeedbackLog()` already returns `Promise<FeedbackEntry[]>`. The Phase 4.1 schema extension adds optional fields but doesn't change the function signature or behavior. No integration changes here.

---

### 5. `lib/learning/weights.ts` — new module (Phase 4.2)

Called from `deal.tsx` init. Pure function, no I/O. Takes entries + recentDeals + now, returns `Map<string, number>`.

---

## Sequence of Calls (Full Data Flow)

```
User taps mode on Tonight
  └── router.push('/deal')

DealScreen mounts
  └── Session init effect fires (sessionId guard)
      ├── markDealStart()
      ├── Start DRM 45s timer
      └── getFeedbackLog()                    ← AsyncStorage read (~1ms)
            └── .then(entries =>
                  const history = getDealHistory()    ← sync, in-memory
                  weightsRef.current = computeWeights(entries, history)  ← pure, <1ms
                  dealNextCard()                      ← uses weightsRef.current
                )

dealNextCard()
  ├── Check DRM trigger → (if yes, handle DRM, skip below)
  ├── pickNextRecipe(mode, allergens, history, constraints, weightsRef.current)
  │     └── getByMode → excludeAllergens → applyConstraints → pickNext(candidates, history, weights)
  │           ├── 15% chance: uniform random
  │           └── 85% chance: weightedPick(candidates, weights)
  └── setCurrentDeal(recipe) + setIsLoading(false)

User swipes card (pass)
  └── handlePass()
      └── addToDealHistory(id) + incrementPassCount()
          └── dealNextCard()   ← same flow, same weightsRef.current
                               (cooldown uses dealHistory which now has the new ID)
```

**Note on cooldown freshness:** `computeWeights()` applies cooldown based on the `recentDeals` snapshot at session start. As the user swipes, `dealHistory` grows — but the weight map is NOT recomputed mid-session. This is intentional:

- Cooldown at session start prevents repeat of meals from the PREVIOUS session's last 3.
- Within the current session, `seenIds` filtering in `pickNext()` already prevents repeats (meals are added to `dealHistory` on each pass/accept).
- These two mechanisms together cover both cross-session and intra-session repeat suppression.

---

## How `recentDeals` Reaches Cooldown

`getDealHistory()` returns the current session's deal history from `ffSession.ts` (in-memory singleton). At session start, this is empty (reset by `resetTonight()` before navigating to Deal). So the cooldown at session start is ineffective within the first session.

**Fix:** For cross-session cooldown to work, we need the previous session's last N deals. Two options:

**Option A (recommended):** Persist the last 3 deal IDs across sessions in a small AsyncStorage key (`ff:v1:recentDeals`). Write on each `addToDealHistory()`. Read in the init effect alongside feedback log. Simple, ~10 lines.

**Option B:** Derive from feedback log timestamps — but feedback is per-completed-meal, not per-dealt-card. Many dealt cards are passed (not completed), so no feedback entry exists. This doesn't work.

**Recommendation:** Option A. Add `ff:v1:recentDeals` key. Store last 3 mealIds. Read on deal session init. Pass to `computeWeights()`. Write on each `addToDealHistory()` (keep only last 3).

**Files for this:** `lib/state/ffSession.ts` (persist last 3 in parallel to existing ephemeral dealHistory). Small change.

---

## How to Avoid Extra Renders / Jank

1. **Weights in ref, not state.** `weightsRef = useRef<Map<string, number>>(new Map())`. Updating a ref doesn't trigger re-render. The map is only read inside `dealNextCard()` — a callback, not JSX.

2. **Async load completes before first card.** The `isLoading = true` spinner already covers the init period. Moving `dealNextCard()` inside the `.then()` callback means the first card is dealt after weights are ready — no race condition, no flash of unweighted card.

3. **No mid-session recomputation.** Weights are computed once. `dealNextCard()` reads from the ref on each call. No additional async operations during swiping.

4. **`computeWeights()` is <1ms.** 30 meals × 1 entry each = 30 iterations with basic arithmetic. No performance concern.

---

## Test Plan

### Unit Tests (`lib/learning/__tests__/weights.test.ts`)

| Test | Input | Expected |
|------|-------|----------|
| Empty entries | `computeWeights([], [])` | Empty map |
| Single positive | `[{ mealId: 'a', rating: 1, timestamp: now }]` | `Map { 'a' → 2.0 }` |
| Single neutral | `[{ mealId: 'a', rating: 0, timestamp: now }]` | `Map { 'a' → 1.0 }` |
| Single negative | `[{ mealId: 'a', rating: -1, timestamp: now }]` | `Map { 'a' → 0.4 }` |
| Decay: 30 days old positive | `[{ ..., timestamp: now - 30d }]` | `Map { 'a' → 1.5 }` |
| Decay: 90 days old negative | `[{ ..., timestamp: now - 90d }]` | `Map { 'a' → ~0.925 }` |
| MIN_WEIGHT clamp | Multiple negatives | Weight ≥ 0.15 |
| MAX_WEIGHT clamp | Multiple positives | Weight ≤ 3.0 |
| Cooldown: recent deal | `recentDeals: ['a']` | 'a' weight × 0.3 |
| Cooldown + clamp | Negative + cooldown | Weight = 0.15 (floor) |
| Multiple meals | 3 entries, different ratings | 3 entries in map, correct weights |

### Unit Tests (`lib/seeds/__tests__/pickNext.test.ts`)

| Test | Input | Expected |
|------|-------|----------|
| No weights → uniform | `pickNext(candidates, [], undefined)` | Any candidate (uniform) |
| Empty weights → uniform | `pickNext(candidates, [], new Map())` | Any candidate (uniform) |
| Weighted: liked meal picked more often | Run 1000 picks with one liked meal | Liked meal appears >25% (vs 16.7% uniform for 6 meals) |
| Weighted: disliked meal picked less often | Run 1000 picks with one disliked meal | Disliked meal appears <10% |
| Exploration: some uniform picks | Mock Math.random to return <0.15 | Verify uniform distribution regardless of weights |
| All candidates seen → null | All IDs in seenIds | Returns null |

### Integration Sanity Test (manual, on-device)

1. Rate one meal positive (+1 via feedback prompt)
2. Start new deal session in same mode
3. Verify the liked meal appears early (within first 3 cards) more often than not over 5 sessions
4. Rate a meal negative (-1)
5. Start new deal session
6. Verify the disliked meal appears late or not at all in the first pass through
7. Verify no crashes, no blank cards, no stuck states

---

## Summary: Total Files Modified

| File | Change | Lines (est.) |
|------|--------|-------------|
| `lib/learning/weights.ts` | New module | ~60 |
| `lib/learning/__tests__/weights.test.ts` | New tests | ~80 |
| `lib/seeds/index.ts` | Add `weights` param to `pickNext` + `pickNextRecipe`, add `weightedPick`, add `EXPLORE_RATE` | ~30 |
| `app/deal.tsx` | Add `weightsRef`, load feedback in init, pass to `pickNextRecipe` | ~15 |
| `lib/state/ffSession.ts` | Persist last 3 deal IDs for cross-session cooldown (small) | ~15 |

**Total: ~200 lines of new/changed code + ~80 lines of tests**
