/**
 * Tonight Screen — Hub (Phase 2.1)
 *
 * "Time to Eat" — mode selection with box-to-full transition.
 * No tabs. Profile accessible via top-right glass icon.
 * Vertical mode buttons, "Choose for Me" CTA at bottom.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  interpolate,
  Extrapolation,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Utensils, User, AlertCircle, X, Check, Frown, Meh, Smile } from 'lucide-react-native';
import { colors, spacing, radii, typography, MIN_TOUCH_TARGET } from '../lib/ui/theme';
import { whisper } from '../lib/ui/motion';
import {
  setSelectedMode,
  getSelectedMode,
  setExcludeAllergens,
  getExcludeAllergens,
  resetTonight,
} from '../lib/state/ffSession';
import type { Mode, AllergenTag } from '../lib/seeds/types';
import {
  checkFeedbackEligibility,
  logFeedback,
  clearLastCompleted,
  type FeedbackRating,
} from '../lib/state/feedbackLog';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ALL_MODES: Mode[] = ['fancy', 'easy', 'cheap'];

const EXPAND_DURATION = 350;
const FADE_OUT_DURATION = 150;

const ALL_ALLERGENS: { tag: AllergenTag; label: string }[] = [
  { tag: 'dairy', label: 'Dairy' },
  { tag: 'nuts', label: 'Nuts' },
  { tag: 'gluten', label: 'Gluten' },
  { tag: 'eggs', label: 'Eggs' },
  { tag: 'soy', label: 'Soy' },
  { tag: 'shellfish', label: 'Shellfish' },
];

const MODE_LABELS: Record<Mode, string> = {
  fancy: 'Fancy',
  easy: 'Easy',
  cheap: 'Cheap',
};

// ---------------------------------------------------------------------------
// Vertical ModeButton
// ---------------------------------------------------------------------------

interface ModeButtonProps {
  mode: Mode;
  selected: boolean;
  onPress: () => void;
  onRef: (ref: View | null) => void;
}

function ModeButton({ mode, selected, onPress, onRef }: ModeButtonProps) {
  return (
    // Outer shadow layer (larger, softer)
    <View style={styles.modeButtonOuter}>
      {/* Inner shadow layer (tighter) */}
      <TouchableOpacity
        ref={(r) => onRef(r as unknown as View | null)}
        style={[styles.modeButton, selected && styles.modeButtonSelected]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${MODE_LABELS[mode]} mode`}
        accessibilityState={{ selected }}
      >
        {/* Top inner highlight bevel */}
        <View style={styles.modeHighlight} />
        <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>
          {MODE_LABELS[mode].toUpperCase()}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tonight Screen
// ---------------------------------------------------------------------------

export default function TonightScreen() {
  const insets = useSafeAreaInsets();
  const [selectedModeLocal, setSelectedModeLocal] = useState<Mode | null>(getSelectedMode());
  const [excludeAllergens, setExcludeAllergensLocal] = useState<AllergenTag[]>(getExcludeAllergens());
  const [showAllergyModal, setShowAllergyModal] = useState(false);
  const [tempAllergens, setTempAllergens] = useState<AllergenTag[]>([]);

  // -----------------------------------------------------------------------
  // Feedback prompt (delayed, 4h+ after meal completion)
  // -----------------------------------------------------------------------

  const [feedbackMealId, setFeedbackMealId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    checkFeedbackEligibility().then(mealId => {
      if (alive && mealId) setFeedbackMealId(mealId);
    });
    return () => { alive = false; };
  }, []);

  const handleFeedback = useCallback((rating: FeedbackRating) => {
    if (!feedbackMealId) return;
    logFeedback(feedbackMealId, rating);
    setFeedbackMealId(null);
  }, [feedbackMealId]);

  const dismissFeedback = useCallback(() => {
    // Don't log — just hide for this session. Will reappear on next visit
    // if still eligible (4h rule). Clear if user explicitly dismisses.
    clearLastCompleted();
    setFeedbackMealId(null);
  }, []);

  // -----------------------------------------------------------------------
  // Tile refs for measurement
  // -----------------------------------------------------------------------

  const tileRefs = useRef<Record<Mode, View | null>>({
    fancy: null,
    easy: null,
    cheap: null,
  });

  const setTileRef = useCallback((mode: Mode, ref: View | null) => {
    tileRefs.current[mode] = ref;
  }, []);

  // -----------------------------------------------------------------------
  // Transition overlay
  // -----------------------------------------------------------------------

  const [transitionMode, setTransitionMode] = useState<Mode | null>(null);
  const isTransitioning = useRef(false);
  const mountedRef = useRef(true);
  const hasNavigated = useRef(false);

  const cloneX = useSharedValue(0);
  const cloneY = useSharedValue(0);
  const cloneW = useSharedValue(0);
  const cloneH = useSharedValue(0);
  const cloneRadius = useSharedValue<number>(radii.xl);
  const cloneOpacity = useSharedValue(0);
  const scrimOpacity = useSharedValue(0);

  const cloneStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: cloneX.value,
    top: cloneY.value,
    width: cloneW.value,
    height: cloneH.value,
    borderRadius: cloneRadius.value,
    opacity: cloneOpacity.value,
    // Z-axis: clone lifts slightly toward camera during expand
    transform: [{ scale: interpolate(scrimOpacity.value, [0, 1], [1, 1.03], Extrapolation.CLAMP) }],
    zIndex: 1000,
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    opacity: scrimOpacity.value,
    zIndex: 999,
  }));

  // Z-axis: background sinks slightly during clone expansion
  const bgDepthStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(scrimOpacity.value, [0, 1], [1, 0.985], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(scrimOpacity.value, [0, 1], [1, 0.93], Extrapolation.CLAMP),
  }));

  // Unmount guard
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Cancel any in-flight animations (prevents ghost clone on return)
      cancelAnimation(cloneX);
      cancelAnimation(cloneY);
      cancelAnimation(cloneW);
      cancelAnimation(cloneH);
      cancelAnimation(cloneRadius);
      cancelAnimation(cloneOpacity);
      cancelAnimation(scrimOpacity);
      cloneOpacity.value = 0;
      scrimOpacity.value = 0;
      isTransitioning.current = false;
      hasNavigated.current = false;
    };
  }, []);

  /** Reset all shared values and unlock taps. Safe to call multiple times. */
  const cleanup = useCallback(() => {
    cancelAnimation(cloneX);
    cancelAnimation(cloneY);
    cancelAnimation(cloneW);
    cancelAnimation(cloneH);
    cancelAnimation(cloneRadius);
    cancelAnimation(cloneOpacity);
    cancelAnimation(scrimOpacity);
    cloneOpacity.value = 0;
    scrimOpacity.value = 0;
    cloneX.value = 0;
    cloneY.value = 0;
    cloneW.value = 0;
    cloneH.value = 0;
    cloneRadius.value = radii.xl;
    if (mountedRef.current) setTransitionMode(null);
    isTransitioning.current = false;
    hasNavigated.current = false;
  }, [cloneOpacity, scrimOpacity, cloneX, cloneY, cloneW, cloneH, cloneRadius]);

  /** Navigate to /deal then fade clone out. Called from animation callback. */
  const doNavigate = useCallback(() => {
    if (!mountedRef.current || hasNavigated.current) return;
    hasNavigated.current = true;

    router.push('/deal');

    // Fade clone + scrim out; cleanup via completion callback (no setTimeout)
    cloneOpacity.value = withTiming(0, { ...whisper, duration: FADE_OUT_DURATION }, (finished) => {
      if (finished) {
        runOnJS(cleanup)();
      }
    });
    scrimOpacity.value = withTiming(0, { ...whisper, duration: FADE_OUT_DURATION });
  }, [cloneOpacity, scrimOpacity, cleanup]);

  const measureAndTransition = useCallback(
    (mode: Mode) => {
      const tileView = tileRefs.current[mode];
      if (!tileView) {
        router.push('/deal');
        isTransitioning.current = false;
        return;
      }

      (tileView as any).measureInWindow(
        (x: number, y: number, width: number, height: number) => {
          if (!mountedRef.current) return;
          if (!width || !height || width <= 0 || height <= 0) {
            router.push('/deal');
            isTransitioning.current = false;
            return;
          }

          cloneX.value = x;
          cloneY.value = y;
          cloneW.value = width;
          cloneH.value = height;
          cloneRadius.value = radii.xl;
          cloneOpacity.value = 1;
          hasNavigated.current = false;
          if (mountedRef.current) setTransitionMode(mode);

          // Exception: uses timing (not Oak spring) because the callback-based
          // nav timing requires deterministic duration. Interruptible via
          // cancelAnimation + finished===false callback.
          const timingConfig = {
            duration: EXPAND_DURATION,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          };

          cloneX.value = withTiming(0, timingConfig);
          cloneY.value = withTiming(0, timingConfig);
          // cloneW drives the primary callback: navigate on finish, cleanup on cancel
          cloneW.value = withTiming(SCREEN_WIDTH, timingConfig, (finished) => {
            if (finished) {
              runOnJS(doNavigate)();
            } else {
              // Animation was cancelled (e.g. unmount, back gesture)
              runOnJS(cleanup)();
            }
          });
          cloneH.value = withTiming(SCREEN_HEIGHT, timingConfig);
          cloneRadius.value = withTiming(0, timingConfig);
          scrimOpacity.value = withTiming(1, { ...whisper, duration: Math.round(EXPAND_DURATION * 0.6) });
        },
      );
    },
    [cloneX, cloneY, cloneW, cloneH, cloneRadius, cloneOpacity, scrimOpacity, doNavigate],
  );

  // -----------------------------------------------------------------------
  // Mode select
  // -----------------------------------------------------------------------

  const handleModeSelect = useCallback(
    (mode: Mode) => {
      if (isTransitioning.current) return;
      isTransitioning.current = true;
      setSelectedModeLocal(mode);
      setSelectedMode(mode);
      resetTonight();
      measureAndTransition(mode);
    },
    [measureAndTransition],
  );

  const handleChoose = useCallback(() => {
    if (isTransitioning.current) return;
    // Always uniform random — never reuse prior selection
    const modeToUse = ALL_MODES[Math.floor(Math.random() * ALL_MODES.length)];
    setSelectedModeLocal(modeToUse);
    setSelectedMode(modeToUse);
    resetTonight();
    isTransitioning.current = true;
    measureAndTransition(modeToUse);
  }, [selectedModeLocal, measureAndTransition]);

  // -----------------------------------------------------------------------
  // Allergy modal
  // -----------------------------------------------------------------------

  const openAllergyModal = () => {
    setTempAllergens([...excludeAllergens]);
    setShowAllergyModal(true);
  };

  const toggleAllergen = (tag: AllergenTag) => {
    setTempAllergens((prev) =>
      prev.includes(tag) ? prev.filter((a) => a !== tag) : [...prev, tag],
    );
  };

  const saveAllergens = () => {
    setExcludeAllergensLocal(tempAllergens);
    setExcludeAllergens(tempAllergens);
    setShowAllergyModal(false);
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      {/* Background depth wrapper — sinks during clone expansion */}
      <Animated.View style={[styles.bgDepthWrapper, bgDepthStyle]}>
      {/* Header: icon — FAST FOOD — profile */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Utensils size={18} color={colors.textPrimary} />
        </View>
        <Text style={styles.title}>FAST FOOD</Text>
        <TouchableOpacity
          style={styles.headerIcon}
          onPress={() => router.push('/profile')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Profile settings"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <User size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Feedback prompt (non-blocking, dismissible) */}
      {feedbackMealId && (
        <View style={styles.feedbackCard}>
          <View style={styles.feedbackHeader}>
            <Text style={styles.feedbackTitle}>Did you enjoy?</Text>
            <TouchableOpacity
              onPress={dismissFeedback}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Dismiss"
            >
              <X size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.feedbackOptions}>
            <TouchableOpacity
              style={styles.feedbackOption}
              onPress={() => handleFeedback(-1)}
              accessibilityLabel="Not great"
            >
              <Frown size={28} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.feedbackOption}
              onPress={() => handleFeedback(0)}
              accessibilityLabel="It was fine"
            >
              <Meh size={28} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.feedbackOption}
              onPress={() => handleFeedback(1)}
              accessibilityLabel="Loved it"
            >
              <Smile size={28} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Mode buttons — vertical stack */}
      <View style={styles.modeContainer}>
        {ALL_MODES.map((mode) => (
          <ModeButton
            key={mode}
            mode={mode}
            selected={selectedModeLocal === mode}
            onPress={() => handleModeSelect(mode)}
            onRef={(r) => setTileRef(mode, r)}
          />
        ))}
      </View>

      {/* Allergy link */}
      <TouchableOpacity
        style={styles.allergyButton}
        onPress={openAllergyModal}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="I'm allergic"
      >
        <AlertCircle size={16} color={colors.textMuted} />
        <Text style={styles.allergyButtonText}>
          {excludeAllergens.length > 0
            ? `Avoiding ${excludeAllergens.length} allergen${excludeAllergens.length > 1 ? 's' : ''}`
            : "I'm allergic"}
        </Text>
      </TouchableOpacity>

      {/* CTA — extends to bottom safe area with scrim */}
      <LinearGradient
        colors={['transparent', colors.background]}
        locations={[0, 0.45]}
        style={styles.ctaScrim}
        pointerEvents="none"
      />
      <View style={[styles.ctaSection, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.ctaOuter}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleChoose}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Choose for me"
          >
            <View style={styles.modeHighlight} />
            <Text style={styles.ctaLabel}>CHOOSE FOR ME</Text>
          </TouchableOpacity>
        </View>
      </View>

      </Animated.View>
      {/* ── Transition Overlay ──────────────────────────────────── */}
      {transitionMode !== null && (
        <>
          <Animated.View style={scrimStyle} pointerEvents="none" />
          <Animated.View style={[cloneStyle, styles.cloneBase]} pointerEvents="none">
            <View style={styles.cloneInner}>
              <Text style={styles.cloneLabel}>
                {MODE_LABELS[transitionMode].toUpperCase()}
              </Text>
            </View>
          </Animated.View>
        </>
      )}

      {/* Allergy Modal */}
      <Modal
        visible={showAllergyModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAllergyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Allergies</Text>
              <TouchableOpacity
                onPress={() => setShowAllergyModal(false)}
                style={styles.modalCloseButton}
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
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowAllergyModal(false)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={saveAllergens}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Save"
              >
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? spacing.md : spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: typography['2xl'],
    fontWeight: typography.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 1.5,
  },
  bgDepthWrapper: {
    flex: 1,
  },

  // Vertical mode buttons — layered shadow system
  modeContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    justifyContent: 'center',
  },
  // Outer shadow layer (larger, softer)
  modeButtonOuter: {
    borderRadius: radii.xl,
    // Outer shadow: large, soft
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  // Inner card with tighter shadow + border
  modeButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    minHeight: 92,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderWidth: 2,
    borderColor: colors.accentBlue,
    overflow: 'hidden',
    // Inner shadow: tight, slightly darker
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  modeButtonSelected: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderColor: colors.accentBlue,
  },
  // Top inner highlight bevel (1px white line at top)
  modeHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  modeLabel: {
    fontSize: typography['4xl'],
    fontWeight: typography.bold,
    color: colors.accentBlue,
    letterSpacing: 1,
    textAlign: 'center',
  },
  modeLabelSelected: {
    color: colors.accentBlueDark,
  },

  // Feedback prompt
  feedbackCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  feedbackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  feedbackTitle: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
  },
  feedbackOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.xs,
  },
  feedbackOption: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Allergy link
  allergyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  allergyButtonText: {
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: colors.textMuted,
  },

  // CTA section with bottom scrim
  ctaScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
    zIndex: 0,
  },
  ctaSection: {
    paddingHorizontal: spacing.md, // 16px (narrower than mode container's 24px)
    paddingTop: spacing.sm,
    zIndex: 1,
  },
  // CTA — same shadow system as mode buttons
  ctaOuter: {
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  ctaButton: {
    height: MIN_TOUCH_TARGET + 8,
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accentBlue,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  ctaLabel: {
    fontSize: typography['2xl'],
    fontWeight: typography.bold,
    color: colors.accentBlue,
    letterSpacing: 1,
    textAlign: 'center',
  },

  // Transition clone — matches white card + blue text
  cloneBase: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accentBlue,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cloneInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cloneLabel: {
    fontSize: typography['4xl'],
    fontWeight: typography.bold,
    color: colors.accentBlue,
    letterSpacing: 1,
    textAlign: 'center',
  },

  // Modal
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
    paddingBottom: Platform.OS === 'ios' ? spacing.xxl : spacing.xl,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: typography.xl,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  modalCloseButton: {
    padding: spacing.xs,
  },
  allergenList: {
    paddingHorizontal: spacing.lg,
  },
  allergenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: colors.accentBlue,
    borderColor: colors.accentBlue,
  },
  allergenLabel: {
    fontSize: typography.base,
    color: colors.textPrimary,
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  modalCancelButton: {
    flex: 1,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.mutedLight,
  },
  modalCancelText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
  },
  modalSaveButton: {
    flex: 1,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.accentBlue,
  },
  modalSaveText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textInverse,
  },
});
