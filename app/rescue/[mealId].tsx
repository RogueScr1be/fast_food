/**
 * Rescue Checklist Screen — DRM Meal Quick Guide
 * 
 * Simplified checklist for Dinner Rescue Mode meals.
 * - Short, calming steps (uses meal.steps or fallback)
 * - No cook/prep toggle (DRM meals are always quick)
 * - Progress bar + Done → resets and returns to Tonight
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { colors, spacing, radii, typography, MIN_TOUCH_TARGET } from '../../lib/ui/theme';
import { getDrmById } from '../../lib/seeds';
import { getImageSource } from '../../lib/seeds/images';
import { resetDealState } from '../../lib/state/ffSession';
import { ThinProgressBar } from '../../components/ThinProgressBar';
import { PrimaryButton } from '../../components/PrimaryButton';

/**
 * Fallback steps for DRM meals without defined steps.
 * Calm, generic, always executable.
 */
const FALLBACK_STEPS = [
  "Set a timer for 10 minutes. You're going to eat.",
  'Gather your ingredients from the pantry/fridge.',
  'If heating is needed, start now (microwave/stovetop).',
  'Plate everything nicely. You deserve it.',
  'Done. Enjoy your rescue meal.',
];

export default function RescueChecklistScreen() {
  const { mealId } = useLocalSearchParams<{ mealId: string }>();
  const meal = mealId ? getDrmById(mealId) : null;
  
  // Get steps: use meal.steps if available and non-empty, else fallback
  const steps = useMemo(() => {
    if (meal?.steps && meal.steps.length > 0) {
      return meal.steps;
    }
    return FALLBACK_STEPS;
  }, [meal]);
  
  // Track completed steps
  const [completedIndices, setCompletedIndices] = useState<Set<number>>(new Set());
  
  // Progress
  const totalSteps = steps.length;
  const completedCount = completedIndices.size;
  const progress = totalSteps > 0 ? completedCount / totalSteps : 0;
  const allComplete = completedCount === totalSteps && totalSteps > 0;
  
  /**
   * Toggle step completion
   */
  const toggleStep = useCallback((index: number) => {
    setCompletedIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);
  
  /**
   * Handle Done - reset deal state and go back to Tonight
   */
  const handleDone = useCallback(() => {
    resetDealState();
    router.replace('/(tabs)/tonight');
  }, []);
  
  /**
   * Handle back navigation
   */
  const handleBack = useCallback(() => {
    router.back();
  }, []);

  // Error state - controlled fallback
  if (!meal) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Rescue meal not found</Text>
          <Text style={styles.errorSubtitle}>
            {mealId ? `ID: ${mealId}` : 'No meal ID provided'}
          </Text>
          
          <TouchableOpacity 
            style={styles.resetButton} 
            onPress={() => {
              resetDealState();
              router.replace('/(tabs)/tonight');
            }}
            accessibilityRole="button"
            accessibilityLabel="Reset tonight and go back"
          >
            <Text style={styles.resetButtonText}>Reset Tonight</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.backLink} onPress={handleBack}>
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress Bar */}
      <ThinProgressBar
        value={progress}
        accessibilityLabel={`Progress: ${completedCount} of ${totalSteps} steps`}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <View style={styles.rescueBadge}>
            <Text style={styles.rescueBadgeText}>RESCUE</Text>
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {meal.name}
          </Text>
          <Text style={styles.headerMeta}>
            {meal.estimatedTime} · {meal.ingredients.length} ingredients
          </Text>
        </View>
        
        {/* Small thumbnail */}
        <Image
          source={getImageSource(meal.imageKey)}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      </View>

      {/* Steps List */}
      <ScrollView 
        style={styles.stepsContainer}
        contentContainerStyle={styles.stepsContent}
      >
        {steps.map((step, index) => {
          const isCompleted = completedIndices.has(index);
          return (
            <TouchableOpacity
              key={index}
              style={[styles.stepRow, isCompleted && styles.stepRowCompleted]}
              onPress={() => toggleStep(index)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isCompleted }}
              accessibilityLabel={`Step ${index + 1}: ${step}`}
            >
              <View style={[styles.checkbox, isCompleted && styles.checkboxChecked]}>
                {isCompleted && <Check size={16} color={colors.textInverse} />}
              </View>
              <Text style={[styles.stepText, isCompleted && styles.stepTextCompleted]}>
                {step}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Done Button */}
      <View style={styles.footer}>
        <PrimaryButton
          label={allComplete ? 'Done' : `${completedCount}/${totalSteps} steps`}
          onPress={handleDone}
          tone="accept"
          disabled={!allComplete}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  // Error state
  errorTitle: {
    fontSize: typography.xl,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  errorSubtitle: {
    fontSize: typography.sm,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
  resetButton: {
    backgroundColor: colors.accentBlue,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  resetButtonText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textInverse,
  },
  backLink: {
    padding: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  backLinkText: {
    fontSize: typography.sm,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  rescueBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.xs,
    alignSelf: 'flex-start',
    marginBottom: spacing.xs,
  },
  rescueBadgeText: {
    fontSize: typography.xs,
    fontWeight: typography.bold,
    color: colors.textInverse,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  headerMeta: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    marginLeft: spacing.md,
  },
  // Steps
  stepsContainer: {
    flex: 1,
  },
  stepsContent: {
    padding: spacing.lg,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    minHeight: MIN_TOUCH_TARGET + 8,
  },
  stepRowCompleted: {
    opacity: 0.6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    marginTop: 2,
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: colors.accentGreen,
    borderColor: colors.accentGreen,
  },
  stepText: {
    flex: 1,
    fontSize: typography.base,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  stepTextCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  // Footer
  footer: {
    padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
