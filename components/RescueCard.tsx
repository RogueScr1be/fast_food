/**
 * RescueCard — DRM (Dinner Rescue Mode) Card with Hero Image
 * 
 * Visually distinct rescue card for panic meals.
 * Warmer surface tones, "Rescue" badge, calmer motion.
 * Same interactions: tap expands, swipe = no, CTA = accept.
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
  Platform,
} from 'react-native';

// Web doesn't support native driver well - use JS driver on web
const USE_NATIVE_DRIVER = Platform.OS !== 'web';
import { colors, spacing, radii, typography, MIN_TOUCH_TARGET } from '../lib/ui/theme';
import type { DrmSeed } from '../lib/seeds/types';
import { getImageSource } from '../lib/seeds/images';
import { IngredientsTray } from './IngredientsTray';
import { WhyWhisper } from './WhyWhisper';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;
const SWIPE_OUT_DURATION = 250;
const HINT_FADE_START = 50;
const MAX_ROTATION = 2; // Even calmer than regular card

// Responsive hero sizing (slightly smaller than DecisionCard)
const CARD_WIDTH = Math.min(SCREEN_WIDTH - spacing.lg * 2, 380);
const HERO_ASPECT_RATIO = 4 / 3;
const HERO_HEIGHT_RAW = CARD_WIDTH / HERO_ASPECT_RATIO * 0.9; // 90% of standard
const HERO_HEIGHT = Math.max(160, Math.min(220, HERO_HEIGHT_RAW)); // Clamp 160-220

export type PassDirection = 'left' | 'right';

interface RescueCardProps {
  meal: DrmSeed;
  whyText: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onAccept: () => void;
  onPass: (direction: PassDirection) => void;
}

export function RescueCard({
  meal,
  whyText,
  expanded,
  onToggleExpand,
  onAccept,
  onPass,
}: RescueCardProps) {
  const position = useRef(new Animated.ValueXY()).current;
  const swipeDirection = useRef<PassDirection | null>(null);

  // Subtle hint labels
  const leftHintOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -HINT_FADE_START, 0],
    outputRange: [0.5, 0, 0],
    extrapolate: 'clamp',
  });

  const rightHintOpacity = position.x.interpolate({
    inputRange: [0, HINT_FADE_START, SWIPE_THRESHOLD],
    outputRange: [0, 0, 0.5],
    extrapolate: 'clamp',
  });

  // Card rotation - even calmer ±2°
  const rotation = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: [`-${MAX_ROTATION}deg`, '0deg', `${MAX_ROTATION}deg`],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 30;
      },
      onPanResponderGrant: () => {
        position.setOffset({
          x: (position.x as any)._value,
          y: 0,
        });
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gestureState) => {
        position.setValue({ x: gestureState.dx, y: 0 });
        
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
          Animated.timing(position, {
            toValue: { x: SCREEN_WIDTH + 100, y: 0 },
            duration: SWIPE_OUT_DURATION,
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start(() => {
            onPass('right');
            resetPosition();
          });
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          Animated.timing(position, {
            toValue: { x: -SCREEN_WIDTH - 100, y: 0 },
            duration: SWIPE_OUT_DURATION,
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start(() => {
            onPass('left');
            resetPosition();
          });
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 5,
            tension: 40,
            useNativeDriver: USE_NATIVE_DRIVER,
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

  // Get image source
  const imageSource = getImageSource(meal.imageKey);

  return (
    <View style={styles.container}>
      {/* Swipe Hint Labels */}
      <Animated.View style={[styles.hintLeft, { opacity: leftHintOpacity }]}>
        <Text style={styles.hintText}>Not feeling it</Text>
      </Animated.View>
      <Animated.View style={[styles.hintRight, { opacity: rightHintOpacity }]}>
        <Text style={styles.hintText}>Doesn't fit</Text>
      </Animated.View>

      {/* Main Card - warmer surface */}
      <Animated.View
        style={[styles.card, cardStyle]}
        {...panResponder.panHandlers}
      >
        {/* Hero Image Section */}
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={onToggleExpand}
          accessibilityRole="button"
          accessibilityLabel={`${meal.name}. Tap to ${expanded ? 'hide' : 'show'} ingredients`}
        >
          <View style={styles.heroContainer}>
            <Image
              source={imageSource}
              style={styles.heroImage}
              resizeMode="cover"
            />
            {/* Warm scrim gradient (3 stacked layers, amber tint) */}
            <View style={styles.scrimTop} />
            <View style={styles.scrimMiddle} />
            <View style={styles.scrimBottom} />
            
            {/* Rescue Badge */}
            <View style={styles.rescueBadge}>
              <Text style={styles.rescueBadgeText}>Rescue</Text>
            </View>
            
            {/* Text on overlay */}
            <View style={styles.heroContent}>
              <Text style={styles.mealName}>{meal.name}</Text>
              <WhyWhisper text={whyText} light />
            </View>
          </View>

          {/* Meta Info below image */}
          <View style={styles.metaSection}>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>{meal.estimatedTime}</Text>
              <View style={styles.metaDot} />
              <Text style={styles.metaText}>No-stress</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Ingredients Tray */}
        <IngredientsTray
          ingredients={meal.ingredients}
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
    backgroundColor: '#FFFBF5', // Slightly warmer surface
    borderRadius: radii.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F5EFE6', // Subtle warm border
  },
  // Hero image section
  heroContainer: {
    height: HERO_HEIGHT,
    width: '100%',
    position: 'relative',
    backgroundColor: '#FEF3C7', // Warm fallback bg
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  // Warm scrim gradient: 3 stacked layers with amber tint
  scrimTop: {
    position: 'absolute',
    bottom: '45%',
    left: 0,
    right: 0,
    height: '20%',
    backgroundColor: 'rgba(120, 53, 15, 0.08)',
  },
  scrimMiddle: {
    position: 'absolute',
    bottom: '20%',
    left: 0,
    right: 0,
    height: '25%',
    backgroundColor: 'rgba(120, 53, 15, 0.25)',
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '35%',
    backgroundColor: 'rgba(92, 40, 12, 0.55)',
  },
  rescueBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: '#FEF3C7', // Warm yellow bg
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    zIndex: 2,
  },
  rescueBadgeText: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: '#92400E', // Amber text
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
  },
  mealName: {
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
    backgroundColor: '#FFFBF5',
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
    backgroundColor: colors.warning, // Warm amber CTA (from theme)
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    height: MIN_TOUCH_TARGET + 8, // 56px - consistent with PrimaryButton
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.textInverse,
  },
  // Hint labels
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
