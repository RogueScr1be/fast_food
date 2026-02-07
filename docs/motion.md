# Motion v2 — Design System

**File:** `lib/ui/motion.ts`

---

## Profiles

| Name | Type | Params | Target Feel | Use When |
|------|------|--------|-------------|----------|
| **Latex** | Spring | d=22, k=400, m=0.8 | ~150ms, snappy | Button presses, checkbox orbit, card spring-back on abort, micro confirms |
| **Vellum** | Spring | d=20, k=200, m=0.5 | ~250ms, natural | Glass overlay level snap, panel entrance, feedback prompt slide |
| **Oak** | Spring | d=28, k=180, m=1.0 | ~380ms, weighty | Tonight→Deal hero expansion, Deal→Checklist reverse-box, DRM card entrance |
| **Whisper** | Timing | 180ms, ease-out | Subtle, calm | Opacity fades, scrim, text reveals, clone fade-out |
| **WhisperSlow** | Timing | 350ms, ease-out | Longer reveal | Great Job text reveal, complex fade sequences |

---

## Hard Rules

### 1. Every animation uses a named profile

No ad-hoc `withSpring({ damping: 15, stiffness: 150 })` inline. If the existing profiles don't fit, add a new named profile to `motion.ts` with a JSDoc explaining its purpose.

### 2. Never spring opacity or light

Opacity, scrim alpha, text color, and blur tint must use **Whisper** (timing curve). Springs on non-physical properties feel wrong — they overshoot to >1.0 or dip below 0, creating flicker.

### 3. cancelAnimation on gesture start

Every gesture handler's `onStart` callback must `cancelAnimation()` on any shared value it will modify. This prevents stacking animations and ensures the gesture takes ownership cleanly.

```
// Correct
.onStart(() => {
  cancelAnimation(translateY);
  startY.value = translateY.value;
})

// Wrong — animation and gesture fight
.onStart(() => {
  startY.value = translateY.value;
})
```

### 4. No JS-thread work during motion

Inside `withSpring` / `withTiming` callbacks and `useAnimatedStyle`, do not:
- Call `setState`
- Read from `AsyncStorage`
- Compute complex expressions

Use `runOnJS()` to defer JS work to after the animation frame.

### 5. Interruptible by default

Prefer springs over timing curves for physical motion. Springs can be redirected mid-flight (set a new target value); timing curves cannot reverse naturally. Use timing (Whisper) only for non-physical properties.

---

## Where Each Profile Applies (Current Codebase)

| Location | Current Motion | Target Profile | Notes |
|----------|---------------|----------------|-------|
| Tonight clone expansion | `withTiming(350ms, bezier)` | Oak (spring) | Migration optional; timing works but isn't interruptible |
| Tonight clone fade-out | `withTiming(150ms)` | Whisper | Already close; standardize |
| Tonight scrim fade | `withTiming(210ms)` | Whisper | Already close |
| Deal card spring-back | `withSpring(0, {d:15, k:150})` | Latex | Tighter, less wobble |
| Deal card slide-out | `withTiming(250ms)` | Keep timing (250ms) | Slide-out is fire-and-forget, not interruptible |
| Glass overlay snap | `withSpring({d:20, k:200, m:0.5})` | Vellum | Already matches |
| Glass tint interpolation | `interpolateColor` (derived) | N/A | Not an animation; derived value |
| Idle nudge | `withTiming(600ms) + withSequence` | Keep custom | Idle motion is deliberate, not a UI response |
| Idle lift | `withTiming(800ms)` | WhisperSlow | Close; standardize |
| Idle reset | `withTiming(200ms)` | Whisper | Match |
| ChecklistStep orbit | `withTiming(300ms, linear)` | Keep custom | Orbit is a loading indicator, not physical |
| ChecklistStep strikethrough | `withTiming(250ms, ease-out)` | Whisper | Close; standardize |
| Great Job reveal | `withTiming(700ms, ease-out)` | WhisperSlow | Longer reveal |
| Great Job fade-out | `withTiming(200ms)` | Whisper | Match |

---

## Adding a New Profile

If you need motion that doesn't fit Latex/Vellum/Oak/Whisper:

1. Add it to `lib/ui/motion.ts` with a descriptive name and JSDoc.
2. Document it in this file with use case.
3. Update CLAUDE.md if it introduces a new category.

Do NOT create one-off inline configs. The whole point of this system is consistency.
