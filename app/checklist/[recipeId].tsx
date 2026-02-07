/**
 * Checklist Screen — Step-by-Step Cooking Guide
 * 
 * Phase 4: Real checklist with progress tracking.
 * - Thin progress bar at top
 * - Cook/Prep toggle for step ordering
 * - Checkable step list
 * - Done button when all complete
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
import { 
  getAnyMealById, 
  reorderForPrepWithIndices, 
  calculateProgress,
} from '../../lib/seeds';
import { getImageSource } from '../../lib/seeds/images';
import { resetDealState } from '../../lib/state/ffSession';
import { ThinProgressBar } from '../../components/ThinProgressBar';
import { PrimaryButton } from '../../components/PrimaryButton';

type OrderMode = 'cook' | 'prep';

interface StepState {
  text: string;
  completed: boolean;
  originalIndex: number;
}

export default function ChecklistScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const meal = recipeId ? getAnyMealById(recipeId) : null;
  
  // Order mode: cook (original) vs prep (prep-first)
  const [orderMode, setOrderMode] = useState<OrderMode>('cook');
  
  // Track completed steps by original index
  const [completedIndices, setCompletedIndices] = useState<Set<number>>(new Set());

  // Compute ordered steps based on mode
  // Uses stable index mapping to handle duplicate step text correctly
  const orderedSteps: StepState[] = useMemo(() => {
    if (!meal) return [];
    
    const originalSteps = meal.steps;
    
    if (orderMode === 'cook') {
      // Original order - straightforward mapping
      return originalSteps.map((text, index) => ({
        text,
        completed: completedIndices.has(index),
        originalIndex: index,
      }));
    } else {
      // Prep-first order - use stable index mapping to avoid indexOf bugs
      const reordered = reorderForPrepWithIndices(originalSteps);
      return reordered.map(({ text, originalIndex }) => ({
        text,
        completed: completedIndices.has(originalIndex),
        originalIndex,
      }));
    }
  }, [meal, orderMode, completedIndices]);

  // Progress calculation
  const totalSteps = meal?.steps.length || 0;
  const completedCount = completedIndices.size;
  const progress = calculateProgress(completedCount, totalSteps);
  const allComplete = completedCount === totalSteps && totalSteps > 0;

  /**
   * Toggle step completion
   */
  const toggleStep = useCallback((originalIndex: number) => {
    setCompletedIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(originalIndex)) {
        newSet.delete(originalIndex);
      } else {
        newSet.add(originalIndex);
      }
      return newSet;
    });
  }, []);

  /**
   * Handle Done - reset deal state and return to Tonight
   */
  const handleDone = useCallback(() => {
    resetDealState();
    router.replace('/tonight');
  }, []);

  /**
   * Handle Back
   */
  const handleBack = useCallback(() => {
    router.back();
  }, []);

  // Error state - controlled fallback instead of crash
  if (!meal) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Recipe not found</Text>
          <Text style={styles.errorSubtitle}>
            {recipeId ? `ID: ${recipeId}` : 'No recipe ID provided'}
          </Text>
          
          {/* Primary action: Reset and start fresh */}
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
          
          {/* Secondary: Just go back */}
          <TouchableOpacity style={styles.backLink} onPress={handleBack}>
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Get estimated cost (only on RecipeSeed, not DrmSeed)
  const estimatedCost = 'estimatedCost' in meal ? meal.estimatedCost : null;

  // Progress value (0-1)
  const progressValue = progress / 100;

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress Bar */}
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
              <Text style={styles.headerTitle} numberOfLines={1}>{meal.name}</Text>
              <Text style={styles.headerSubtitle}>
                {completedCount} of {totalSteps} steps
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.headerButton} />
      </View>

      {/* Cook/Prep Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            orderMode === 'cook' && styles.toggleButtonActive,
          ]}
          onPress={() => setOrderMode('cook')}
          accessibilityRole="button"
          accessibilityState={{ selected: orderMode === 'cook' }}
        >
          <Text style={[
            styles.toggleText,
            orderMode === 'cook' && styles.toggleTextActive,
          ]}>
            Cook now
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            orderMode === 'prep' && styles.toggleButtonActive,
          ]}
          onPress={() => setOrderMode('prep')}
          accessibilityRole="button"
          accessibilityState={{ selected: orderMode === 'prep' }}
        >
          <Text style={[
            styles.toggleText,
            orderMode === 'prep' && styles.toggleTextActive,
          ]}>
            Prep first
          </Text>
        </TouchableOpacity>
      </View>

      {/* Steps List */}
      <ScrollView 
        style={styles.stepsList}
        contentContainerStyle={styles.stepsContent}
      >
        {orderedSteps.map((step, displayIndex) => (
          <TouchableOpacity
            key={`${step.originalIndex}-${orderMode}`}
            style={styles.stepRow}
            onPress={() => toggleStep(step.originalIndex)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: step.completed }}
          >
            <View style={[
              styles.stepCheckbox,
              step.completed && styles.stepCheckboxChecked,
            ]}>
              {step.completed && (
                <Check size={14} color={colors.textInverse} />
              )}
            </View>
            <View style={styles.stepContent}>
              <Text style={[
                styles.stepNumber,
                step.completed && styles.stepNumberCompleted,
              ]}>
                Step {displayIndex + 1}
              </Text>
              <Text style={[
                styles.stepText,
                step.completed && styles.stepTextCompleted,
              ]}>
                {step.text}
              </Text>
            </View>
          </TouchableOpacity>
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
          label={allComplete ? "Done" : `${totalSteps - completedCount} steps left`}
          onPress={handleDone}
          disabled={!allComplete}
          icon={<Check size={20} color={allComplete ? colors.textInverse : colors.textMuted} />}
          accessibilityLabel={allComplete ? "Done cooking" : "Complete all steps first"}
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
  // Header
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
  // Cook/Prep Toggle
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.mutedLight,
    borderRadius: radii.md,
    padding: 3,
  },
  toggleButton: {
    flex: 1,
    height: MIN_TOUCH_TARGET - 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.sm,
  },
  toggleButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleText: {
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: colors.textPrimary,
  },
  // Steps list
  stepsList: {
    flex: 1,
  },
  stepsContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    minHeight: MIN_TOUCH_TARGET,
  },
  stepCheckbox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.md,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCheckboxChecked: {
    backgroundColor: colors.accentGreen,
    borderColor: colors.accentGreen,
  },
  stepContent: {
    flex: 1,
  },
  stepNumber: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.textMuted,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepNumberCompleted: {
    color: colors.textMuted,
  },
  stepText: {
    fontSize: typography.base,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  stepTextCompleted: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
    opacity: 0.7,
  },
  // Meta section
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
  // Footer
  footer: {
    padding: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  // Error state
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
