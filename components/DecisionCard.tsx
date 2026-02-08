/**
 * DecisionCard — Full-Screen Editorial Meal Card
 *
 * Phase 1.3.1: RNGH gesture composition + expo-image + glass tint fix.
 *
 * Gestures:
 *   swipeGesture  — Gesture.Pan() horizontal, activeOffsetX([-10,10]),
 *                   failOffsetY([-30,30]). Slides card off-screen.
 *   handleGesture — from GlassOverlay ref. Vertical pan on handle bar.
 *   Composed via Gesture.Exclusive(handleGesture, swipeGesture) so
 *   only one gesture owns the touch. Handle wins when vertical; swipe
 *   wins when horizontal. No PanResponder anywhere.
 *
 * Image:
 *   expo-image with contentFit="cover" contentPosition="bottom" so food
 *   images focus on the bottom (plate) rather than the top (empty space).
 *
 * Variant:
 *   "default" — cool scrim, blue accept CTA
 *   "rescue"  — warm amber scrim, amber accept CTA, Rescue badge
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import {
  colors,
  spacing,
  radii,
  typography,
  MIN_TOUCH_TARGET,
} from '../lib/ui/theme';
import { latex } from '../lib/ui/motion';
import type { RecipeSeed, DrmSeed } from '../lib/seeds/types';
import { getImageSourceSafe } from '../lib/seeds/images';
import { WhyWhisper } from './WhyWhisper';
import { GlassOverlay, OverlayLevel } from './GlassOverlay';
import type { GlassOverlayRef } from './GlassOverlay';
import { AllergyIndicator } from './AllergyIndicator';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SWIPE_THRESHOLD = 120;
const SWIPE_OUT_DURATION = 250;
/** Velocity gate: fast flick dismisses even under distance threshold */
const SWIPE_VELOCITY_THRESHOLD = 800;

const COLLAPSED_GLASS_HEIGHT = 140;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PassDirection = 'left' | 'right';
export type CardVariant = 'default' | 'rescue';

export interface DecisionCardProps {
  recipe: RecipeSeed | DrmSeed;
  whyText: string;
  /** @deprecated Use overlayLevel instead */
  expanded: boolean;
  /** @deprecated Use onOverlayLevelChange instead */
  onToggleExpand: () => void;
  onAccept: () => void;
  onPass: (direction: PassDirection) => void;
  variant?: CardVariant;
  overlayLevel?: OverlayLevel;
  onOverlayLevelChange?: (level: OverlayLevel) => void;
  externalLiftY?: SharedValue<number>;
  modeLabel?: string;
}

// ---------------------------------------------------------------------------
// Variant color maps
// ---------------------------------------------------------------------------

const SCRIM_COLORS: Record<CardVariant, readonly [string, string]> = {
  default: ['transparent', 'rgba(0, 0, 0, 0.7)'],
  rescue: ['transparent', 'rgba(92, 40, 12, 0.7)'],
};

const ACCEPT_BG: Record<CardVariant, string> = {
  default: colors.accentBlue,
  rescue: colors.warning,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DecisionCard({
  recipe,
  whyText,
  expanded,
  onToggleExpand,
  onAccept,
  onPass,
  variant = 'default',
  overlayLevel,
  onOverlayLevelChange,
  externalLiftY,
  modeLabel,
}: DecisionCardProps) {
  // -----------------------------------------------------------------------
  // Overlay level management
  // -----------------------------------------------------------------------

  const [internalLevel, setInternalLevel] = useState<OverlayLevel>(
    overlayLevel ?? (expanded ? 1 : 0),
  );

  useEffect(() => {
    if (overlayLevel !== undefined) {
      setInternalLevel(overlayLevel);
    } else {
      setInternalLevel(expanded ? 1 : 0);
    }
  }, [overlayLevel, expanded]);

  const handleOverlayLevelChange = useCallback(
    (newLevel: OverlayLevel) => {
      setInternalLevel(newLevel);
      onOverlayLevelChange?.(newLevel);
      const wasExpanded = internalLevel > 0;
      const isNowExpanded = newLevel > 0;
      if (wasExpanded !== isNowExpanded) {
        onToggleExpand();
      }
    },
    [internalLevel, onOverlayLevelChange, onToggleExpand],
  );

  // -----------------------------------------------------------------------
  // GlassOverlay ref (for gesture composition)
  // -----------------------------------------------------------------------

  const glassRef = useRef<GlassOverlayRef>(null);

  // -----------------------------------------------------------------------
  // Swipe gesture (RNGH — replaces PanResponder)
  // -----------------------------------------------------------------------

  const { width: screenWidth } = useWindowDimensions();
  const swipeX = useSharedValue(0);
  // Keep screenWidth in a shared value so the worklet can read it
  const screenW = useSharedValue(screenWidth);
  useEffect(() => { screenW.value = screenWidth; }, [screenWidth]);

  const firePass = useCallback(
    (dir: PassDirection) => {
      onPass(dir);
      swipeX.value = 0;
    },
    [onPass, swipeX],
  );

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-30, 30])
    .onStart(() => {
      cancelAnimation(swipeX);
    })
    .onUpdate((e) => {
      swipeX.value = e.translationX;
    })
    .onEnd((e) => {
      const w = screenW.value;
      const tx = e.translationX;
      const vx = e.velocityX;

      // Distance gate OR velocity gate
      const dismissRight = tx > SWIPE_THRESHOLD || vx > SWIPE_VELOCITY_THRESHOLD;
      const dismissLeft = tx < -SWIPE_THRESHOLD || vx < -SWIPE_VELOCITY_THRESHOLD;

      if (dismissRight) {
        swipeX.value = withTiming(
          w + 100,
          { duration: SWIPE_OUT_DURATION },
          () => runOnJS(firePass)('right'),
        );
      } else if (dismissLeft) {
        swipeX.value = withTiming(
          -w - 100,
          { duration: SWIPE_OUT_DURATION },
          () => runOnJS(firePass)('left'),
        );
      } else {
        // Spring back with Latex (snappy, no wobble)
        swipeX.value = withSpring(0, latex);
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }],
  }));

  // -----------------------------------------------------------------------
  // Compose gestures: handle (vertical) wins over swipe (horizontal)
  // -----------------------------------------------------------------------

  const handleGesture = glassRef.current?.getHandleGesture();
  const composedGesture = handleGesture
    ? Gesture.Exclusive(handleGesture, swipeGesture)
    : swipeGesture;

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const estimatedCost =
    'estimatedCost' in recipe ? (recipe as any).estimatedCost as string : null;
  const imageSource = getImageSourceSafe({
    imageKey: recipe.imageKey,
    recipeId: recipe.id,
    mode: modeLabel,
    isRescue: variant === 'rescue',
  });
  const allergenCount = recipe.allergens.length;
  const isRescue = variant === 'rescue';
  const useSafeFrame = recipe.heroSafeFrame === true;

  // Log once per recipe when using fallback framing (non-safe-frame)
  const loggedFramingRef = useRef<string | null>(null);
  if (!useSafeFrame && loggedFramingRef.current !== recipe.id) {
    loggedFramingRef.current = recipe.id;
    // Intentionally non-spammy: once per recipe ID per component instance
  }

  // -----------------------------------------------------------------------
  // Image readiness gate — prevent black void on first render
  // -----------------------------------------------------------------------

  const [imageReady, setImageReady] = useState(false);
  const imageReadyRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when recipe changes
  useEffect(() => {
    setImageReady(false);
    imageReadyRef.current = false;

    // Fallback: if onLoad never fires (cached image), flip after 80ms
    fallbackTimerRef.current = setTimeout(() => {
      if (!imageReadyRef.current) {
        imageReadyRef.current = true;
        setImageReady(true);
      }
    }, 80);

    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, [recipe.id]);

  const handleImageLoad = useCallback(() => {
    if (!imageReadyRef.current) {
      imageReadyRef.current = true;
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      setImageReady(true);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Z-axis: 10% inverse parallax on hero during glass overlay lift
  // -----------------------------------------------------------------------

  const heroParallaxStyle = useAnimatedStyle(() => {
    const lift = externalLiftY ? externalLiftY.value : 0;
    // Inverse: glass lifts up → hero shifts down slightly (depth illusion)
    // Clamped to ±8px to stay imperceptible as "movement"
    const shift = Math.min(8, Math.max(-8, lift * 0.1));
    return {
      transform: [{ translateY: shift }],
    };
  });

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[styles.card, cardAnimatedStyle]}>
          {/* ── Hero image with Z-axis parallax ──────────────────── */}
          <Animated.View style={[StyleSheet.absoluteFill, heroParallaxStyle]}>
            <Image
              source={imageSource}
              style={useSafeFrame ? styles.heroImageSafe : styles.heroImage}
              contentFit={useSafeFrame ? 'contain' : 'cover'}
              contentPosition={useSafeFrame ? 'bottom' : 'center'}
              accessibilityLabel={`Photo of ${recipe.name}`}
              onLoad={handleImageLoad}
            />
          </Animated.View>

          {/* ── Overlays: gated on imageReady ──────────────────────── */}
          {imageReady && (
            <>
              {/* Scrim gradient */}
              <LinearGradient
                colors={[SCRIM_COLORS[variant][0], SCRIM_COLORS[variant][1]]}
                locations={[0.4, 1]}
                style={styles.scrim}
              />

              {/* Rescue badge */}
              {isRescue && (
                <View style={styles.rescueBadge}>
                  <Text style={styles.rescueBadgeText}>Rescue</Text>
                </View>
              )}

              {/* Info overlay on image */}
              <View
                style={[
                  styles.infoOverlay,
                  { bottom: COLLAPSED_GLASS_HEIGHT + spacing.sm },
                ]}
              >
                <Text style={styles.recipeName}>{recipe.name}</Text>
                <WhyWhisper text={whyText} light />
                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>{recipe.estimatedTime}</Text>
                  {estimatedCost && (
                    <>
                      <View style={styles.metaDot} />
                      <Text style={styles.metaText}>{estimatedCost}</Text>
                    </>
                  )}
                  {isRescue && !estimatedCost && (
                    <>
                      <View style={styles.metaDot} />
                      <Text style={styles.metaText}>No-stress</Text>
                    </>
                  )}
                </View>
              </View>

              {/* Allergy indicator */}
              <AllergyIndicator
                count={allergenCount}
                style={{ bottom: COLLAPSED_GLASS_HEIGHT + spacing.sm }}
              />

              {/* Glass overlay */}
              <GlassOverlay
                ref={glassRef}
                level={internalLevel}
                onLevelChange={handleOverlayLevelChange}
                modeLabel={modeLabel}
                externalLiftY={externalLiftY}
                collapsedHeight={COLLAPSED_GLASS_HEIGHT}
                stickyContent={
                  <View style={styles.stickyWrapper}>
                    <TouchableOpacity
                      style={[
                        styles.acceptButton,
                        { backgroundColor: ACCEPT_BG[variant] },
                      ]}
                      onPress={onAccept}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Let's do this"
                    >
                      <Text style={styles.acceptButtonText}>
                        Let's do this
                      </Text>
                    </TouchableOpacity>
                  </View>
                }
              >
                {/* Ingredients (level 1+) */}
                <View style={styles.ingredientsList}>
                  <Text style={styles.ingredientsTitle}>Ingredients</Text>
                  {recipe.ingredients.map((ingredient, i) => (
                    <View key={i} style={styles.ingredientRow}>
                      <Text style={styles.ingredientName}>
                        {ingredient.name}
                      </Text>
                      <Text style={styles.ingredientQty}>
                        {ingredient.quantity}
                      </Text>
                    </View>
                  ))}
                </View>
              </GlassOverlay>
            </>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    flex: 1,
    backgroundColor: colors.textPrimary, // clean dark edge behind image
    overflow: 'hidden',
  },
  // Default: cover with slight pull-back so edges breathe.
  heroImage: {
    position: 'absolute',
    top: '1.5%',
    left: '1.5%',
    right: '1.5%',
    bottom: '1.5%',
    borderRadius: 4,
  },
  // Safe frame: contain + slight scale-up to reduce letterboxing.
  // Shows the full dish without clipping; dark bg fills any gaps.
  heroImageSafe: {
    position: 'absolute',
    top: '-3%',
    left: '-3%',
    right: '-3%',
    bottom: '-3%',
    // Negative insets expand the contain area ~6%, so the image
    // scales up slightly while still fitting the full dish.
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  rescueBadge: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.md,
    backgroundColor: colors.warningAmberBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    zIndex: 2,
  },
  rescueBadgeText: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.warningAmber,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md + 48,
  },
  recipeName: {
    fontSize: typography['2xl'],
    fontWeight: typography.bold,
    color: colors.textInverse,
    textAlign: 'left',
    marginBottom: spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  metaText: {
    fontSize: typography.sm,
    color: 'rgba(255, 255, 255, 0.8)',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: spacing.sm,
  },
  stickyWrapper: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  acceptButton: {
    height: MIN_TOUCH_TARGET + 8,
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.textInverse,
  },
  ingredientsList: {
    paddingTop: spacing.sm,
  },
  ingredientsTitle: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.glassTextMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  ingredientName: {
    fontSize: typography.sm,
    color: colors.glassText,
    flex: 1,
  },
  ingredientQty: {
    fontSize: typography.sm,
    color: colors.glassTextMuted,
    marginLeft: spacing.sm,
  },
});

export default DecisionCard;
