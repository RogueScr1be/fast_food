/**
 * Settings Screen (Profile Tab)
 * 
 * Fast Food MVP Settings - calm, OS-like design.
 * Shows preferences, about info, and reset options.
 * 
 * Phase 5A: Complete rewrite removing legacy chat/AI content.
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
} from 'react-native';
import { RefreshCw, Info, AlertTriangle } from 'lucide-react-native';
import { colors, spacing, radii, typography, shadows, MIN_TOUCH_TARGET } from '../../lib/ui/theme';
import {
  getExcludeAllergens,
  getConstraints,
  resetDealState,
} from '../../lib/state/ffSession';
import type { AllergenTag, ConstraintTag } from '../../lib/seeds/types';

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

export default function SettingsScreen() {
  const [showResetModal, setShowResetModal] = useState(false);
  
  // Read current preferences (re-read on each render for simplicity)
  const excludeAllergens = getExcludeAllergens();
  const constraints = getConstraints();
  
  /**
   * Format allergens list for display
   */
  const formatAllergens = (): string => {
    if (excludeAllergens.length === 0) {
      return 'None selected';
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
   * Handle reset tonight
   */
  const handleResetTonight = useCallback(() => {
    resetDealState();
    setShowResetModal(false);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
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
            {/* Allergens Row */}
            <View style={styles.row}>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Allergens Avoided</Text>
                <Text style={styles.rowValue}>{formatAllergens()}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Dietary Preferences */}
            <View style={styles.row}>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Vegetarian</Text>
                <Text style={styles.rowStatus}>
                  {isConstraintActive('vegetarian') ? 'On' : 'Off'}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>No Dairy</Text>
                <Text style={styles.rowStatus}>
                  {isConstraintActive('no_dairy') || excludeAllergens.includes('dairy') 
                    ? 'On' 
                    : 'Off'}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Quick Meals (15 min)</Text>
                <Text style={styles.rowStatus}>
                  {isConstraintActive('15_min') ? 'On' : 'Off'}
                </Text>
              </View>
            </View>
          </View>
          
          <Text style={styles.hint}>
            Adjust preferences on the Tonight screen before dealing.
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
          <TouchableOpacity
            style={styles.resetButton}
            onPress={() => setShowResetModal(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Reset tonight's session"
          >
            <RefreshCw size={20} color={colors.error} />
            <Text style={styles.resetButtonText}>Reset Tonight</Text>
          </TouchableOpacity>
          
          <Text style={styles.hint}>
            Clears deal history and pass count. Keeps allergens and mode.
          </Text>
        </View>
      </ScrollView>

      {/* Reset Confirmation Modal */}
      <Modal
        visible={showResetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <AlertTriangle size={32} color={colors.warning} />
            </View>
            
            <Text style={styles.modalTitle}>Reset tonight?</Text>
            <Text style={styles.modalMessage}>
              This will clear your deal history and pass count for this session.
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
                style={styles.modalConfirmButton}
                onPress={handleResetTonight}
                accessibilityRole="button"
                accessibilityLabel="Yes, reset tonight"
              >
                <Text style={styles.modalConfirmText}>Yes</Text>
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
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  rowLabel: {
    fontSize: typography.base,
    fontWeight: typography.medium,
    color: colors.textPrimary,
  },
  rowValue: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    maxWidth: '50%',
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
    marginLeft: spacing.md + spacing.sm + 20, // Align with text after icon
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
  // Reset button
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorLight,
    borderRadius: radii.lg,
    height: MIN_TOUCH_TARGET + 4, // 52px
    paddingHorizontal: spacing.lg,
    ...shadows.sm,
  },
  resetButtonText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.error,
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
  modalConfirmText: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: colors.textInverse,
  },
});
