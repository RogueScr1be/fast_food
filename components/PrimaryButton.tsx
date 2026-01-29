/**
 * PrimaryButton — Consistent primary CTA
 * 
 * A calm, prominent action button used across:
 * - Tonight: "Decide for Me"
 * - Deal: "Let's do this"
 * - Checklist: "Done"
 * 
 * Specs:
 * - Height: 56px (MIN_TOUCH_TARGET + 8)
 * - Radius: lg (16px)
 * - Typography: lg bold
 * - Variants: primary (green), muted (grey)
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors, spacing, radii, typography, shadows, MIN_TOUCH_TARGET } from '../lib/ui/theme';

const BUTTON_HEIGHT = MIN_TOUCH_TARGET + 8; // 56px

type ButtonVariant = 'primary' | 'muted';

interface PrimaryButtonProps {
  /** Button label text */
  label: string;
  /** Press handler */
  onPress: () => void;
  /** Visual variant (default: primary) */
  variant?: ButtonVariant;
  /** Disabled state */
  disabled?: boolean;
  /** Additional container styles */
  style?: ViewStyle;
  /** Accessibility label (defaults to label) */
  accessibilityLabel?: string;
  /** Optional icon to render before label */
  icon?: React.ReactNode;
}

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
  accessibilityLabel,
  icon,
}: PrimaryButtonProps) {
  const isDisabled = disabled || variant === 'muted';
  const buttonStyle = [
    styles.button,
    variant === 'muted' && styles.buttonMuted,
    disabled && styles.buttonDisabled,
    style,
  ];
  const textStyle: TextStyle[] = [
    styles.text,
    (variant === 'muted' || disabled) && styles.textMuted,
  ];

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled }}
    >
      {icon}
      <Text style={textStyle}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: BUTTON_HEIGHT,
    borderRadius: radii.lg,
    backgroundColor: colors.accentGreen,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    ...shadows.md,
  },
  buttonMuted: {
    backgroundColor: colors.muted,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonDisabled: {
    backgroundColor: colors.mutedLight,
    shadowOpacity: 0,
    elevation: 0,
  },
  text: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.textInverse,
  },
  textMuted: {
    color: colors.textMuted,
  },
});

export default PrimaryButton;
