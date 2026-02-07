/**
 * Checklist Screen — Step-by-Step Cooking Guide
 *
 * Phase 3.0.1: Simplified — no Cook/Prep toggle, blue progress.
 * Steps always render in recipe-defined order.
 */

import React, { useState, useCallback } from 'react';
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
import { getAnyMealById, calculateProgress } from '../../lib/seeds';
import { ChecklistStep } from '../../components/ChecklistStep';
import { getImageSource } from '../../lib/seeds/images';
import { resetDealState } from '../../lib/state/ffSession';
import { recordCompletion } from '../../lib/state/feedbackLog';
import { ThinProgressBar } from '../../components/ThinProgressBar';
import { PrimaryButton } from '../../components/PrimaryButton';
import { GreatJobOverlay } from '../../components/GreatJobOverlay';

export default function ChecklistScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const meal = recipeId ? getAnyMealById(recipeId) : null;

  // Track completed steps by index
  const [completedIndices, setCompletedIndices] = useState<Set<number>>(new Set());

  // Great Job overlay — edge-triggered, not on mount
  const [showGreatJob, setShowGreatJob] = useState(false);

  // Steps always in recipe order
  const steps = meal?.steps ?? [];
  const totalSteps = steps.length;
  const completedCount = completedIndices.size;
  const progress = calculateProgress(completedCount, totalSteps);
  const allComplete = completedCount === totalSteps && totalSteps > 0;

  const toggleStep = useCallback((index: number) => {
    setCompletedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
        setShowGreatJob(false);
      } else {
        next.add(index);
        // Trigger Great Job on final step
        if (next.size === totalSteps && totalSteps > 0) {
          setShowGreatJob(true);
        }
      }
      return next;
    });
  }, [totalSteps]);

  const handleDone = useCallback(() => {
    if (recipeId) recordCompletion(recipeId);
    resetDealState();
    router.replace('/tonight');
  }, [recipeId]);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  // Error state
  if (!meal) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Recipe not found</Text>
          <Text style={styles.errorSubtitle}>
            {recipeId ? `ID: ${recipeId}` : 'No recipe ID provided'}
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

  const estimatedCost = 'estimatedCost' in meal ? meal.estimatedCost : null;
  const progressValue = progress / 100;

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress Bar (blue) */}
      <ThinProgressBar
        value={progressValue}
        accessibilityLabel={`Cooking progress: ${completedCount} of ${totalSteps} steps`}
      />

      {/* Header with thumbnail */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerWithThumb}>
            <Image
              source={getImageSource(meal.imageKey)}
              style={styles.headerThumb}
              resizeMode="cover"
            />
            <View style={styles.headerText}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {meal.name}
              </Text>
              <Text style={styles.headerSubtitle}>
                {completedCount} of {totalSteps} steps
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.headerButton} />
      </View>

      {/* Steps List */}
      <ScrollView
        style={styles.stepsList}
        contentContainerStyle={styles.stepsContent}
      >
        {steps.map((text, index) => (
          <ChecklistStep
            key={index}
            index={index}
            text={text}
            completed={completedIndices.has(index)}
            onToggle={() => toggleStep(index)}
            showStepLabel
          />
        ))}

        {/* Meta info at bottom */}
        <View style={styles.metaSection}>
          <Text style={styles.metaText}>{meal.estimatedTime}</Text>
          {estimatedCost && (
            <>
              <View style={styles.metaDot} />
              <Text style={styles.metaText}>{estimatedCost}</Text>
            </>
          )}
        </View>
      </ScrollView>

      {/* Done Button */}
      <View style={styles.footer}>
        <PrimaryButton
          label={allComplete ? 'Done' : `${totalSteps - completedCount} steps left`}
          onPress={handleDone}
          disabled={!allComplete}
          icon={
            <Check
              size={20}
              color={allComplete ? colors.textInverse : colors.textMuted}
            />
          }
          accessibilityLabel={
            allComplete ? 'Done cooking' : 'Complete all steps first'
          }
        />
      </View>

      {/* Great Job overlay — edge-triggered on final step */}
      <GreatJobOverlay
        visible={showGreatJob}
        onDismiss={() => setShowGreatJob(false)}
      />
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
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  headerWithThumb: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerThumb: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.mutedLight,
    marginRight: spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  stepsList: {
    flex: 1,
  },
  stepsContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  metaSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  metaText: {
    fontSize: typography.sm,
    color: colors.textMuted,
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    marginHorizontal: spacing.sm,
  },
  footer: {
    padding: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
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
    fontWeight: typography.medium,
  },
});
