# Phase 2: Relief Flow — Exploration Report

**Date:** 2026-02-06
**Scope:** Tab removal, Tonight hub redesign, Profile relocation, DRM autopilot.
**Non-goals:** Checklist micro-interactions, feedback prompts, sharing, theming.

---

## 1. Impacted Files

### Phase 2.1 — Tonight Hub + Navigation Restructure

| File | Action | Purpose |
|------|--------|---------|
| `app/(tabs)/_layout.tsx` | **Rewrite or delete** | Remove Tabs navigator entirely. Tonight becomes a plain Stack screen. |
| `app/(tabs)/tonight.tsx` | **Move to `app/tonight.tsx`** | Promote from tab child to root stack screen. Update copy, layout, CTA. |
| `app/(tabs)/profile.tsx` | **Move to `app/profile.tsx`** | Promote from tab child to root stack screen. Accessed via icon on Tonight. |
| `app/_layout.tsx` | **Modify** | Remove `(tabs)` Stack.Screen. Add `tonight` and `profile` as root stack screens. Update index redirect. |
| `app/index.tsx` | **Modify** | Change redirect from `/(tabs)/tonight` to `/tonight`. |
| `app/deal.tsx` | **Modify (minimal)** | Back button: `router.replace('/tonight')` instead of `router.replace('/(tabs)/tonight')`. |
| `app/checklist/[recipeId].tsx` | **Modify (minimal)** | Done/back routes: replace `/(tabs)/tonight` with `/tonight`. |
| `app/rescue/[mealId].tsx` | **Modify (minimal)** | Done/back routes: replace `/(tabs)/tonight` with `/tonight`. |

### Phase 2.2 — DRM Autopilot

| File | Action | Purpose |
|------|--------|---------|
| `app/deal.tsx` | **Modify** | When DRM triggers, skip card display and navigate directly to `/rescue/[mealId]`. |
| `app/rescue/[mealId].tsx` | **Modify** | Back button goes to `/deal` (return to card dealing), not Tonight. Done still goes to `/tonight`. |

### Files NOT touched

- `components/DecisionCard.tsx` — no changes
- `components/GlassOverlay.tsx` — no changes
- `components/AllergyIndicator.tsx` — no changes
- `hooks/useIdleAffordance.ts` — no changes
- `lib/state/ffSession.ts` — no changes (DRM trigger logic is unchanged, only the response to it changes in deal.tsx)
- `lib/seeds/*` — no changes
- `lib/ui/theme.ts` — no changes

---

## 2. Current vs Target Navigation Tree

### Current

```
app/
├── _layout.tsx          (Root Stack)
├── index.tsx            (Redirect → /(tabs)/tonight)
├── (tabs)/
│   ├── _layout.tsx      (Tab Navigator: Tonight + Profile)
│   ├── tonight.tsx      (Tab 0: mode select)
│   └── profile.tsx      (Tab 1: settings)
├── deal.tsx             (Stack screen)
├── checklist/[recipeId] (Stack screen)
└── rescue/[mealId]      (Stack screen)
```

**Navigation flow:**
```
[Tab: Tonight] ──push──→ [Deal] ──push──→ [Checklist]
                                 ──push──→ [Rescue]
[Tab: Profile] (separate tab)
```

**Back stack:** Tonight (tab) → Deal → Checklist/Rescue. Tab bar visible on Tonight+Profile only.

### Target

```
app/
├── _layout.tsx          (Root Stack — no tabs)
├── index.tsx            (Redirect → /tonight)
├── tonight.tsx          (Stack screen: hub)
├── profile.tsx          (Stack screen: settings)
├── deal.tsx             (Stack screen)
├── checklist/[recipeId] (Stack screen)
└── rescue/[mealId]      (Stack screen)
```

**Navigation flow:**
```
[Tonight] ──push──→ [Deal] ──push──→ [Checklist]
    │                  │
    │                  └── DRM autopilot ──replace──→ [Rescue]
    │
    └── push → [Profile]
```

**Back stack:** Tonight → Deal → Checklist. No tab bar anywhere. Profile is a push from Tonight (back = Tonight).

---

## 3. Exact Routing / Back-Stack Approach

### Tonight → Deal (unchanged from Phase 1.4)
- `router.push('/deal')` — inside the box-to-full transition overlay
- Deal back button: `router.replace('/tonight')` (deterministic)

### Tonight → Profile (new)
- Top-right icon on Tonight: `router.push('/profile')`
- Profile back: `router.back()` (single stack level, deterministic) or `router.replace('/tonight')` if paranoid

### Deal → Checklist (recipe accept, unchanged)
- `router.push({ pathname: '/checklist/[recipeId]', params: { recipeId } })`
- Checklist back: `router.back()` (returns to Deal)
- Checklist done: `router.replace('/tonight')` (resets stack)

### Deal → Rescue (DRM autopilot, changed)
- **Current:** DRM triggers → shows RescueCard in deal → user taps "Let's do this" → `router.push('/rescue/[mealId]')`
- **Target:** DRM triggers → `router.replace({ pathname: '/rescue/[mealId]', params: { mealId } })` — bypasses card swiping entirely
- `router.replace` (not push) because the deal screen should not remain in the back stack when DRM auto-pilots

### Rescue → back (changed)
- **Current:** `router.back()` → returns to Deal (which shows the rescue card user already accepted)
- **Target:** Back button: `router.replace('/deal')` — returns to card dealing (not the rescued card). This re-enters deal and deals the next card.
- Done: `router.replace('/tonight')` — resets entire flow

### Profile → back
- `router.back()` → returns to Tonight

### Key routing principles
- `router.replace` for "reset to a known state" (Done → Tonight, DRM autopilot → Rescue)
- `router.push` for "add to stack" (Tonight → Deal, Deal → Checklist)
- `router.back()` only when the back stack is guaranteed single-level and deterministic
- Never use `router.back()` across more than one level

---

## 4. Tonight Copy/Layout Changes

### Current → Target

| Element | Current | Target |
|---------|---------|--------|
| Title | "Tonight" | "Time to Eat" |
| Subtitle | "What kind of dinner?" | Remove entirely |
| Mode buttons | Horizontal row, 110px square tiles | Vertical stack, full-width buttons |
| CTA | "Decide for Me" | "Choose for Me" |
| Allergy link | Below mode buttons | Keep, below vertical mode stack |
| Profile access | Bottom tab | Top-right icon (User icon) |
| Progress bar | Above CTA | Remove (no longer needed without mode select → CTA two-step) |
| Hint text | "Ready for fancy" / "Tap a mode..." | Remove |

### Layout structure (target)

```
┌─────────────────────────┐
│ [safe area top]         │
│                         │
│  Time to Eat    [👤]    │  ← title + profile icon
│                         │
│  ┌─────────────────┐   │
│  │  ✨  Fancy      │   │  ← full-width button, vertical stack
│  └─────────────────┘   │
│  ┌─────────────────┐   │
│  │  🍴  Easy       │   │
│  └─────────────────┘   │
│  ┌─────────────────┐   │
│  │  🪙  Cheap      │   │
│  └─────────────────┘   │
│                         │
│  I'm allergic           │  ← allergy link
│                         │
│  ┌─────────────────┐   │
│  │  Choose for Me  │   │  ← CTA, extends to bottom safe area
│  └─────────────────┘   │
│ [safe area bottom]      │
└─────────────────────────┘
```

Note: icons above are placeholders for Lucide icons, not actual emojis (per design constitution).

---

## 5. DRM Autopilot Details

### Current DRM flow
1. User swipes past 3 cards (or 45s elapses)
2. `dealNextCard()` detects DRM trigger
3. A `RescueCard` is dealt as the next card (user sees it, can swipe or accept)
4. User taps "Let's do this" → navigates to `/rescue/[mealId]`

### Target DRM flow
1. User swipes past 3 cards (or 45s elapses)
2. `dealNextCard()` detects DRM trigger
3. Pick DRM meal via `pickDrmMeal()`
4. **Immediately** `router.replace({ pathname: '/rescue/[mealId]', params: { mealId } })` — no card shown, no swiping
5. User lands directly in rescue checklist
6. Back → `router.replace('/deal')` (re-enters dealing, cards resume post-DRM)
7. Done → `router.replace('/tonight')`

### State implications
- `setDrmInserted(true)` still fires before navigation (prevents re-trigger)
- `setCurrentDealId(drmMeal.id)` still fires (telemetry)
- No need to `setCurrentDeal({ type: 'drm', data: drmMeal })` since we're not rendering the rescue card in deal.tsx
- The `RescueCard` component import in deal.tsx can be removed (or left for backward compat)
- `app/rescue/[mealId].tsx` already handles meal lookup via `getDrmById(mealId)` — no change needed there

---

## 6. Risks + Recommended Sequencing

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Moving files out of `(tabs)/` may break existing deep links or redirects | Medium | Search all files for `/(tabs)/tonight` and `/(tabs)/profile` references and update. The index.tsx redirect is the primary one. |
| Box-to-full transition in tonight.tsx uses measureInWindow — after file move, refs and layout must still work | Low | The transition logic is self-contained; file location doesn't affect it. |
| Removing tabs changes the back behavior for web (browser back button) | Medium | Use `router.replace` for deterministic navigation. Test web back button explicitly. |
| DRM autopilot replaces deal screen — if user presses back from rescue, they need to re-enter deal cleanly | Medium | Use `router.replace('/deal')` from rescue back button (not `router.back()`). Deal re-initializes via `dealNextCard()` on mount. Verify `didInitRef` guard doesn't block re-init. |
| `didInitRef` in deal.tsx prevents re-initialization on re-mount | High | Currently `didInitRef` guards against React 18 StrictMode double-mount. When navigating back to deal via `router.replace`, it's a fresh mount — but the ref persists if deal.tsx is cached. Must reset `didInitRef` on unmount or use a different guard pattern. |

### Recommended Sequencing

**Phase 2.1 — Tonight Hub + Navigation (do first)**

1. Move `app/(tabs)/tonight.tsx` → `app/tonight.tsx`
2. Move `app/(tabs)/profile.tsx` → `app/profile.tsx`
3. Delete or empty `app/(tabs)/_layout.tsx`
4. Update `app/_layout.tsx`: remove `(tabs)` screen, add `tonight` and `profile` screens
5. Update `app/index.tsx`: redirect to `/tonight`
6. Update all `/(tabs)/tonight` references to `/tonight` in deal.tsx, checklist, rescue
7. Add Profile icon (top-right) to tonight.tsx
8. Update Tonight copy: "Time to Eat", remove subtitle, "Choose for Me"
9. Restructure mode buttons to vertical stack
10. CTA extends to bottom safe area

**Phase 2.2 — DRM Autopilot (do second, after nav is stable)**

1. In `deal.tsx` `dealNextCard()`: when DRM triggers, navigate directly to rescue instead of setting currentDeal
2. Update `app/rescue/[mealId].tsx`: back button uses `router.replace('/deal')` instead of `router.back()`
3. Verify `didInitRef` allows deal re-initialization when returning from rescue
4. Remove `RescueCard` import from deal.tsx if no longer needed
5. Test full flow: swipe 3 → auto-rescue → back → resume dealing

---

## 7. Questions to Resolve Before Execution

1. **Mode button style in vertical stack:** Should they be tall cards (like current tiles but full-width) or compact horizontal rows (icon left, text right, like a list)?

2. **"Choose for Me" CTA behavior:** Same as current "Decide for Me" (random mode if none selected, then deal)? Or does tapping a mode button ALSO trigger the deal (like current), with "Choose for Me" as a separate random-only path?

3. **Profile icon style:** Same glass-circle treatment as the deal back button? Or a more visible icon?

4. **DRM autopilot "back" from rescue:** Should "back" return to deal (resume swiping) or to Tonight (abandon session)? The spec says "checklist → rescue card → Tonight" but the rescue card is being removed. Clarify: rescue checklist back → deal (resume) or → tonight (exit)?

5. **Box-to-full transition preservation:** The vertical mode buttons change the transition origin geometry. The `measureInWindow` approach still works — the clone just starts taller/wider. Confirm this is acceptable.
