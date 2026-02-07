/**
 * Motion v2 — Harmonic Motion Token System
 *
 * Four named profiles for all animations in the app.
 * Springs for physical motion; timing curves for opacity/light.
 *
 * Rules:
 *   1. Every animation must use a named profile from this file.
 *   2. Never use withSpring for opacity, scrim, or text fades (use Whisper).
 *   3. Always cancelAnimation() on gesture start before setting new values.
 *   4. No JS-thread work during active motion (keep callbacks on UI thread).
 *   5. Ad-hoc spring/timing constants are not allowed. Add a profile here
 *      if none fits.
 */

import { Easing } from 'react-native-reanimated';

// ---------------------------------------------------------------------------
// Spring Profiles (for withSpring)
// ---------------------------------------------------------------------------

/**
 * Latex — Snappy spring.
 * Buttons, micro confirms, card spring-back on abort.
 * Target feel: ~150ms to settle. Tight, decisive, no wobble.
 */
export const latex = {
  damping: 22,
  stiffness: 400,
  mass: 0.8,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
} as const;

/**
 * Vellum — Natural spring.
 * Glass overlay snapping, panel transitions, feedback prompt.
 * Target feel: ~250ms to settle. Smooth, organic hand.
 */
export const vellum = {
  damping: 20,
  stiffness: 200,
  mass: 0.5,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
} as const;

/**
 * Oak — Hero spring.
 * Large-surface transitions: Tonight→Deal, Deal→Checklist reverse-box.
 * Target feel: ~380ms to settle. Weighty, deliberate, <1% overshoot.
 */
export const oak = {
  damping: 28,
  stiffness: 180,
  mass: 1.0,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
} as const;

// ---------------------------------------------------------------------------
// Timing Profile (for withTiming)
// ---------------------------------------------------------------------------

/**
 * Whisper — Timing curve for non-physical motion.
 * Opacity fades, scrim transitions, text reveals, light changes.
 * NEVER use spring for these — springs on opacity feel wrong.
 */
export const whisper = {
  duration: 180,
  easing: Easing.out(Easing.ease),
} as const;

/**
 * Whisper variant for longer reveals (e.g. Great Job overlay).
 */
export const whisperSlow = {
  duration: 350,
  easing: Easing.out(Easing.ease),
} as const;

// ---------------------------------------------------------------------------
// Easing Helpers
// ---------------------------------------------------------------------------

/** Standard ease-out for most timing animations. */
export const easeOut = Easing.out(Easing.ease);

/** Smooth bezier for hero expansion (matches Tonight clone curve). */
export const heroEase = Easing.bezier(0.25, 0.1, 0.25, 1);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpringProfile = typeof latex | typeof vellum | typeof oak;
export type TimingProfile = typeof whisper | typeof whisperSlow;
