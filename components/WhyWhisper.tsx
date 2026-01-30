/**
 * WhyWhisper — Subtle "Why this?" Hint Text
 * 
 * Displays a single-line reason in muted styling.
 * Supports light variant for dark backgrounds.
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../lib/ui/theme';

interface WhyWhisperProps {
  text: string;
  light?: boolean; // Use light colors (for dark backgrounds)
}

export function WhyWhisper({ text, light }: WhyWhisperProps) {
  return (
    <Text 
      style={[styles.text, light && styles.textLight]} 
      numberOfLines={1}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: typography.sm,
    fontWeight: typography.regular,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'left',
    marginTop: spacing.xs,
  },
  textLight: {
    color: 'rgba(255, 255, 255, 0.8)',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
