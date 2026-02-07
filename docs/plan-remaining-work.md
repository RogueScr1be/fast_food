# Fast Food 1.0.1 — Remaining Work Plan

**Created:** 2026-02-06
**Status:** Phase 1 complete, Phase 2.1 complete, Phase 2.2 complete.

---

## Current State Summary

| Area | Status |
|------|--------|
| Editorial card (full-bleed, glass overlay, RNGH gestures) | Shipped |
| Idle micro-motion (7s nudge + lift) | Shipped |
| Box-to-full Tonight → Deal transition | Shipped |
| Portrait lock | Shipped |
| Tabs removed, flat stack nav | Shipped |
| Tonight hub ("Time to Eat", vertical buttons, "Choose for Me") | Shipped |
| DRM autopilot (auto-navigate to rescue, skip card) | Shipped |
| Init guard fix (session counter pattern) | Shipped |
| Hero safe framing (heroSafeFrame field, 12 recipes flagged) | Shipped |
| Glass tint interpolation (light L0 → deep L1+) | Shipped |

---

## Remaining Phases

### Phase 2.3 — Tonight Button Shape (optional polish)

**Goal:** Evaluate whether the current full-width row buttons should become tall card-like tiles for a more premium feel and better visual continuity with the clone transition.

**Current state:** Full-width horizontal rows (icon left, label right, `radii.lg` corners). The clone transition starts from the row's measured rect and expands to full screen. This works visually but the clone shape is wide+short, making the early frames of the expansion look stretched.

**Decision needed before execution:**
- Tall cards (e.g. ~160px height, full width) would make the clone expansion feel more natural — the starting shape is closer to a card.
- Trade-off: tall cards push the CTA further down, reducing the number of options visible without scrolling on small devices.
- Recommendation: implement tall cards with a fixed height of 80–100px (not 160px). This is a middle ground — taller than current rows (~56px), more card-like, but still fits 3 + allergy link + CTA on a 667px screen.

**Files to touch:**
| File | Change |
|------|--------|
| `app/tonight.tsx` | `modeButton` style: increase `paddingVertical`, add `minHeight: 80`. `cloneRadius` init: match new corner radius. |

**Acceptance criteria:**
- Three mode buttons + allergy link + CTA all visible without scrolling on iPhone SE (667pt).
- Clone transition starts from a visually taller rect and expands smoothly.
- No layout changes to any other screen.

**Risks:** Minimal. Self-contained style change in one file.

**Rollback:** Revert `modeButton` style to previous padding values.

---

### Phase 3.0 — Checklist Polish

**Goal:** Transform the checklist from a functional checkbox list into a polished, emotionally satisfying completion experience.

#### Phase 3.0.1 — Remove Cook/Prep Toggle + Blue Progress

**Files to touch:**
| File | Change |
|------|--------|
| `app/checklist/[recipeId].tsx` | Remove `orderMode` state, `toggleContainer` JSX, `Cook now` / `Prep first` buttons. Steps always render in original order. Change progress bar color from green to blue. |
| `components/ThinProgressBar.tsx` | Change fill color from `colors.accentGreen` to `colors.accentBlue`. |
| `lib/seeds/index.ts` | `reorderForPrep` and `reorderForPrepWithIndices` become unused. Leave in place (no deletion needed). |

**Acceptance criteria:**
- No Cook/Prep toggle visible.
- Steps render in recipe-defined order.
- Progress bar fills in blue.
- Rescue checklist (`rescue/[mealId].tsx`) unaffected (it never had the toggle).

**Risks:** None. Removal only.
**Rollback:** Restore removed JSX + state.

---

#### Phase 3.0.2 — Orbit-Loader Checkbox + Strikethrough Animation

**Goal:** Replace the plain green checkmark with:
1. Tap triggers a brief orbit-loader animation (circular progress around the checkbox, ~400ms).
2. On completion: blue filled checkbox with white check icon.
3. Step text gets a strikethrough with a left-to-right travel animation (~300ms).

**Files to touch:**
| File | Change |
|------|--------|
| `components/ChecklistStep.tsx` | **New component.** Encapsulates the animated checkbox + text. Uses Reanimated `withTiming` for the orbit progress + strikethrough width. |
| `app/checklist/[recipeId].tsx` | Replace inline step rendering with `<ChecklistStep />` component. |
| `app/rescue/[mealId].tsx` | Same: replace inline step rendering with `<ChecklistStep />`. |
| `lib/ui/theme.ts` | Optional: add `colors.checkboxOrbit` if orbit color differs from `accentBlue`. |

**Implementation approach:**
- Orbit loader: a Reanimated animated `View` with `borderWidth` on one side, rotated via `withTiming(360deg, { duration: 400 })`. On completion callback, swap to filled blue circle with `Check` icon.
- Strikethrough: an absolutely-positioned `View` (1px height, blue bg) that animates `width` from 0 to text width via `onLayout` measurement + `withTiming`.
- Both animations fire on `toggleStep`. Unchecking reverses immediately (no animation on uncheck).

**Acceptance criteria:**
- Tap step → orbit animation (400ms) → blue check + strikethrough (300ms).
- Uncheck → instant revert, no animation.
- Works on both checklist and rescue screens.
- 60fps, no jank on older devices.

**Risks:**
- Text width measurement for strikethrough needs `onLayout`. If text wraps to multiple lines, strikethrough should span full width of the first line only (or full container width for simplicity).
- Orbit animation uses Reanimated `useSharedValue` + `useAnimatedStyle` — consistent with existing architecture.

**Rollback:** Delete `ChecklistStep.tsx`, restore inline rendering.

---

#### Phase 3.0.3 — Confetti on All-Complete

**Goal:** When the last step is checked, trigger a brief confetti burst from the bottom of the screen.

**Files to touch:**
| File | Change |
|------|--------|
| `components/ConfettiBurst.tsx` | **New component.** ~20 animated particles (Reanimated) with random colors, positions, trajectories. Duration ~1.2s. Self-cleans (opacity → 0). |
| `app/checklist/[recipeId].tsx` | Render `<ConfettiBurst trigger={allComplete} />` below the step list. |
| `app/rescue/[mealId].tsx` | Same. |

**Implementation approach:**
- Confetti particles: array of 20 `Animated.View` elements with randomized `translateX`, `translateY` (withSpring, negative Y for upward burst), `rotate`, `opacity` (fade out at end).
- Trigger: `allComplete` boolean transitions from false → true. Component detects the edge and fires.
- No external library (lottie-react-native adds ~500KB). Pure Reanimated.

**Acceptance criteria:**
- Confetti fires once when all steps complete.
- Does not fire on screen mount if steps were already complete.
- No confetti when unchecking a step brings count below total.

**Risks:** Performance on low-end devices with 20 simultaneous spring animations. Mitigate by using `useNativeDriver: true` (all transforms).

**Rollback:** Delete `ConfettiBurst.tsx`, remove renders.

---

#### Phase 3.0.4 — "Great Job!" Handwriting Animation (Skippable)

**Goal:** After confetti, display a "Great Job!" text that draws in with a handwriting-style animation. Tap anywhere to skip to the Done state.

**Files to touch:**
| File | Change |
|------|--------|
| `components/GreatJobOverlay.tsx` | **New component.** Full-screen semi-transparent overlay with animated text. Uses Reanimated `withTiming` to animate a clip mask revealing text left-to-right (~1.5s). Tap anywhere skips to fully-revealed state. After reveal (or skip), auto-dismisses after 800ms. |
| `app/checklist/[recipeId].tsx` | Render `<GreatJobOverlay visible={showGreatJob} onDismiss={...} />` after confetti. |
| `app/rescue/[mealId].tsx` | Same. |

**Implementation approach:**
- Text reveal: absolutely-positioned text with a `width` clip animated from 0 → text width. Approximates handwriting without needing SVG path animation or Lottie.
- Skip: `Pressable` covers the overlay. On press, immediately set clip width to full and trigger dismiss timer.
- Dismiss: `onDismiss` callback fires after animation + hold period. Parent shows Done button.

**Decision: Lottie/Rive assessment:**
- Lottie (`lottie-react-native`): adds ~500KB to bundle. Required only if the client provides an actual `.json` animation file. Not justified for MVP.
- Rive: similar weight. Not justified.
- Recommendation: **pure Reanimated clip-reveal**. If a real calligraphy animation is later desired, swap the inner content for a Lottie player without changing the overlay/skip logic.

**Acceptance criteria:**
- "Great Job!" text draws in over ~1.5s.
- Tap anywhere skips to fully revealed.
- Auto-dismisses after reveal + 800ms hold.
- Skippable (not blocking).

**Risks:** Low. Self-contained overlay component.

**Rollback:** Delete `GreatJobOverlay.tsx`, remove renders.

---

### Phase 3.1 — Delayed Feedback Prompt

**Goal:** 4+ hours after a meal completion, show a "Did you enjoy your meal?" prompt with a 3-state slider. Log response by mealId locally.

**Files to touch:**
| File | Change |
|------|--------|
| `lib/state/ffSession.ts` | Add `lastCompletedMeal: { id: string; completedAt: number } | null` to ephemeral state. Set on checklist/rescue done. |
| `lib/state/persist.ts` | Add `lastCompletedMeal` to persisted prefs (needs to survive app restart). |
| `lib/state/feedbackLog.ts` | **New module.** Simple AsyncStorage-backed log: `{ mealId, rating: 'bad'|'ok'|'great', timestamp }[]`. Append-only. |
| `app/tonight.tsx` | On mount: check if `lastCompletedMeal` exists AND `Date.now() - completedAt >= 4 hours`. If yes, show feedback modal. On submit/dismiss, clear `lastCompletedMeal`. |
| `components/FeedbackSlider.tsx` | **New component.** 3-state horizontal slider with emoji-free labels (e.g., "Not great" / "It was fine" / "Loved it"). Returns selected state on submit. |

**Acceptance criteria:**
- Complete a meal → `lastCompletedMeal` persisted.
- Open app 4+ hours later → feedback prompt appears on Tonight.
- Submit or dismiss → prompt never reappears for that meal.
- Response logged to `feedbackLog` (local AsyncStorage).

**Risks:**
- Persistence: `lastCompletedMeal` must survive app restart. Requires adding it to the `savePrefs` / `loadPrefs` schema in `persist.ts`. This is a schema change — Stop-and-Ask trigger applies.
- Timer accuracy: depends on user opening the app. No background notification in MVP scope.

**Rollback:** Remove feedback modal from tonight.tsx, delete feedbackLog.ts + FeedbackSlider.tsx.

---

### Phase 3.2 — Share Sheet

**Goal:** Allow users to share their meal selection from two entry points.

**Entry points:**
1. Profile/Settings screen → "Share Fast Food" row
2. Glass overlay at Level 1+ → small share icon

**Files to touch:**
| File | Change |
|------|--------|
| `app/profile.tsx` | Add "Share Fast Food" row that triggers system share sheet with app deep link / text. |
| `components/GlassOverlay.tsx` | Add optional `onShare` prop. When provided, render a small share icon in the sticky content area. |
| `components/DecisionCard.tsx` | Pass `onShare` through to GlassOverlay if the parent provides it. |
| `app/deal.tsx` | Pass `onShare` handler that triggers system share sheet with current recipe name + app link. |

**Implementation:**
- Use Expo's `expo-sharing` or `react-native`'s `Share.share()` API (already available, no new dependency).
- Share content: "I'm making {recipe.name} tonight! 🍽️" + app store link placeholder.

**Acceptance criteria:**
- Share from profile → system share sheet.
- Share from glass overlay (Level 1+) → system share sheet with current recipe.
- No share icon visible at Level 0 (too cluttered).

**Risks:** Low. System share API is well-tested.

**Rollback:** Remove share handlers + icon; revert GlassOverlay prop addition.

---

## Sequencing Summary

```
✅ Phase 1    — Editorial Magic (complete)
✅ Phase 2.1  — Tonight hub + nav restructure (complete)
✅ Phase 2.2  — DRM autopilot (complete)
⬜ Phase 2.3  — Tonight button shape (optional, 0.5 day)
⬜ Phase 3.0.1 — Remove Cook/Prep toggle + blue progress (0.5 day)
⬜ Phase 3.0.2 — Orbit checkbox + strikethrough (1 day)
⬜ Phase 3.0.3 — Confetti burst (0.5 day)
⬜ Phase 3.0.4 — "Great Job!" handwriting overlay (0.5 day)
⬜ Phase 3.1  — Delayed feedback prompt (1 day)
⬜ Phase 3.2  — Share sheet (0.5 day)
```

**Total remaining: ~4.5 days**

Dependencies: 3.0.2 depends on 3.0.1 (toggle removed first). 3.0.3 depends on 3.0.2 (confetti fires after last orbit completes). 3.0.4 depends on 3.0.3 (overlay appears after confetti). All others are independent.

---

## Test Plan

### Unit Tests

| Phase | Tests |
|-------|-------|
| 3.0.1 | Verify `reorderForPrepWithIndices` still passes (unused but not deleted). Verify progress bar renders blue (snapshot or style assertion). |
| 3.0.2 | `ChecklistStep` renders unchecked/checked states. Animation values set correctly on toggle. |
| 3.0.3 | `ConfettiBurst` renders nothing when `trigger=false`. Renders particles when `trigger=true`. |
| 3.1 | `feedbackLog` read/write/append. `lastCompletedMeal` persistence. Threshold check (4 hours). |

### On-Device Smoke Tests (per phase)

| Phase | Steps |
|-------|-------|
| 2.3 | Tap each mode button. Verify clone transition looks smooth from taller rect. Verify 3 buttons + CTA visible on smallest supported device. |
| 3.0.1 | Open checklist. Verify no Cook/Prep toggle. Verify progress bar is blue. Complete all steps, verify Done works. |
| 3.0.2 | Tap a step → orbit animation → blue check → strikethrough. Uncheck → instant revert. Verify 60fps on mid-range device. |
| 3.0.3 | Complete all steps → confetti burst. Re-open checklist with all steps complete → no confetti on mount. |
| 3.0.4 | After confetti → "Great Job!" draws in. Tap to skip → text fully visible. Wait → auto-dismiss. |
| 3.1 | Complete meal. Set device clock forward 4+ hours. Reopen app → feedback prompt. Submit → logged. Reopen → no prompt. |
| 3.2 | Tap share in profile → system sheet. Expand glass overlay to L1 → share icon → system sheet with recipe name. |

---

## Risks & Mitigations (Cross-Cutting)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Reanimated animation count in checklist (orbit + strikethrough × N steps + confetti × 20 particles) | Medium | Limit confetti to 15 particles. Use `cancelAnimation` on unmount. Test on iPhone 8 / mid-range Android. |
| `feedbackLog` schema migration on existing installs | Low | Append-only log with no schema versioning needed. `loadPrefs` already handles missing keys gracefully. |
| Share sheet availability on web | Low | `Share.share()` falls back to clipboard on web. Acceptable for MVP. |
| Phase 3.0.4 "handwriting" visual quality without Lottie | Low | Clip-reveal approximation is good enough for MVP. Can swap to Lottie later if real calligraphy animation is provided. |

---

## Rollback Strategy

Each phase is an independent commit (or set of commits) that can be reverted without affecting other phases:

- **Phase 2.3:** Single style change in `tonight.tsx`. `git revert` safe.
- **Phase 3.0.1:** Removal diff. `git revert` restores toggle + green progress.
- **Phase 3.0.2–3.0.4:** New components + render insertions. `git revert` removes them; checklist falls back to plain rendering.
- **Phase 3.1:** New files + modal insertion. `git revert` removes feedback system. Persisted `lastCompletedMeal` key is ignored if the code to read it is gone.
- **Phase 3.2:** New prop + handlers. `git revert` removes share functionality.

No phase requires a data migration that can't be reversed.
