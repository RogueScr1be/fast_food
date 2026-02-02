/**
 * IngredientsTray — Animated Expandable Ingredients List
 * 
 * Reveals ingredients with a smooth height/opacity animation.
 * Appears below the card content when expanded.
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { colors, spacing, radii, typography } from '../lib/ui/theme';
import type { Ingredient } from '../lib/seeds/types';

interface IngredientsTrayProps {
  ingredients: Ingredient[];
  visible: boolean;
}

export function IngredientsTray({ ingredients, visible }: IngredientsTrayProps) {
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const animatedOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(animatedHeight, {
        toValue: visible ? 1 : 0,
        duration: 250,
        useNativeDriver: false, // height can't use native driver
      }),
      Animated.timing(animatedOpacity, {
        toValue: visible ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [visible, animatedHeight, animatedOpacity]);

  // Estimate max height based on ingredient count
  const estimatedMaxHeight = Math.max(120, ingredients.length * 36 + 40);

  const containerStyle = {
    maxHeight: animatedHeight.interpolate({
      inputRange: [0, 1],
      outputRange: [0, estimatedMaxHeight],
    }),
    opacity: animatedOpacity,
    overflow: 'hidden' as const,
  };

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <View style={styles.divider} />
      <View style={styles.content}>
        <Text style={styles.title}>Ingredients</Text>
        {ingredients.map((ingredient, index) => (
          <View key={index} style={styles.ingredientRow}>
            <Text style={styles.ingredientName}>{ingredient.name}</Text>
            <Text style={styles.ingredientQty}>{ingredient.quantity}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.mutedLight,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  content: {
    padding: spacing.md,
  },
  title: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.textMuted,
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
    color: colors.textPrimary,
    flex: 1,
  },
  ingredientQty: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
});
