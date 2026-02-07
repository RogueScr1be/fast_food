# Phase 4.4 — DRM/Rescue Card View Plan

**Status:** Plan only. No code.

---

## Route / Screen Decision

**Use the existing Deal screen (`app/deal.tsx`) and existing `DecisionCard` component.**

No new route or screen. When DRM triggers, `dealNextCard()` sets `currentDeal` to a DRM meal (type `'drm'`) instead of navigating away. The Deal screen renders the same `DecisionCard` component with `variant="rescue"` — showing the Rescue badge, warm scrim, and amber CTA. The card is non-swipeable.

**Why not a new route:** The Deal screen already has all the infrastructure — glass overlay, idle affordance, back button, accept handler. A rescue card is visually identical to a recipe card except for variant styling. Adding a new route would duplicate this surface for no functional benefit.

---

## How to Disable Swipe

### New prop: `swipeDisabled?: boolean` on `DecisionCard`

**DecisionCard.tsx change (gesture composition section):**

Currently:
```ts
const handleGesture = glassRef.current?.getHandleGesture();
const composedGesture = handleGesture
  ? Gesture.Exclusive(handleGesture, swipeGesture)
  : swipeGesture;
```

Proposed:
```ts
const handleGesture = glassRef.current?.getHandleGesture();

const composedGesture = swipeDisabled
  ? (handleGesture ?? Gesture.Tap())           // handle-only, no horizontal swipe
  : handleGesture
    ? Gesture.Exclusive(handleGesture, swipeGesture)
    : swipeGesture;
```

When `swipeDisabled=true`:
- The horizontal `swipeGesture` (Gesture.Pan with activeOffsetX) is never included in the composed gesture
- The glass overlay handle gesture still works (vertical drag for ingredients)
- If no handle gesture ref is available yet (first render before ref attaches), a `Gesture.Tap()` placeholder is used — it's inert but satisfies GestureDetector's requirement for a gesture object
- The card sits stationary. No horizontal translation. `swipeX` stays at 0.

**Why this is clean:**
- Single prop controls the behavior
- No changes to the gesture definitions themselves
- No conditional gesture creation (avoids RNGH hook ordering issues)
- The swipe gesture object is still created (hook stability) but simply not included in the composition

---

## How Accept Routes to Checklist

**No change needed.** `handleAccept` in `deal.tsx` already handles both types:

```ts
if (currentDeal.type === 'recipe') {
  router.push({ pathname: '/checklist/[recipeId]', params: { recipeId: ... } });
} else {
  router.push({ pathname: '/rescue/[mealId]', params: { mealId: ... } });
}
```

When `currentDeal.type === 'drm'`, it pushes to `/rescue/[mealId]`. The rescue checklist screen works exactly as today — steps, progress, Done → Tonight.

---

## How Back Exits

### Destination: skip DRM, resume dealing (stay on `/deal`)

**Not `/tonight`.** The user started a Deal session and is partway through. Exiting DRM should return them to card dealing, not abort the session.

**Implementation:** The back button's `onPress` handler checks `currentDeal.type`:

```ts
// In deal.tsx back button:
onPress={() => {
  if (currentDeal?.type === 'drm') {
    // Skip the DRM card and deal the next regular recipe
    dealNextCard();
  } else {
    router.replace('/tonight');
  }
}}
```

When `currentDeal.type === 'drm'`:
- `dealNextCard()` is called directly (no navigation)
- `drmInserted` is already `true` (set when DRM triggered), so DRM won't re-trigger
- `dealNextCard()` picks the next regular recipe from the candidate pool
- If no recipes remain, the empty state renders with "Reset Tonight" / "Try a different mode"

**Why `dealNextCard()` and not `router.replace`:**
- We're already on the Deal screen. No route change needed.
- `dealNextCard()` handles all state updates: `setCurrentDeal`, `setWhyText`, `setOverlayLevel(0)`, `setCardKey`
- The DRM meal is NOT added to `dealHistory` (user didn't engage with it), so it could reappear in a future session

**Why not `router.replace('/tonight')`:**
- Too aggressive. The user may have swiped 2 cards and wants to continue.
- `/tonight` aborts the session. The back button on a non-DRM card already goes to Tonight — that's the "exit session" action.
- On a DRM card, back means "I don't want the rescue, keep dealing."

---

## deal.tsx Changes (Summary)

### DRM trigger in `dealNextCard()`

Current:
```ts
if (triggerDrm) {
  const drmMeal = pickDrmMeal(excludeAllergens, dealHistory);
  if (drmMeal) {
    setCurrentDealId(drmMeal.id);
    setDrmInserted(true);
    setIsLoading(false);
    router.replace({ pathname: '/rescue/[mealId]', params: { mealId: drmMeal.id } });
    return;
  }
}
```

Proposed:
```ts
if (triggerDrm) {
  const drmMeal = pickDrmMeal(excludeAllergens, dealHistory);
  if (drmMeal) {
    setCurrentDeal({ type: 'drm', data: drmMeal });
    setWhyText(getRandomWhy(drmMeal));
    setCurrentDealId(drmMeal.id);
    setDrmInserted(true);
    setOverlayLevel(0);
    setNoMoreRecipes(false);
    setIsLoading(false);
    setCardKey(k => k + 1);
    return;
  }
}
```

No navigation. The DRM meal renders as a card in the existing Deal UI.

### Card render

Current: only renders `DecisionCard` for `currentDeal.type === 'recipe'`. DRM comment says "autopilot navigates directly."

Proposed: render `DecisionCard` for both types:

```tsx
{currentDeal && (
  <DecisionCard
    recipe={currentDeal.data}
    whyText={whyText}
    variant={currentDeal.type === 'drm' ? 'rescue' : 'default'}
    swipeDisabled={currentDeal.type === 'drm'}
    onAccept={handleAccept}
    onPass={handlePass}
    overlayLevel={overlayLevel}
    onOverlayLevelChange={handleOverlayLevelChange}
    externalLiftY={overlayLiftY}
    modeLabel={modeLabel}
    expanded={overlayLevel > 0}
    onToggleExpand={handleToggleExpand}
  />
)}
```

### Back button

Current: always `router.replace('/tonight')`.

Proposed: if DRM card, call `dealNextCard()` to skip. Otherwise, exit to Tonight.

---

## Files to Touch

| File | Change | Lines (est.) |
|------|--------|-------------|
| `components/DecisionCard.tsx` | Add `swipeDisabled?: boolean` prop. Conditional gesture composition. | ~8 |
| `app/deal.tsx` | DRM trigger: set currentDeal instead of router.replace. Render DecisionCard for both types. Back button: conditional behavior. Remove old DRM comment. | ~20 |

**Total: ~28 lines changed**

---

## Acceptance Criteria

1. DRM triggers (3 passes or 45s) → full-screen hero card appears with "Rescue" badge, warm scrim, amber CTA
2. Card cannot be swiped left or right (no horizontal pan gesture)
3. Glass overlay handle still works (drag up for ingredients)
4. "Let's do this" → navigates to rescue checklist (`/rescue/[mealId]`)
5. Back chevron (top-left) → skips DRM, deals next regular recipe
6. If no more recipes after DRM skip → empty state renders
7. DRM meal is NOT added to deal history when skipped via back
8. Normal (non-DRM) dealing is completely unaffected
9. Idle affordance works on DRM card (nudge + glass lift)
10. `handlePass` is never called on a DRM card (no swipe = no pass)

---

## Manual Test Checklist

| # | Step | Expected |
|---|------|----------|
| 1 | Open Deal, swipe 3 cards to pass | DRM triggers → rescue hero card appears |
| 2 | Try swiping left/right on rescue card | Card doesn't move |
| 3 | Drag glass handle up | Ingredients expand |
| 4 | Tap "Let's do this" | Navigates to rescue checklist |
| 5 | Complete checklist → Done | Returns to Tonight |
| 6 | Open Deal again, trigger DRM, tap back chevron | DRM card disappears, next regular recipe appears |
| 7 | If no recipes left after DRM skip | Empty state with "Reset Tonight" |
| 8 | Open Deal, swipe 2 cards (no DRM) | Normal recipe cards, swipeable, no rescue badge |
| 9 | Wait 45s without swiping | DRM triggers by timer → rescue card |
| 10 | Idle on rescue card for 7s | Idle nudge + glass lift still fires |
