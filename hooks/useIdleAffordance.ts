/**
 * useIdleAffordance — Silent Onboarding via Staged Motion
 *
 * Step 1 (default 2s idle):  Glass overlay lifts slightly (teaches panel)
 * Step 2 (+default 1s):      Card nudges horizontally (teaches swipe)
 *
 * One-shot per eligibility period. No looping.
 * resetIdle() cancels timers and snaps values to rest.
 * Session persistence is handled by the caller (deal.tsx).
 */

import { useRef, useCallback, useEffect } from 'react';
import {
  useSharedValue,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { idle } from '../lib/ui/theme';
import {
  whisper,
  getShouldReduceMotion,
  getReducedMotionDuration,
} from '../lib/ui/motion';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Time before glass lift (Step 1) */
export const STEP1_DELAY_MS = 2000;
/** Additional time before card nudge (Step 2) */
export const STEP2_DELAY_MS = 1000;

export const NUDGE_PX = idle.nudgePx; // 12
export const LIFT_PX = idle.liftPx; // 40

const NUDGE_DURATION = 600; // Exception: pedagogical timing, not UI response
const LIFT_DURATION = 800; // Exception: pedagogical timing, not UI response
const RESET_DURATION = 200;

// Keep old export name for test compatibility
export const IDLE_THRESHOLD_MS = STEP1_DELAY_MS;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseIdleAffordanceOptions {
  /** Enable / disable. When false, timers are cleared and values snap to 0. */
  enabled?: boolean;
  liftDelayMs?: number;
  nudgeDelayMs?: number;
  onLiftStart?: () => void;
  onSequenceComplete?: () => void;
}

export interface UseIdleAffordanceReturn {
  nudgeX: ReturnType<typeof useSharedValue<number>>;
  overlayLiftY: ReturnType<typeof useSharedValue<number>>;
  isIdle: boolean;
  /** Cancel timers + reset values. Call on any user interaction. */
  resetIdle: () => void;
  restartIdle: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useIdleAffordance(
  options: UseIdleAffordanceOptions = {},
): UseIdleAffordanceReturn {
  const {
    enabled = true,
    liftDelayMs = STEP1_DELAY_MS,
    nudgeDelayMs = STEP2_DELAY_MS,
    onLiftStart,
    onSequenceComplete,
  } = options;

  const nudgeX = useSharedValue(0);
  const overlayLiftY = useSharedValue(0);
  const isIdleRef = useRef(false);
  const firedRef = useRef(false); // one-shot guard for this mount cycle
  const timer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer3Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotionRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timer1Ref.current) {
      clearTimeout(timer1Ref.current);
      timer1Ref.current = null;
    }
    if (timer2Ref.current) {
      clearTimeout(timer2Ref.current);
      timer2Ref.current = null;
    }
    if (timer3Ref.current) {
      clearTimeout(timer3Ref.current);
      timer3Ref.current = null;
    }
  }, []);

  /** Step 1: lift glass overlay */
  const triggerStep1 = useCallback(() => {
    isIdleRef.current = true;
    onLiftStart?.();

    if (reduceMotionRef.current) {
      if (onSequenceComplete) {
        timer3Ref.current = setTimeout(onSequenceComplete, nudgeDelayMs);
      }
      return;
    }

    overlayLiftY.value = withTiming(LIFT_PX, {
      duration: LIFT_DURATION,
      easing: Easing.out(Easing.ease),
    });

    // Schedule Step 2
    timer2Ref.current = setTimeout(() => {
      // Step 2: nudge card horizontally (single pulse)
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

      if (onSequenceComplete) {
        timer3Ref.current = setTimeout(() => {
          onSequenceComplete();
        }, NUDGE_DURATION * 2);
      }
    }, nudgeDelayMs);
  }, [nudgeX, overlayLiftY, nudgeDelayMs, onLiftStart, onSequenceComplete]);

  /** Start the staged sequence (one-shot) */
  const startSequence = useCallback(() => {
    if (firedRef.current) return; // already fired this mount
    clearTimers();
    timer1Ref.current = setTimeout(() => {
      firedRef.current = true;
      triggerStep1();
    }, liftDelayMs);
  }, [clearTimers, triggerStep1, liftDelayMs]);

  /** Reset: cancel everything, snap values to 0 */
  const resetIdle = useCallback(() => {
    clearTimers();
    isIdleRef.current = false;
    const resetDuration = getReducedMotionDuration(RESET_DURATION, reduceMotionRef.current);
    nudgeX.value = withTiming(0, { ...whisper, duration: resetDuration });
    overlayLiftY.value = withTiming(0, { ...whisper, duration: resetDuration });
    // Do NOT restart — one-shot. Once reset, it's done.
  }, [clearTimers, nudgeX, overlayLiftY]);

  const restartIdle = useCallback(() => {
    if (!enabled || firedRef.current) return;
    startSequence();
  }, [enabled, startSequence]);

  useEffect(() => {
    let alive = true;
    getShouldReduceMotion()
      .then((value) => {
        if (alive) reduceMotionRef.current = value;
      });

    return () => {
      alive = false;
    };
  }, []);

  // Lifecycle: start sequence when enabled, clear on disable/unmount
  useEffect(() => {
    if (enabled && !firedRef.current) {
      startSequence();
    } else if (!enabled) {
      clearTimers();
      isIdleRef.current = false;
      nudgeX.value = 0;
      overlayLiftY.value = 0;
    }
    return clearTimers;
  }, [enabled, startSequence, clearTimers, nudgeX, overlayLiftY]);

  return {
    nudgeX,
    overlayLiftY,
    isIdle: isIdleRef.current,
    resetIdle,
    restartIdle,
  };
}

export default useIdleAffordance;
