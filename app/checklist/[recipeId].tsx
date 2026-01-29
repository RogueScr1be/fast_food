/**
 * Checklist Screen — Placeholder (Phase 2)
 * 
 * This screen will show the cooking checklist in Phase 4.
 * For now, displays recipe info and placeholder message.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { colors, spacing, radii, typography, MIN_TOUCH_TARGET } from '../../lib/ui/theme';
import { getRecipeById } from '../../lib/seeds';
import { resetDealState } from '../../lib/state/ffSession';

export default function ChecklistScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const recipe = recipeId ? getRecipeById(recipeId) : null;

  const handleDone = () => {
    resetDealState();
    router.replace('/(tabs)/tonight');
  };

  const handleBack = () => {
    router.back();
  };

  if (!recipe) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Recipe not found</Text>
          <TouchableOpacity style={styles.backLink} onPress={handleBack}>
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checklist</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Recipe Card */}
        <View style={styles.card}>
          <Text style={styles.emoji}>{recipe.emoji}</Text>
          <Text style={styles.recipeName}>{recipe.name}</Text>
          <Text style={styles.metaText}>
            {recipe.estimatedTime} · {'estimatedCost' in recipe ? recipe.estimatedCost : 'Quick'}
          </Text>
        </View>

        {/* Placeholder Message */}
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderTitle}>Checklist comes in Phase 4</Text>
          <Text style={styles.placeholderText}>
            This screen will show step-by-step cooking instructions with checkable items.
          </Text>
        </View>

        {/* Steps Preview */}
        <View style={styles.stepsCard}>
          <Text style={styles.sectionTitle}>Steps Preview</Text>
          {recipe.steps.map((step, index) => (
            <View key={index} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Done Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={handleDone}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Check size={20} color={colors.textInverse} />
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
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
  headerTitle: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.md,
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  emoji: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  recipeName: {
    fontSize: typography.xl,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  metaText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  placeholderCard: {
    backgroundColor: colors.accentBlueLight,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  placeholderTitle: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.accentBlueDark,
    marginBottom: spacing.xs,
  },
  placeholderText: {
    fontSize: typography.sm,
    color: colors.accentBlueDark,
  },
  stepsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.mutedLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  stepNumberText: {
    fontSize: typography.xs,
    fontWeight: typography.bold,
    color: colors.textSecondary,
  },
  stepText: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  footer: {
    padding: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.md,
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentGreen,
    height: MIN_TOUCH_TARGET + 8,
    borderRadius: radii.md,
    gap: spacing.sm,
  },
  doneButtonText: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: colors.textInverse,
  },
});
