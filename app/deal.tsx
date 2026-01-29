/**
 * Deal Screen — Swipeable Recipe Cards
 * 
 * Phase 2: Shows one recipe at a time with swipe-to-pass gestures.
 * - Reads mode + allergens from session state
 * - Picks recipes from local seeds
 * - Tracks pass count and deal history
 * - Navigates to checklist on accept
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, RefreshCw } from 'lucide-react-native';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../lib/ui/theme';
import {
  getSelectedMode,
  getExcludeAllergens,
  getConstraints,
  getDealHistory,
  getCurrentDealId,
  setCurrentDealId,
  incrementPassCount,
  addToDealHistory,
  resetDealState,
  getPassCount,
} from '../lib/state/ffSession';
import {
  pickNextRecipe,
  getRandomWhy,
  getAvailableCount,
} from '../lib/seeds';
import type { RecipeSeed } from '../lib/seeds/types';
import { DecisionCard, PassDirection } from '../components/DecisionCard';

export default function DealScreen() {
  const [currentRecipe, setCurrentRecipe] = useState<RecipeSeed | null>(null);
  const [whyText, setWhyText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [noMoreRecipes, setNoMoreRecipes] = useState(false);

  // Get session state
  const mode = getSelectedMode();
  const excludeAllergens = getExcludeAllergens();
  const constraints = getConstraints();

  /**
   * Deal a new recipe
   */
  const dealNextRecipe = useCallback(() => {
    if (!mode) {
      setIsLoading(false);
      return;
    }

    const dealHistory = getDealHistory();
    const recipe = pickNextRecipe(mode, excludeAllergens, dealHistory, constraints);

    if (recipe) {
      setCurrentRecipe(recipe);
      setWhyText(getRandomWhy(recipe));
      setCurrentDealId(recipe.id);
      addToDealHistory(recipe.id);
      setExpanded(false);
      setNoMoreRecipes(false);
    } else {
      // No more recipes available
      setCurrentRecipe(null);
      setNoMoreRecipes(true);
    }
    setIsLoading(false);
  }, [mode, excludeAllergens, constraints]);

  // Deal first recipe on mount
  useEffect(() => {
    dealNextRecipe();
  }, [dealNextRecipe]);

  /**
   * Handle pass (swipe)
   */
  const handlePass = useCallback((direction: PassDirection) => {
    incrementPassCount();
    // Small delay for animation to complete
    setTimeout(() => {
      dealNextRecipe();
    }, 50);
  }, [dealNextRecipe]);

  /**
   * Handle accept ("Let's do this")
   */
  const handleAccept = useCallback(() => {
    if (currentRecipe) {
      router.push({
        pathname: '/checklist/[recipeId]',
        params: { recipeId: currentRecipe.id },
      });
    }
  }, [currentRecipe]);

  /**
   * Toggle ingredients tray
   */
  const handleToggleExpand = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  /**
   * Reset and start over
   */
  const handleStartOver = useCallback(() => {
    resetDealState();
    setIsLoading(true);
    setTimeout(() => {
      dealNextRecipe();
    }, 100);
  }, [dealNextRecipe]);

  // No mode selected - redirect back
  if (!mode) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>No mode selected</Text>
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => router.back()}
          >
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
        </View>
      </SafeAreaView>
    );
  }

  // No more recipes
  if (noMoreRecipes) {
    const passCount = getPassCount();
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Deal</Text>
          <View style={styles.headerButton} />
        </View>

        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🍽️</Text>
          <Text style={styles.emptyTitle}>That's all for {mode}</Text>
          <Text style={styles.emptySubtitle}>
            You've seen all {passCount + 1} recipes
          </Text>
          <TouchableOpacity
            style={styles.startOverButton}
            onPress={handleStartOver}
            accessibilityRole="button"
            accessibilityLabel="Start over"
          >
            <RefreshCw size={18} color={colors.textInverse} />
            <Text style={styles.startOverText}>Start Over</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Main deal screen
  const availableCount = getAvailableCount(mode, excludeAllergens, getDealHistory());
  const passCount = getPassCount();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{mode}</Text>
          <Text style={styles.headerSubtitle}>
            {availableCount} more · {passCount} passed
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {/* Card */}
      {currentRecipe && (
        <DecisionCard
          recipe={currentRecipe}
          whyText={whyText}
          expanded={expanded}
          onToggleExpand={handleToggleExpand}
          onAccept={handleAccept}
          onPass={handlePass}
        />
      )}

      {/* Swipe hint at bottom */}
      <View style={styles.footer}>
        <Text style={styles.footerHint}>Swipe to pass · Tap for ingredients</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingTop: Platform.OS === 'ios' ? spacing.sm : spacing.md,
    paddingBottom: spacing.sm,
  },
  headerButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  headerSubtitle: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  errorText: {
    fontSize: typography.base,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  backLink: {
    padding: spacing.sm,
  },
  backLinkText: {
    fontSize: typography.base,
    color: colors.accentBlue,
    fontWeight: typography.medium,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.xl,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.base,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  startOverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentBlue,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: spacing.sm,
    gap: spacing.sm,
  },
  startOverText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textInverse,
  },
  footer: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  footerHint: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
});
