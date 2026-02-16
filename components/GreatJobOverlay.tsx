/**
 * GreatJobOverlay — Completion celebration overlay
 *
 * Phase 3.0.4: "Great Job!" text reveals left-to-right (≤700ms).
 * Tap anywhere skips to fully revealed + dismisses.
 * Auto-dismiss after reveal + 500ms hold.
 *
 * Only triggers on the edge: visible transitions from false → true.
 * Does NOT fire on screen mount if already complete.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { Pressable, Text, StyleSheet, Platform, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { colors, typography } from '../lib/ui/theme';
import {
  whisper,
  getShouldReduceMotion,
  getReducedMotionDuration,
} from '../lib/ui/motion';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REVEAL_DURATION = 700;  // Exception: longer than whisperSlow (350ms) for handwriting feel
const HOLD_DURATION = 500;    // ms — hold after reveal before dismiss

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GreatJobOverlayProps {
  /** Show the overlay (edge-triggered: only animates on false → true) */
  visible: boolean;
  /** Called when the overlay dismisses (after animation or tap) */
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GreatJobOverlay({ visible, onDismiss }: GreatJobOverlayProps) {
  const overlayOpacity = useSharedValue(0);
  const revealWidth = useSharedValue(0);  // 0 → 1 (clip fraction)
  const wasVisible = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    getShouldReduceMotion().then((value) => {
      if (mountedRef.current) reduceMotionRef.current = value;
    });
    return () => {
      mountedRef.current = false;
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const doDismiss = useCallback(() => {
    // Fade out (Whisper)
    const dismissDuration = getReducedMotionDuration(
      whisper.duration,
      reduceMotionRef.current,
    );
    overlayOpacity.value = withTiming(0, { ...whisper, duration: dismissDuration });
    dismissTimer.current = setTimeout(() => {
      if (mountedRef.current) onDismiss();
    }, dismissDuration + 30);
  }, [onDismiss, overlayOpacity]);

  // Edge detection: only animate on false → true
  useEffect(() => {
    if (visible && !wasVisible.current) {
      // Start reveal
      wasVisible.current = true;
      cancelAnimation(overlayOpacity);
      cancelAnimation(revealWidth);

      const reduceMotion = reduceMotionRef.current;
      const fadeInDuration = getReducedMotionDuration(whisper.duration, reduceMotion);
      overlayOpacity.value = withTiming(1, { ...whisper, duration: fadeInDuration });

      if (reduceMotion) {
        revealWidth.value = 1;
      } else {
        revealWidth.value = 0;
        revealWidth.value = withTiming(1, {
          duration: REVEAL_DURATION,
          easing: Easing.out(Easing.ease),
        });
      }

      // Auto-dismiss after reveal + hold
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => {
        if (mountedRef.current) doDismiss();
      }, (reduceMotion ? fadeInDuration : REVEAL_DURATION) + HOLD_DURATION);
    }

    if (!visible) {
      wasVisible.current = false;
      cancelAnimation(overlayOpacity);
      cancelAnimation(revealWidth);
      overlayOpacity.value = 0;
      revealWidth.value = 0;
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    }
  }, [visible]);

  // Tap to skip: snap to full reveal + dismiss
  const handleTap = useCallback(() => {
    if (!visible) return;
    cancelAnimation(revealWidth);
    revealWidth.value = 1;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    doDismiss();
  }, [visible, revealWidth, doDismiss]);

  // Animated styles
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const clipStyle = useAnimatedStyle(() => ({
    width: `${revealWidth.value * 100}%` as any,
  }));

  if (!visible && overlayOpacity.value === 0) return null;

  return (
    <Animated.View style={[styles.overlay, overlayStyle]}>
      {Platform.OS === 'ios' ? (
        <>
          <BlurView intensity={25} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.iosTint} pointerEvents="none" />
        </>
      ) : (
        <View style={styles.androidTint} pointerEvents="none" />
      )}
      <Pressable style={styles.pressable} onPress={handleTap}>
        {/* Clip container: reveals text left to right */}
        <Animated.View style={[styles.clipContainer, clipStyle]}>
          <Text style={styles.text} numberOfLines={1}>
            Great Job!
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  iosTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248, 249, 252, 0.62)',
  },
  androidTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245, 247, 251, 0.92)',
  },
  pressable: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clipContainer: {
    overflow: 'hidden',
    // Width animates from 0% to 100% — clips the text
  },
  text: {
    fontSize: typography['4xl'],
    fontWeight: typography.bold,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    // Prevent text from wrapping during clip reveal
    width: 300,
    textAlign: 'center',
  },
});

export default GreatJobOverlay;
