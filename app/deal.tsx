/**
 * Deal Screen — Full-Screen Editorial Card Experience
 *
 * Phase 1.3: Chrome-free, full-bleed card with glass overlay + idle affordance.
 *
 * - Shows one recipe at a time (edge-to-edge hero image)
 * - Swipe-to-pass gestures handled by DecisionCard
 * - Glass overlay (level 0/1/2) managed as controlled state here
 * - Idle affordance: staged silent onboarding (first session only)
 * - DRM insertion after 3 passes OR 45 seconds
 * - Accept → navigate to /checklist/[recipeId]
 * - Back chevron → /tonight (deterministic)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, RefreshCw, X, Check } from 'lucide-react-native';

import { colors, spacing, radii, typography, MIN_TOUCH_TARGET } from '../lib/ui/theme';
import { oak, whisper } from '@/lib/ui/motion';
import {
  consumePendingHeroTransition,
  type PendingHeroTransition,
} from '@/lib/ui/heroTransition';

import {
  getSelectedMode,
  setSelectedMode,
  getExcludeAllergens,
  getConstraints,
  getDealHistory,
  setCurrentDealId,
  addToDealHistory,
  resetDealState,
  getPassCount,
  getDrmInserted,
  setDrmInserted,
  markDealStart,
  setExcludeAllergens,
  DRM_PASS_THRESHOLD,
  DRM_TIME_THRESHOLD_MS,
} from '../lib/state/ffSession';

import {
  pickNextRecipe,
  pickDrmMeal,
  getRandomWhy,
  hasConflictingAllergens,
  getAnyMealById,
} from '../lib/seeds';

import type { RecipeSeed, DrmSeed, AllergenTag } from '../lib/seeds/types';
import { DecisionCard } from '../components/DecisionCard';
import type { OverlayLevel } from '../components/GlassOverlay';

import { getHasSeenAffordance, setHasSeenAffordance } from '@/lib/state/persist';
import { useIdleAffordance } from '@/hooks/useIdleAffordance';
import { getImageSourceSafe } from '@/lib/seeds/images';

// All allergens for the modal
const ALL_ALLERGENS: { tag: AllergenTag; label: string }[] = [
  { tag: 'dairy', label: 'Dairy' },
  { tag: 'nuts', label: 'Nuts' },
  { tag: 'gluten', label: 'Gluten' },
  { tag: 'eggs', label: 'Eggs' },
  { tag: 'soy', label: 'Soy' },
  { tag: 'shellfish', label: 'Shellfish' },
];

type CurrentDeal =
  | { type: 'recipe'; data: RecipeSeed }
  | { type: 'drm'; data: DrmSeed }
  | null;

const ALL_MODES: ('fancy' | 'easy' | 'cheap')[] = ['fancy', 'easy', 'cheap'];

export default function DealScreen() {
  const params = useLocalSearchParams<{ resume?: string }>();
  const resumeId = typeof params.resume === 'string' ? params.resume : undefined;

  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();

  const [currentDeal, setCurrentDeal] = useState<CurrentDeal>(null);
  const [whyText, setWhyText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [noMoreRecipes, setNoMoreRecipes] = useState(false);

  // Glass overlay level (controlled here, passed into DecisionCard)
  const [overlayLevel, setOverlayLevel] = useState<OverlayLevel>(0);

  // Allergy modal state
  const [showAllergyModal, setShowAllergyModal] = useState(false);
  const [tempAllergens, setTempAllergens] = useState<AllergenTag[]>([]);
  const [_localExcludeAllergens, setLocalExcludeAllergens] = useState<AllergenTag[]>(getExcludeAllergens());

  // DRM timer ref
  const drmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drmTimerTriggered, setDrmTimerTriggered] = useState(false);

  // Session ID guard (StrictMode + re-entry)
  const [sessionId] = useState(0);
  const lastInitSession = useRef(-1);

  // Card generation key — increments on each new card to reset idle timer
  const [cardKey, setCardKey] = useState(0);

  // Ensure mode exists
  const [mode] = useState(() => {
    const savedMode = getSelectedMode();
    if (savedMode) return savedMode;
    const randomMode = ALL_MODES[Math.floor(Math.random() * ALL_MODES.length)];
    setSelectedMode(randomMode);
    return randomMode;
  });
  const constraints = getConstraints();
  const isValidMode = mode === 'fancy' || mode === 'easy' || mode === 'cheap';

  // ---------------------------------------------------------------------------
  // (NEW) Checklist → Deal “expand to full hero” transition
  // ---------------------------------------------------------------------------

  const pendingEnterRef = useRef<PendingHeroTransition | null>(null);
  const [showEnterClone, setShowEnterClone] = useState(false);

  const enterX = useSharedValue(0);
  const enterY = useSharedValue(0);
  const enterW = useSharedValue(0);
  const enterH = useSharedValue(0);
  const enterOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(1);

  const resumeMeal = useMemo(() => {
    if (!resumeId) return null;
    return getAnyMealById(resumeId);
  }, [resumeId]);

  // Consume pending transition on mount if we’re returning from checklist
  useEffect(() => {
    if (!resumeId) return;

    const pending = consumePendingHeroTransition(`deal:${resumeId}`);
    if (!pending) return;

    pendingEnterRef.current = pending;

    // Initialize clone at source rect
    enterX.value = pending.sourceRect.x;
    enterY.value = pending.sourceRect.y;
    enterW.value = pending.sourceRect.width;
    enterH.value = pending.sourceRect.height;
    enterOpacity.value = 1;

    // Hide underlying content until the clone expands
    contentOpacity.value = 0;

    setShowEnterClone(true);

    // Animate clone to full-screen (Oak), then fade it out (Whisper 120ms),
    // while fading content in (Whisper).
    enterX.value = withSpring(0, oak);
    enterY.value = withSpring(0, oak);
    enterW.value = withSpring(winW, oak);
    enterH.value = withSpring(winH, oak);

    // Settle delay mirrors checklist reverse-box quality
    const settleMs = 450;

    const t = setTimeout(() => {
      contentOpacity.value = withTiming(1, whisper);
      enterOpacity.value = withTiming(
        0,
        { ...whisper, duration: 120 },
        (finished) => {
          if (finished) {
            runOnJS(setShowEnterClone)(false);
            pendingEnterRef.current = null;
          }
        },
      );
    }, settleMs);

    return () => {
      clearTimeout(t);
      cancelAnimation(enterX);
      cancelAnimation(enterY);
      cancelAnimation(enterW);
      cancelAnimation(enterH);
      cancelAnimation(enterOpacity);
      cancelAnimation(contentOpacity);
      setShowEnterClone(false);
      pendingEnterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId, winW, winH]);

  const enterCloneStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: enterX.value,
    top: enterY.value,
    width: enterW.value,
    height: enterH.value,
    opacity: enterOpacity.value,
    borderRadius: 0,
    overflow: 'hidden',
  }));

  const contentFadeStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  // ---------------------------------------------------------------------------
  // Idle affordance — staged silent onboarding (first session only)
  // ---------------------------------------------------------------------------

  const [affordanceEligible, setAffordanceEligible] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const seen = await getHasSeenAffordance();
      if (!mounted) return;
      setAffordanceEligible(!seen);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const { nudgeX, overlayLiftY, resetIdle } = useIdleAffordance({
    enabled: affordanceEligible,
    liftDelayMs: 4000,
    nudgeDelayMs: 1500,
  });

  const markAffordanceSeen = useCallback(() => {
    if (!affordanceEligible) return;
    setAffordanceEligible(false);
    void setHasSeenAffordance(true);
  }, [affordanceEligible]);

  useEffect(() => {
    resetIdle();
  }, [cardKey, resetIdle]);

  const idleNudgeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: nudgeX.value }],
  }));

  // ---------------------------------------------------------------------------
  // Deal logic
  // ---------------------------------------------------------------------------

  const dealNextCard = useCallback(() => {
    const dealHistory = getDealHistory();
    const passCount = getPassCount();
    const drmInserted = getDrmInserted();
    const excludeAllergens = getExcludeAllergens();

    const triggerDrm = !drmInserted && (passCount >= DRM_PASS_THRESHOLD || drmTimerTriggered);

    if (triggerDrm) {
      const drmMeal = pickDrmMeal(excludeAllergens, dealHistory);
      if (drmMeal) {
        setCurrentDeal({ type: 'drm', data: drmMeal });
        setWhyText(getRandomWhy(drmMeal));
        setCurrentDealId(drmMeal.id);
        setDrmInserted(true);
        setOverlayLevel(0);
        setNoMoreRecipes(false);
        setIsLoading(false);
        setCardKey((k) => k + 1);
        return;
      }
      setDrmInserted(true);
    }

    let recipe = pickNextRecipe(mode, excludeAllergens, dealHistory, constraints);

    if (!recipe && constraints.length > 0) recipe = pickNextRecipe(mode, excludeAllergens, dealHistory, []);
    if (!recipe && excludeAllergens.length > 0) recipe = pickNextRecipe(mode, [], dealHistory, []);

    if (recipe) {
      setCurrentDeal({ type: 'recipe', data: recipe });
      setWhyText(getRandomWhy(recipe));
      setCurrentDealId(recipe.id);
      setOverlayLevel(0);
      setNoMoreRecipes(false);
    } else {
      setCurrentDeal(null);
      setNoMoreRecipes(true);
    }
    setIsLoading(false);
    setCardKey((k) => k + 1);
  }, [mode, constraints, drmTimerTriggered]);

  // Init session
  useEffect(() => {
    if (lastInitSession.current === sessionId) return;
    lastInitSession.current = sessionId;

    markDealStart();

    drmTimerRef.current = setTimeout(() => {
      setDrmTimerTriggered(true);
    }, DRM_TIME_THRESHOLD_MS);

    // If we came back from checklist with a specific meal, show it.
    if (resumeMeal) {
      const isDrm = (resumeMeal as any).kind === 'drm' || (resumeMeal as any).type === 'drm';
      setCurrentDeal(isDrm ? ({ type: 'drm', data: resumeMeal as DrmSeed } as CurrentDeal) : ({ type: 'recipe', data: resumeMeal as RecipeSeed } as CurrentDeal));
      setWhyText(getRandomWhy(resumeMeal as any));
      setCurrentDealId((resumeMeal as any).id);
      setOverlayLevel(0);
      setNoMoreRecipes(false);
      setIsLoading(false);
      setCardKey((k) => k + 1);
      return () => {
        if (drmTimerRef.current) clearTimeout(drmTimerRef.current);
      };
    }

    dealNextCard();

    return () => {
      if (drmTimerRef.current) clearTimeout(drmTimerRef.current);
    };
  }, [sessionId, dealNextCard, resumeMeal]);

  useEffect(() => {
    setLocalExcludeAllergens(getExcludeAllergens());
  }, [showAllergyModal]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAccept = useCallback(() => {
    markAffordanceSeen();
    resetIdle();

    if (!currentDeal) return;

    addToDealHistory(currentDeal.data.id);
    router.push(`/checklist/${currentDeal.data.id}`);
  }, [currentDeal, markAffordanceSeen, resetIdle]);

  const handlePass = useCallback(() => {
    markAffordanceSeen();
    resetIdle();

    if (!currentDeal) return;
    addToDealHistory(currentDeal.data.id);
    dealNextCard();
  }, [currentDeal, markAffordanceSeen, resetIdle, dealNextCard]);

  const handleOverlayLevelChange = useCallback(
    (lvl: 0 | 1 | 2) => {
      markAffordanceSeen();
      resetIdle();
      setOverlayLevel(lvl);
    },
    [markAffordanceSeen, resetIdle],
  );

  const handleToggleExpand = useCallback(() => {
    markAffordanceSeen();
    setOverlayLevel((prev) => (prev === 0 ? 1 : 0));
  }, [markAffordanceSeen]);

  const handleShuffle = useCallback(() => {
    resetDealState();
    setDrmTimerTriggered(false);
    setIsLoading(true);

    if (drmTimerRef.current) clearTimeout(drmTimerRef.current);
    drmTimerRef.current = setTimeout(() => {
      setDrmTimerTriggered(true);
    }, DRM_TIME_THRESHOLD_MS);

    setTimeout(() => dealNextCard(), 100);
  }, [dealNextCard]);

  // ---------------------------------------------------------------------------
  // Allergy modal handlers
  // ---------------------------------------------------------------------------

  const toggleAllergen = (tag: AllergenTag) => {
    setTempAllergens((prev) => (prev.includes(tag) ? prev.filter((a) => a !== tag) : [...prev, tag]));
  };

  const saveAllergens = useCallback(() => {
    setExcludeAllergens(tempAllergens);
    setLocalExcludeAllergens(tempAllergens);
    setShowAllergyModal(false);

    if (currentDeal && hasConflictingAllergens(currentDeal.data, tempAllergens)) {
      addToDealHistory(currentDeal.data.id);
      setTimeout(() => {
        const dealHistory = getDealHistory();
        if (currentDeal.type === 'drm') {
          const drmMeal = pickDrmMeal(tempAllergens, dealHistory);
          if (drmMeal) {
            setCurrentDeal({ type: 'drm', data: drmMeal });
            setWhyText(getRandomWhy(drmMeal));
            setCurrentDealId(drmMeal.id);
            setOverlayLevel(0);
            setCardKey((k) => k + 1);
            return;
          }
        }
        if (mode) {
          const recipe = pickNextRecipe(mode, tempAllergens, dealHistory, constraints);
          if (recipe) {
            setCurrentDeal({ type: 'recipe', data: recipe });
            setWhyText(getRandomWhy(recipe));
            setCurrentDealId(recipe.id);
            setOverlayLevel(0);
            setCardKey((k) => k + 1);
          } else {
            setCurrentDeal(null);
            setNoMoreRecipes(true);
          }
        }
      }, 50);
    }
  }, [tempAllergens, currentDeal, mode, constraints]);

  // ---------------------------------------------------------------------------
  // Render: Loading
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Empty state
  // ---------------------------------------------------------------------------

  if (noMoreRecipes) {
    const seenCount = getDealHistory().length;
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>That’s all for {isValidMode ? mode : 'tonight'}</Text>
          <Text style={styles.emptySubtitle}>You’ve seen {seenCount} options</Text>

          <TouchableOpacity
            style={styles.resetTonightButton}
            onPress={handleShuffle}
            accessibilityRole="button"
            accessibilityLabel="Reset tonight and deal again"
          >
            <RefreshCw size={18} color={colors.textInverse} />
            <Text style={styles.resetTonightButtonText}>Reset Tonight</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backToModeButton}
            onPress={() => router.replace('/tonight')}
            accessibilityRole="button"
            accessibilityLabel="Try a different mode"
          >
            <Text style={styles.backToModeText}>Try a different mode</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Main
  // ---------------------------------------------------------------------------

  const modeLabel = isValidMode ? mode : undefined;
  const cloneMealForEnter = resumeMeal && pendingEnterRef.current ? resumeMeal : null;

  return (
    <View style={styles.container}>
      {/* Underlying card content (fades in when entering from checklist) */}
      <Animated.View style={[styles.cardWrapper, idleNudgeStyle, contentFadeStyle]}>
        {currentDeal && (
          <DecisionCard
            recipe={currentDeal.data}
            whyText={whyText}
            variant={currentDeal.type === 'drm' ? 'rescue' : 'default'}
            swipeDisabled={currentDeal.type === 'drm'}
            expanded={overlayLevel > 0}
            onToggleExpand={handleToggleExpand}
            onAccept={handleAccept}
            onPass={handlePass}
            overlayLevel={overlayLevel}
            onOverlayLevelChange={handleOverlayLevelChange}
            externalLiftY={overlayLiftY}
            modeLabel={modeLabel}
          />
        )}
      </Animated.View>

      {/* (NEW) Enter clone: checklist hero -> full screen hero */}
      {showEnterClone && cloneMealForEnter && (
        <Animated.View pointerEvents="none" style={enterCloneStyle}>
          <Animated.Image
            source={getImageSourceSafe(cloneMealForEnter as any)}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </Animated.View>
      )}

      {/* Back button */}
      {overlayLevel === 0 && (
        <TouchableOpacity
          style={[styles.backButton, { top: insets.top + spacing.sm }]}
          onPress={() => router.replace('/tonight')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={20} color={colors.glassText} />
        </TouchableOpacity>
      )}

      {/* Allergy Modal */}
      <Modal visible={showAllergyModal} animationType="slide" transparent onRequestClose={() => setShowAllergyModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>I’m allergic to…</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowAllergyModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.allergenList}>
              {ALL_ALLERGENS.map(({ tag, label }) => (
                <TouchableOpacity
                  key={tag}
                  style={styles.allergenRow}
                  onPress={() => toggleAllergen(tag)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: tempAllergens.includes(tag) }}
                >
                  <View style={[styles.checkbox, tempAllergens.includes(tag) && styles.checkboxChecked]}>
                    {tempAllergens.includes(tag) && <Check size={16} color={colors.textInverse} />}
                  </View>
                  <Text style={styles.allergenLabel}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveAllergens}
                accessibilityRole="button"
                accessibilityLabel="Save allergies"
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.textPrimary,
  },
  cardWrapper: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    left: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(25, 25, 25, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  emptyTitle: {
    fontSize: typography.xl,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.base,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  resetTonightButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentBlue,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  resetTonightButtonText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textInverse,
  },
  backToModeButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  backToModeText: {
    fontSize: typography.sm,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'rgba(245, 245, 245, 0.97)',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
    maxHeight: '70%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.lg,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
  },
  modalClose: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -spacing.sm,
  },
  allergenList: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  allergenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.accentBlue,
    borderColor: colors.accentBlue,
  },
  allergenLabel: {
    fontSize: typography.base,
    color: colors.textPrimary,
  },
  modalFooter: {
    padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveButton: {
    backgroundColor: colors.accentBlue,
    height: MIN_TOUCH_TARGET + 4,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: colors.textInverse,
  },
});
