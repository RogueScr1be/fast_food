/**
 * WhyWhisper — Subtle "Why this?" Hint Text
 * 
 * Displays a single-line reason in muted styling.
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../lib/ui/theme';

interface WhyWhisperProps {
  text: string;
}

export function WhyWhisper({ text }: WhyWhisperProps) {
  return (
    <Text style={styles.text} numberOfLines={1}>
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
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
