/**
 * DecisionCard — Swipeable Recipe Card
 * 
 * Displays a single recipe with swipe-to-pass gestures.
 * Uses React Native Animated + PanResponder for smooth gestures.
 * 
 * Swipe left: "Not feeling it"
 * Swipe right: "Doesn't fit"
 * Tap: Toggle ingredients tray
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
} from 'react-native';
import { colors, spacing, radii, typography, shadows, MIN_TOUCH_TARGET } from '../lib/ui/theme';
import type { RecipeSeed } from '../lib/seeds/types';
import { IngredientsTray } from './IngredientsTray';
import { WhyWhisper } from './WhyWhisper';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;
const SWIPE_OUT_DURATION = 250;

export type PassDirection = 'left' | 'right';

interface DecisionCardProps {
  recipe: RecipeSeed;
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

  // Track swipe direction for hint labels
  const leftHintOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -50, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  const rightHintOpacity = position.x.interpolate({
    inputRange: [0, 50, SWIPE_THRESHOLD],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  // Card rotation during swipe
  const rotation = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-8deg', '0deg', '8deg'],
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
        if (gestureState.dx < -50) {
          swipeDirection.current = 'left';
        } else if (gestureState.dx > 50) {
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

  return (
    <View style={styles.container}>
      {/* Swipe Hint Labels */}
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
        {/* Tap Area for Expand */}
        <TouchableOpacity
          style={styles.cardContent}
          onPress={onToggleExpand}
          activeOpacity={0.95}
          accessibilityRole="button"
          accessibilityLabel={`${recipe.name}. Tap to ${expanded ? 'hide' : 'show'} ingredients`}
        >
          {/* Emoji placeholder for image */}
          <Text style={styles.emoji}>{recipe.emoji}</Text>

          {/* Recipe Name */}
          <Text style={styles.recipeName}>{recipe.name}</Text>

          {/* Why Whisper */}
          <WhyWhisper text={whyText} />

          {/* Meta Info */}
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{recipe.estimatedTime}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>{recipe.estimatedCost}</Text>
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
  cardContent: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  recipeName: {
    fontSize: typography['2xl'],
    fontWeight: typography.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
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
  // Hint labels
  hintLeft: {
    position: 'absolute',
    left: spacing.lg,
    top: '45%',
    zIndex: 10,
  },
  hintRight: {
    position: 'absolute',
    right: spacing.lg,
    top: '45%',
    zIndex: 10,
  },
  hintText: {
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: colors.textMuted,
    backgroundColor: colors.mutedLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
});
