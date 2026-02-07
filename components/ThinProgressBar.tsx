/**
 * ThinProgressBar — Consistent progress indicator
 * 
 * A calm, minimal progress bar used across:
 * - Tonight mode selection
 * - Checklist progress
 * 
 * Specs:
 * - Height: 3px
 * - Track: theme border color
 * - Fill: theme accentBlue
 * - Animation: 220ms timing (no bounce)
 */

import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors, radii } from '../lib/ui/theme';

const BAR_HEIGHT = 3;
const ANIMATION_DURATION = 220;

interface ThinProgressBarProps {
  /** Progress value from 0 to 1 */
  value: number;
  /** Optional accessibility label */
  accessibilityLabel?: string;
}

export function ThinProgressBar({ value, accessibilityLabel }: ThinProgressBarProps) {
  const animatedWidth = useRef(new Animated.Value(value)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: value,
      duration: ANIMATION_DURATION,
      useNativeDriver: false,
    }).start();
  }, [value, animatedWidth]);

  const widthPercent = animatedWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel || 'Progress'}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
    >
      <Animated.View style={[styles.fill, { width: widthPercent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: BAR_HEIGHT,
    backgroundColor: colors.border,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  fill: {
    height: BAR_HEIGHT,
    backgroundColor: colors.accentBlue,
    borderRadius: radii.full,
  },
});

export default ThinProgressBar;
