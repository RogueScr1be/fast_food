/**
 * LockedTransition — Micro-state "Locked." overlay
 * 
 * Displays a calm "Locked." confirmation before navigating to checklist.
 * Timing: fade in 200ms, hold 600ms, fade out 200ms (total 1000ms)
 * 
 * Design: Centered, minimal, no confetti or gimmicks.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { colors, typography } from '../lib/ui/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Timing constants
const FADE_IN_DURATION = 200;
const HOLD_DURATION = 600;
const FADE_OUT_DURATION = 200;
export const TOTAL_DURATION = FADE_IN_DURATION + HOLD_DURATION + FADE_OUT_DURATION;

interface LockedTransitionProps {
  visible: boolean;
  onComplete?: () => void;
}

export function LockedTransition({ visible, onComplete }: LockedTransitionProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (visible) {
      // Sequence: fade in -> hold -> fade out -> callback
      Animated.sequence([
        // Fade in with subtle scale
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: FADE_IN_DURATION,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: FADE_IN_DURATION,
            useNativeDriver: true,
          }),
        ]),
        // Hold
        Animated.delay(HOLD_DURATION),
        // Fade out
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_OUT_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Reset for next use
        scale.setValue(0.95);
        onComplete?.();
      });
    }
  }, [visible, opacity, scale, onComplete]);

  if (!visible) {
    return null;
  }

  return (
    <Animated.View 
      style={[
        styles.overlay,
        { opacity }
      ]}
      pointerEvents="auto"
    >
      <Animated.View style={[styles.content, { transform: [{ scale }] }]}>
        <Text style={styles.text}>Locked.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: 'rgba(250, 250, 250, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  content: {
    alignItems: 'center',
  },
  text: {
    fontSize: typography['3xl'],
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    letterSpacing: 1,
  },
});
