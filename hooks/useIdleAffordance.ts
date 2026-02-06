/**
 * useIdleAffordance — Passive Onboarding via Motion
 *
 * After ~7 s of idle on a deal card, emits animated values for:
 *   - nudgeX:       subtle horizontal card shift (~12 px)
 *   - overlayLiftY: partial glass overlay lift   (~40 px)
 *
 * Design Constitution alignment:
 *   Article VII — "Behavioral Training Over Instruction"
 *   No text, no tooltip, no modal. Motion alone teaches affordance.
 *
 * Usage:
 *   const { nudgeX, overlayLiftY, isIdle, resetIdle } = useIdleAffordance();
 *
 *   // On any user gesture:
 *   resetIdle();
 *
 *   // Apply to card:
 *   useAnimatedStyle(() => ({ transform: [{ translateX: nudgeX.value }] }));
 *
 *   // Pass to GlassOverlay:
 *   <GlassOverlay externalLiftY={overlayLiftY} ... />
 *
 * The hook can be toggled off via `enabled: false` — it immediately
 * clears the timer and resets all animated values to zero.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  useSharedValue,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { idle } from '../lib/ui/theme';

// ---------------------------------------------------------------------------
// Constants (from theme, re-exported for test access)
// ---------------------------------------------------------------------------

export const IDLE_THRESHOLD_MS = idle.thresholdMs;  // 7 000
export const NUDGE_PX = idle.nudgePx;               // 12
export const LIFT_PX = idle.liftPx;                  // 40

/** Duration for the nudge half-cycle (px → 0 or 0 → px) */
const NUDGE_DURATION = 600;
/** Duration for the lift animation */
const LIFT_DURATION = 800;
/** Duration for the reset (back to zero) animation */
const RESET_DURATION = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseIdleAffordanceOptions {
  /** Enable / disable the timer. Default: true. */
  enabled?: boolean;
  /** Override idle threshold for testing (ms). */
  thresholdMs?: number;
}

export interface UseIdleAffordanceReturn {
  /** Shared animated value: horizontal card nudge (px, 0 at rest) */
  nudgeX: ReturnType<typeof useSharedValue<number>>;
  /** Shared animated value: overlay lift offset (px, 0 at rest, positive = up) */
  overlayLiftY: ReturnType<typeof useSharedValue<number>>;
  /** Whether the idle animation has triggered */
  isIdle: boolean;
  /** Reset idle timer and snap values to 0. Call on any user input. */
  resetIdle: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useIdleAffordance(
  options: UseIdleAffordanceOptions = {},
): UseIdleAffordanceReturn {
  const { enabled = true, thresholdMs = IDLE_THRESHOLD_MS } = options;

  const nudgeX = useSharedValue(0);
  const overlayLiftY = useSharedValue(0);
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ------- internal helpers ------------------------------------------------

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Trigger the idle animations (card nudge + glass lift). */
  const triggerIdle = useCallback(() => {
    setIsIdle(true);

    // Horizontal nudge: 0 → NUDGE_PX → 0 (single pulse)
    nudgeX.value = withSequence(
      withTiming(NUDGE_PX, {
        duration: NUDGE_DURATION,
        easing: Easing.inOut(Easing.ease),
      }),
      withTiming(0, {
        duration: NUDGE_DURATION,
        easing: Easing.inOut(Easing.ease),
      }),
    );

    // Overlay lift: 0 → LIFT_PX (stays lifted until reset)
    overlayLiftY.value = withTiming(LIFT_PX, {
      duration: LIFT_DURATION,
      easing: Easing.out(Easing.ease),
    });
  }, [nudgeX, overlayLiftY]);

  /** Start (or restart) the idle countdown. */
  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(triggerIdle, thresholdMs);
  }, [clearTimer, triggerIdle, thresholdMs]);

  // ------- public API ------------------------------------------------------

  /** Reset all idle state and restart the timer. */
  const resetIdle = useCallback(() => {
    clearTimer();
    setIsIdle(false);

    // Animate values back to rest
    nudgeX.value = withTiming(0, { duration: RESET_DURATION });
    overlayLiftY.value = withTiming(0, { duration: RESET_DURATION });

    // Restart countdown if enabled
    if (enabled) {
      startTimer();
    }
  }, [clearTimer, enabled, startTimer, nudgeX, overlayLiftY]);

  // ------- lifecycle -------------------------------------------------------

  useEffect(() => {
    if (enabled) {
      startTimer();
    } else {
      clearTimer();
      setIsIdle(false);
      // Snap to rest immediately (no animation when disabled)
      nudgeX.value = 0;
      overlayLiftY.value = 0;
    }

    return clearTimer;
  }, [enabled, startTimer, clearTimer, nudgeX, overlayLiftY]);

  return { nudgeX, overlayLiftY, isIdle, resetIdle };
}

export default useIdleAffordance;
