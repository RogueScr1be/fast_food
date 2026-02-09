/**
 * useIdleAffordance — Silent Onboarding via Staged Motion
 *
 * Phase C: Two-step affordance sequence, first-session only.
 *
 * Step 1 (default 4s idle):  Glass overlay lifts slightly (teaches panel)
 * Step 2 (+default 1.5s):    Card nudges horizontally (teaches swipe)
 *
 * One-shot: fires once per eligibility period, never loops.
 * Any user interaction should call resetIdle() to cancel + snap back to rest.
 *
 * Persistence (hasSeenAffordance) is handled by the caller (deal.tsx).
 */

import { useRef, useCallback, useEffect } from 'react';
import {
  useSharedValue,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { idle } from '@/lib/ui/theme';

export interface UseIdleAffordanceOptions {
  /** Enable / disable the sequence. When false: clears timers + snaps values to 0. */
  enabled?: boolean;
  /** Delay before Step 1 (glass lift). Default 4000ms */
  liftDelayMs?: number;
  /** Additional delay after Step 1 before Step 2 (card nudge). Default 1500ms */
  nudgeDelayMs?: number;
}

export interface UseIdleAffordanceReturn {
  nudgeX: ReturnType<typeof useSharedValue<number>>;
  overlayLiftY: ReturnType<typeof useSharedValue<number>>;
  isIdle: boolean;
  /** Cancel timers + reset values. Call on any user interaction. */
  resetIdle: () => void;
}

// Defaults match spec
const DEFAULT_LIFT_DELAY_MS = 4000;
const DEFAULT_NUDGE_DELAY_MS = 1500;

// Motion values from theme (your tokens)
const NUDGE_PX = idle.nudgePx; // 12
const LIFT_PX = idle.liftPx; // 40

// Pedagogical durations (intentionally not “physical” springs)
const NUDGE_DURATION_MS = 600;
const LIFT_DURATION_MS = 800;
const RESET_DURATION_MS = 200;

export function useIdleAffordance(
  options: UseIdleAffordanceOptions = {},
): UseIdleAffordanceReturn {
  const {
    enabled = true,
    liftDelayMs = DEFAULT_LIFT_DELAY_MS,
    nudgeDelayMs = DEFAULT_NUDGE_DELAY_MS,
  } = options;

  const nudgeX = useSharedValue(0);
  const overlayLiftY = useSharedValue(0);

  const isIdleRef = useRef(false);
  const firedRef = useRef(false); // one-shot per mount/eligibility period

  const timer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timer1Ref.current) {
      clearTimeout(timer1Ref.current);
      timer1Ref.current = null;
    }
    if (timer2Ref.current) {
      clearTimeout(timer2Ref.current);
      timer2Ref.current = null;
    }
  }, []);

  const triggerStep2 = useCallback(() => {
    // single pulse
    nudgeX.value = withSequence(
      withTiming(NUDGE_PX, {
        duration: NUDGE_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      withTiming(0, {
        duration: NUDGE_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
      }),
    );
  }, [nudgeX]);

  const triggerStep1 = useCallback(() => {
    isIdleRef.current = true;

    overlayLiftY.value = withTiming(LIFT_PX, {
      duration: LIFT_DURATION_MS,
      easing: Easing.out(Easing.ease),
    });

    timer2Ref.current = setTimeout(() => {
      triggerStep2();
    }, nudgeDelayMs);
  }, [overlayLiftY, triggerStep2, nudgeDelayMs]);

  const startSequence = useCallback(() => {
    if (firedRef.current) return;
    clearTimers();

    timer1Ref.current = setTimeout(() => {
      firedRef.current = true;
      triggerStep1();
    }, liftDelayMs);
  }, [clearTimers, triggerStep1, liftDelayMs]);

  const resetIdle = useCallback(() => {
    clearTimers();
    isIdleRef.current = false;

    // cancel any in-flight animations cleanly
    cancelAnimation(nudgeX);
    cancelAnimation(overlayLiftY);

    nudgeX.value = withTiming(0, { duration: RESET_DURATION_MS, easing: Easing.out(Easing.ease) });
    overlayLiftY.value = withTiming(0, { duration: RESET_DURATION_MS, easing: Easing.out(Easing.ease) });

    // one-shot: do NOT restart timers here
  }, [clearTimers, nudgeX, overlayLiftY]);

  useEffect(() => {
    if (enabled) {
      // if enabled flips true after async load, we arm here
      if (!firedRef.current) startSequence();
    } else {
      // disabling should hard snap to rest and stop everything
      clearTimers();
      isIdleRef.current = false;
      cancelAnimation(nudgeX);
      cancelAnimation(overlayLiftY);
      nudgeX.value = 0;
      overlayLiftY.value = 0;
    }

    return () => {
      clearTimers();
    };
  }, [enabled, startSequence, clearTimers, nudgeX, overlayLiftY]);

  return {
    nudgeX,
    overlayLiftY,
    isIdle: isIdleRef.current,
    resetIdle,
  };
}

export default useIdleAffordance;
