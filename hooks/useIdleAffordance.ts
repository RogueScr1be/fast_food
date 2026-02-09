/**
 * useIdleAffordance — Silent Onboarding via Staged Motion
 *
 * Phase C: Two-step affordance sequence, first-session only.
 *
 * Step 1 (4s idle):  Glass overlay lifts slightly (teaches panel)
 * Step 2 (+1.5s):    Card nudges horizontally (teaches swipe)
 *
 * One-shot: fires once per eligibility period, never loops.
 * Any user interaction cancels + resets values to 0.
 *
 * The hook does NOT manage persistence (hasSeenAffordance).
 * The caller (deal.tsx) controls `enabled` based on persisted state.
 */

// hooks/useIdleAffordance.ts
import { useCallback, useEffect, useRef } from 'react';
import { motion } from '@/lib/ui/motion'; // adjust import to your actual motion token file

type Args = {
  enabled: boolean;
  liftDelayMs?: number;     // default 4000
  nudgeDelayMs?: number;    // default 1500 (after lift)
};

export function useIdleAffordance({
  enabled,
  liftDelayMs = 4000,
  nudgeDelayMs = 1500,
}: Args) {
  const nudgeX = useSharedValue(0);
  const overlayLiftY = useSharedValue(0);

  const timerLiftRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerNudgeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const firedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timerLiftRef.current) {
      clearTimeout(timerLiftRef.current);
      timerLiftRef.current = null;
    }
    if (timerNudgeRef.current) {
      clearTimeout(timerNudgeRef.current);
      timerNudgeRef.current = null;
    }
  }, []);

  const resetIdle = useCallback(() => {
    // cancel any pending triggers
    clearTimers();

    // cancel animations + snap back
    cancelAnimation(nudgeX);
    cancelAnimation(overlayLiftY);

    nudgeX.value = withTiming(0, motion.whisper);
    overlayLiftY.value = withTiming(0, motion.whisper);
    // IMPORTANT: do NOT restart timers here (one-shot behavior)
  }, [clearTimers, nudgeX, overlayLiftY]);

  useEffect(() => {
    // If disabled, always clean and do nothing.
    if (!enabled) {
      clearTimers();
      firedRef.current = true; // treat disabled as “already done”
      cancelAnimation(nudgeX);
      cancelAnimation(overlayLiftY);
      nudgeX.value = 0;
      overlayLiftY.value = 0;
      return;
    }

    // If already fired (one-shot), do nothing.
    if (firedRef.current) return;

    // Schedule staged affordance
    timerLiftRef.current = setTimeout(() => {
      // Step 1: lift glass (teach handle)
      overlayLiftY.value = withTiming(-40, motion.whisper);

      timerNudgeRef.current = setTimeout(() => {
        // Step 2: nudge card (teach swipe)
        // single pulse: 0 -> 12 -> 0
        nudgeX.value = withTiming(12, { duration: 220, easing: Easing.out(Easing.ease) }, () => {
          nudgeX.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.ease) });
        });

        firedRef.current = true;
      }, nudgeDelayMs);
    }, liftDelayMs);

    return () => {
      clearTimers();
    };
  }, [enabled, liftDelayMs, nudgeDelayMs, clearTimers, nudgeX, overlayLiftY]);

  return {
    nudgeX,
    overlayLiftY,
    resetIdle,
  };
}
