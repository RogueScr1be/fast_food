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
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { colors, spacing, radii, typography, MIN_TOUCH_TARGET } from '../../lib/ui/theme';
import { getDrmById } from '../../lib/seeds';
import { ChecklistStep } from '../../components/ChecklistStep';
import { ChecklistHero } from '../../components/ChecklistHero';
import { getImageSource } from '../../lib/seeds/images';
import { resetDealState } from '../../lib/state/ffSession';
import { recordCompletion } from '../../lib/state/feedbackLog';
import { ThinProgressBar } from '../../components/ThinProgressBar';
import { PrimaryButton } from '../../components/PrimaryButton';
import { GreatJobOverlay } from '../../components/GreatJobOverlay';

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
  const [showGreatJob, setShowGreatJob] = useState(false);
  
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
        setShowGreatJob(false);
      } else {
        newSet.add(index);
        if (newSet.size === totalSteps && totalSteps > 0) {
          setShowGreatJob(true);
        }
      }
      return newSet;
    });
  }, [totalSteps]);
  
  /**
   * Handle Done - reset deal state and go back to Tonight
   */
  const handleDone = useCallback(() => {
    if (mealId) recordCompletion(mealId);
    resetDealState();
    router.replace('/tonight');
  }, [mealId]);
  
  /**
   * Handle back navigation — return to deal (resume swiping)
   * Uses replace so rescue is removed from the back stack.
   */
  const handleBack = useCallback(() => {
    router.replace('/deal');
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
              router.replace('/tonight');
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
    <View style={styles.container}>
      {/* Hero image header */}
      <ChecklistHero
        imageSource={getImageSource(meal.imageKey)}
        title={meal.name}
        progressText={`${completedCount} of ${totalSteps} steps`}
        meta={`${meal.estimatedTime} · ${meal.ingredients.length} ingredients`}
        isRescue
        onBack={handleBack}
      />

      {/* Progress bar below hero */}
      <ThinProgressBar
        value={progress}
        accessibilityLabel={`Progress: ${completedCount} of ${totalSteps} steps`}
      />

      {/* Steps List */}
      <ScrollView 
        style={styles.stepsContainer}
        contentContainerStyle={styles.stepsContent}
      >
        {steps.map((step, index) => (
          <ChecklistStep
            key={index}
            index={index}
            text={step}
            completed={completedIndices.has(index)}
            onToggle={() => toggleStep(index)}
            showStepLabel={false}
          />
        ))}
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

      {/* Great Job overlay */}
      <GreatJobOverlay
        visible={showGreatJob}
        onDismiss={() => setShowGreatJob(false)}
      />
    </View>
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
  // Steps
  stepsContainer: {
    flex: 1,
  },
  stepsContent: {
    padding: spacing.lg,
  },
  // Footer
  footer: {
    padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
