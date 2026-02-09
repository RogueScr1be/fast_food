# Phases A–E Final Execution Plan

**Branch:** `cursor/editorial-card-experience-0792`
**Head:** `fd12476`

---

## Phase A — Critical Fixes

### A1: Rescue / DRM Hero Card (swipeDisabled + back to /tonight)

**Current state:** DRM triggers → `router.replace('/rescue/[mealId]')` → user lands directly in rescue checklist. No hero card preview.

**Target:** DRM triggers → Deal screen renders `DecisionCard variant="rescue"` with `swipeDisabled={true}`. Back → `/tonight`. Accept → `/checklist/[recipeId]` (standard checklist route, not rescue-specific).

**Files to touch:**

| File | Change |
|------|--------|
| `components/DecisionCard.tsx` | Add `swipeDisabled?: boolean` prop. When true, exclude swipeGesture from Gesture.Exclusive composition. |
| `app/deal.tsx` | DRM trigger: `setCurrentDeal({ type: 'drm', data: drmMeal })` instead of `router.replace`. Render DecisionCard for both types. Pass `swipeDisabled={currentDeal?.type === 'drm'}`. Back button: if DRM card → `router.replace('/tonight')`. Accept: DRM card → `router.push('/checklist/[recipeId]')` using `drmMeal.id` as recipeId (checklist's `getAnyMealById` already resolves DRM IDs). |

**Acceptance tests:**
- Trigger DRM (swipe 3 cards) → rescue hero card appears (Rescue badge, warm scrim)
- Attempt horizontal swipe → card does not move
- Glass overlay handle still works (vertical drag for ingredients)
- Back chevron → `router.replace('/tonight')`
- Accept ("Let's do this") → checklist loads with correct hero image
- Checklist Done → `/tonight`

**Rollback:** Revert to `router.replace('/rescue/[mealId]')` autopilot. Remove `swipeDisabled` prop.

**Risks:**
- `getAnyMealById(drmMealId)` must resolve DRM IDs. It does (searches both `RECIPES` and `DRM_MEALS`). Verified.
- `didInitRef` / session guard: session counter pattern already handles re-mount. No issue.

---

### A2: Image/Recipe Mismatch Guardrails

**Current state:** `getImageSource()` returns fallback silently when key is missing. No logging.

**Target:** Log a warning with recipe context when image key is missing or not found. Add a unit test that all seed recipes have valid image keys.

**Files to touch:**

| File | Change |
|------|--------|
| `lib/seeds/images.ts` | Add warning log in `getImageSource()` when key is provided but not found in `RECIPE_IMAGES`. Include the key in the warning message. |
| `lib/seeds/__tests__/seeds.test.ts` | Add test: iterate all RECIPES + DRM_MEALS, assert `imageKey` is defined AND exists in `RECIPE_IMAGES`. |

**Acceptance tests:**
- Set an invalid imageKey temporarily → console warning fires with `[IMAGE_MISSING] key: xyz`
- All existing recipes pass the new test
- Normal operation: no warnings (all keys valid)

**Rollback:** Remove the warning log line. Remove the test.

**Risks:** None. Read-only audit + logging.

---

### A3: Hero Clipping — contentPosition Adjustment

**Current state:** Non-safe-frame images use `contentPosition="bottom"`. Some overhead-shot dishes clip at the bottom edge.

**Target:** Non-safe-frame images use `contentPosition="center"` instead of `"bottom"`. This centers the subject vertically, reducing clipping for both bowl and flat presentations. Safe-frame images (`heroSafeFrame=true`) keep `contentPosition="bottom"` with `contentFit="contain"`.

**Files to touch:**

| File | Change |
|------|--------|
| `components/DecisionCard.tsx` | Default `contentPosition`: `"bottom"` → `"center"`. Safe-frame keeps `"bottom"`. |

**Acceptance tests:**
- Overhead bowl shots (non-safe-frame): dish centered, no bottom clip
- Flat presentations (steak, sheet pan): centered, still looks bold
- Safe-frame images: unchanged (contain + bottom)

**Rollback:** Revert `contentPosition` to `"bottom"`.

**Risks:** Some images may look slightly different centered vs bottom-anchored. This is a subjective quality call but centers are generally safer for diverse compositions.

---

## Phase B — Visual Consistency

### B1: Tonight Header Identity

**Current state:** "Time to Eat" left-aligned with profile icon right.

**Target:** "FAST FOOD" centered, profile icon right (black, same size). No left icon (app has no logo asset; adding one would be scope creep). Title uses `textPrimary` (black). Blue only for interactive elements.

**Files to touch:**

| File | Change |
|------|--------|
| `app/tonight.tsx` | Header: change title "Time to Eat" → "FAST FOOD". Center title. Keep profile icon right. Ensure `textPrimary` color. |

**Acceptance tests:**
- "FAST FOOD" centered in header
- Profile icon right, black (`textSecondary`)
- No blue in header
- Safe area respected

**Rollback:** Revert title + alignment.

---

### B2: Button Color Drift Lock

**Current state:** All three mode buttons use identical styling (accentBlue border, accentBlue text, white bg). Selected state uses `rgba(37,99,235,0.08)` wash.

**Target:** Verify and lock. No code change expected — this is a verification step. If any drift is found, fix it.

**Acceptance tests:**
- All three buttons visually identical except label text
- Selected wash consistent across all three

---

### B3: Choose For Me Randomness (Verify)

Already fixed (uniform random, no memory). Verify after B1 header refactor.

**Acceptance tests:**
- 20 taps: all three modes appear, no bias

---

## Phase C — Interaction & Motion Corrections

### C1: Ingredients Overlay Clamp (Verify)

Already implemented (content-aware clamp, Level 2 gated). Verify correct.

**Acceptance tests:**
- Short list: stops at content edge
- Long list: caps at 50% container
- Level 2: requires deep pull (80px + 900px/s)

---

### C2: Remove AllergyIndicator from Deal Card

**Current state:** Amber hexagon badge at bottom-right of hero card showing allergen count.

**Target:** Remove entirely. No replacement.

**Files to touch:**

| File | Change |
|------|--------|
| `components/DecisionCard.tsx` | Remove `<AllergyIndicator>` render + import. |

**Acceptance tests:**
- No amber hexagon visible on any Deal card
- No yellow number indicator anywhere

**Rollback:** Restore the AllergyIndicator render.

**Risks:** None. The indicator was informational, not interactive.

---

### C3: Allergy Modal Glass Styling (Verify)

Already implemented (frosted bg + handle bar). Verify on Tonight + Deal.

**Acceptance tests:**
- Modal uses frosted bg, handle bar present, no opaque white

---

### C4: Passive Nudge (Verify)

Already implemented (4s lift, +1.5s nudge, first-session only). Verify persistence.

**Acceptance tests:**
- Fresh: sequence fires once
- After interaction: never again (this session or future)

---

## Phase D — Layout Polish

### D1: Settings Title Alignment

**Current state:** "Settings" left-aligned in a `header` View. Back button is absolutely positioned at top-left.

**Target:** Center "Settings" title. Back chevron at left. Both respect safe area.

**Files to touch:**

| File | Change |
|------|--------|
| `app/profile.tsx` | Header: center title text. Back button already positioned correctly. Add `textAlign: 'center'` or restructure header row. |

**Acceptance tests:**
- "Settings" centered horizontally
- Back chevron at left, no overlap
- Safe area respected on all devices

**Rollback:** Revert header styles.

---

### D2: CTA Width Adjustment

**Current state:** "CHOOSE FOR ME" CTA is full-width within `paddingHorizontal: spacing.lg` (24px each side).

**Target:** Slightly narrower — add extra horizontal margin (~8-12px each side beyond current padding) so CTA is visibly smaller than mode buttons while still prominent.

**Files to touch:**

| File | Change |
|------|--------|
| `app/tonight.tsx` | CTA button or wrapper: add `marginHorizontal: spacing.sm` or equivalent. |

**Acceptance tests:**
- CTA visually narrower than mode buttons
- Still readable, still prominent
- No cramping

**Rollback:** Remove margin.

---

## Phase E — Motion Tightening

### E1: Audit + Verify (Already Complete)

Phase E motion audit was executed in commit `fd12476`. All profiles verified, exceptions documented, content fades migrated to Whisper. No further code changes expected.

**Verification only:**
- Tonight→Deal: no stutter
- Deal→Checklist: no floating rectangle
- Rescue card: no gesture conflicts
- Cancel paths: deterministic

---

## Sequencing

```
A1 — DRM hero card (MUST ship first)     ~0.5 day
A2 — Image mismatch guardrails           ~0.25 day
A3 — Hero clipping contentPosition       ~0.1 day
B1 — Tonight header identity             ~0.25 day
B2 — Button color drift (verify only)    ~0 (manual check)
B3 — Choose For Me (verify only)         ~0 (manual check)
C1 — Overlay clamp (verify only)         ~0 (manual check)
C2 — Remove AllergyIndicator             ~0.1 day
C3 — Allergy modal (verify only)         ~0 (manual check)
C4 — Passive nudge (verify only)         ~0 (manual check)
D1 — Settings title alignment            ~0.1 day
D2 — CTA width adjustment                ~0.1 day
E1 — Motion verify (already done)        ~0 (manual check)
                                         ─────────
                                         ~1.4 days code + verification
```

A1 is the only critical path item. Everything else is independent and small.

---

## Gates (Every Phase)

```bash
npm run lint           # 0 warnings
npm run build:sanity   # tsc clean
npx expo export -p web # dist/ generated
npx jest               # all tests pass
```

---

## Rollback Strategy

Every phase is a single commit (or small set). `git revert <sha>` for any phase without affecting others. No phase has irreversible data or schema changes.
