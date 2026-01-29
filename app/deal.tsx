/**
 * Deal Screen — Placeholder (Phase 1)
 * 
 * This screen will show the swipeable decision cards in Phase 2.
 * For now, it displays the selected session state for QA verification.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { colors, spacing, radii, typography, MIN_TOUCH_TARGET } from '../lib/ui/theme';
import { getSessionState } from '../lib/state/ffSession';

export default function DealScreen() {
  const session = getSessionState();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Deal</Text>
        <View style={styles.backButton} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Deal screen coming next phase</Text>
          
          <View style={styles.divider} />
          
          {/* Session State for QA */}
          <Text style={styles.sectionTitle}>Session State (QA)</Text>
          
          <View style={styles.stateRow}>
            <Text style={styles.stateLabel}>Mode:</Text>
            <Text style={styles.stateValue}>
              {session.selectedMode || '(none)'}
            </Text>
          </View>
          
          <View style={styles.stateRow}>
            <Text style={styles.stateLabel}>Allergens:</Text>
            <Text style={styles.stateValue}>
              {session.excludeAllergens.length > 0
                ? session.excludeAllergens.join(', ')
                : '(none)'}
            </Text>
          </View>
          
          <View style={styles.stateRow}>
            <Text style={styles.stateLabel}>Constraints:</Text>
            <Text style={styles.stateValue}>
              {session.constraints.length > 0
                ? session.constraints.join(', ')
                : '(none)'}
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'ios' ? spacing.sm : spacing.lg,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: typography.xl,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: typography.lg,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  stateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  stateLabel: {
    fontSize: typography.base,
    color: colors.textSecondary,
  },
  stateValue: {
    fontSize: typography.base,
    fontWeight: typography.medium,
    color: colors.textPrimary,
  },
});
