/**
 * Tonight Screen — Hub (Phase 2.1)
 *
 * "Time to Eat" — mode selection with box-to-full transition.
 * No tabs. Profile accessible via top-right glass icon.
 * Vertical mode buttons, "Choose for Me" CTA at bottom.
 */

import React, { useState, useRef, useCallback } from 'react';
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
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { User, AlertCircle, X, Check } from 'lucide-react-native';
import { colors, spacing, radii, typography, shadows, MIN_TOUCH_TARGET } from '../lib/ui/theme';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  setSelectedMode,
  getSelectedMode,
  setExcludeAllergens,
  getExcludeAllergens,
  resetTonight,
} from '../lib/state/ffSession';
import type { Mode, AllergenTag } from '../lib/seeds/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ALL_MODES: Mode[] = ['fancy', 'easy', 'cheap'];

const EXPAND_DURATION = 350;
const NAV_DELAY = Math.round(EXPAND_DURATION * 0.83);
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
    <TouchableOpacity
      ref={(r) => onRef(r as unknown as View | null)}
      style={[styles.modeButton, selected && styles.modeButtonSelected]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${MODE_LABELS[mode]} mode`}
      accessibilityState={{ selected }}
    >
      <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>
        {MODE_LABELS[mode].toUpperCase()}
      </Text>
    </TouchableOpacity>
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
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cloneX = useSharedValue(0);
  const cloneY = useSharedValue(0);
  const cloneW = useSharedValue(0);
  const cloneH = useSharedValue(0);
  const cloneRadius = useSharedValue(radii.xl);
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
    zIndex: 1000,
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    opacity: scrimOpacity.value,
    zIndex: 999,
  }));

  // Unmount guard
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
      cloneOpacity.value = 0;
      scrimOpacity.value = 0;
      isTransitioning.current = false;
    };
  }, []);

  const cleanup = useCallback(() => {
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    navTimerRef.current = null;
    cleanupTimerRef.current = null;
    cloneOpacity.value = 0;
    scrimOpacity.value = 0;
    cloneX.value = 0;
    cloneY.value = 0;
    cloneW.value = 0;
    cloneH.value = 0;
    cloneRadius.value = radii.xl;
    if (mountedRef.current) setTransitionMode(null);
    isTransitioning.current = false;
  }, [cloneOpacity, scrimOpacity, cloneX, cloneY, cloneW, cloneH, cloneRadius]);

  const doNavigate = useCallback(() => {
    if (!mountedRef.current) return;
    router.push('/deal');
    cloneOpacity.value = withTiming(0, { duration: FADE_OUT_DURATION });
    scrimOpacity.value = withTiming(0, { duration: FADE_OUT_DURATION });
    cleanupTimerRef.current = setTimeout(() => {
      if (mountedRef.current) cleanup();
    }, FADE_OUT_DURATION + 50);
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
          if (mountedRef.current) setTransitionMode(mode);

          const timingConfig = {
            duration: EXPAND_DURATION,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          };

          cloneX.value = withTiming(0, timingConfig);
          cloneY.value = withTiming(0, timingConfig);
          cloneW.value = withTiming(SCREEN_WIDTH, timingConfig);
          cloneH.value = withTiming(SCREEN_HEIGHT, timingConfig);
          cloneRadius.value = withTiming(0, timingConfig);
          scrimOpacity.value = withTiming(1, { duration: EXPAND_DURATION * 0.6 });

          navTimerRef.current = setTimeout(doNavigate, NAV_DELAY);
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
    let modeToUse = selectedModeLocal;
    if (!modeToUse) {
      modeToUse = ALL_MODES[Math.floor(Math.random() * ALL_MODES.length)];
    }
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
      {/* Header: title + profile icon */}
      <View style={styles.header}>
        <Text style={styles.title}>Time to Eat</Text>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push('/profile')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Profile settings"
        >
          <User size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

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

      {/* CTA — extends to bottom safe area */}
      <View style={[styles.ctaSection, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <PrimaryButton
          label="CHOOSE FOR ME"
          onPress={handleChoose}
          tone="primary"
          labelStyle={styles.ctaLabel}
        />
      </View>

      {/* ── Transition Overlay ──────────────────────────────────── */}
      {transitionMode !== null && (
        <>
          <Animated.View style={scrimStyle} pointerEvents="none" />
          <Animated.View style={[cloneStyle, styles.cloneBase]} pointerEvents="none">
            <Text style={styles.cloneLabel}>
              {MODE_LABELS[transitionMode].toUpperCase()}
            </Text>
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
  title: {
    fontSize: typography['3xl'],
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.mutedLight,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Vertical mode buttons
  modeContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    justifyContent: 'center',
  },
  modeButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    minHeight: 92,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderWidth: 2,
    borderColor: colors.borderSubtle,
    ...shadows.sm,
  },
  modeButtonSelected: {
    backgroundColor: colors.accentBlue,
    borderColor: colors.accentBlue,
  },
  modeLabel: {
    fontSize: typography['4xl'],
    fontWeight: typography.bold,
    color: colors.textPrimary,
    letterSpacing: 1,
    textAlign: 'center',
  },
  modeLabelSelected: {
    color: colors.textInverse,
  },

  // CTA label override (matches hero editorial typography)
  ctaLabel: {
    fontSize: typography['2xl'],
    fontWeight: typography.bold,
    letterSpacing: 1,
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

  // CTA section
  ctaSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },

  // Transition clone
  cloneBase: {
    backgroundColor: colors.accentBlue,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cloneLabel: {
    fontSize: typography['4xl'],
    fontWeight: typography.bold,
    color: colors.textInverse,
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
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xxl : spacing.xl,
    maxHeight: '70%',
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
