/**
 * Settings Screen (Profile Tab)
 * 
 * Fast Food MVP Settings - calm, OS-like design.
 * Editable preferences, about info, and reset options.
 * 
 * Phase 6.3: Made settings editable with toggles and allergen modal.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  Platform,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, RefreshCw, Info, AlertTriangle, ChevronRight, X, Check, Trash2 } from 'lucide-react-native';
import { colors, spacing, radii, typography, shadows, MIN_TOUCH_TARGET } from '../lib/ui/theme';
import {
  getExcludeAllergens,
  getConstraints,
  setExcludeAllergens,
  toggleConstraint,
  addExcludeAllergen,
  removeExcludeAllergen,
  resetDealState,
  resetAll,
} from '../lib/state/ffSession';
import type { AllergenTag, ConstraintTag } from '../lib/seeds/types';

// App version - placeholder for MVP
const APP_VERSION = 'MVP';

// Allergen display names
const ALLERGEN_LABELS: Record<AllergenTag, string> = {
  dairy: 'Dairy',
  nuts: 'Nuts',
  gluten: 'Gluten',
  eggs: 'Eggs',
  soy: 'Soy',
  shellfish: 'Shellfish',
};

// Constraint display names
const CONSTRAINT_LABELS: Record<ConstraintTag, string> = {
  no_oven: 'No Oven',
  kid_safe: 'Kid Safe',
  '15_min': '15 min',
  vegetarian: 'Vegetarian',
  no_dairy: 'No Dairy',
};

// All allergens for the modal
const ALL_ALLERGENS: { tag: AllergenTag; label: string }[] = [
  { tag: 'dairy', label: 'Dairy' },
  { tag: 'nuts', label: 'Nuts' },
  { tag: 'gluten', label: 'Gluten' },
  { tag: 'eggs', label: 'Eggs' },
  { tag: 'soy', label: 'Soy' },
  { tag: 'shellfish', label: 'Shellfish' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [showResetModal, setShowResetModal] = useState(false);
  const [showResetAllModal, setShowResetAllModal] = useState(false);
  const [showAllergyModal, setShowAllergyModal] = useState(false);
  const [tempAllergens, setTempAllergens] = useState<AllergenTag[]>([]);
  
  // Force re-render counter for reactive updates
  const [, forceUpdate] = useState(0);
  
  // Read current preferences
  const excludeAllergens = getExcludeAllergens();
  const constraints = getConstraints();
  
  /**
   * Format allergens list for display
   */
  const formatAllergens = (): string => {
    if (excludeAllergens.length === 0) {
      return 'None';
    }
    return excludeAllergens.map(a => ALLERGEN_LABELS[a]).join(', ');
  };

  /**
   * Check if a constraint is active
   */
  const isConstraintActive = (constraint: ConstraintTag): boolean => {
    return constraints.includes(constraint);
  };
  
  /**
   * Handle constraint toggle
   */
  const handleConstraintToggle = useCallback((constraint: ConstraintTag) => {
    toggleConstraint(constraint);
    // Special case: No Dairy also adds/removes dairy allergen for consistency
    if (constraint === 'no_dairy') {
      if (isConstraintActive('no_dairy')) {
        // Was on, now off - remove dairy allergen
        removeExcludeAllergen('dairy');
      } else {
        // Was off, now on - add dairy allergen
        addExcludeAllergen('dairy');
      }
    }
    forceUpdate(n => n + 1);
  }, [constraints]);
  
  /**
   * Open allergy modal
   */
  const openAllergyModal = useCallback(() => {
    setTempAllergens([...excludeAllergens]);
    setShowAllergyModal(true);
  }, [excludeAllergens]);
  
  /**
   * Toggle allergen in temp state
   */
  const toggleAllergenTemp = (tag: AllergenTag) => {
    setTempAllergens(prev =>
      prev.includes(tag)
        ? prev.filter(a => a !== tag)
        : [...prev, tag]
    );
  };
  
  /**
   * Save allergens and close modal
   */
  const saveAllergens = useCallback(() => {
    setExcludeAllergens(tempAllergens);
    setShowAllergyModal(false);
    forceUpdate(n => n + 1);
  }, [tempAllergens]);

  /**
   * Handle reset tonight
   */
  const handleResetTonight = useCallback(() => {
    resetDealState();
    setShowResetModal(false);
  }, []);
  
  /**
   * Handle reset all (clears persisted prefs too)
   */
  const handleResetAll = useCallback(() => {
    resetAll();
    setShowResetAllModal(false);
    forceUpdate(n => n + 1);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Back button (glass circle, top-left) */}
      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + spacing.sm }]}
        onPress={() => router.back()}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <ChevronLeft size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.card}>
            {/* Allergens Row - Tappable */}
            <TouchableOpacity
              style={styles.rowTouchable}
              onPress={openAllergyModal}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Edit allergens"
            >
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Allergens</Text>
                <View style={styles.rowValueContainer}>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {formatAllergens()}
                  </Text>
                  <ChevronRight size={18} color={colors.textMuted} />
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Vegetarian Toggle */}
            <View style={styles.row}>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Vegetarian</Text>
                <Switch
                  value={isConstraintActive('vegetarian')}
                  onValueChange={() => handleConstraintToggle('vegetarian')}
                  trackColor={{ false: colors.borderSubtle, true: colors.accentGreen }}
                  thumbColor={colors.surface}
                  accessibilityRole="switch"
                  accessibilityLabel="Vegetarian mode"
                />
              </View>
            </View>

            <View style={styles.divider} />

            {/* No Dairy Toggle */}
            <View style={styles.row}>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>No Dairy</Text>
                <Switch
                  value={isConstraintActive('no_dairy') || excludeAllergens.includes('dairy')}
                  onValueChange={() => handleConstraintToggle('no_dairy')}
                  trackColor={{ false: colors.borderSubtle, true: colors.accentGreen }}
                  thumbColor={colors.surface}
                  accessibilityRole="switch"
                  accessibilityLabel="No dairy mode"
                />
              </View>
            </View>

            <View style={styles.divider} />

            {/* Quick Meals Toggle */}
            <View style={styles.row}>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Quick Meals</Text>
                <Switch
                  value={isConstraintActive('15_min')}
                  onValueChange={() => handleConstraintToggle('15_min')}
                  trackColor={{ false: colors.borderSubtle, true: colors.accentGreen }}
                  thumbColor={colors.surface}
                  accessibilityRole="switch"
                  accessibilityLabel="Quick meals only (15 minutes or less)"
                />
              </View>
            </View>
          </View>
          
          <Text style={styles.hint}>
            Changes apply to future deals. Persisted across app restarts.
          </Text>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Info size={20} color={colors.textMuted} />
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Build</Text>
                <Text style={styles.rowValue}>{APP_VERSION}</Text>
              </View>
            </View>
          </View>
          
          <Text style={styles.aboutText}>
            Fast Food compresses dinner decisions into one calm loop.
          </Text>
        </View>

        {/* Reset Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reset</Text>
          
          {/* Reset Tonight */}
          <TouchableOpacity
            style={styles.resetButton}
            onPress={() => setShowResetModal(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Reset tonight's session"
          >
            <RefreshCw size={20} color={colors.accentBlue} />
            <Text style={styles.resetButtonTextBlue}>Reset Tonight</Text>
          </TouchableOpacity>
          
          <Text style={styles.hint}>
            Clears deal history and pass count. Keeps preferences.
          </Text>
          
          {/* Reset All */}
          <TouchableOpacity
            style={[styles.resetButton, styles.resetAllButton]}
            onPress={() => setShowResetAllModal(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Reset all preferences"
          >
            <Trash2 size={20} color={colors.error} />
            <Text style={styles.resetButtonText}>Reset All</Text>
          </TouchableOpacity>
          
          <Text style={styles.hint}>
            Clears all preferences including allergens and constraints.
          </Text>
        </View>
      </ScrollView>

      {/* Reset Tonight Modal */}
      <Modal
        visible={showResetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <RefreshCw size={32} color={colors.accentBlue} />
            </View>
            
            <Text style={styles.modalTitle}>Reset tonight?</Text>
            <Text style={styles.modalMessage}>
              Clears deal history and pass count. Preferences are kept.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowResetModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButtonBlue}
                onPress={handleResetTonight}
                accessibilityRole="button"
                accessibilityLabel="Yes, reset tonight"
              >
                <Text style={styles.modalConfirmText}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Reset All Modal */}
      <Modal
        visible={showResetAllModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResetAllModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <AlertTriangle size={32} color={colors.error} />
            </View>
            
            <Text style={styles.modalTitle}>Reset all preferences?</Text>
            <Text style={styles.modalMessage}>
              This clears allergens, dietary preferences, and deal history. Cannot be undone.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowResetAllModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleResetAll}
                accessibilityRole="button"
                accessibilityLabel="Yes, reset all"
              >
                <Text style={styles.modalConfirmText}>Reset All</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Allergen Edit Modal */}
      <Modal
        visible={showAllergyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAllergyModal(false)}
      >
        <View style={styles.allergyModalOverlay}>
          <View style={styles.allergyModalContent}>
            {/* Header */}
            <View style={styles.allergyModalHeader}>
              <Text style={styles.allergyModalTitle}>Allergens</Text>
              <TouchableOpacity
                onPress={() => setShowAllergyModal(false)}
                style={styles.allergyModalClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            {/* Allergen List */}
            <ScrollView style={styles.allergenList}>
              {ALL_ALLERGENS.map(({ tag, label }) => (
                <TouchableOpacity
                  key={tag}
                  style={styles.allergenRow}
                  onPress={() => toggleAllergenTemp(tag)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: tempAllergens.includes(tag) }}
                >
                  <View style={[
                    styles.checkbox,
                    tempAllergens.includes(tag) && styles.checkboxChecked,
                  ]}>
                    {tempAllergens.includes(tag) && (
                      <Check size={16} color={colors.textInverse} />
                    )}
                  </View>
                  <Text style={styles.allergenLabel}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            {/* Save Button */}
            <View style={styles.allergyModalFooter}>
              <TouchableOpacity
                style={styles.saveAllergensButton}
                onPress={saveAllergens}
                accessibilityRole="button"
                accessibilityLabel="Save allergens"
              >
                <Text style={styles.saveAllergensText}>Save</Text>
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
  backButton: {
    position: 'absolute',
    left: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.mutedLight,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  // Header
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? spacing.md : spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: typography['3xl'],
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  // Sections
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    ...shadows.sm,
    overflow: 'hidden',
  },
  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minHeight: MIN_TOUCH_TARGET + 8, // 56px
  },
  rowTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minHeight: MIN_TOUCH_TARGET + 8, // 56px
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: typography.base,
    fontWeight: typography.medium,
    color: colors.textPrimary,
  },
  rowValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '60%',
  },
  rowValue: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  rowStatus: {
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginLeft: spacing.md,
  },
  // Hints
  hint: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
  // About
  aboutText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
    fontStyle: 'italic',
  },
  // Reset buttons
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    height: MIN_TOUCH_TARGET + 4, // 52px
    paddingHorizontal: spacing.lg,
    ...shadows.sm,
  },
  resetAllButton: {
    marginTop: spacing.md,
    backgroundColor: colors.errorLight,
    borderColor: colors.errorLight,
  },
  resetButtonText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.error,
    marginLeft: spacing.sm,
  },
  resetButtonTextBlue: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.accentBlue,
    marginLeft: spacing.sm,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    ...shadows.lg,
  },
  modalIcon: {
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: typography.xl,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    width: '100%',
    gap: spacing.sm,
  },
  modalCancelButton: {
    flex: 1,
    height: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.mutedLight,
    borderRadius: radii.md,
  },
  modalCancelText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
  },
  modalConfirmButton: {
    flex: 1,
    height: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.error,
    borderRadius: radii.md,
  },
  modalConfirmButtonBlue: {
    flex: 1,
    height: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.accentBlue,
    borderRadius: radii.md,
  },
  modalConfirmText: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: colors.textInverse,
  },
  // Allergen Modal
  allergyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  allergyModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '70%',
  },
  allergyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  allergyModalTitle: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  allergyModalClose: {
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
    minHeight: MIN_TOUCH_TARGET,
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
  allergyModalFooter: {
    padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveAllergensButton: {
    backgroundColor: colors.accentBlue,
    height: MIN_TOUCH_TARGET + 4,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveAllergensText: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: colors.textInverse,
  },
});
