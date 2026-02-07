/**
 * ChecklistHero — Full-width hero image header for checklist screens
 *
 * Replaces the old thumbnail row with a premium hero block:
 * - Full-width image, height ~28% of window (clamped 200–260px)
 * - Bottom scrim gradient for text legibility
 * - Title + progress overlay on scrim
 * - Back button (glass circle, safe-area aware)
 * - Optional rescue badge
 * - Exposes heroRef for measureInWindow (reverse-box transition M4)
 */

import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing, radii, typography } from '../lib/ui/theme';
import type { ImageSourcePropType } from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeroRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChecklistHeroProps {
  /** Image source (from getImageSource) */
  imageSource: ImageSourcePropType;
  /** Meal name */
  title: string;
  /** Progress text (e.g. "2 of 5 steps") */
  progressText: string;
  /** Show rescue badge */
  isRescue?: boolean;
  /** Meta line (e.g. "15 min · 4 ingredients") */
  meta?: string;
  /** Back button handler */
  onBack: () => void;
  /** Called after mount with the hero container rect (for reverse-box) */
  onHeroReady?: (rect: HeroRect) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChecklistHero({
  imageSource,
  title,
  progressText,
  isRescue,
  meta,
  onBack,
  onHeroReady,
}: ChecklistHeroProps) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const heroViewRef = useRef<View>(null);

  // Responsive height: ~28% of window, clamped 200–260
  const heroHeight = Math.max(200, Math.min(260, Math.round(windowHeight * 0.28)));

  // Measure hero rect after layout for reverse-box transition
  const handleLayout = useCallback(() => {
    if (!onHeroReady || !heroViewRef.current) return;
    (heroViewRef.current as any).measureInWindow(
      (x: number, y: number, width: number, height: number) => {
        if (width > 0 && height > 0) {
          onHeroReady({ x, y, width, height });
        }
      },
    );
  }, [onHeroReady]);

  return (
    <View
      ref={heroViewRef}
      style={[styles.container, { height: heroHeight }]}
      onLayout={handleLayout}
    >
      {/* Hero image */}
      <Image
        source={imageSource}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="center"
      />

      {/* Bottom scrim for text legibility */}
      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 0.55)']}
        locations={[0.35, 1]}
        style={styles.scrim}
      />

      {/* Back button (glass circle, safe-area top) */}
      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + spacing.xs }]}
        onPress={onBack}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <ChevronLeft size={20} color={colors.textInverse} />
      </TouchableOpacity>

      {/* Rescue badge */}
      {isRescue && (
        <View style={[styles.rescueBadge, { top: insets.top + spacing.xs }]}>
          <Text style={styles.rescueBadgeText}>RESCUE</Text>
        </View>
      )}

      {/* Title + progress overlay */}
      <View style={styles.overlay}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.progress}>{progressText}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    backgroundColor: colors.textPrimary, // dark fallback
    overflow: 'hidden',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '65%',
  },
  backButton: {
    position: 'absolute',
    left: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  rescueBadge: {
    position: 'absolute',
    right: spacing.md,
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    zIndex: 10,
  },
  rescueBadgeText: {
    fontSize: typography.xs,
    fontWeight: typography.bold,
    color: colors.textInverse,
    letterSpacing: 0.5,
  },
  overlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
  },
  title: {
    fontSize: typography.xl,
    fontWeight: typography.bold,
    color: colors.textInverse,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 2,
  },
  progress: {
    fontSize: typography.sm,
    color: 'rgba(255, 255, 255, 0.8)',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  meta: {
    fontSize: typography.xs,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 2,
  },
});

export default ChecklistHero;
