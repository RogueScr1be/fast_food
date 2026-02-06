/**
 * AllergyIndicator — Hexagonal Amber Warning Badge
 *
 * Displays a small hexagonal badge to signal that the current recipe
 * contains known allergens. Positioned bottom-right of the card by
 * the consuming parent.
 *
 * Design:
 *   - Hexagon form (pointy-top, built with border-triangle technique)
 *   - Amber / warning treatment — NOT clinical red
 *   - Shows allergen count when > 0
 *   - Purely informational; parent handles tap if needed
 *
 * Usage:
 *   <View style={{ position: 'relative' }}>
 *     <AllergyIndicator count={2} />
 *   </View>
 *
 * The component renders with `position: absolute` by default
 * (bottom-right). Override via `style` prop if needed.
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { colors, typography, spacing } from '../lib/ui/theme';

// ---------------------------------------------------------------------------
// Hexagon geometry (pointy-top)
//
//       /\
//      /  \
//     |    |    ← HEX_BODY_HEIGHT
//      \  /
//       \/
//
// For width W:
//   total height ≈ W × 1.1547  (2 / √3)
//   body height  = total / 2
//   triangle height = total / 4
// ---------------------------------------------------------------------------

const HEX_WIDTH = 30;
const HEX_TOTAL_HEIGHT = Math.round(HEX_WIDTH * 1.1547); // ≈ 35
const HEX_BODY_HEIGHT = Math.round(HEX_TOTAL_HEIGHT / 2); // ≈ 17
const HEX_TRI_HEIGHT = Math.round((HEX_TOTAL_HEIGHT - HEX_BODY_HEIGHT) / 2); // ≈ 9

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AllergyIndicatorProps {
  /** Number of allergens present in the recipe (0 = hidden) */
  count: number;
  /** Optional tap handler (e.g. to open allergy modal) */
  onPress?: () => void;
  /** Override container positioning */
  style?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AllergyIndicator({ count, onPress, style }: AllergyIndicatorProps) {
  if (count <= 0) return null;

  const displayText = count > 9 ? '9+' : String(count);

  const hexContent = (
    <View style={[styles.wrapper, style]}>
      {/* Top triangle (points up) */}
      <View style={styles.triTop} />

      {/* Body — contains the label */}
      <View style={styles.body}>
        <Text
          style={styles.label}
          accessibilityLabel={`${count} allergen${count !== 1 ? 's' : ''} present`}
        >
          {displayText}
        </Text>
      </View>

      {/* Bottom triangle (points down) */}
      <View style={styles.triBottom} />
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${count} allergen${count !== 1 ? 's' : ''} present. Tap to manage.`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {hexContent}
      </TouchableOpacity>
    );
  }

  return hexContent;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const AMBER_BG = colors.warningAmberBg; // #FEF3C7
const AMBER_TEXT = colors.warningAmber;  // #D97706

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    alignItems: 'center',
    // No shadow — clean indicator, not a floating action
  },
  triTop: {
    width: 0,
    height: 0,
    borderLeftWidth: HEX_WIDTH / 2,
    borderRightWidth: HEX_WIDTH / 2,
    borderBottomWidth: HEX_TRI_HEIGHT,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: AMBER_BG,
  },
  body: {
    width: HEX_WIDTH,
    height: HEX_BODY_HEIGHT,
    backgroundColor: AMBER_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: typography.xs,
    fontWeight: typography.bold,
    color: AMBER_TEXT,
    textAlign: 'center',
    // Slight upward shift to optically center in the hex
    marginTop: -1,
  },
  triBottom: {
    width: 0,
    height: 0,
    borderLeftWidth: HEX_WIDTH / 2,
    borderRightWidth: HEX_WIDTH / 2,
    borderTopWidth: HEX_TRI_HEIGHT,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: AMBER_BG,
  },
});

export default AllergyIndicator;
