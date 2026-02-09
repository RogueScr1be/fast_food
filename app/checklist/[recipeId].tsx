// app/checklist/[recipeId].tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView, LayoutRectangle } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { ChevronLeft } from 'lucide-react-native';

import { colors, spacing, radii, typography, MIN_TOUCH_TARGET } from '@/lib/ui/theme';
import { getAnyMealById } from '@/lib/seeds';
import { getImageSourceSafe } from '@/lib/seeds/images';
import { consumePendingHeroTransition } from '@/lib/ui/heroTransition';
import { Oak, whisper } from '@/lib/ui/motion';

import { ChecklistStep } from '@/components/ChecklistStep';
import ChecklistHero from '@/components/ChecklistHero';
import GreatJobOverlay from '@/components/GreatJobOverlay';
import { recordCompletion } from '@/lib/state/feedbackLog';

type Meal = ReturnType<typeof getAnyMealById>;

type HeroRect = { x: number; y: number; width: number; height: number };

export default function ChecklistScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const id = recipeId ?? '';

  const meal: Meal = useMemo(() => (id ? getAnyMealById(id) : null), [id]);
  const [doneSet, setDoneSet] = useState<Set<number>>(new Set());
  const [showGreatJob, setShowGreatJob] = useState(false);

  // --- Reverse-box (Deal -> Checklist) overlay clone ---
  const [heroRect, setHeroRect] = useState<HeroRect | null>(null);
  const pendingRef = useRef<ReturnType<typeof consumePendingHeroTransition> | null>(null);

  const cloneX = useSharedValue(0);
  const cloneY = useSharedValue(0);
  const cloneW = useSharedValue(0);
  const cloneH = useSharedValue(0);
  const cloneOpacity = useSharedValue(0);

  const cloneStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: cloneX.value,
    top: cloneY.value,
    width: cloneW.value,
    height: cloneH.value,
    opacity: cloneOpacity.value,
    borderRadius: withTiming(0, { duration: 0 }),
  }));

  useEffect(() => {
    if (!id) return;
    // consume once per mount
    pendingRef.current = consumePendingHeroTransition(`checklist:${id}`);
  }, [id]);

  // When heroRect becomes available, run the pull-back animation if we have pending
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || !heroRect) return;

    // init clone at sourceRect
    cloneX.value = pending.sourceRect.x;
    cloneY.value = pending.sourceRect.y;
    cloneW.value = pending.sourceRect.width;
    cloneH.value = pending.sourceRect.height;
    cloneOpacity.value = 1;

    // animate into hero rect using Oak spring “weight”
    cloneX.value = withSpring(heroRect.x, Oak);
    cloneY.value = withSpring(heroRect.y, Oak);
    cloneW.value = withSpring(heroRect.width, Oak);
    cloneH.value = withSpring(heroRect.height, Oak);

    // fade out after settle (matches your earlier “settle then fade” approach)
    const t = setTimeout(() => {
      cloneOpacity.value = withTiming(0, { ...whisper, duration: 120 });
    }, 450);

    return () => clearTimeout(t);
  }, [heroRect]);

  const onHeroReady = useCallback((rect: HeroRect) => {
    setHeroRect(rect);
  }, []);

  if (!meal) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Meal not found</Text>
        <TouchableOpacity onPress={() => router.replace('/tonight')} style={styles.backPill}>
          <Text style={styles.backPillText}>Back to Tonight</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const steps = meal.steps ?? [];
  const allComplete = steps.length > 0 && doneSet.size === steps.length;

  // Great Job: edge trigger only
  useEffect(() => {
    if (allComplete) setShowGreatJob(true);
  }, [allComplete]);

  const toggleStep = useCallback((idx: number) => {
    setDoneSet(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const handleDone = useCallback(async () => {
    await recordCompletion(meal.id);
    router.replace('/tonight');
  }, [meal.id]);

  const imageSource = getImageSourceSafe(meal);

  return (
    <View style={styles.container}>
      {/* Clone overlay (renders on top of everything) */}
      <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.Image source={imageSource} style={cloneStyle} resizeMode="cover" />
      </Animated.View>

      <ChecklistHero
        imageSource={imageSource}
        title={meal.title}
        progressText={`${doneSet.size}/${steps.length}`}
        meta={meal.meta ?? ''}
        onHeroReady={onHeroReady}
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {steps.map((s, i) => (
          <ChecklistStep
            key={`${meal.id}-step-${i}`}
            index={i}
            text={s}
            checked={doneSet.has(i)}
            onToggle={() => toggleStep(i)}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          disabled={!allComplete}
          onPress={handleDone}
          style={[styles.doneButton, !allComplete && styles.doneButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={[styles.doneText, !allComplete && styles.doneTextDisabled]}>DONE</Text>
        </TouchableOpacity>
      </View>

      <GreatJobOverlay
        visible={showGreatJob}
        onDismiss={() => setShowGreatJob(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: typography.xl, fontWeight: typography.bold, padding: spacing.lg, color: colors.textPrimary },
  backPill: { marginLeft: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radii.xl, backgroundColor: colors.accentBlue },
  backPillText: { color: colors.textInverse, fontWeight: typography.bold },

  content: { padding: spacing.lg, paddingBottom: 120 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  doneButton: {
    height: MIN_TOUCH_TARGET + 6,
    borderRadius: radii.md,
    backgroundColor: colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonDisabled: { backgroundColor: colors.surfaceMuted },
  doneText: { fontSize: typography.base, fontWeight: typography.bold, color: colors.textInverse, letterSpacing: 1 },
  doneTextDisabled: { color: colors.textMuted },
});
