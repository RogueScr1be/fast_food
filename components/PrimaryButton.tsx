/**
 * PrimaryButton — Consistent primary CTA
 * 
 * A calm, prominent action button used across:
 * - Tonight: "Decide for Me" (tone: primary/blue - system action)
 * - Deal: "Let's do this" (tone: accept/green - commitment)
 * - Checklist: "Done" (tone: accept/green - commitment)
 * 
 * Specs:
 * - Height: 56px (MIN_TOUCH_TARGET + 8)
 * - Radius: lg (16px)
 * - Typography: lg bold
 * 
 * Tones:
 * - primary: Blue (navigation/system action)
 * - accept: Green (acceptance/commitment)
 * - danger: Red (destructive action)
 * - neutral: Grey (secondary action)
 */

import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors, spacing, radii, typography, shadows, MIN_TOUCH_TARGET } from '../lib/ui/theme';

const BUTTON_HEIGHT = MIN_TOUCH_TARGET + 8; // 56px

/** Semantic tone for button color */
type ButtonTone = 'primary' | 'accept' | 'danger' | 'neutral';

/** Visual variant for state */
type ButtonVariant = 'solid' | 'muted';

interface PrimaryButtonProps {
  /** Button label text */
  label: string;
  /** Press handler */
  onPress: () => void;
  /** Semantic tone (default: accept for backward compat) */
  tone?: ButtonTone;
  /** Visual variant (default: solid) */
  variant?: ButtonVariant;
  /** Disabled state */
  disabled?: boolean;
  /** Additional container styles */
  style?: ViewStyle;
  /** Override label text style (merged with defaults) */
  labelStyle?: TextStyle;
  /** Accessibility label (defaults to label) */
  accessibilityLabel?: string;
  /** Optional icon to render before label */
  icon?: React.ReactNode;
}

/** Map tone to background color */
const TONE_COLORS: Record<ButtonTone, string> = {
  primary: colors.accentBlue,
  accept: colors.accentGreen,
  danger: colors.error,
  neutral: colors.muted,
};

export function PrimaryButton({
  label,
  onPress,
  tone = 'accept',
  variant = 'solid',
  disabled = false,
  style,
  labelStyle,
  accessibilityLabel,
  icon,
}: PrimaryButtonProps) {
  const isMuted = variant === 'muted';
  const backgroundColor = isMuted ? colors.muted : TONE_COLORS[tone];
  
  const buttonStyle: ViewStyle[] = [
    styles.button,
    { backgroundColor },
    isMuted && styles.buttonMuted,
    disabled && styles.buttonDisabled,
    style as ViewStyle,
  ].filter(Boolean) as ViewStyle[];
  
  const textStyle: TextStyle[] = [
    styles.text,
    (isMuted || disabled) && styles.textMuted,
    labelStyle,
  ].filter(Boolean) as TextStyle[];

  return (
    <Pressable
      style={({ pressed }) => [
        ...buttonStyle,
        !disabled && pressed && styles.buttonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled }}
    >
      {icon}
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: BUTTON_HEIGHT,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    ...shadows.md,
  },
  buttonMuted: {
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonDisabled: {
    backgroundColor: colors.mutedLight,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.95,
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
