/**
 * Checklist Screen — Step-by-Step Cooking Guide
 *
 * Phase 3.0.1: Simplified — no Cook/Prep toggle, blue progress.
 * Steps always render in recipe-defined order.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { colors, spacing, radii, typography, MIN_TOUCH_TARGET } from '../../lib/ui/theme';
import { latex, oak, whisper } from '../../lib/ui/motion';
import { getAnyMealById, calculateProgress } from '../../lib/seeds';
import { ChecklistStep } from '../../components/ChecklistStep';
import { ChecklistHero, type HeroRect } from '../../components/ChecklistHero';
import { resetDealState } from '../../lib/state/ffSession';
import { recordCompletion } from '../../lib/state/feedbackLog';
import { setPendingHeroTransition } from '@/lib/ui/heroTransition';
import { consumePendingHeroTransition, type PendingHeroTransition } from '../../lib/ui/heroTransition';
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

  // -----------------------------------------------------------------------
  // Reverse-box hero transition (from Deal)
  // -----------------------------------------------------------------------

  const [transition] = useState<PendingHeroTransition | null>(() =>
    recipeId ? consumePendingHeroTransition(`checklist:${recipeId}`) : null,
  );
  const [showClone, setShowClone] = useState(transition !== null);
  const mountedRef = useRef(true);
  const heroRectRef = useRef<HeroRect | null>(null);
  const heroRectRef = useRef<TransitionRect | null>(null);
  const destReceivedRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clone shared values (start at source rect)
  const cloneX = useSharedValue(transition?.sourceRect.x ?? 0);
  const cloneY = useSharedValue(transition?.sourceRect.y ?? 0);
  const cloneW = useSharedValue(transition?.sourceRect.width ?? 0);
  const cloneH = useSharedValue(transition?.sourceRect.height ?? 0);
  const cloneRadius = useSharedValue(0);
  const cloneOpacity = useSharedValue(transition ? 1 : 0);
  const contentOpacity = useSharedValue(transition ? 0 : 1);

  useEffect(() => {
    mountedRef.current = true;
    // Safety timeout: if dest rect not received in 500ms, fade clone out
    if (transition) {
      fallbackTimerRef.current = setTimeout(() => {
        if (!destReceivedRef.current && mountedRef.current) {
          fadeOutClone();
        }
      }, 500);
    }
    return () => {
      mountedRef.current = false;
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      cancelAnimation(cloneX);
      cancelAnimation(cloneY);
      cancelAnimation(cloneW);
      cancelAnimation(cloneH);
      cancelAnimation(cloneRadius);
      cancelAnimation(cloneOpacity);
      cancelAnimation(contentOpacity);
    };
  }, []);

  const fadeOutClone = useCallback(() => {
    // 120ms fade (tighter than standard whisper 180ms for snappy finish)
    cloneOpacity.value = withTiming(0, { ...whisper, duration: 120 }, (finished) => {
      if (finished) runOnJS(setShowClone)(false);
    });
    contentOpacity.value = withTiming(1, whisper);
  }, [cloneOpacity, contentOpacity]);

  // Deterministic: go back to Deal with the same meal.
  router.replace({ pathname: '/deal', params: { resume: recipeId } });
}, [recipeId]);

  const cloneStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: cloneX.value,
    top: cloneY.value,
    width: cloneW.value,
    height: cloneH.value,
    borderRadius: cloneRadius.value,
    opacity: cloneOpacity.value,
    zIndex: 100,
    overflow: 'hidden' as const,
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    flex: 1,
  }));

  // Steps always in recipe order
  const steps = meal?.steps ?? [];
  const totalSteps = steps.length;
  const completedCount = completedIndices.size;
  const progress = calculateProgress(completedCount, totalSteps);
  const allComplete = completedCount === totalSteps && totalSteps > 0;

  // Done button bloom: scale pulse on completion edge (false → true)
  const doneBloom = useSharedValue(1);
  const wasCompleteRef = useRef(false);
  const bloomMountedRef = useRef(false);

  useEffect(() => {
    if (!bloomMountedRef.current) {
      bloomMountedRef.current = true;
      wasCompleteRef.current = allComplete;
      return;
    }
    if (allComplete && !wasCompleteRef.current) {
      // Edge: just completed → bloom
      cancelAnimation(doneBloom);
      doneBloom.value = withSequence(
        withSpring(1.04, latex),
        withSpring(1, latex),
      );
    } else if (!allComplete && wasCompleteRef.current) {
      // Unchecked → reset immediately
      cancelAnimation(doneBloom);
      doneBloom.value = 1;
    }
    wasCompleteRef.current = allComplete;
  }, [allComplete]);

  const doneBloomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: doneBloom.value }],
  }));

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

  const estimatedCost = 'estimatedCost' in meal ? (meal as any).estimatedCost as string : null;
  const progressValue = progress / 100;

  return (
    <View style={styles.container}>
      {/* Hero image header */}
      <ChecklistHero
      imageSource={imageSource}
      title={title}
      progressText={progressText}
      meta={meta}
      onHeroReady={(rect: HeroRect) => {
        heroRectRef.current = rect;
      }}
      onBack={handleBack}
    />

      {/* Progress bar below hero */}
      <Animated.View style={contentAnimStyle}>
      <ThinProgressBar
        value={progressValue}
        accessibilityLabel={`Cooking progress: ${completedCount} of ${totalSteps} steps`}
      />

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

      {/* Done Button with bloom */}
      <Animated.View style={[styles.footer, doneBloomStyle]}>
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
      </Animated.View>

      </Animated.View>

      {/* Great Job overlay — edge-triggered on final step */}
      <GreatJobOverlay
        visible={showGreatJob}
        onDismiss={() => setShowGreatJob(false)}
      />

      {/* Reverse-box clone overlay (from Deal transition) */}
      {showClone && transition && (
        <Animated.View style={cloneStyle}>
          <Image
            source={transition.imageSource}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="bottom"
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
