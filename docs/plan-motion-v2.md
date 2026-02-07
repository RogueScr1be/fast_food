# Motion v2 — Invisible Mastery Plan

**Status:** Plan only. No code.

---

## A) Current Motion/Transition Inventory

### Tonight clone expansion (`app/tonight.tsx`)
- **Mechanism:** 7 Reanimated shared values (x, y, w, h, radius, opacity, scrimOpacity)
- **Clone:** Absolute-positioned `Animated.View` matching selected tile (blue bg, white text)
- **Timing:** `withTiming(target, { duration: 350, easing: bezier(0.25,0.1,0.25,1) })`
- **Nav fires:** setTimeout at 290ms (~83% of expansion)
- **Fade out:** 150ms after nav push
- **Cancel:** None. Tap lock prevents new taps; no mid-transition cancel.
- **Cleanup:** mountedRef guard + timer clearing + shared value reset

### Deal card swipe (`components/DecisionCard.tsx`)
- **Mechanism:** Reanimated `swipeX` shared value + RNGH `Gesture.Pan()`
- **Slide out:** `withTiming(±screenW + 100, { duration: 250 })` then `runOnJS(firePass)`
- **Spring back:** `withSpring(0, { damping: 15, stiffness: 150 })`
- **Cancel:** Spring back on release below threshold

### Glass overlay drag (`components/GlassOverlay.tsx`)
- **Mechanism:** Reanimated `translateY` + RNGH `Gesture.Pan()` (handle-only)
- **During drag:** Direct follow (clamp, no spring)
- **On release:** `withSpring(snapPoint, { damping: 20, stiffness: 200, mass: 0.5 })`
- **Thresholds:** `activeOffsetY([-8, 8])`, `failOffsetX([-15, 15])`

### Deal accept CTA path (`app/deal.tsx` → `handleAccept`)
- **Mechanism:** Plain `router.push('/checklist/[recipeId]')` — no transition animation
- **Current feel:** Stack `slide_from_right` (Expo Router default for the route)

### Checklist hero image (`app/checklist/[recipeId].tsx`)
- **Layout:** 40×40px thumbnail (`headerThumb`), `borderRadius: radii.sm (8)`, in a header row with back arrow and meal name
- **Position:** Top of screen, inside `SafeAreaView`, below `ThinProgressBar`

### Rescue hero image (`app/rescue/[mealId].tsx`)
- **Layout:** 56×56px thumbnail, `borderRadius: radii.md (12)`, in header with rescue badge + meta text
- **Position:** Same structural location as checklist

---

## B) Motion Token System

### File: `lib/ui/motion.ts` + `docs/motion.md`

Define four motion profiles as named spring/timing configs:

#### Latex (snappy spring) — buttons, micro confirms
```
damping: 22
stiffness: 400
mass: 0.8
```
Target feel: ~150ms to settle. Tight, decisive. No wobble.
**Used in:** Button press scale feedback, checkbox orbit settle, card spring-back on sub-threshold swipe.

#### Vellum (natural spring) — panels, overlays
```
damping: 20
stiffness: 200
mass: 0.5
```
Target feel: ~250ms to settle. Smooth, natural hand.
**Used in:** GlassOverlay level snapping (already using these values in `glass.*`), feedback prompt entrance.

#### Oak (hero spring) — large surface transitions
```
damping: 28
stiffness: 180
mass: 1.0
```
Target feel: ~380ms to settle. Weighty, deliberate. No overshoot.
**Used in:** Tonight→Deal hero expansion, Deal→Checklist reverse-box, DRM card entrance.
NOTE: The current Tonight expansion uses `withTiming(350ms, bezier)` not spring. Migration to Oak spring is optional but recommended for interruptibility (springs can be cancelled mid-flight; timing curves cannot reverse naturally).

#### Whisper (timing curve) — opacity, scrim, text fades
```
duration: 180ms
easing: Easing.out(Easing.ease)
```
**Used in:** Clone fade-out, scrim fade-in/out, overlay opacity transitions, "Great Job!" reveal.

### Enforcement
- Export as named configs from `lib/ui/motion.ts`
- CLAUDE.md rule: "All new animations must use a named motion profile. Ad-hoc spring/timing constants are not allowed."
- Existing inline constants gradually migrated (not a blocking prerequisite)

### Documentation: `docs/motion.md`
- Table of profiles with name, params, target feel, usage
- Rule: "If it moves, it uses a profile. If it fades, it uses Whisper."

---

## C) Inertia Tuning (M1)

### Current twitchy spots

| Surface | Current thresholds | Risk | Proposed tuning |
|---------|-------------------|------|-----------------|
| Glass overlay drag | `activeOffsetY([-8,8])` | 8px is tight on trembly thumbs; accidental activation | Increase to `[-12, 12]` |
| Glass overlay snap | Nearest snap point (no velocity check) | Slow drags snap to unintended levels | Add velocity gate: if `|velocityY| > 500`, snap in velocity direction regardless of position |
| Card swipe threshold | 120px fixed | Doesn't account for velocity; fast flick under 120px doesn't register | Add velocity gate: if `|velocityX| > 800`, treat as pass even if `|translationX| < 120` |
| Card spring-back | `damping: 15, stiffness: 150` | Slightly bouncy on abort | Tighten to Latex profile (`damping: 22, stiffness: 400`) for crisper abort |

### Hysteresis around glass snap points

When releasing near a snap boundary, add a ±20px dead zone where the overlay snaps to the level the user was already on (bias toward current state). This prevents "flicker" when the user's thumb lands exactly between two levels.

```
hysteresis = 20px
if |current - currentLevelSnap| < hysteresis:
  snap to currentLevel (no change)
else:
  snap to nearest level
```

### Files to touch

| File | Change |
|------|--------|
| `components/GlassOverlay.tsx` | Increase activeOffsetY, add velocity-gated snap, add hysteresis |
| `components/DecisionCard.tsx` | Add velocity-gated swipe pass, tighten spring-back to Latex |
| `lib/ui/motion.ts` | New file, exported configs |

---

## D) Z-Axis Illusion (M2)

### Tonight → Deal: foreground rise / background sink

During the clone expansion (350ms):
- **Clone:** Add `scale: 1.0 → 1.02` — subtle upward "lift" of the expanding tile
- **Tonight content behind clone:** Add `scale: 1.0 → 0.97` + `opacity: 1.0 → 0.6` — sinks and dims, like it's receding

Implementation: In `tonight.tsx`, wrap the main content (header + mode buttons + CTA) in an `Animated.View` with a scale+opacity animated style driven by `scrimOpacity` (reuse existing shared value as a proxy for transition progress).

Magnitudes:
- Clone lift: +2% scale (barely perceptible, feels "closer")
- Background sink: -3% scale + 40% opacity reduction (creates depth)

### Glass overlay drag: inverse parallax on hero image

When the glass overlay drags up, the hero image behind it shifts slightly downward — as if the glass is sliding over a fixed deeper layer.

- Magnitude: 10% inverse. If glass translates up by 100px, hero shifts down by 10px.
- Implementation: In `DecisionCard`, derive a `heroParallaxY` from the glass overlay's `translateY` (via the existing `externalLiftY` shared value or a new one exposed from GlassOverlay). Apply as a small `translateY` on the hero `<Image>` style.

### Files to touch

| File | Change |
|------|--------|
| `app/tonight.tsx` | Background scale+opacity during clone expansion |
| `components/DecisionCard.tsx` | Hero parallax from glass overlay translateY |
| `components/GlassOverlay.tsx` | Expose translateY progress for parallax (may already be sufficient via `externalLiftY` inverse) |

---

## E) Interactive Cancel for Hero Transition (M3)

### Current problem
The Tonight→Deal transition is fire-and-forget: once tap is registered, 350ms timing runs, nav fires at 290ms, clone fades at 350ms. No cancel path. If the user back-swipes during this window, the tap lock stays engaged and the clone may ghost.

### Proposed fix

Replace `setTimeout(doNavigate, NAV_DELAY)` with a **Reanimated callback** on the expansion animation:

1. Use `withTiming(target, config, (finished) => { ... })` on `cloneW` (or any one shared value — they all animate together)
2. In the callback: if `finished === true`, call `runOnJS(doNavigate)()`; if `finished === false` (interrupted), call `runOnJS(cleanup)()`
3. Remove `navTimerRef` setTimeout entirely

**Cancel trigger:** If the user performs a back gesture (iOS edge swipe) while the clone is expanding, Expo Router's gesture system will attempt to pop the stack. Since we haven't pushed yet (nav fires at 83%), the gesture won't actually navigate — but we can detect it via a `useEffect` on navigation state or simply by checking `mountedRef` in the callback.

**Simpler cancel:** Add a tap-anywhere-to-cancel during the expansion. The scrim Animated.View (already rendered) gets `pointerEvents="auto"` during transition + an `onPress` that calls:
```
cancelAnimation(cloneX); cancelAnimation(cloneY); ... // cancel all
cloneOpacity.value = withTiming(0, { duration: 100 });
cleanup();
```
This reverses the expansion instantly and unlocks taps.

### Files to touch

| File | Change |
|------|--------|
| `app/tonight.tsx` | Replace setTimeout with Reanimated callback. Add cancel-on-tap to scrim. |

---

## F) Reverse-Box Deal → Checklist Transition (M4)

### Concept

When the user taps "Let's do this" on the Deal card:
1. Measure the Deal hero image bounds (full screen, minus inset)
2. Push `/checklist/[recipeId]` behind a clone overlay
3. Once checklist mounts, measure the destination hero thumbnail bounds (40×40 at top)
4. Animate the clone from full-screen → thumbnail rect (reverse of Tonight→Deal)
5. Fade clone out, revealing the checklist underneath

### Choreography Timeline

```
0ms    — User taps Accept CTA
         Lock input. Measure Deal hero rect (source).
         Push /checklist/[recipeId] (route change fires immediately).
         Render clone overlay at source rect (full screen, hero image).

0–50ms — Checklist mounts behind clone. Clone covers everything.
         Checklist hero thumbnail renders at its natural position.
         Measure thumbnail rect (destination) via ref + measureInWindow.

50ms   — Begin clone animation:
         x: 0 → destX
         y: 0 → destY
         w: screenW → 40
         h: screenH → 40
         borderRadius: 0 → radii.sm (8)
         Using Oak spring profile (~380ms)

50ms   — Simultaneously fade in checklist content:
         opacity: 0 → 1 over 200ms (Whisper)
         (Only the content below the header fades; header is visible immediately)

~350ms — Clone reaches destination. Fade clone opacity 1 → 0 (100ms Whisper).

~450ms — Cleanup: remove clone, unlock input.
```

### Technical Approach

**Clone lives in deal.tsx** (not in a portal or root overlay). Since `router.push` adds the checklist to the stack ON TOP of deal, the deal screen stays mounted. The clone (absolutely positioned in deal.tsx with high zIndex) would be BEHIND the new checklist screen.

**Problem:** The clone needs to be visible on top of the checklist during transition.

**Solution: Root-level transition overlay.**

Create a minimal `TransitionOverlay` component rendered in `app/_layout.tsx` (the root layout). It:
- Listens for a "start transition" signal (via a module-level event emitter or a simple shared ref)
- Receives source rect + image source + destination rect
- Renders the clone at root level (above all screens)
- Animates using Oak spring
- Cleans up when done

This is the same pattern as the Tonight clone (which also renders at screen level above content), but elevated to root level so it survives route transitions.

**Measurement flow:**
1. Deal.tsx `handleAccept`: measures own hero image via ref → `measureInWindow(x, y, w, h)`
2. Fires transition signal with `{ sourceRect, imageSource, destRoute, destParams }`
3. Root overlay renders clone at sourceRect
4. `router.push(destRoute)` fires immediately
5. Checklist mounts, measures its header thumbnail via ref → fires "dest ready" signal with destRect
6. Root overlay animates clone from sourceRect → destRect
7. On animation complete: clone fades, cleanup

**Destination measurement:** The checklist header thumbnail already has a ref-able `<Image>` component. Add a `measureInWindow` call in a `useEffect` on mount, then fire the "dest ready" signal. The clone animation waits for this signal before starting (with a timeout fallback in case measurement fails).

### Interrupt / Cancel Handling

- **Back gesture during transition:** If user back-swipes, checklist unmounts. Root overlay detects via mountedRef check in the "dest ready" listener. If dest never reports ready within 500ms, clone fades out and cleanup runs.
- **App background during transition:** Clone continues animating (Reanimated runs on UI thread). On foreground return, it's either done or nearly done. No stuck state.
- **Double tap:** Input locked via ref flag, same pattern as Tonight transition.
- **Web:** Clone overlay uses absolute positioning and Reanimated `useAnimatedStyle`. No native-only APIs. Stable on web export.

### Rescue checklist parity

Same transition for `/rescue/[mealId]`. The rescue screen has a 56×56 thumbnail instead of 40×40 — the clone animates to different destination dimensions. The root overlay doesn't care about the destination screen type; it just receives a rect.

### Files to touch

| File | Change |
|------|--------|
| `lib/ui/motion.ts` | Oak spring config (used for clone animation) |
| `components/TransitionOverlay.tsx` | **New.** Root-level clone overlay with measure+animate+cleanup. |
| `app/_layout.tsx` | Render `<TransitionOverlay />` at root level. |
| `app/deal.tsx` | `handleAccept`: measure hero rect, fire transition signal, push route. |
| `app/checklist/[recipeId].tsx` | On mount: measure header thumbnail, fire "dest ready" signal. |
| `app/rescue/[mealId].tsx` | Same: measure thumbnail, fire "dest ready". |

---

## G) Phase Sequencing

```
M0 — Motion tokens + docs (0.5 day)
  └── lib/ui/motion.ts, docs/motion.md
  └── No behavioral changes. Define profiles, document usage.

M1 — Inertia tuning (0.5 day)
  └── GlassOverlay: widen activation, velocity snap, hysteresis
  └── DecisionCard: velocity-gated swipe, tighter spring-back
  └── Depends on: M0 (use Latex/Vellum profiles)

M2 — Z-axis + parallax (0.5 day)
  └── Tonight: background sink during clone expansion
  └── DecisionCard: hero parallax on glass drag
  └── Depends on: M0

M3 — Hero transition cancel (0.5 day)
  └── Tonight: replace setTimeout with Reanimated callback
  └── Add tap-to-cancel on scrim
  └── Independent of M1/M2

M4 — Reverse-box Deal→Checklist (1.5 days)
  └── Root-level TransitionOverlay component
  └── Measure source (Deal hero) + dest (Checklist thumbnail)
  └── Oak spring animation across route boundary
  └── Rescue parity
  └── Depends on: M0 (Oak profile), M3 (cancel pattern)
```

**Total: ~3.5 days**

---

## H) Risks and Mitigations

| Risk | Phase | Severity | Mitigation |
|------|-------|----------|------------|
| Root-level overlay adds complexity to `_layout.tsx` | M4 | Medium | Overlay is self-contained with own cleanup. If it fails, route transition still works (just no animation). |
| Destination measurement arrives late (slow mount) | M4 | Medium | 500ms timeout fallback: if dest rect not received, fade clone out and skip animation. User sees standard stack transition. |
| Z-axis scale on background causes layout shift | M2 | Low | Scale is transform-only (doesn't affect layout). Applied to a wrapper View, not the content itself. |
| Velocity-gated snaps feel "too easy to trigger" | M1 | Low | Tune velocity threshold (start at 800px/s, adjust based on testing). Easy to revert: remove velocity check, restore position-only snap. |
| Oak spring overshoots on clone animation | M4 | Low | `damping: 28` with `mass: 1.0` produces <1% overshoot. Test and increase damping if visible. |
| Web export: Reanimated callbacks timing differs | M3/M4 | Low | Reanimated web shim supports `withTiming` callbacks. Test in web export specifically. |

---

## I) Acceptance Criteria per Phase

### M0 — Motion tokens
- `lib/ui/motion.ts` exports 4 named profiles
- `docs/motion.md` documents each with usage table
- No runtime behavior changes

### M1 — Inertia tuning
- Glass overlay: no accidental activation on tremble (<12px)
- Glass overlay: fast flick snaps in direction of velocity
- Card swipe: fast flick registers as pass even under 120px
- Card spring-back: crisp, no wobble

### M2 — Z-axis + parallax
- Tonight→Deal: background visibly sinks during expansion
- Glass drag: hero image shifts slightly opposite to glass direction
- No layout shifts, no jank

### M3 — Hero transition cancel
- Tap scrim during Tonight→Deal expansion → expansion reverses, tap lock clears
- No ghost clone after cancel
- Normal (non-cancelled) transition unchanged

### M4 — Reverse-box
- Accept on Deal → hero image smoothly contracts to checklist thumbnail
- Checklist content fades in during contraction
- No blank frame between Deal and Checklist
- Back gesture during transition → clone fades, no stuck overlay
- Works for both `/checklist` and `/rescue` destinations
- Web export: transition works or gracefully falls back to standard push

---

## J) 10-Minute Manual Test Checklist

| # | Test | Expected |
|---|------|----------|
| 1 | Tonight: tap mode button | Clone expands to full screen with slight background sink. Deal appears. |
| 2 | Tonight: tap mode button, immediately tap scrim | Clone reverses, returns to Tonight. No ghost. |
| 3 | Deal: slow drag glass handle up/down near snap boundary | No flicker. Hysteresis prevents accidental level change. |
| 4 | Deal: fast flick glass handle upward | Snaps to next level regardless of position (velocity gate). |
| 5 | Deal: fast horizontal flick (under 120px) | Card passes (velocity gate). |
| 6 | Deal: trembly drag on glass handle (<12px) | No activation. Handle doesn't move. |
| 7 | Deal: drag glass up → observe hero image | Hero shifts slightly down (parallax). |
| 8 | Deal: tap "Let's do this" | Hero image contracts to checklist thumbnail. Checklist fades in. |
| 9 | Deal: tap "Let's do this", immediately swipe back | Clone fades out, no stuck overlay. Either Deal or Checklist visible, no blank. |
| 10 | Rescue: DRM triggers → accept → hero contracts to rescue thumbnail | Same reverse-box as checklist. |

---

## K) Rollback Strategy

Each phase is an independent commit (or small set):

- **M0:** Delete `motion.ts` + `motion.md`. No runtime impact.
- **M1:** Revert threshold/velocity constants to originals. Pure number changes.
- **M2:** Remove scale/opacity/parallax animated styles. Surfaces return to flat.
- **M3:** Revert to setTimeout-based nav timing. Re-add `navTimerRef`.
- **M4:** Delete `TransitionOverlay.tsx`. Remove measurement code from deal/checklist/rescue. Accept reverts to plain `router.push`. Stack `slide_from_right` takes over.

No phase has irreversible data or schema changes.
