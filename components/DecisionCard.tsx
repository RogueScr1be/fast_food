/**
 * DecisionCard — Full-Screen Editorial Meal Card
 *
 * Phase 1.2 rewrite: edge-to-edge hero image with GlassOverlay system.
 *
 * Layout (top → bottom):
 *   Hero image          — fills entire card, resizeMode="cover"
 *   LinearGradient scrim — bottom 55 %, transparent → dark
 *   Info overlay        — recipe name + WhyWhisper + time/cost on scrim
 *   Rescue badge        — top-left (variant="rescue" only)
 *   AllergyIndicator    — bottom-right hexagon, above glass
 *   GlassOverlay        — anchored to bottom
 *     Level 0: handle + mode label + accept CTA (stickyContent)
 *     Level 1: + ingredients list
 *     Level 2: + expanded content (future checklist)
 *
 * Swipe gesture:
 *   Horizontal PanResponder slides the card off-screen to pass.
 *   No rotation on full-screen card (pure horizontal translation).
 *   GlassOverlay handle drag (vertical, RNGH) does not conflict
 *   because PanResponder only captures when |dx| > 10 && |dy| < 30.
 *
 * Variant:
 *   "default" — cool scrim, green accept CTA
 *   "rescue"  — warm amber scrim, amber accept CTA, Rescue badge
 *
 * Backward compatibility:
 *   `expanded` / `onToggleExpand` still work (map to overlay level 0↔1).
 *   New optional props (`overlayLevel`, `onOverlayLevelChange`, etc.)
 *   take precedence when provided.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  TouchableOpacity,
  Image,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { SharedValue } from 'react-native-reanimated';
import {
  colors,
  spacing,
  radii,
  typography,
  MIN_TOUCH_TARGET,
} from '../lib/ui/theme';
import type { RecipeSeed, DrmSeed } from '../lib/seeds/types';
import { getImageSource } from '../lib/seeds/images';
import { WhyWhisper } from './WhyWhisper';
import { GlassOverlay, OverlayLevel } from './GlassOverlay';
import { AllergyIndicator } from './AllergyIndicator';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Web doesn't support native driver well — use JS driver on web
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

const SWIPE_THRESHOLD = 120;
const SWIPE_OUT_DURATION = 250;

/**
 * Collapsed glass height: handle (40) + mode label row (28) + accept CTA (56)
 * + vertical padding (~16). Gives the overlay enough room for sticky content.
 */
const COLLAPSED_GLASS_HEIGHT = 140;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PassDirection = 'left' | 'right';
export type CardVariant = 'default' | 'rescue';

export interface DecisionCardProps {
  /** Recipe or DRM meal to display */
  recipe: RecipeSeed | DrmSeed;
  /** "Why this?" whisper text */
  whyText: string;
  /** @deprecated Use overlayLevel instead. Drives overlay 0↔1 for compat. */
  expanded: boolean;
  /** @deprecated Use onOverlayLevelChange instead. Toggles expanded. */
  onToggleExpand: () => void;
  /** Called when user accepts (CTA press) */
  onAccept: () => void;
  /** Called when user swipes to pass */
  onPass: (direction: PassDirection) => void;

  // --- New optional props (Phase 1.3+) ---

  /** Visual variant. Default: 'default'. */
  variant?: CardVariant;
  /** Explicit overlay level (overrides expanded) */
  overlayLevel?: OverlayLevel;
  /** Called when glass overlay level changes (gesture or programmatic) */
  onOverlayLevelChange?: (level: OverlayLevel) => void;
  /** Idle affordance lift value (pass-through to GlassOverlay) */
  externalLiftY?: SharedValue<number>;
  /** Mode label inside glass overlay (e.g. "Fancy") */
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
  default: colors.accentGreen,
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
  // Overlay level management (backward compat + new API)
  // -----------------------------------------------------------------------

  const [internalLevel, setInternalLevel] = useState<OverlayLevel>(
    overlayLevel ?? (expanded ? 1 : 0),
  );

  // Sync with external props
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

      // Backward compat: toggle expanded when crossing the 0↔1 boundary
      const wasExpanded = internalLevel > 0;
      const isNowExpanded = newLevel > 0;
      if (wasExpanded !== isNowExpanded) {
        onToggleExpand();
      }
    },
    [internalLevel, onOverlayLevelChange, onToggleExpand],
  );

  // -----------------------------------------------------------------------
  // Swipe gesture (horizontal only, PanResponder)
  // -----------------------------------------------------------------------

  const position = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dy) < 30,
      onPanResponderGrant: () => {
        position.setOffset({
          x: (position.x as any)._value,
          y: 0,
        });
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gs) => {
        position.setValue({ x: gs.dx, y: 0 });
      },
      onPanResponderRelease: (_, gs) => {
        position.flattenOffset();

        if (gs.dx > SWIPE_THRESHOLD) {
          Animated.timing(position, {
            toValue: { x: SCREEN_WIDTH + 100, y: 0 },
            duration: SWIPE_OUT_DURATION,
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start(() => {
            onPass('right');
            position.setValue({ x: 0, y: 0 });
          });
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          Animated.timing(position, {
            toValue: { x: -SCREEN_WIDTH - 100, y: 0 },
            duration: SWIPE_OUT_DURATION,
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start(() => {
            onPass('left');
            position.setValue({ x: 0, y: 0 });
          });
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 5,
            tension: 40,
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start();
        }
      },
    }),
  ).current;

  const cardTransform = {
    transform: [{ translateX: position.x }],
  };

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const estimatedCost =
    'estimatedCost' in recipe ? recipe.estimatedCost : null;
  const imageSource = getImageSource(recipe.imageKey);
  const allergenCount = recipe.allergens.length;
  const isRescue = variant === 'rescue';

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.card, cardTransform]}
        {...panResponder.panHandlers}
      >
        {/* ── Hero image ─────────────────────────────────────────── */}
        <Image
          source={imageSource}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityLabel={`Photo of ${recipe.name}`}
        />

        {/* ── Scrim gradient ─────────────────────────────────────── */}
        <LinearGradient
          colors={[SCRIM_COLORS[variant][0], SCRIM_COLORS[variant][1]]}
          locations={[0.4, 1]}
          style={styles.scrim}
        />

        {/* ── Rescue badge (variant only) ────────────────────────── */}
        {isRescue && (
          <View style={styles.rescueBadge}>
            <Text style={styles.rescueBadgeText}>Rescue</Text>
          </View>
        )}

        {/* ── Info overlay on image ──────────────────────────────── */}
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

        {/* ── Allergy indicator ──────────────────────────────────── */}
        <AllergyIndicator
          count={allergenCount}
          style={{ bottom: COLLAPSED_GLASS_HEIGHT + spacing.sm }}
        />

        {/* ── Glass overlay ──────────────────────────────────────── */}
        <GlassOverlay
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
                <Text style={styles.acceptButtonText}>Let's do this</Text>
              </TouchableOpacity>
            </View>
          }
        >
          {/* Ingredients (visible at level 1+) */}
          <View style={styles.ingredientsList}>
            <Text style={styles.ingredientsTitle}>Ingredients</Text>
            {recipe.ingredients.map((ingredient, i) => (
              <View key={i} style={styles.ingredientRow}>
                <Text style={styles.ingredientName}>{ingredient.name}</Text>
                <Text style={styles.ingredientQty}>
                  {ingredient.quantity}
                </Text>
              </View>
            ))}
          </View>
        </GlassOverlay>
      </Animated.View>
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
    backgroundColor: colors.textPrimary, // Dark fallback behind image
    overflow: 'hidden',
  },

  // Scrim: covers bottom 60% of card, fades from transparent → dark
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },

  // Rescue badge
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

  // Info overlay — positioned above the collapsed glass
  infoOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md + 48, // leave room for AllergyIndicator
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

  // Accept CTA inside glass overlay (stickyContent)
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

  // Ingredients list rendered inside GlassOverlay children
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
