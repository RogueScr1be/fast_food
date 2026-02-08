# Polish Plan — Invisible Mastery

**Status:** Plan only. No code.
**Prerequisite:** Motion v2 (M0–M4) complete. Learning Loop paused.

---

## Execution Order

```
Phase A  — Trust & Identity Lock         (0.5 day)
Phase B  — Physical Believability        (1 day)
Phase C  — Silent Onboarding             (0.5 day)
Phase D  — Micro-Reward                  (0.25 day)
Phase E  — Motion Quality Control        (0.5 day)
                                         ─────────
                                         ~2.75 days
```

A before B because trust is the foundation. B before C because physical
believability must be correct before we teach users to interact with it.
C before D because onboarding teaches the loop that reward completes.
E last because it's an audit pass across everything delivered in A–D.

---

## Phase A — Trust & Identity Lock

### What

Establish visual truth: the app never lies about what's interactive, never
patterns randomness, and presents a clear identity.

### Tasks

**A.1 — Header identity**

Tonight screen title "Time to Eat" is the primary identity. It uses
`textPrimary` (#171717) which is correct. No branding element says
"FAST FOOD" currently; if one is added later it must use the same
dark text treatment. No work needed here unless the title is being
changed — confirm and move on.

**A.2 — Accent blue audit**

Scan all screens for any use of `accentBlue` on non-interactive elements
(text labels, badges, backgrounds). Accent blue must ONLY appear on:
- Touchable/pressable elements (buttons, links, checkboxes)
- Selection indicators (selected mode button wash)
- Progress indicators (progress bar fill)

Non-interactive text must use `textPrimary`, `textSecondary`, or
`textMuted`. Non-interactive badges must use `warning`/`warningAmber`
or neutral colors.

Files to audit:
- `app/tonight.tsx` (mode labels are accentBlue — correct, they're buttons)
- `app/deal.tsx` (back button uses glassText — correct)
- `app/checklist/[recipeId].tsx` (checkbox blue — correct, interactive)
- `app/rescue/[mealId].tsx` (same)
- `components/AllergyIndicator.tsx` (amber — correct, non-interactive)

**A.3 — "Choose for Me" randomness verification**

Current code (tonight.tsx line 336-337):
```ts
if (!modeToUse) {
  modeToUse = ALL_MODES[Math.floor(Math.random() * ALL_MODES.length)];
}
```

This selects from `['fancy', 'easy', 'cheap']` uniformly. But if the user
has already selected a mode (tapped then un-tapped), `selectedModeLocal`
is non-null and "Choose for Me" reuses it — not random.

Fix: "Choose for Me" should ALWAYS random-select regardless of prior
selection state. Change:
```ts
const modeToUse = ALL_MODES[Math.floor(Math.random() * ALL_MODES.length)];
```
Remove the `selectedModeLocal` fallback path.

**A.4 — Anti-patterning guard**

With only 3 modes and `Math.random()`, users may perceive patterns
(e.g., "it always picks Easy"). No code fix needed — the pool is too
small for true randomness to feel random. Document this as a known
perception risk. If Phase 4 Learning Loop ships, weighted selection
will naturally vary results.

### Files to touch

| File | Change |
|------|--------|
| `app/tonight.tsx` | A.3: "Choose for Me" always random. ~2 lines. |

### Acceptance criteria

- "Choose for Me" produces all three modes over 10 taps (statistical)
- No accentBlue on non-interactive elements (manual visual audit)
- No identity/branding confusion

### Risks

None. Pure logic + visual consistency.

---

## Phase B — Physical Believability

### What

Close the remaining visual grammar gaps so every surface feels like it
belongs to the same physical system.

### Tasks

**B.1 — Glass overlay max height clamp**

Currently the glass overlay at Level 1 expands to `windowHeight * 0.5`
(50% of viewport). If the recipe has only 2 ingredients, the glass
expands to 50% but is mostly empty space — breaking the "physical
object" illusion.

Fix: clamp Level 1 height to `min(50% viewport, content height + padding)`.

Implementation: the GlassOverlay children container measures its content
via `onLayout`. If content height + handle + mode label + sticky CTA < the
50% snap target, the Level 1 snap point moves closer to the content edge.

Files:
- `components/GlassOverlay.tsx` — add content measurement, dynamic snap1

Complexity: Medium. Must update snap1 shared value when content height
changes without causing jank. Use a ref to avoid re-render loops.

**B.2 — Hero image visibility behind glass**

At Level 1, the glass overlay covers the bottom 50% of the screen. The
hero image is the full card. Currently the glass scrim is
`rgba(25,25,25,0.20)` at Level 0 interpolating to `rgba(25,25,25,0.65)`
at Level 1. At Level 1 the image behind the glass is barely visible.

This is acceptable — the glass is meant to be opaque enough for text
legibility. No change needed. The hero image is fully visible at Level 0
and through the upper portion at Level 1. Document as intentional.

**B.3 — "I'm Allergic" adopts glass language**

Currently the allergy modal uses a standard RN `<Modal>` with slide-up
animation and opaque white background. This breaks from the glass overlay
language used everywhere else.

Fix: Replace the allergy `<Modal>` with a glass-styled bottom sheet
using the same visual tokens (blur on iOS, tint on Android, handle bar,
rounded top corners). NOT a full GlassOverlay component reuse — a
simpler styled View with the same glass background treatment.

Files:
- `app/tonight.tsx` — allergy modal styling (not the Modal component
  itself, just its visual treatment: background, border radius, handle)
- `app/deal.tsx` — same allergy modal (if still present)

Complexity: Low. Style-only changes to existing Modal content views.

### Files to touch

| File | Change |
|------|--------|
| `components/GlassOverlay.tsx` | B.1: content height measurement + dynamic snap1 |
| `app/tonight.tsx` | B.3: allergy modal glass styling |
| `app/deal.tsx` | B.3: allergy modal glass styling (if modal still exists) |

### Acceptance criteria

- Glass overlay at Level 1 with 2-ingredient recipe: glass stops at
  content edge, not at 50% viewport. Hero image visible above.
- Glass overlay at Level 1 with 6-ingredient recipe: glass fills to 50%
  as before (content exceeds 50%).
- Allergy modals use glass background tokens (not opaque white).
- No visual grammar breaks between overlay and modal surfaces.

### Risks

- B.1 (dynamic snap): Changing snap1 mid-gesture could cause jank.
  Mitigate by only updating snap1 outside of active gestures (check
  if gesture is active before updating shared value).
- B.3: Modal backdrop behavior may differ from glass overlay. Test
  dismiss-on-backdrop-tap still works.

---

## Phase C — Silent Onboarding

### What

Teach the Deal card affordances (swipe to pass, glass handle to expand)
through motion alone, without text or tooltips.

### Tasks

**C.1 — Tighten idle affordance timing**

Current: 7000ms idle → nudge (12px, 600ms) + glass lift (40px, 800ms)
simultaneously.

New sequence (first session only):
1. 4000ms idle → glass overlay lifts slightly (40px, 800ms) — teaches
   "the glass can move"
2. +1500ms → subtle horizontal card nudge (12px, 600ms) — teaches
   "the card can slide"

This two-step sequence is more pedagogically clear: first "there's a
panel below," then "the card is swipeable."

**C.2 — First session only**

The idle affordance currently triggers on every card, every session.
For polish, it should only trigger on the first card of the first session
(ever). After any user interaction (swipe, glass drag, accept), it never
fires again.

Implementation: persist a boolean `hasSeenAffordance` in AsyncStorage
(or in ffSession persisted prefs). Check on mount. If true, disable
idle affordance entirely.

Files:
- `hooks/useIdleAffordance.ts` — accept `firstSessionOnly` flag
- `lib/state/persist.ts` — add `hasSeenAffordance: boolean` to prefs
- `app/deal.tsx` — read persisted flag, pass to hook

**C.3 — Never repeat after interaction**

Currently `resetIdle()` restarts the timer. For the first-session-only
model, `resetIdle()` should also persist `hasSeenAffordance = true`
so the affordance never fires again, even in future sessions.

### Files to touch

| File | Change |
|------|--------|
| `hooks/useIdleAffordance.ts` | C.1: sequenced timing. C.2: firstSessionOnly flag. |
| `lib/ui/theme.ts` | C.1: update idle constants (thresholdMs: 4000). |
| `lib/state/persist.ts` | C.2: add hasSeenAffordance to prefs schema. |
| `app/deal.tsx` | C.2: read flag, pass to hook. C.3: persist on interaction. |

### Acceptance criteria

- First ever deal session: glass lifts at 4s, card nudges at 5.5s
- After any user interaction: affordance never fires again (this session
  or future sessions)
- Second+ sessions: no idle affordance at all
- No text, no tooltips, no modals

### Risks

- C.2: Adding to persisted prefs schema — technically a schema change
  (Stop-and-Ask trigger). But it's an optional boolean with graceful
  default (false = show affordance), so backward-compatible.
- Timing change (7s → 4s) may feel aggressive on first experience.
  Test with a fresh user mental model.

### Do NOT implement yet

- Audio/haptic feedback on nudge (noted for native-only future phase)
- Tooltip fallback for accessibility (separate a11y audit scope)

---

## Phase D — Micro-Reward

### What

A barely-perceptible visual reward when the user completes all checklist
steps, reinforcing the "dinner solved" feeling.

### Tasks

**D.1 — Done button bloom**

When `allComplete` transitions from false → true (last step checked):
- The Done button animates `scale: 1.0 → 1.04 → 1.0` using Latex
  spring profile (~150ms)
- Simultaneously, the button's shadow deepens slightly (elevation
  increase or shadow opacity bump, 180ms Whisper timing)
- No confetti, no sound, no new copy

Implementation: In the checklist/rescue footer, wrap the PrimaryButton
in an `Animated.View`. On `allComplete` edge (false → true), fire a
`withSequence(withSpring(1.04, latex), withSpring(1.0, latex))` on a
scale shared value.

### Files to touch

| File | Change |
|------|--------|
| `app/checklist/[recipeId].tsx` | D.1: scale bloom on Done button |
| `app/rescue/[mealId].tsx` | D.1: same |

### Acceptance criteria

- Last step checked → Done button subtly "breathes" larger then settles
- Effect is barely noticeable on first occurrence — user feels something
  but can't identify what
- No bloom on uncheck-recheck (only on edge false→true)
- No bloom if screen opens with all steps already complete

### Risks

None. Self-contained animation on a single element. Revert by removing
the animated wrapper.

### Do NOT implement yet

- Haptic feedback on bloom (native-only, noted for later)
- Sound effect (out of scope, noted for audio design phase)

---

## Phase E — Motion Quality Control

### What

Audit pass across all animated surfaces to ensure motion profiles are
correctly applied and no "nervous UI" or visual grammar breaks remain.

### Tasks

**E.1 — Profile mapping audit**

Walk through every `withSpring` and `withTiming` call in the codebase.
Verify each uses a named motion profile from `lib/ui/motion.ts`.
Flag any inline constants that should be migrated.

Known remaining inline constants:
- Tonight clone expansion: `withTiming(350ms, bezier)` — should consider
  Oak spring for interruptibility (but current bezier+callback works;
  note for future, do not change now)
- Idle nudge: custom 600ms timing — intentional, not a UI response
- ChecklistStep orbit: 300ms linear — loading indicator, not physical

**E.2 — Inertia verification**

Verify M1 tuning is correct on device:
- Glass overlay: ±12px activation, velocity gate >500px/s, ±20px hysteresis
- Card swipe: velocity gate >800px/s, Latex spring-back
- No accidental activations on trembly thumb

**E.3 — Z-axis consistency**

Verify M2 depth effects are subtle and consistent:
- Tonight→Deal: background sinks 1.5%, dims 7%
- Hero parallax: 10% inverse, ±8px clamp
- No shimmer, no stutter on 60Hz or 120Hz

**E.4 — Transition audit**

Verify M3+M4 transitions:
- Tonight→Deal: interruptible (tap-to-cancel via callback)
- Deal→Checklist: reverse-box completes in ~570ms, no drift
- Singleton hardened (destKey match, expiry, overwrite policy)
- No ghost clones under rapid tap/back sequences

### Files to touch

None for audit. Only fix files where bugs are found.

### Acceptance criteria

- Every `withSpring` uses a named profile (or has a documented exception)
- All motion feels intentional on device (5-minute manual walkthrough)
- No jitter, no stuck states, no ghost overlays

### Risks

- Audit may reveal inline constants in legacy components (ReceiptScanner,
  LocationPicker, etc.). These are excluded from lint scope and should
  NOT be migrated in this phase.

---

## Explicitly Out of Scope

| Item | Status | Notes |
|------|--------|-------|
| Learning Loop execution | Paused | Phase 4 plan exists. Do not execute. |
| Auth / sign-in | Not planned | No backend. |
| Splash screen (web) | Not planned | Web loads directly to Tonight. |
| Native haptics | Noted for future | Add after core motion is finalized. |
| Branding / logo redesign | Not planned | Identity is typographic ("Time to Eat"). |
| Confetti / particle systems | Rejected | Explicitly banned. "Great Job!" overlay is the reward ceiling. |
| Share sheet | Phase 3.2 scope | Plan exists but not in this polish pass. |

---

## Summary

```
Phase A — Trust & Identity Lock
  A.1  Header identity (verify, no change needed)
  A.2  Accent blue audit (manual, fix if found)
  A.3  "Choose for Me" always random (2-line fix)
  A.4  Anti-patterning guard (document only)

Phase B — Physical Believability
  B.1  Glass overlay content-aware height clamp
  B.2  Hero visibility behind glass (verify, no change)
  B.3  Allergy modal glass styling

Phase C — Silent Onboarding
  C.1  Sequenced idle timing (4s glass, +1.5s nudge)
  C.2  First session only (persist hasSeenAffordance)
  C.3  Never repeat after interaction

Phase D — Micro-Reward
  D.1  Done button scale bloom (Latex, 1.04→1.0)

Phase E — Motion Quality Control
  E.1  Profile mapping audit
  E.2  Inertia verification
  E.3  Z-axis consistency
  E.4  Transition audit
```

Each phase is independently revertable. Each has clear acceptance criteria.
No phase introduces new navigation, new state stores, or new libraries.
Total estimated effort: ~2.75 days.
