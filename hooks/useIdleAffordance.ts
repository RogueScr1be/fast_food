/**
 * useIdleAffordance — Silent Onboarding via Staged Motion
 *
 * Step 1 (default 4s idle):  Glass overlay lifts slightly (teaches panel)
 * Step 2 (+default 1.5s):    Card nudges horizontally (teaches swipe)
 *
 * One-shot per eligibility period. No looping.
 * resetIdle() cancels timers and snaps values to rest.
 * Persistence is handled by the caller (deal.tsx) via hasSeenAffordance.
 */

import { useRef, useCallback, useEffect } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import {
  useSharedValue,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { idle } from '@/lib/ui/theme';

export interface UseIdleAffordanceOptions {
  enabled?: boolean;
  liftDelayMs?: number;
  nudgeDelayMs?: number;
}

export interface UseIdleAffordanceReturn {
  nudgeX: SharedValue<number>;
  overlayLiftY: SharedValue<number>;
  isIdle: boolean;
  resetIdle: () => void;
}

const DEFAULT_LIFT_DELAY_MS = 4000;
const DEFAULT_NUDGE_DELAY_MS = 1500;

const NUDGE_PX = idle.nudgePx; // 12
const LIFT_PX = idle.liftPx; // 40

// Keep these “pedagogical” timings (not physical UI response)
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

  const nudgeX = useSharedValue<number>(0);
  const overlayLiftY = useSharedValue<number>(0);

  const isIdleRef = useRef(false);
  const firedRef = useRef(false);

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
    // Horizontal “swipe affordance” pulse
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

    // Lift the glass overlay slightly
    overlayLiftY.value = withTiming(LIFT_PX, {
      duration: LIFT_DURATION_MS,
      easing: Easing.out(Easing.ease),
    });

    // Schedule Step 2 after Step 1 has begun
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

    cancelAnimation(nudgeX);
    cancelAnimation(overlayLiftY);

    // Snap back gently (do NOT restart timers)
    nudgeX.value = withTiming(0, {
      duration: RESET_DURATION_MS,
      easing: Easing.out(Easing.ease),
    });
    overlayLiftY.value = withTiming(0, {
      duration: RESET_DURATION_MS,
      easing: Easing.out(Easing.ease),
    });
  }, [clearTimers, nudgeX, overlayLiftY]);

  useEffect(() => {
    if (enabled) {
      if (!firedRef.current) startSequence();
    } else {
      // If disabled (seen already), guarantee everything is reset and quiet.
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
