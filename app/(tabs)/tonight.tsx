/**
 * Tonight Screen — Mode Selection
 * 
 * Phase 1 UI:
 * - Three mode options: Fancy, Easy, Cheap
 * - "I'm allergic" modal for allergen exclusions
 * - Subtle progress bar that fills when mode is selected
 * - Primary CTA: "Decide for Me" → navigates to /deal
 * 
 * Follows Design Constitution: calm, OS-like, minimal, elegant.
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native';
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
} from '../../lib/state/ffSession';
import type { Mode, AllergenTag } from '../../lib/seeds/types';

// All allergens for the modal
const ALL_ALLERGENS: { tag: AllergenTag; label: string }[] = [
  { tag: 'dairy', label: 'Dairy' },
  { tag: 'nuts', label: 'Nuts' },
  { tag: 'gluten', label: 'Gluten' },
  { tag: 'eggs', label: 'Eggs' },
  { tag: 'soy', label: 'Soy' },
  { tag: 'shellfish', label: 'Shellfish' },
];

/**
 * Check if QA panel is enabled (client-side gate)
 */
function isQaEnabled(): boolean {
  return process.env.EXPO_PUBLIC_FF_QA_ENABLED === 'true';
}

/**
 * Mode Button Component
 */
interface ModeButtonProps {
  mode: Mode;
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onPress: () => void;
}

function ModeButton({ mode, label, icon, selected, onPress }: ModeButtonProps) {
  return (
    <TouchableOpacity
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

/**
 * Allergen Checkbox Component
 */
interface AllergenCheckboxProps {
  tag: AllergenTag;
  label: string;
  checked: boolean;
  onToggle: () => void;
}

function AllergenCheckbox({ label, checked, onToggle }: AllergenCheckboxProps) {
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

/**
 * Tonight Screen — Main Component
 */
export default function TonightScreen() {
  const [selectedMode, setSelectedModeLocal] = useState<Mode | null>(getSelectedMode());
  const [excludeAllergens, setExcludeAllergensLocal] = useState<AllergenTag[]>(getExcludeAllergens());
  const [showAllergyModal, setShowAllergyModal] = useState(false);
  const [tempAllergens, setTempAllergens] = useState<AllergenTag[]>([]);
  const [showHelper, setShowHelper] = useState(false);
  
  // QA Panel access: Long-press timer
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LONG_PRESS_DURATION = 2000;
  
  /**
   * Handle title long press for QA panel
   */
  const handleTitlePressIn = () => {
    if (!isQaEnabled()) return;
    longPressTimer.current = setTimeout(() => {
      router.push('/qa');
    }, LONG_PRESS_DURATION);
  };
  
  const handleTitlePressOut = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  
  /**
   * Handle mode selection
   */
  const handleModeSelect = (mode: Mode) => {
    const newMode = selectedMode === mode ? null : mode;
    setSelectedModeLocal(newMode);
    setSelectedMode(newMode);
    setShowHelper(false);
  };
  
  /**
   * Handle "Decide for Me" press
   */
  const handleDecide = () => {
    if (!selectedMode) {
      setShowHelper(true);
      return;
    }
    router.push('/deal');
  };
  
  /**
   * Open allergy modal
   */
  const openAllergyModal = () => {
    setTempAllergens([...excludeAllergens]);
    setShowAllergyModal(true);
  };
  
  /**
   * Toggle allergen in temp state
   */
  const toggleAllergen = (tag: AllergenTag) => {
    setTempAllergens(prev =>
      prev.includes(tag)
        ? prev.filter(a => a !== tag)
        : [...prev, tag]
    );
  };
  
  /**
   * Save allergens and close modal
   */
  const saveAllergens = () => {
    setExcludeAllergensLocal(tempAllergens);
    setExcludeAllergens(tempAllergens);
    setShowAllergyModal(false);
  };
  
  /**
   * Cancel and close modal
   */
  const cancelAllergyModal = () => {
    setShowAllergyModal(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPressIn={handleTitlePressIn}
          onPressOut={handleTitlePressOut}
        >
          <Text style={styles.title}>Tonight</Text>
        </Pressable>
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
              color={selectedMode === 'fancy' ? colors.textInverse : colors.accentBlue}
            />
          }
          selected={selectedMode === 'fancy'}
          onPress={() => handleModeSelect('fancy')}
        />
        <ModeButton
          mode="easy"
          label="Easy"
          icon={
            <Utensils
              size={32}
              color={selectedMode === 'easy' ? colors.textInverse : colors.accentBlue}
            />
          }
          selected={selectedMode === 'easy'}
          onPress={() => handleModeSelect('easy')}
        />
        <ModeButton
          mode="cheap"
          label="Cheap"
          icon={
            <Coins
              size={32}
              color={selectedMode === 'cheap' ? colors.textInverse : colors.accentBlue}
            />
          }
          selected={selectedMode === 'cheap'}
          onPress={() => handleModeSelect('cheap')}
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
        {/* Progress Bar */}
        <View style={styles.progressWrapper}>
          <ThinProgressBar
            value={selectedMode ? 1 : 0}
            accessibilityLabel="Mode selection progress"
          />
        </View>

        {/* Helper Text */}
        {showHelper && (
          <Text style={styles.helperText}>Pick a mode first</Text>
        )}

        {/* Primary CTA */}
        <PrimaryButton
          label="Decide for Me"
          onPress={handleDecide}
          tone="primary"
          variant={selectedMode ? 'solid' : 'muted'}
        />
      </View>

      {/* Allergy Modal */}
      <Modal
        visible={showAllergyModal}
        animationType="slide"
        transparent
        onRequestClose={cancelAllergyModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
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

            {/* Allergen List */}
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

            {/* Modal Actions */}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  
  // Header
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
  
  // Mode Selection
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
  
  // Allergy Button
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
  
  // CTA Section
  ctaSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.xl,
    paddingTop: spacing.md,
  },
  progressWrapper: {
    marginBottom: spacing.md,
  },
  helperText: {
    fontSize: typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
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
