/**
 * ChecklistStep — Animated Checkbox with Orbit Loader + Strikethrough
 *
 * Phase 3.0.2: tap triggers orbit animation (≤300ms) then blue fill +
 * strikethrough travel (≤250ms). Uncheck is instant (no animation).
 * Pure Reanimated — no external libraries.
 *
 * Orbit: a rotating arc (border trick) that spins once around the
 * checkbox, then collapses into the filled blue circle.
 *
 * Strikethrough: a blue line that grows left-to-right across the
 * step text, triggered after the orbit completes.
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { colors, spacing, radii, typography, MIN_TOUCH_TARGET } from '../lib/ui/theme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORBIT_DURATION = 300;   // ms — full orbit rotation
const STRIKE_DURATION = 250;  // ms — strikethrough travel
const CHECKBOX_SIZE = 24;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChecklistStepProps {
  /** Step index (for display as "Step N") */
  index: number;
  /** Step text */
  text: string;
  /** Whether this step is completed */
  completed: boolean;
  /** Called when user taps the step */
  onToggle: () => void;
  /** If true, show "Step N" label above text (checklist style) */
  showStepLabel?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChecklistStep({
  index,
  text,
  completed,
  onToggle,
  showStepLabel = true,
}: ChecklistStepProps) {
  // Orbit progress: 0 → 1 (rotation from 0° to 360°)
  const orbitProgress = useSharedValue(completed ? 1 : 0);
  // Fill opacity: 0 → 1 (checkbox fills blue)
  const fillOpacity = useSharedValue(completed ? 1 : 0);
  // Strikethrough width fraction: 0 → 1
  const strikeFraction = useSharedValue(completed ? 1 : 0);
  // Check icon opacity
  const checkOpacity = useSharedValue(completed ? 1 : 0);

  useEffect(() => {
    if (completed) {
      // Animate in: orbit → fill → strikethrough
      // Cancel any prior animations to handle rapid taps
      cancelAnimation(orbitProgress);
      cancelAnimation(fillOpacity);
      cancelAnimation(strikeFraction);
      cancelAnimation(checkOpacity);

      // Orbit spins over ORBIT_DURATION
      orbitProgress.value = 0;
      orbitProgress.value = withTiming(1, {
        duration: ORBIT_DURATION,
        easing: Easing.linear,
      });

      // Fill + check appear at end of orbit
      fillOpacity.value = withDelay(
        ORBIT_DURATION - 50,
        withTiming(1, { duration: 80 }),
      );
      checkOpacity.value = withDelay(
        ORBIT_DURATION - 30,
        withTiming(1, { duration: 80 }),
      );

      // Strikethrough starts right after orbit
      strikeFraction.value = withDelay(
        ORBIT_DURATION,
        withTiming(1, { duration: STRIKE_DURATION, easing: Easing.out(Easing.ease) }),
      );
    } else {
      // Instant revert — no animation on uncheck
      cancelAnimation(orbitProgress);
      cancelAnimation(fillOpacity);
      cancelAnimation(strikeFraction);
      cancelAnimation(checkOpacity);
      orbitProgress.value = 0;
      fillOpacity.value = 0;
      strikeFraction.value = 0;
      checkOpacity.value = 0;
    }
  }, [completed]);

  // -- Animated styles --

  // Orbit arc: a rotating partial border
  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitProgress.value * 360}deg` }],
    opacity: orbitProgress.value < 1 && orbitProgress.value > 0 ? 1 : 0,
  }));

  // Blue fill circle
  const fillStyle = useAnimatedStyle(() => ({
    opacity: fillOpacity.value,
  }));

  // Check icon
  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
  }));

  // Strikethrough line
  const strikeStyle = useAnimatedStyle(() => ({
    width: `${strikeFraction.value * 100}%` as any,
  }));

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: completed }}
      accessibilityLabel={`Step ${index + 1}: ${text}`}
    >
      {/* Checkbox area */}
      <View style={styles.checkboxContainer}>
        {/* Base ring (always visible) */}
        <View style={styles.checkboxRing} />

        {/* Orbit arc (visible during animation only) */}
        <Animated.View style={[styles.orbitArc, orbitStyle]} />

        {/* Blue fill (appears at end of orbit) */}
        <Animated.View style={[styles.checkboxFill, fillStyle]}>
          <Animated.View style={checkStyle}>
            <Check size={14} color={colors.textInverse} />
          </Animated.View>
        </Animated.View>
      </View>

      {/* Text content */}
      <View style={styles.textContainer}>
        {showStepLabel && (
          <Text style={[styles.stepLabel, completed && styles.stepLabelDone]}>
            Step {index + 1}
          </Text>
        )}
        <View style={styles.textWrapper}>
          <Text style={[styles.stepText, completed && styles.stepTextDone]}>
            {text}
          </Text>
          {/* Strikethrough line — animates left to right */}
          <Animated.View style={[styles.strikeLine, strikeStyle]} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    minHeight: MIN_TOUCH_TARGET,
  },

  // Checkbox
  checkboxContainer: {
    width: CHECKBOX_SIZE,
    height: CHECKBOX_SIZE,
    marginRight: spacing.md,
    marginTop: 2,
    position: 'relative',
  },
  checkboxRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.border,
  },
  orbitArc: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.accentBlue,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  checkboxFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.sm,
    backgroundColor: colors.accentBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Text
  textContainer: {
    flex: 1,
  },
  stepLabel: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.textMuted,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepLabelDone: {
    color: colors.textMuted,
  },
  textWrapper: {
    position: 'relative',
  },
  stepText: {
    fontSize: typography.base,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  stepTextDone: {
    color: colors.textMuted,
  },
  strikeLine: {
    position: 'absolute',
    left: 0,
    top: '50%',
    height: 1.5,
    backgroundColor: colors.accentBlue,
    opacity: 0.5,
  },
});

export default ChecklistStep;
