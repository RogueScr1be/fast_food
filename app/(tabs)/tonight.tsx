/**
 * Tonight Screen — Mode Selection with Box-to-Full Transition
 *
 * Phase 1.4: Tapping a mode tile triggers a measured-clone overlay that
 * expands from the tile's exact position to full screen, then navigates
 * to /deal behind the overlay. The clone fades out once /deal is mounted.
 *
 * Transition timeline (total ~400ms):
 *   0ms   — Measure tile, lock input, render clone at tile rect
 *   0–350ms — Animate clone to full screen (x→0, y→0, w→screenW, h→screenH,
 *             borderRadius → 0) + fade in dark scrim behind
 *   ~290ms — Navigate to /deal (at ~80% of expansion)
 *   350–500ms — Fade clone out, unlock input, cleanup
 *
 * Fallback: if measurement fails, navigate immediately with no animation.
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { Sparkles, Utensils, Coins, AlertCircle, X, Check } from 'lucide-react-native';
import { colors, spacing, radii, typography, shadows, MIN_TOUCH_TARGET } from '../../lib/ui/theme';
import { ThinProgressBar } from '../../components/ThinProgressBar';
import { PrimaryButton } from '../../components/PrimaryButton';
import {
  setSelectedMode,
  getSelectedMode,
  setExcludeAllergens,
  getExcludeAllergens,
  resetTonight,
} from '../../lib/state/ffSession';
import type { Mode, AllergenTag } from '../../lib/seeds/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ALL_MODES: Mode[] = ['fancy', 'easy', 'cheap'];

const EXPAND_DURATION = 350; // ms — clone expansion
const NAV_DELAY = Math.round(EXPAND_DURATION * 0.83); // ~290ms — navigate at ~83%
const FADE_OUT_DURATION = 150; // ms — clone fade after nav

const ALL_ALLERGENS: { tag: AllergenTag; label: string }[] = [
  { tag: 'dairy', label: 'Dairy' },
  { tag: 'nuts', label: 'Nuts' },
  { tag: 'gluten', label: 'Gluten' },
  { tag: 'eggs', label: 'Eggs' },
  { tag: 'soy', label: 'Soy' },
  { tag: 'shellfish', label: 'Shellfish' },
];

/** Tile visual config per mode (matches ModeButton styles) */
const MODE_CONFIG: Record<Mode, { label: string; iconColor: string }> = {
  fancy: { label: 'Fancy', iconColor: colors.accentBlue },
  easy: { label: 'Easy', iconColor: colors.accentBlue },
  cheap: { label: 'Cheap', iconColor: colors.accentBlue },
};

// ---------------------------------------------------------------------------
// Tile rect type
// ---------------------------------------------------------------------------

interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// ModeButton — with ref for measurement
// ---------------------------------------------------------------------------

interface ModeButtonProps {
  mode: Mode;
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onPress: () => void;
  onRef: (ref: View | null) => void;
}

function ModeButton({ mode, label, icon, selected, onPress, onRef }: ModeButtonProps) {
  return (
    <TouchableOpacity
      ref={(r) => onRef(r as unknown as View | null)}
      style={[styles.modeButton, selected && styles.modeButtonSelected]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label} mode`}
      accessibilityState={{ selected }}
    >
      <View style={[styles.modeIcon, selected && styles.modeIconSelected]}>
        {icon}
      </View>
      <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// AllergenCheckbox (unchanged)
// ---------------------------------------------------------------------------

function AllergenCheckbox({
  label,
  checked,
  onToggle,
}: {
  tag: AllergenTag;
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.allergenRow}
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Check size={16} color={colors.textInverse} />}
      </View>
      <Text style={styles.allergenLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Tonight Screen
// ---------------------------------------------------------------------------

export default function TonightScreen() {
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
  // Transition overlay state
  // -----------------------------------------------------------------------

  const [transitionMode, setTransitionMode] = useState<Mode | null>(null);
  const isTransitioning = useRef(false);
  const mountedRef = useRef(true);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reanimated shared values for the clone
  const cloneX = useSharedValue(0);
  const cloneY = useSharedValue(0);
  const cloneW = useSharedValue(0);
  const cloneH = useSharedValue(0);
  const cloneRadius = useSharedValue(radii.xl);
  const cloneOpacity = useSharedValue(0);
  const scrimOpacity = useSharedValue(0);

  // Animated styles
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

  // -----------------------------------------------------------------------
  // Unmount guard — cancel everything, prevent setState after unmount
  // -----------------------------------------------------------------------

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
      navTimerRef.current = null;
      cleanupTimerRef.current = null;
      // Reset shared values so returning to Tonight never shows ghost clone
      cloneOpacity.value = 0;
      scrimOpacity.value = 0;
      isTransitioning.current = false;
    };
  }, []);

  // -----------------------------------------------------------------------
  // Cleanup helper — ensures no ghost overlay
  // -----------------------------------------------------------------------

  const cleanup = useCallback(() => {
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    navTimerRef.current = null;
    cleanupTimerRef.current = null;

    // Reset all shared values (cancels any in-flight Reanimated animations)
    cloneOpacity.value = 0;
    scrimOpacity.value = 0;
    cloneX.value = 0;
    cloneY.value = 0;
    cloneW.value = 0;
    cloneH.value = 0;
    cloneRadius.value = radii.xl;

    if (mountedRef.current) {
      setTransitionMode(null);
    }
    isTransitioning.current = false;
  }, [cloneOpacity, scrimOpacity, cloneX, cloneY, cloneW, cloneH, cloneRadius]);

  // -----------------------------------------------------------------------
  // Navigate (called from animation timeline)
  // -----------------------------------------------------------------------

  const doNavigate = useCallback(() => {
    if (!mountedRef.current) return;

    router.push('/deal');

    // Fade clone out after navigation push
    cloneOpacity.value = withTiming(0, { duration: FADE_OUT_DURATION });
    scrimOpacity.value = withTiming(0, { duration: FADE_OUT_DURATION });

    // Final cleanup after fade
    cleanupTimerRef.current = setTimeout(() => {
      if (mountedRef.current) cleanup();
    }, FADE_OUT_DURATION + 50);
  }, [cloneOpacity, scrimOpacity, cleanup]);

  // -----------------------------------------------------------------------
  // Measure tile and start transition
  // -----------------------------------------------------------------------

  const measureAndTransition = useCallback(
    (mode: Mode) => {
      const tileView = tileRefs.current[mode];
      if (!tileView) {
        // Fallback: no measurement, navigate directly
        router.push('/deal');
        isTransitioning.current = false;
        return;
      }

      // measureInWindow gives absolute screen coordinates
      (tileView as any).measureInWindow(
        (x: number, y: number, width: number, height: number) => {
          if (!mountedRef.current) return;

          if (!width || !height || width <= 0 || height <= 0) {
            // Invalid measurement — fallback
            router.push('/deal');
            isTransitioning.current = false;
            return;
          }

          // Set clone to tile position (no animation, instant)
          cloneX.value = x;
          cloneY.value = y;
          cloneW.value = width;
          cloneH.value = height;
          cloneRadius.value = radii.xl;
          cloneOpacity.value = 1;

          // Show clone + scrim
          if (mountedRef.current) setTransitionMode(mode);

          // Timing config
          const timingConfig = {
            duration: EXPAND_DURATION,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          };

          // Animate to full screen
          cloneX.value = withTiming(0, timingConfig);
          cloneY.value = withTiming(0, timingConfig);
          cloneW.value = withTiming(SCREEN_WIDTH, timingConfig);
          cloneH.value = withTiming(SCREEN_HEIGHT, timingConfig);
          cloneRadius.value = withTiming(0, timingConfig);
          scrimOpacity.value = withTiming(1, {
            duration: EXPAND_DURATION * 0.6,
          });

          // Navigate at ~83% of expansion
          navTimerRef.current = setTimeout(doNavigate, NAV_DELAY);
        },
      );
    },
    [
      cloneX, cloneY, cloneW, cloneH, cloneRadius, cloneOpacity,
      scrimOpacity, doNavigate,
    ],
  );

  // -----------------------------------------------------------------------
  // Handle mode select — the main entry point
  // -----------------------------------------------------------------------

  const handleModeSelect = useCallback(
    (mode: Mode) => {
      // Tap lock: ignore if already transitioning
      if (isTransitioning.current) return;
      isTransitioning.current = true;

      // Set mode + reset deal state (as before)
      setSelectedModeLocal(mode);
      setSelectedMode(mode);
      resetTonight();

      // Start box-to-full transition
      measureAndTransition(mode);
    },
    [measureAndTransition],
  );

  // -----------------------------------------------------------------------
  // "Decide for Me" — random mode, same transition
  // -----------------------------------------------------------------------

  const handleDecide = useCallback(() => {
    if (isTransitioning.current) return;

    let modeToUse = selectedModeLocal;
    if (!modeToUse) {
      const idx = Math.floor(Math.random() * ALL_MODES.length);
      modeToUse = ALL_MODES[idx];
    }
    setSelectedModeLocal(modeToUse);
    setSelectedMode(modeToUse);
    resetTonight();

    isTransitioning.current = true;
    measureAndTransition(modeToUse);
  }, [selectedModeLocal, measureAndTransition]);

  // -----------------------------------------------------------------------
  // Allergy modal handlers (unchanged)
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

  const cancelAllergyModal = () => {
    setShowAllergyModal(false);
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Tonight</Text>
        <Text style={styles.subtitle}>What kind of dinner?</Text>
      </View>

      {/* Mode Selection */}
      <View style={styles.modeContainer}>
        <ModeButton
          mode="fancy"
          label="Fancy"
          icon={
            <Sparkles
              size={32}
              color={
                selectedModeLocal === 'fancy'
                  ? colors.textInverse
                  : colors.accentBlue
              }
            />
          }
          selected={selectedModeLocal === 'fancy'}
          onPress={() => handleModeSelect('fancy')}
          onRef={(r) => setTileRef('fancy', r)}
        />
        <ModeButton
          mode="easy"
          label="Easy"
          icon={
            <Utensils
              size={32}
              color={
                selectedModeLocal === 'easy'
                  ? colors.textInverse
                  : colors.accentBlue
              }
            />
          }
          selected={selectedModeLocal === 'easy'}
          onPress={() => handleModeSelect('easy')}
          onRef={(r) => setTileRef('easy', r)}
        />
        <ModeButton
          mode="cheap"
          label="Cheap"
          icon={
            <Coins
              size={32}
              color={
                selectedModeLocal === 'cheap'
                  ? colors.textInverse
                  : colors.accentBlue
              }
            />
          }
          selected={selectedModeLocal === 'cheap'}
          onPress={() => handleModeSelect('cheap')}
          onRef={(r) => setTileRef('cheap', r)}
        />
      </View>

      {/* Allergy Button */}
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

      {/* CTA Section */}
      <View style={styles.ctaSection}>
        <View style={styles.progressWrapper}>
          <ThinProgressBar
            value={selectedModeLocal ? 1 : 0}
            accessibilityLabel="Ready to decide"
          />
        </View>
        <PrimaryButton
          label="Decide for Me"
          onPress={handleDecide}
          tone="primary"
        />
        <Text style={styles.hintText}>
          {selectedModeLocal
            ? `Ready for ${selectedModeLocal}`
            : 'Tap a mode or let us pick'}
        </Text>
      </View>

      {/* ── Transition Overlay ──────────────────────────────────────── */}
      {transitionMode !== null && (
        <>
          {/* Dark scrim behind clone (hides tab bar artifacts) */}
          <Animated.View style={scrimStyle} pointerEvents="none" />

          {/* Clone tile expanding to full screen */}
          <Animated.View style={[cloneStyle, styles.cloneBase]} pointerEvents="none">
            {/* Render only the selected mode icon — no wasted renders */}
            {transitionMode === 'fancy' && (
              <Sparkles size={32} color={colors.textInverse} />
            )}
            {transitionMode === 'easy' && (
              <Utensils size={32} color={colors.textInverse} />
            )}
            {transitionMode === 'cheap' && (
              <Coins size={32} color={colors.textInverse} />
            )}
            <Text style={styles.cloneLabel}>
              {MODE_CONFIG[transitionMode].label}
            </Text>
          </Animated.View>
        </>
      )}

      {/* Allergy Modal */}
      <Modal
        visible={showAllergyModal}
        animationType="slide"
        transparent
        onRequestClose={cancelAllergyModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Allergies</Text>
              <TouchableOpacity
                onPress={cancelAllergyModal}
                style={styles.modalCloseButton}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.allergenList}>
              {ALL_ALLERGENS.map(({ tag, label }) => (
                <AllergenCheckbox
                  key={tag}
                  tag={tag}
                  label={label}
                  checked={tempAllergens.includes(tag)}
                  onToggle={() => toggleAllergen(tag)}
                />
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={cancelAllergyModal}
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
    paddingTop: Platform.OS === 'ios' ? spacing.lg : spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: typography['3xl'],
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.base,
    fontWeight: typography.regular,
    color: colors.textSecondary,
  },
  modeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    flex: 1,
    alignItems: 'flex-start',
    paddingTop: spacing.lg,
  },
  modeButton: {
    flex: 1,
    maxWidth: 110,
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.borderSubtle,
    ...shadows.md,
  },
  modeButtonSelected: {
    backgroundColor: colors.accentBlue,
    borderColor: colors.accentBlue,
  },
  modeIcon: {
    marginBottom: spacing.sm,
  },
  modeIconSelected: {},
  modeLabel: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
  },
  modeLabelSelected: {
    color: colors.textInverse,
  },
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
  ctaSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.xl,
    paddingTop: spacing.md,
  },
  progressWrapper: {
    marginBottom: spacing.md,
  },
  hintText: {
    fontSize: typography.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // -- Transition clone --
  cloneBase: {
    backgroundColor: colors.accentBlue,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cloneLabel: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textInverse,
    marginTop: spacing.sm,
  },
  // -- Modal --
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
