/**
 * DecisionCard — Swipeable Recipe Card with Hero Image
 * 
 * Displays a single recipe with swipe-to-pass gestures.
 * Uses React Native Animated + PanResponder for smooth gestures.
 * 
 * Swipe left: "Not feeling it"
 * Swipe right: "Doesn't fit"
 * Tap: Toggle ingredients tray
 * 
 * Design: Calm, OS-like. Hero image with subtle overlay, clean typography.
 */

import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  TouchableOpacity,
  Image,
} from 'react-native';
import { colors, spacing, radii, typography, shadows, MIN_TOUCH_TARGET } from '../lib/ui/theme';
import type { RecipeSeed, DrmSeed } from '../lib/seeds/types';
import { getImageSource } from '../lib/seeds/images';
import { IngredientsTray } from './IngredientsTray';
import { WhyWhisper } from './WhyWhisper';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;
const SWIPE_OUT_DURATION = 250;
const HINT_FADE_START = 50; // px before hints start fading in
const MAX_ROTATION = 3; // degrees - subtle, not "dating app"
const HERO_HEIGHT = 180; // Hero image height

export type PassDirection = 'left' | 'right';

interface DecisionCardProps {
  recipe: RecipeSeed | DrmSeed;
  whyText: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onAccept: () => void;
  onPass: (direction: PassDirection) => void;
}

export function DecisionCard({
  recipe,
  whyText,
  expanded,
  onToggleExpand,
  onAccept,
  onPass,
}: DecisionCardProps) {
  const position = useRef(new Animated.ValueXY()).current;
  const swipeDirection = useRef<PassDirection | null>(null);

  // Subtle hint labels - fade in late (after 50px), stay low-contrast
  const leftHintOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -HINT_FADE_START, 0],
    outputRange: [0.6, 0, 0], // max 60% opacity for subtlety
    extrapolate: 'clamp',
  });

  const rightHintOpacity = position.x.interpolate({
    inputRange: [0, HINT_FADE_START, SWIPE_THRESHOLD],
    outputRange: [0, 0, 0.6],
    extrapolate: 'clamp',
  });

  // Card rotation during swipe - subtle ±3° max
  const rotation = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: [`-${MAX_ROTATION}deg`, '0deg', `${MAX_ROTATION}deg`],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture horizontal gestures
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 30;
      },
      onPanResponderGrant: () => {
        // Reset position offset
        position.setOffset({
          x: (position.x as any)._value,
          y: 0,
        });
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gestureState) => {
        position.setValue({ x: gestureState.dx, y: 0 });
        
        // Track direction for hint
        if (gestureState.dx < -HINT_FADE_START) {
          swipeDirection.current = 'left';
        } else if (gestureState.dx > HINT_FADE_START) {
          swipeDirection.current = 'right';
        } else {
          swipeDirection.current = null;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        position.flattenOffset();

        if (gestureState.dx > SWIPE_THRESHOLD) {
          // Swipe right - animate out
          Animated.timing(position, {
            toValue: { x: SCREEN_WIDTH + 100, y: 0 },
            duration: SWIPE_OUT_DURATION,
            useNativeDriver: true,
          }).start(() => {
            onPass('right');
            resetPosition();
          });
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          // Swipe left - animate out
          Animated.timing(position, {
            toValue: { x: -SCREEN_WIDTH - 100, y: 0 },
            duration: SWIPE_OUT_DURATION,
            useNativeDriver: true,
          }).start(() => {
            onPass('left');
            resetPosition();
          });
        } else {
          // Spring back to center
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 5,
            tension: 40,
            useNativeDriver: true,
          }).start();
        }
        swipeDirection.current = null;
      },
    })
  ).current;

  const resetPosition = () => {
    position.setValue({ x: 0, y: 0 });
  };

  const cardStyle = {
    transform: [
      { translateX: position.x },
      { rotate: rotation },
    ],
  };

  // Get estimated cost (only on RecipeSeed, not DrmSeed)
  const estimatedCost = 'estimatedCost' in recipe ? recipe.estimatedCost : null;
  
  // Get image source
  const imageSource = getImageSource(recipe.imageKey);

  return (
    <View style={styles.container}>
      {/* Swipe Hint Labels - subtle, late fade-in */}
      <Animated.View style={[styles.hintLeft, { opacity: leftHintOpacity }]}>
        <Text style={styles.hintText}>Not feeling it</Text>
      </Animated.View>
      <Animated.View style={[styles.hintRight, { opacity: rightHintOpacity }]}>
        <Text style={styles.hintText}>Doesn't fit</Text>
      </Animated.View>

      {/* Main Card */}
      <Animated.View
        style={[styles.card, cardStyle]}
        {...panResponder.panHandlers}
      >
        {/* Hero Image Section */}
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={onToggleExpand}
          accessibilityRole="button"
          accessibilityLabel={`${recipe.name}. Tap to ${expanded ? 'hide' : 'show'} ingredients`}
        >
          <View style={styles.heroContainer}>
            <Image
              source={imageSource}
              style={styles.heroImage}
              resizeMode="cover"
            />
            {/* Dark gradient overlay for text legibility */}
            <View style={styles.heroOverlay} />
            
            {/* Text on overlay */}
            <View style={styles.heroContent}>
              <Text style={styles.recipeName}>{recipe.name}</Text>
              <WhyWhisper text={whyText} light />
            </View>
          </View>

          {/* Meta Info below image */}
          <View style={styles.metaSection}>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>{recipe.estimatedTime}</Text>
              {estimatedCost && (
                <>
                  <View style={styles.metaDot} />
                  <Text style={styles.metaText}>{estimatedCost}</Text>
                </>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {/* Ingredients Tray */}
        <IngredientsTray
          ingredients={recipe.ingredients}
          visible={expanded}
        />

        {/* Accept CTA */}
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={onAccept}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Let's do this"
        >
          <Text style={styles.acceptButtonText}>Let's do this</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: SCREEN_WIDTH - spacing.lg * 2,
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    ...shadows.lg,
    overflow: 'hidden',
  },
  // Hero image section
  heroContainer: {
    height: HERO_HEIGHT,
    width: '100%',
    position: 'relative',
    backgroundColor: colors.mutedLight, // Fallback bg
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    // Simulate gradient effect with opacity
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
  },
  recipeName: {
    fontSize: typography['2xl'],
    fontWeight: typography.bold,
    color: colors.textInverse,
    textAlign: 'left',
    marginBottom: spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Meta section below image
  metaSection: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    marginHorizontal: spacing.sm,
  },
  acceptButton: {
    backgroundColor: colors.accentGreen,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    height: MIN_TOUCH_TARGET + 4, // 52px
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: colors.textInverse,
  },
  // Hint labels - subtle styling
  hintLeft: {
    position: 'absolute',
    left: spacing.md,
    top: '45%',
    zIndex: 10,
  },
  hintRight: {
    position: 'absolute',
    right: spacing.md,
    top: '45%',
    zIndex: 10,
  },
  hintText: {
    fontSize: typography.xs,
    fontWeight: typography.regular,
    color: colors.textMuted,
    backgroundColor: 'transparent',
  },
});
