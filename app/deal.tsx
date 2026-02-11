/**
 * Deal Screen — Full-Screen Editorial Card Experience
 *
 * Phase 1.3: Chrome-free, full-bleed card with glass overlay + idle affordance.
 *
 * - Shows one recipe at a time (edge-to-edge hero image)
 * - Swipe-to-pass gestures handled by DecisionCard
 * - Glass overlay (level 0/1/2) managed as controlled state here
 * - Idle affordance: subtle nudge + glass lift after ~7 s of inactivity
 * - DRM insertion after 3 passes OR 45 seconds
 * - Accept → navigate to /checklist or /rescue (no LockedTransition)
 * - Allergy modal still available
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { router } from 'expo-router';
import { ChevronLeft, RefreshCw, X, Check } from 'lucide-react-native';
import { colors, spacing, radii, typography, MIN_TOUCH_TARGET } from '../lib/ui/theme';
import {
  getSelectedMode,
  setSelectedMode,
  getExcludeAllergens,
  getConstraints,
  getDealHistory,
  setCurrentDealId,
  incrementPassCount,
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

const ALL_MODES: ('fancy' | 'easy' | 'cheap')[] = ['fancy', 'easy', 'cheap'];
import {
  pickNextRecipe,
  pickDrmMeal,
  getRandomWhy,
  hasConflictingAllergens,
} from '../lib/seeds';
import type { RecipeSeed, DrmSeed, AllergenTag } from '../lib/seeds/types';
import { DecisionCard, PassDirection } from '../components/DecisionCard';
import type { OverlayLevel } from '../components/GlassOverlay';
import { useIdleAffordance } from '../hooks/useIdleAffordance';
import { getImageSource } from '../lib/seeds/images';
import { setPendingHeroTransition } from '../lib/ui/heroTransition';
import { getHasSeenAffordance, setHasSeenAffordance } from '../lib/state/persist';
import { router, useLocalSearchParams } from 'expo-router';

import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';

import { consumePendingHeroTransition } from '../lib/ui/heroTransition';
import { oak, whisper } from '../lib/ui/motion';

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

export default function DealScreen() {
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

  // Session ID: increments on each mount cycle. Protects against
  // React 18 StrictMode double-init AND allows re-init when returning
  // from rescue via router.replace('/deal').
  const [sessionId, _setSessionId] = useState(0);
  const lastInitSession = useRef(-1);

  // Card generation key — increments on each new card to reset idle timer
  const [cardKey, setCardKey] = useState(0);

  // Get session state - ensure we have a mode
  const [mode] = useState(() => {
    const savedMode = getSelectedMode();
    if (savedMode) return savedMode;
    const randomMode = ALL_MODES[Math.floor(Math.random() * ALL_MODES.length)];
    setSelectedMode(randomMode);
    return randomMode;
  });
  const constraints = getConstraints();

  const isValidMode = mode === 'fancy' || mode === 'easy' || mode === 'cheap';

  // Safe area for back button positioning
  const insets = useSafeAreaInsets();

  // ---------------------------------------------------------------------------
  // Idle affordance — staged silent onboarding (first session only)
  // ---------------------------------------------------------------------------

  const [affordanceEligible, setAffordanceEligible] = useState(false);

  // Check persistence on mount
  useEffect(() => {
    let alive = true;
    getHasSeenAffordance().then(seen => {
      if (alive && !seen) setAffordanceEligible(true);
    });
    return () => { alive = false; };
  }, []);

  const { nudgeX, overlayLiftY, resetIdle } = useIdleAffordance({
    enabled: affordanceEligible && !isLoading && !noMoreRecipes && currentDeal !== null,
  });

  /** Mark affordance as seen + cancel. Called on any user interaction. */
  const markAffordanceSeen = useCallback(() => {
    if (affordanceEligible) {
      setAffordanceEligible(false);
      setHasSeenAffordance();
    }
    resetIdle();
  }, [affordanceEligible, resetIdle]);

  // Reset idle on new card (but don't mark seen — just cancel current timers)
  useEffect(() => {
    resetIdle();
  }, [cardKey]);

  // Reanimated animated style for the idle nudge wrapper
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

    const triggerDrm = !drmInserted && (
      passCount >= DRM_PASS_THRESHOLD || drmTimerTriggered
    );

    if (triggerDrm) {
      const drmMeal = pickDrmMeal(excludeAllergens, dealHistory);
      if (drmMeal) {
        // Show rescue hero card (no auto-navigate, no swiping)
        setCurrentDeal({ type: 'drm', data: drmMeal });
        setWhyText(getRandomWhy(drmMeal));
        setCurrentDealId(drmMeal.id);
        setDrmInserted(true);
        setOverlayLevel(0);
        setNoMoreRecipes(false);
        setIsLoading(false);
        setCardKey(k => k + 1);
        return;
      }
      setDrmInserted(true);
    }

    let recipe = pickNextRecipe(mode, excludeAllergens, dealHistory, constraints);

    if (!recipe && constraints.length > 0) {
      recipe = pickNextRecipe(mode, excludeAllergens, dealHistory, []);
    }

    if (!recipe && excludeAllergens.length > 0) {
      recipe = pickNextRecipe(mode, [], dealHistory, []);
    }

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
    setCardKey(k => k + 1);
  }, [mode, constraints, drmTimerTriggered]);

  // Initialize deal session.
  // Uses sessionId to allow re-init when returning from rescue.
  // lastInitSession ref prevents double-init within the same session
  // (React 18 StrictMode double-mount protection).
  useEffect(() => {
    if (lastInitSession.current === sessionId) return;
    lastInitSession.current = sessionId;

    markDealStart();

    drmTimerRef.current = setTimeout(() => {
      setDrmTimerTriggered(true);
    }, DRM_TIME_THRESHOLD_MS);

    dealNextCard();

    return () => {
      if (drmTimerRef.current) clearTimeout(drmTimerRef.current);
    };
  }, [sessionId, dealNextCard]);

  // Sync local allergen display
  useEffect(() => {
    setLocalExcludeAllergens(getExcludeAllergens());
  }, [showAllergyModal]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /** Swipe to pass — mark affordance seen, increment, deal next */
  const handlePass = useCallback((_direction: PassDirection) => {
    markAffordanceSeen();
    if (currentDeal) addToDealHistory(currentDeal.data.id);
    incrementPassCount();
    setTimeout(() => dealNextCard(), 50);
  }, [currentDeal, dealNextCard, markAffordanceSeen]);

  /** Accept — mark seen, set up reverse-box transition, then navigate */
  const { width: dealScreenW, height: dealScreenH } = useWindowDimensions();

  const handleAccept = useCallback(() => {
    if (!currentDeal) return;
    markAffordanceSeen();

    // Both recipe and rescue accept → standard checklist
    const destKey = `checklist:${currentDeal.data.id}`;

    setPendingHeroTransition({
      sourceRect: { x: 0, y: 0, width: dealScreenW, height: dealScreenH },
      imageSource: getImageSource(currentDeal.data.imageKey),
      destKey,
    });

    router.push({
      pathname: '/checklist/[recipeId]',
      params: { recipeId: currentDeal.data.id },
    });
  }, [currentDeal, markAffordanceSeen, dealScreenW, dealScreenH]);

    const { resume } = useLocalSearchParams<{ resume?: string }>();
    const resumeId = typeof resume === 'string' ? resume : undefined;

    // Checklist -> Deal expand clone
    const pendingEnterRef = useRef<PendingHeroTransition | null>(null);
    const [showEnterClone, setShowEnterClone] = useState(false);

    const enterX = useSharedValue(0);
    const enterY = useSharedValue(0);
    const enterW = useSharedValue(0);
    const enterH = useSharedValue(0);
    const enterOpacity = useSharedValue(0);
    const contentOpacity = useSharedValue(1);

    useEffect(() => {
      if (!resumeId) return;

      const p = consumePendingHeroTransition(`deal:${resumeId}`);
      if (!p) return;

      pendingEnterRef.current = p;

      // init clone at checklist hero rect
      enterX.value = p.sourceRect.x;
      enterY.value = p.sourceRect.y;
      enterW.value = p.sourceRect.width;
      enterH.value = p.sourceRect.height;
      enterOpacity.value = 1;

      // hide real content until clone expands
      contentOpacity.value = 0;
      setShowEnterClone(true);

      // animate to full screen
      enterX.value = withSpring(0, oak);
      enterY.value = withSpring(0, oak);
      enterW.value = withSpring(dealScreenW, oak);
      enterH.value = withSpring(dealScreenH, oak);

      const t = setTimeout(() => {
        contentOpacity.value = withTiming(1, whisper);
        enterOpacity.value = withTiming(0, { ...whisper, duration: 120 }, (finished) => {
          if (finished) {
            runOnJS(setShowEnterClone)(false);
            pendingEnterRef.current = null;
          }
        });
      }, 450);

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
    }, [resumeId, dealScreenW, dealScreenH]);

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

  /** Overlay level change from glass handle drag */
  const handleOverlayLevelChange = useCallback((level: OverlayLevel) => {
    markAffordanceSeen();
    setOverlayLevel(level);
  }, [markAffordanceSeen]);

  /** Legacy toggle for backward compat */
  const handleToggleExpand = useCallback(() => {
    markAffordanceSeen();
    setOverlayLevel(prev => (prev === 0 ? 1 : 0));
  }, [markAffordanceSeen]);

  /** Reset and start over */
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

  const _openAllergyModal = useCallback(() => {
    setTempAllergens(getExcludeAllergens());
    setShowAllergyModal(true);
  }, []);

  const toggleAllergen = (tag: AllergenTag) => {
    setTempAllergens(prev =>
      prev.includes(tag) ? prev.filter(a => a !== tag) : [...prev, tag],
    );
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
            setCardKey(k => k + 1);
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
            setCardKey(k => k + 1);
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
          <Text style={styles.emptyTitle}>
            That's all for {isValidMode ? mode : 'tonight'}
          </Text>
          <Text style={styles.emptySubtitle}>
            You've seen {seenCount} options
          </Text>

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
  // Render: Main deal screen — full-bleed card
  // ---------------------------------------------------------------------------

  const modeLabel = isValidMode ? mode : undefined;

  return (
    <View style={styles.container}>
      {/* Idle-nudge wrapper (Reanimated) around the card */}
      <Animated.View style={[styles.cardWrapper, contentFadeStyle, idleNudgeStyle]}>
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

      {showEnterClone && pendingEnterRef.current && (
        <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Animated.View style={enterCloneStyle}>
            <Animated.Image
              source={pendingEnterRef.current.imageSource}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          </Animated.View>
        </Animated.View>
      )}

      {/* ── Back button (glass, top-left, only at level 0) ────────── */}
      {overlayLevel === 0 && (
        <TouchableOpacity
          style={[
            styles.backButton,
            { top: insets.top + spacing.sm },
          ]}
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
      <Modal
        visible={showAllergyModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAllergyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>I'm allergic to...</Text>
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
                  <View
                    style={[
                      styles.checkbox,
                      tempAllergens.includes(tag) && styles.checkboxChecked,
                    ]}
                  >
                    {tempAllergens.includes(tag) && (
                      <Check size={16} color={colors.textInverse} />
                    )}
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
    backgroundColor: colors.textPrimary, // Dark bg matches card fallback
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
  // Modal styles (kept for allergy management)
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
