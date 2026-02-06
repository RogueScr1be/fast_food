# Phase 1: Editorial Magic — Exploration Report

**Version:** 1.0.1 Editorial-First
**Date:** 2026-02-06
**Scope:** Deal card experience only. No navigation, tab, profile, or settings changes.

---

## 1. Impacted Files

### Primary (must change)

| File | Purpose in Phase 1 |
|------|-------------------|
| `components/DecisionCard.tsx` | Becomes the full-screen editorial card. Currently a bounded card (max 380px wide, hero clamped 160–240px) with swipe hints, rotation, PanResponder gestures, meta row, accept CTA. Must be rewritten to edge-to-edge layout with glass overlay system. |
| `components/RescueCard.tsx` | DRM variant of DecisionCard. Same structural changes apply (full-screen, glass overlay). Shares ~80% of logic with DecisionCard — consider extracting a shared base or merging. |
| `components/IngredientsTray.tsx` | Currently a height-animated list below the card body. Must become part of the **glass overlay** at ~50% expansion state. Will need a new layout position (overlaying the hero) and BlurView backdrop. |
| `components/LockedTransition.tsx` | Current "Locked." overlay becomes the **glass overlay system** at 100% expansion (the checklist confirmation state). The white fade-over is replaced by glass lifting to full, then routing. This component's role changes fundamentally. |
| `app/deal.tsx` | Deal screen orchestrator. Must remove: header chrome (back arrow, counter subtitle "5 more · 2 passed"), footer swipe hint text, allergy modal trigger icon from header. Must add: idle detection timer (~7s), glass overlay state management, shared-element transition entry hooks. |
| `app/(tabs)/tonight.tsx` | Launcher surface for the shared-element transition. Mode tiles become the "box" origin for the box-to-full animation. Navigation call (`router.push('/deal')`) must be replaced with a shared-element transition trigger. |
| `lib/ui/theme.ts` | Must add: glass overlay tokens (blur radius, overlay tints, amber/warning color for allergy indicator). May need a `colors.warningAmber` and `colors.glassBackground` semantic token. |

### Secondary (touched but not rewritten)

| File | Purpose in Phase 1 |
|------|-------------------|
| `app/_layout.tsx` | Stack screen options for `/deal` may need `animation: 'none'` or custom `transitionSpec` to allow the shared-element transition to own the animation instead of the Expo Router stack. |
| `lib/seeds/types.ts` | No schema change needed. The existing `allergens: AllergenTag[]` field on RecipeSeed/DrmSeed is sufficient for the allergy indicator. |
| `lib/seeds/images.ts` | No change needed. `getImageSource()` already returns require()'d images suitable for full-screen rendering. |
| `lib/state/ffSession.ts` | No new persisted fields needed. Idle timer is ephemeral and belongs in component state (see Section 3). |
| `components/WhyWhisper.tsx` | May be repositioned inside the glass overlay at ~50% state. No logic change, only container context changes. |

### New Files (likely)

| File | Purpose |
|------|---------|
| `components/GlassOverlay.tsx` | New component. Manages the three expansion states (mode label, ingredients ~50%, checklist 100%). Uses `expo-blur` BlurView + animated height. |
| `components/AllergyIndicator.tsx` | New component. Hexagonal amber badge positioned bottom-right of the card. Reads allergen data from the current recipe. |
| `hooks/useIdleAffordance.ts` | New hook. Encapsulates the 7-second idle timer logic + produces animated values for the card shift and partial glass lift. |

---

## 2. Current vs Target Flow

### Current Entry Flow

```
Tonight Screen
  ├── User taps mode tile (e.g. "Fancy")
  │     └── setSelectedMode('fancy')
  │     └── resetTonight()
  │     └── Animated.timing(progressAnim) → 150ms
  │     └── router.push('/deal')        ← hard route jump
  │
  └── OR taps "Decide for Me"
        └── same flow, random mode

Deal Screen mounts:
  ├── SafeAreaView with header (back, title, counter, allergy icon)
  ├── DecisionCard (centered, max 380px, hero 160–240px)
  ├── Footer ("Swipe to pass · Tap for ingredients")
  └── LockedTransition overlay (shown on accept)
```

**Key observation:** The `router.push('/deal')` inside Tonight creates a new Stack.Screen entry. The deal route is registered with `animation: 'slide_from_right'`. There is no shared visual element between the Tonight tile and the Deal card — it's a complete screen replacement.

### Target Entry Flow

```
Tonight Screen
  ├── User taps mode tile
  │     └── Mode tile starts "box-to-full" animation
  │     └── Tile expands to fill screen
  │     └── Image crossfades into the first deal card's hero
  │     └── Route transition completes seamlessly
  │
  └── Deal card is now full-screen, edge-to-edge imagery

Deal Card (full screen):
  ├── Edge-to-edge hero image (100% viewport)
  ├── Glass overlay (bottom, collapsed by default)
  │     └── State 0: Mode label pill only
  │     └── State 1 (~50%): Ingredients visible
  │     └── State 2 (100%): Checklist/confirm (replaces LockedTransition)
  ├── Allergy indicator (bottom-right hexagon, amber)
  ├── No header chrome, no counters, no footer hint
  └── Passive affordance kicks in after ~7s idle
```

### Where Shared-Element Transition Must Hook In

1. **Origin:** `app/(tabs)/tonight.tsx` — the `ModeButton` component (currently 110px square tiles with icon + label). Each tile needs a `sharedTransitionTag` or equivalent identifier.

2. **Destination:** `app/deal.tsx` — the full-screen card. The hero image of the first dealt recipe must be the transition target.

3. **Mechanism options:**
   - **Option A: `react-native-reanimated` Shared Element Transitions** — Reanimated 3 has experimental `SharedTransition` API. Already in `package.json` (`react-native-reanimated: ~3.16.1`). Works with `react-native-screens` (also present). This is the cleanest path.
   - **Option B: Custom animated overlay** — Render the tile as an absolutely positioned View, animate its bounds to full-screen, then unmount and reveal the deal screen beneath. More control, more code, no experimental APIs.
   - **Option C: Expo Router custom transition** — Override the Stack screen transition for `/deal` with a custom animation. Doesn't give true shared-element continuity but can approximate it.

4. **Key constraint:** The Tonight screen lives in `(tabs)` (a tab navigator), while `/deal` is a Stack screen at root level. Shared-element transitions across navigator boundaries (tabs → stack) require either:
   - A portal/overlay approach (Option B), or
   - Careful use of Reanimated's SharedTransition with `react-native-screens` (Option A), which has known limitations across navigators.

### Where Idle Detection Logic Should Live

**In the Deal screen (`app/deal.tsx`)**, as a local hook:

```
useIdleAffordance(isActive: boolean) → {
  cardShiftX: Animated.Value,    // subtle horizontal shift
  glassLiftY: Animated.Value,    // partial glass lift
  isIdle: boolean,               // whether idle state triggered
  resetIdle: () => void          // call on any user gesture
}
```

The timer resets on:
- Any swipe gesture start (`onPanResponderGrant`)
- Any tap (expand/accept)
- New card dealt

The 7-second threshold is a constant. No persistence needed — it's purely ephemeral UI behavior.

---

## 3. State Ownership

### Overlay Expansion State

| State | Owner | Rationale |
|-------|-------|-----------|
| `overlayLevel: 0 \| 1 \| 2` | Local component state in `GlassOverlay.tsx` (or `DecisionCard.tsx`) | Purely visual, no cross-screen sharing needed. Driven by gestures (vertical pan) and programmatic triggers (accept → level 2). |
| Animated position values | `useRef(new Animated.Value(...))` inside the component | Must survive re-renders but not persist. Native driver compatible for 60fps. |

**Current state to remap:**
- `expanded` (boolean in `deal.tsx`) → becomes `overlayLevel` (0/1/2 in card or glass component)
- `showLocked` (boolean in `deal.tsx`) → replaced by `overlayLevel === 2`

### Idle Timing State

| State | Owner | Rationale |
|-------|-------|-----------|
| `idleTimerRef` | `useRef` in custom hook | Timeout reference, no render impact |
| `isIdle` | Local state in hook | Triggers animation, resets on interaction |
| `cardShiftX`, `glassLiftY` | `Animated.Value` refs in hook | Animated values driven by idle trigger |

**Does NOT belong in `ffSession.ts`.** This is UI-only ephemeral state with no persistence or cross-screen relevance.

### Allergy Visibility State

| State | Owner | Rationale |
|-------|-------|-----------|
| `hasActiveAllergens` | Derived from `recipe.allergens` intersected with `getExcludeAllergens()` | Read-only. If the current recipe contains any allergens the user hasn't excluded, show the indicator. |
| `currentRecipeAllergens` | Derived from `currentDeal.data.allergens` in `deal.tsx` | Already available. No new state needed. |

**The allergy indicator is stateless** — it reads existing data. The only question is whether to show it when:
- (a) the recipe HAS allergens (informational), or
- (b) the recipe has allergens the user hasn't excluded (warning).

Recommendation: Show amber indicator when the recipe contains ANY allergens (option a), regardless of exclusions. This is informational and helps users who haven't set exclusions yet.

---

## 4. Technical Risks

### 4.1 Animation Conflicts — HIGH RISK

**Problem:** The current `DecisionCard` uses `PanResponder` + RN core `Animated` for horizontal swipe. The glass overlay needs vertical pan gestures. Combining two gesture axes on the same view creates conflicts.

**Specifics:**
- `PanResponder.onMoveShouldSetPanResponder` currently captures when `|dx| > 10 && |dy| < 30`. A vertical glass-pull gesture would be blocked.
- Nesting `PanResponder` instances (one for swipe, one for glass) requires careful responder negotiation.

**Mitigation:**
- Migrate from `PanResponder` to `react-native-gesture-handler` `Gesture.Pan()` composable API. RNGH is already in `package.json`. The composable gesture API supports simultaneous + exclusive gestures natively.
- Horizontal pan → card dismiss. Vertical pan (up) → glass overlay expand. RNGH handles the arbitration.

### 4.2 Shared-Element Transition Across Navigators — HIGH RISK

**Problem:** Tonight lives in a `Tabs` navigator; Deal is a root `Stack` screen. Shared-element transitions across navigator types are fragile.

**Specifics:**
- Reanimated's `SharedTransition` requires both screens to be in the same native stack (or have explicit `sharedTransitionTag` support on the screen components).
- Expo Router's `Stack.Screen` with `react-native-screens` may not propagate shared element tags from a tab child to a stack child.

**Mitigation:**
- Prefer Option B (custom animated overlay): Measure tile position with `onLayout`, animate an absolutely-positioned Image clone from tile bounds to full-screen, then complete the route push behind the animation. This is navigator-agnostic.
- Phase the work: Ship full-screen card + glass overlay first, shared-element transition second.

### 4.3 Performance on Low-End Devices — MEDIUM RISK

**Problem:** Full-screen blur (via `expo-blur`) is GPU-intensive. Animating blur radius or overlay height at 60fps on older Android devices can drop frames.

**Specifics:**
- `expo-blur` wraps native `BlurView` on iOS (performant) but uses a CSS/fallback approach on web and older Android.
- Animating the `intensity` prop of BlurView is not natively driven — it requires JS thread involvement.

**Mitigation:**
- Use a fixed blur intensity (don't animate it). Animate only the overlay height/translate, which CAN use native driver.
- On Android, fall back to a semi-transparent dark overlay (`rgba(0,0,0,0.6)`) instead of blur. Feature-detect or use Platform.select.
- Pre-render the blur layer; show/hide with opacity animation (native driver safe).

### 4.4 Image Loading for Full-Screen — LOW RISK

**Problem:** Current images are bundled via `require()` at reasonable resolution. Going edge-to-edge means they fill the entire viewport.

**Specifics:**
- Images are ~1024x1024 JPG, < 200KB. On a 1080p phone, they'll upscale slightly but should look acceptable.
- On tablets or large screens, pixelation could be visible.

**Mitigation:**
- For MVP, accept current image quality. Note for post-Phase 1: source @2x/@3x variants or use `expo-image` for progressive loading.
- `resizeMode="cover"` already handles aspect ratio correctly.

### 4.5 Gesture vs Tap Ambiguity — MEDIUM RISK

**Problem:** Currently, tap on the hero toggles ingredients tray. With the glass overlay, a vertical swipe-up gesture also expands the overlay. Distinguishing "tap" from "short swipe" requires careful gesture thresholds.

**Mitigation:**
- Use RNGH `Gesture.Tap()` for tap detection (separate from `Gesture.Pan()`). RNGH automatically resolves tap vs pan with built-in thresholds.
- Remove the explicit `onToggleExpand` tap target. Instead, let vertical pan on the glass handle be the primary expand affordance, and tap can either be removed or used for a small toggle.

---

## 5. Implementation Recommendation

### Approach: Bottom-Up, Card-First

**Phase 1a — Full-Screen Card + Chrome Removal (1–2 days)**
1. Rework `DecisionCard` to be full-screen (remove bounded card, remove border-radius on outer shell, hero fills viewport).
2. Remove from `deal.tsx`: header row, counter subtitle, footer hint text, allergy icon in header.
3. Remove from `DecisionCard`: hint labels ("Not feeling it" / "Doesn't fit"), card shadow/elevation (edge-to-edge needs no shadow).
4. Apply same changes to `RescueCard` (or merge them).

**Phase 1b — Glass Overlay (2–3 days)**
1. Create `GlassOverlay.tsx`: vertical-pan-driven overlay with three states (collapsed/50%/100%).
2. Integrate `expo-blur` (iOS) with dark-tint fallback (Android).
3. Migrate swipe gestures from `PanResponder` to `react-native-gesture-handler` composable API to resolve horizontal/vertical conflict.
4. Move mode label, ingredients, and accept CTA into the glass overlay at appropriate expansion levels.
5. Remove standalone `IngredientsTray` usage. The glass overlay subsumes it.
6. Remove `LockedTransition.tsx` — its role (post-accept state) is handled by glass expanding to 100%.

**Phase 1c — Passive Affordance Onboarding (0.5–1 day)**
1. Create `useIdleAffordance` hook with 7-second timer.
2. On idle: animate `translateX` (small horizontal shift, ~8–12px) + `translateY` on glass overlay (partial lift, ~40px).
3. Reset on any user interaction.
4. No text, no tooltip, no modal. Motion only.

**Phase 1d — Allergy Indicator (0.5 day)**
1. Create `AllergyIndicator.tsx`: hexagonal shape, amber fill (`#F59E0B` from `colors.warning`), positioned absolute bottom-right.
2. Show when current recipe has allergens (regardless of user exclusions — informational).
3. Tap could open the existing allergy modal (reuse from `deal.tsx`, move to bottom sheet).

**Phase 1e — Shared-Element Transition (1–2 days)**
1. Implement custom animated overlay approach (Option B): capture tile bounds → animate clone to full-screen → push route behind animation.
2. Wire into Tonight's `handleModeSelect`.
3. Modify `app/_layout.tsx` to suppress default slide animation for `/deal` when shared-element is active.

### Total Estimated Effort: 5–8 days

### Key Decision Points (Stop-and-Ask)

Before implementation, the following need explicit sign-off:

1. **Glass overlay gesture model:** Should vertical swipe on the image itself expand glass, or only on a glass "handle" region?
2. **Accept action location:** Currently "Let's do this" is a button below the card. In glass model, does it live inside the glass at all times, or only appear at ~50% expansion?
3. **Shared-element source:** Which visual element on the Tonight screen is the animation origin? The mode tile icon? The entire tile? A preview image (currently none exists on tiles)?
4. **Allergy indicator tap behavior:** Open allergy modal, or just informational (no action)?
5. **RescueCard merge or separate:** Should DecisionCard and RescueCard be merged into one component with a `variant` prop, or remain separate?

---

## Dependencies Noted (Non-Goals, But Technically Coupled)

| Non-Goal | Coupling |
|----------|----------|
| DRM logic | DRM trigger logic (`ffSession.ts`) is unaffected. But the RescueCard visual changes mirror DecisionCard changes. If DecisionCard goes full-screen, RescueCard must too, or DRM insertion looks jarring. |
| Checklist animations | Glass overlay at 100% replaces LockedTransition. The route push to `/checklist/[recipeId]` still happens, but the entry animation changes. The checklist screen itself is untouched. |
| Tonight hub layout | The shared-element transition originates from Tonight tiles. The tile layout/styling may need minor changes (e.g., adding `onLayout` measurement, setting a `sharedTransitionTag`). The overall Tonight layout/copy is NOT redesigned. |

---

## Summary

A developer starting Phase 1 implementation should touch exactly these areas:

1. **`components/DecisionCard.tsx`** — Rewrite to full-screen, integrate glass overlay, migrate to RNGH
2. **`components/RescueCard.tsx`** — Mirror DecisionCard changes
3. **`app/deal.tsx`** — Strip chrome, add idle timer, manage glass state
4. **`app/(tabs)/tonight.tsx`** — Add shared-element transition origin (minimal touch)
5. **`app/_layout.tsx`** — Suppress default animation for `/deal` route
6. **`lib/ui/theme.ts`** — Add glass/amber tokens
7. **New: `components/GlassOverlay.tsx`** — The overlay system
8. **New: `components/AllergyIndicator.tsx`** — Hexagon badge
9. **New: `hooks/useIdleAffordance.ts`** — Idle timer + animation values
10. **Retire: `components/LockedTransition.tsx`** — Subsumed by glass at 100%

No changes to: seed data schema, session state persistence, DRM trigger logic, checklist screen, rescue screen, profile screen, or navigation structure.
