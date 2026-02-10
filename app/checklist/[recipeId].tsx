import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, spacing, radii } from '@/lib/ui/theme';
import { oak, whisper } from '@/lib/ui/motion';
import { getAnyMealById } from '@/lib/seeds';
import { getImageSourceSafe } from '@/lib/seeds/images';
import type { RecipeSeed } from '@/lib/seeds/types';

import { ChecklistHero } from '@/components/ChecklistHero';
import { ChecklistStep } from '@/components/ChecklistStep';
import { GreatJobOverlay } from '@/components/GreatJobOverlay';

import {
  consumePendingHeroTransition,
  setPendingHeroTransition,
  type TransitionRect,
} from '@/lib/ui/heroTransition';

type Params = { recipeId?: string };

export default function ChecklistScreen() {
  const { recipeId: recipeIdRaw } = useLocalSearchParams<Params>();
  const recipeId = typeof recipeIdRaw === 'string' ? recipeIdRaw : '';

  const meal = useMemo(() => (recipeId ? getAnyMealById(recipeId) : null), [recipeId]);
  const recipe = (meal && (meal as any).steps) ? (meal as RecipeSeed) : null;

  const imageSource = useMemo(() => {
    if (!meal) return null;
    return getImageSourceSafe(meal as any);
  }, [meal]);

  // ---- Transition destination rect (the checklist hero image area) ----
  const heroRectRef = useRef<TransitionRect | null>(null);

  const handleHeroReady = useCallback((rect: TransitionRect) => {
    heroRectRef.current = rect;
  }, []);

  // ---- Reverse-box entrance (Deal -> Checklist) ----
  const enterX = useSharedValue(0);
  const enterY = useSharedValue(0);
  const enterW = useSharedValue(0);
  const enterH = useSharedValue(0);
  const enterOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const [showEnterClone, setShowEnterClone] = useState(false);

  const runEnterClone = useCallback(
    (t: { sourceRect: TransitionRect; imageSource: any }) => {
      // Start clone at full-screen rect (source)
      enterX.value = t.sourceRect.x;
      enterY.value = t.sourceRect.y;
      enterW.value = t.sourceRect.w;
      enterH.value = t.sourceRect.h;
      enterOpacity.value = 1;
      contentOpacity.value = 0;
      setShowEnterClone(true);

      // Wait until we have a destination hero rect, then animate into it.
      const tryStart = () => {
        const dest = heroRectRef.current;
        if (!dest) {
          requestAnimationFrame(tryStart);
          return;
        }

        // Animate clone into hero rect
        enterX.value = withSpring(dest.x, oak);
        enterY.value = withSpring(dest.y, oak);
        enterW.value = withSpring(dest.w, oak);
        enterH.value = withSpring(dest.h, oak);

        // Fade content in after settle, then fade clone out quickly
        contentOpacity.value = withDelay(450, withTiming(1, whisper));
        enterOpacity.value = withDelay(
          450,
          withTiming(0, { ...whisper, duration: 120 }, (finished) => {
            if (finished) runOnJS(setShowEnterClone)(false);
          }),
        );
      };

      tryStart();
    },
    [contentOpacity, enterH, enterOpacity, enterW, enterX, enterY],
  );

  useEffect(() => {
    if (!recipeId || !imageSource) return;

    // Consume pending "checklist:<id>" transition, if present
    const transition = consumePendingHeroTransition(`checklist:${recipeId}`);
    if (!transition) {
      contentOpacity.value = 1;
      return;
    }

    runEnterClone({ sourceRect: transition.sourceRect, imageSource: transition.imageSource });
  }, [recipeId, imageSource, runEnterClone, contentOpacity]);

  const enterCloneStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: enterX.value,
    top: enterY.value,
    width: enterW.value,
    height: enterH.value,
    borderRadius: radii.xl,
    overflow: 'hidden',
    opacity: enterOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  // ---- Back transition (Checklist -> Deal) ----
  const handleBackToDeal = useCallback(() => {
    // If we have a hero rect, animate it back out to full-screen in Deal.
    const rect = heroRectRef.current;
    if (rect && imageSource) {
      setPendingHeroTransition({
        sourceRect: rect,
        imageSource,
        destKey: `deal:${recipeId}`,
      });
    }
    router.replace(`/deal?resume=${encodeURIComponent(recipeId)}`);
  }, [recipeId, imageSource]);

  // ---- Checklist completion UX ----
  const [completed, setCompleted] = useState<Set<number>>(() => new Set());
  const [showGreatJob, setShowGreatJob] = useState(false);

  const steps = useMemo(() => {
    const raw = (recipe?.steps ?? []) as string[];
    return raw.filter(Boolean);
  }, [recipe]);

  const allComplete = steps.length > 0 && completed.size === steps.length;

  useEffect(() => {
    if (allComplete) {
      // Delay slightly so the last checkbox feedback lands first
      const t = setTimeout(() => setShowGreatJob(true), 250);
      return () => clearTimeout(t);
    }
    return;
  }, [allComplete]);

  if (!recipe || !meal || !imageSource) {
    // If route param is invalid, go back deterministically
    useEffect(() => {
      router.replace('/tonight');
    }, []);
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      {showEnterClone && (
        <Animated.Image
          source={imageSource}
          style={enterCloneStyle as any}
          resizeMode="cover"
        />
      )}

      <Animated.View style={[styles.content, contentStyle]}>
        <ChecklistHero
          imageSource={imageSource}
          title={meal.title}
          progressText={`${Math.min(completed.size, steps.length)}/${steps.length}`}
          meta={(meal as any).meta ?? ''}
          onHeroReady={handleHeroReady}
          onBack={handleBackToDeal}
        />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {steps.map((s, idx) => (
            <ChecklistStep
              key={`${recipeId}:${idx}`}
              index={idx}
              text={s}
              checked={completed.has(idx)}
              onToggle={() => {
                setCompleted((prev) => {
                  const next = new Set(prev);
                  if (next.has(idx)) next.delete(idx);
                  else next.add(idx);
                  return next;
                });
              }}
            />
          ))}
        </ScrollView>
      </Animated.View>

      {showGreatJob && (
        <GreatJobOverlay
          onDismiss={() => {
            // Clean exit after completion
            setShowGreatJob(false);
            router.replace('/tonight');
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
