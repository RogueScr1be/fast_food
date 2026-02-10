/**
 * Checklist Screen — Recipe execution
 *
 * Requirements:
 * - Enter animation: Deal full-screen hero "pulls back" into checklist hero box.
 * - Back animation: Checklist hero box expands back to Deal full-screen hero.
 * - Deterministic back: Back goes to /deal?resume=<id> (not router.back()).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, spacing, typography, radii, MIN_TOUCH_TARGET } from '@/lib/ui/theme';
import { oak, whisper } from '@/lib/ui/motion';
import { ChecklistHero, type HeroRect } from '@/components/ChecklistHero';
import { ChecklistStep } from '@/components/ChecklistStep';
import { GreatJobOverlay } from '@/components/GreatJobOverlay';

import { getRecipeById } from '@/lib/seeds';
import { getImageSourceSafe } from '@/lib/seeds/images';
import {
  consumePendingHeroTransition,
  setPendingHeroTransition,
  type TransitionRect,
} from '@/lib/ui/heroTransition';

type Params = { recipeId?: string };

export default function ChecklistScreen() {
  const { recipeId } = useLocalSearchParams<Params>();
  const id = typeof recipeId === 'string' ? recipeId : '';

  const { width: winW, height: winH } = useWindowDimensions();

  const recipe = useMemo(() => (id ? getRecipeById(id) : null), [id]);
  const imageSource = useMemo(() => (recipe ? getImageSourceSafe(recipe) : null), [recipe]);

  // Steps state
  const steps = recipe?.steps ?? [];
  const [done, setDone] = useState<boolean[]>(() => steps.map(() => false));
  useEffect(() => {
    setDone(steps.map(() => false));
  }, [id]);

  const allDone = done.length > 0 && done.every(Boolean);
  const [showGreatJob, setShowGreatJob] = useState(false);

  // Measure the hero rect for reverse transition back to Deal
  const heroRectRef = useRef<HeroRect | null>(null);
  const handleHeroReady = useCallback((rect: HeroRect) => {
    heroRectRef.current = rect;
  }, []);

  // ---------------------------------------------------------------------------
  // Deal -> Checklist "pull back into box" transition (enter clone)
  // ---------------------------------------------------------------------------

  const [pending, setPending] = useState<{
    sourceRect: TransitionRect;
    imageSource: any;
  } | null>(null);

  const cloneX = useSharedValue(0);
  const cloneY = useSharedValue(0);
  const cloneW = useSharedValue(0);
  const cloneH = useSharedValue(0);
  const cloneOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(1);

  const cloneStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: cloneX.value,
    top: cloneY.value,
    width: cloneW.value,
    height: cloneH.value,
    opacity: cloneOpacity.value,
    borderRadius: 0,
    overflow: 'hidden',
  }));

  const contentFadeStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  useEffect(() => {
    if (!id) return;

    const p = consumePendingHeroTransition(`checklist:${id}`);
    if (!p) return;

    setPending({ sourceRect: p.sourceRect, imageSource: p.imageSource });

    // Start clone full-screen (Deal) -> animate into destination (Checklist hero rect once ready)
    cloneX.value = p.sourceRect.x;
    cloneY.value = p.sourceRect.y;
    cloneW.value = p.sourceRect.width;
    cloneH.value = p.sourceRect.height;
    cloneOpacity.value = 1;

    // Hide content until clone lands
    contentOpacity.value = 0;

    // Wait for hero layout (heroRectRef) with a short polling loop
    let raf = 0;
    const startWhenReady = () => {
      const r = heroRectRef.current;
      if (!r) {
        raf = requestAnimationFrame(startWhenReady);
        return;
      }

      cloneX.value = withSpring(r.x, oak);
      cloneY.value = withSpring(r.y, oak);
      cloneW.value = withSpring(r.width, oak);
      cloneH.value = withSpring(r.height, oak);

      const settleMs = 450;
      const t = setTimeout(() => {
        contentOpacity.value = withTiming(1, whisper);
        cloneOpacity.value = withTiming(
          0,
          { ...whisper, duration: 120 },
          (finished) => {
            if (finished) {
              runOnJS(setPending)(null);
            }
          },
        );
      }, settleMs);

      return () => clearTimeout(t);
    };

    raf = requestAnimationFrame(startWhenReady);

    return () => {
      cancelAnimation(cloneX);
      cancelAnimation(cloneY);
      cancelAnimation(cloneW);
      cancelAnimation(cloneH);
      cancelAnimation(cloneOpacity);
      cancelAnimation(contentOpacity);
      if (raf) cancelAnimationFrame(raf);
      setPending(null);
    };
  }, [id, cloneX, cloneY, cloneW, cloneH, cloneOpacity, contentOpacity]);

  // ---------------------------------------------------------------------------
  // Back to Deal (reverse clone expansion)
  // ---------------------------------------------------------------------------

  const handleBackToDeal = useCallback(() => {
    if (!recipe || !imageSource) {
      router.replace('/deal');
      return;
    }

    const r = heroRectRef.current;
    // If we don't have a rect yet, still exit deterministically.
    if (!r) {
      router.replace(`/deal?resume=${recipe.id}`);
      return;
    }

    setPendingHeroTransition({
      sourceRect: { x: r.x, y: r.y, width: r.width, height: r.height },
      imageSource,
      destKey: `deal:${recipe.id}`,
    });

    router.replace(`/deal?resume=${recipe.id}`);
  }, [recipe, imageSource]);

  // ---------------------------------------------------------------------------
  // Done flow
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (allDone) setShowGreatJob(true);
  }, [allDone]);

  const progressText = useMemo(() => {
    const total = done.length;
    const completed = done.filter(Boolean).length;
    return total > 0 ? `${completed}/${total}` : '';
  }, [done]);

  const meta = useMemo(() => {
    if (!recipe) return '';
    const parts: string[] = [];
    if (recipe.time) parts.push(recipe.time);
    if (recipe.cost) parts.push(recipe.cost);
    return parts.join(' • ');
  }, [recipe]);

  if (!recipe || !imageSource) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.title}>Recipe not found.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/deal')}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Content */}
      <Animated.View style={[styles.contentWrap, contentFadeStyle]}>
        <ChecklistHero
          imageSource={imageSource}
          title={recipe.title}
          progressText={progressText}
          meta={meta}
          onHeroReady={handleHeroReady}
          onBack={handleBackToDeal}
        />

        <ScrollView contentContainerStyle={styles.content}>
          {steps.map((step, idx) => (
            <ChecklistStep
              key={`${recipe.id}:${idx}`}
              index={idx}
              text={step}
              isDone={!!done[idx]}
              onToggle={() => {
                setDone((prev) => {
                  const next = [...prev];
                  next[idx] = !next[idx];
                  return next;
                });
              }}
            />
          ))}

          <View style={{ height: 24 }} />
        </ScrollView>
      </Animated.View>

      {/* Enter clone (Deal -> Checklist pullback) */}
      {pending && (
        <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Animated.View style={cloneStyle}>
            <Animated.Image
              source={pending.imageSource}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          </Animated.View>
        </Animated.View>
      )}

      <GreatJobOverlay visible={showGreatJob} onDismiss={() => setShowGreatJob(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentWrap: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  title: {
    fontSize: typography.lg,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  backBtn: {
    height: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.accentBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    color: colors.textInverse,
    fontWeight: typography.semibold,
    fontSize: typography.base,
  },
});
