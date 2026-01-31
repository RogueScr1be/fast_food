/**
 * Deal Screen — Swipeable Recipe Cards with DRM
 * 
 * Phase 3: Includes Dinner Rescue Mode (DRM) insertion.
 * - Shows one recipe at a time with swipe-to-pass gestures
 * - Reads mode + allergens from session state
 * - Picks recipes from local seeds
 * - Tracks pass count and deal history
 * - Inserts DRM after 3 passes OR 45 seconds
 * - "I'm allergic" button for in-deal allergen filtering
 * - Navigates to checklist on accept
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, RefreshCw, AlertCircle, X, Check } from 'lucide-react-native';
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
  shouldTriggerDrm,
  setExcludeAllergens,
  DRM_PASS_THRESHOLD,
  DRM_TIME_THRESHOLD_MS,
} from '../lib/state/ffSession';

// All modes for random selection fallback
const ALL_MODES: ('fancy' | 'easy' | 'cheap')[] = ['fancy', 'easy', 'cheap'];
import {
  pickNextRecipe,
  pickDrmMeal,
  getRandomWhy,
  getAvailableCount,
  hasConflictingAllergens,
} from '../lib/seeds';
import type { RecipeSeed, DrmSeed, AllergenTag } from '../lib/seeds/types';
import { DecisionCard, PassDirection } from '../components/DecisionCard';
import { RescueCard } from '../components/RescueCard';
import { LockedTransition, TOTAL_DURATION as LOCKED_DURATION } from '../components/LockedTransition';

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
  const [expanded, setExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [noMoreRecipes, setNoMoreRecipes] = useState(false);
  
  // Allergy modal state
  const [showAllergyModal, setShowAllergyModal] = useState(false);
  const [tempAllergens, setTempAllergens] = useState<AllergenTag[]>([]);
  const [localExcludeAllergens, setLocalExcludeAllergens] = useState<AllergenTag[]>(getExcludeAllergens());
  
  // DRM timer ref
  const drmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drmTimerTriggered, setDrmTimerTriggered] = useState(false);
  
  // Locked transition state (Phase 4)
  const [showLocked, setShowLocked] = useState(false);
  const lockedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Pending navigation after Locked transition - stores type and id
  const pendingNavRef = useRef<{ type: 'recipe' | 'drm'; id: string } | null>(null);

  // Get session state - ensure we have a mode
  const [mode, setLocalMode] = useState(() => {
    const savedMode = getSelectedMode();
    if (savedMode) return savedMode;
    // Randomly select a mode if none set
    const randomMode = ALL_MODES[Math.floor(Math.random() * ALL_MODES.length)];
    setSelectedMode(randomMode);
    return randomMode;
  });
  const constraints = getConstraints();

  /**
   * Deal a new card (recipe or DRM)
   */
  const dealNextCard = useCallback(() => {
    const dealHistory = getDealHistory();
    const passCount = getPassCount();
    const drmInserted = getDrmInserted();
    const excludeAllergens = getExcludeAllergens();

    // Check if DRM should be inserted
    const triggerDrm = !drmInserted && (
      passCount >= DRM_PASS_THRESHOLD || drmTimerTriggered
    );

    if (triggerDrm) {
      // Try to get a DRM meal
      const drmMeal = pickDrmMeal(excludeAllergens, dealHistory);
      if (drmMeal) {
        setCurrentDeal({ type: 'drm', data: drmMeal });
        setWhyText(getRandomWhy(drmMeal));
        setCurrentDealId(drmMeal.id);
        addToDealHistory(drmMeal.id);
        setDrmInserted(true);
        setExpanded(false);
        setNoMoreRecipes(false);
        setIsLoading(false);
        return;
      }
      // If no DRM available, mark as inserted and continue with recipes
      setDrmInserted(true);
    }

    // Try to get a recipe
    const recipe = pickNextRecipe(mode, excludeAllergens, dealHistory, constraints);

    if (recipe) {
      setCurrentDeal({ type: 'recipe', data: recipe });
      setWhyText(getRandomWhy(recipe));
      setCurrentDealId(recipe.id);
      addToDealHistory(recipe.id);
      setExpanded(false);
      setNoMoreRecipes(false);
    } else {
      // No more recipes available
      setCurrentDeal(null);
      setNoMoreRecipes(true);
    }
    setIsLoading(false);
  }, [mode, constraints, drmTimerTriggered]);

  // Mark deal start and set up 45s timer on mount
  useEffect(() => {
    markDealStart();
    
    // Set up 45s timer for DRM trigger
    drmTimerRef.current = setTimeout(() => {
      setDrmTimerTriggered(true);
    }, DRM_TIME_THRESHOLD_MS);

    return () => {
      if (drmTimerRef.current) {
        clearTimeout(drmTimerRef.current);
      }
      if (lockedTimerRef.current) {
        clearTimeout(lockedTimerRef.current);
      }
    };
  }, []);

  // When drmTimerTriggered changes, check if we need to insert DRM
  useEffect(() => {
    if (drmTimerTriggered && !getDrmInserted() && currentDeal) {
      // Timer triggered - next deal should be DRM
      // Don't auto-switch mid-viewing, just flag it for next deal
    }
  }, [drmTimerTriggered, currentDeal]);

  // Deal first card on mount
  useEffect(() => {
    dealNextCard();
  }, [dealNextCard]);

  // Update local allergen state when global changes
  useEffect(() => {
    setLocalExcludeAllergens(getExcludeAllergens());
  }, [showAllergyModal]);

  /**
   * Handle pass (swipe) - increments pass count toward DRM
   */
  const handlePass = useCallback((direction: PassDirection) => {
    incrementPassCount();
    // Small delay for animation to complete
    setTimeout(() => {
      dealNextCard();
    }, 50);
  }, [dealNextCard]);

  /**
   * Handle accept ("Let's do this")
   * Shows "Locked." transition, then navigates to appropriate screen
   * - Recipe → /checklist/[recipeId]
   * - DRM → /rescue/[mealId]
   */
  const handleAccept = useCallback(() => {
    if (!currentDeal || showLocked) return;
    
    // Store navigation intent for after Locked transition
    pendingNavRef.current = currentDeal.type === 'recipe'
      ? { type: 'recipe', id: currentDeal.data.id }
      : { type: 'drm', id: currentDeal.data.id };
    
    setShowLocked(true);
  }, [currentDeal, showLocked]);

  /**
   * Called when LockedTransition completes
   * Routes to checklist or rescue based on deal type
   */
  const handleLockedComplete = useCallback(() => {
    const pending = pendingNavRef.current;
    pendingNavRef.current = null;
    setShowLocked(false);
    
    if (!pending) return;
    
    if (pending.type === 'recipe') {
      router.push({
        pathname: '/checklist/[recipeId]',
        params: { recipeId: pending.id },
      });
    } else {
      router.push({
        pathname: '/rescue/[mealId]',
        params: { mealId: pending.id },
      });
    }
  }, []);

  /**
   * Toggle ingredients tray
   */
  const handleToggleExpand = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  /**
   * Reset and start over (shuffle)
   */
  const handleShuffle = useCallback(() => {
    resetDealState();
    setDrmTimerTriggered(false);
    setIsLoading(true);
    
    // Reset timer
    if (drmTimerRef.current) {
      clearTimeout(drmTimerRef.current);
    }
    drmTimerRef.current = setTimeout(() => {
      setDrmTimerTriggered(true);
    }, DRM_TIME_THRESHOLD_MS);
    
    setTimeout(() => {
      dealNextCard();
    }, 100);
  }, [dealNextCard]);

  /**
   * Open allergy modal
   */
  const openAllergyModal = useCallback(() => {
    setTempAllergens(getExcludeAllergens());
    setShowAllergyModal(true);
  }, []);

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
   * Does NOT increment pass count, does NOT trigger DRM
   */
  const saveAllergens = useCallback(() => {
    setExcludeAllergens(tempAllergens);
    setLocalExcludeAllergens(tempAllergens);
    setShowAllergyModal(false);
    
    // Check if current card conflicts with new allergens
    if (currentDeal && hasConflictingAllergens(currentDeal.data, tempAllergens)) {
      // Re-deal without incrementing pass count
      setTimeout(() => {
        // Deal next card (don't call handlePass, which increments)
        const dealHistory = getDealHistory();
        const excludeAllergens = tempAllergens;
        
        if (currentDeal.type === 'drm') {
          // Try another DRM
          const drmMeal = pickDrmMeal(excludeAllergens, dealHistory);
          if (drmMeal) {
            setCurrentDeal({ type: 'drm', data: drmMeal });
            setWhyText(getRandomWhy(drmMeal));
            setCurrentDealId(drmMeal.id);
            addToDealHistory(drmMeal.id);
            setExpanded(false);
            return;
          }
        }
        
        // Fall back to recipe
        if (mode) {
          const recipe = pickNextRecipe(mode, excludeAllergens, dealHistory, constraints);
          if (recipe) {
            setCurrentDeal({ type: 'recipe', data: recipe });
            setWhyText(getRandomWhy(recipe));
            setCurrentDealId(recipe.id);
            addToDealHistory(recipe.id);
            setExpanded(false);
          } else {
            setCurrentDeal(null);
            setNoMoreRecipes(true);
          }
        }
      }, 50);
    }
  }, [tempAllergens, currentDeal, mode, constraints]);

  // Mode is always set (randomly if needed) - no null check required

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
        </View>
      </SafeAreaView>
    );
  }

  // No more recipes - calm empty state with reset option
  if (noMoreRecipes) {
    const passCount = getPassCount();
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Deal</Text>
          <View style={styles.headerButton} />
        </View>

        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>That's all for {mode}</Text>
          <Text style={styles.emptySubtitle}>
            You've seen {passCount + 1} options
          </Text>
          
          {/* Primary reset action */}
          <TouchableOpacity
            style={styles.resetTonightButton}
            onPress={handleShuffle}
            accessibilityRole="button"
            accessibilityLabel="Reset tonight and deal again"
          >
            <RefreshCw size={18} color={colors.textInverse} />
            <Text style={styles.resetTonightButtonText}>Reset Tonight</Text>
          </TouchableOpacity>
          
          {/* Secondary action - go back to mode select */}
          <TouchableOpacity
            style={styles.backToModeButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Try a different mode"
          >
            <Text style={styles.backToModeText}>Try a different mode</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Main deal screen
  const availableCount = getAvailableCount(mode, localExcludeAllergens, getDealHistory());
  const passCount = getPassCount();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{mode}</Text>
          <Text style={styles.headerSubtitle}>
            {availableCount} more · {passCount} passed
          </Text>
        </View>
        {/* Allergy button - quiet placement */}
        <TouchableOpacity
          style={styles.allergyButton}
          onPress={openAllergyModal}
          accessibilityRole="button"
          accessibilityLabel="Manage allergies"
        >
          <AlertCircle 
            size={20} 
            color={localExcludeAllergens.length > 0 ? colors.accentBlue : colors.textMuted} 
          />
        </TouchableOpacity>
      </View>

      {/* Card - Recipe or Rescue */}
      {currentDeal?.type === 'recipe' && (
        <DecisionCard
          recipe={currentDeal.data}
          whyText={whyText}
          expanded={expanded}
          onToggleExpand={handleToggleExpand}
          onAccept={handleAccept}
          onPass={handlePass}
        />
      )}
      {currentDeal?.type === 'drm' && (
        <RescueCard
          meal={currentDeal.data}
          whyText={whyText}
          expanded={expanded}
          onToggleExpand={handleToggleExpand}
          onAccept={handleAccept}
          onPass={handlePass}
        />
      )}

      {/* Swipe hint at bottom */}
      <View style={styles.footer}>
        <Text style={styles.footerHint}>Swipe to pass · Tap for ingredients</Text>
      </View>

      {/* Allergy Modal */}
      <Modal
        visible={showAllergyModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAllergyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
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

            {/* Allergen List */}
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

      {/* Locked Transition Overlay */}
      <LockedTransition
        visible={showLocked}
        onComplete={handleLockedComplete}
      />
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
    paddingHorizontal: spacing.sm,
    paddingTop: Platform.OS === 'ios' ? spacing.sm : spacing.md,
    paddingBottom: spacing.sm,
  },
  headerButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  headerSubtitle: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  allergyButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  errorText: {
    fontSize: typography.base,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  backLink: {
    padding: spacing.sm,
  },
  backLinkText: {
    fontSize: typography.base,
    color: colors.accentBlue,
    fontWeight: typography.medium,
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
  shuffleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: spacing.sm,
    gap: spacing.sm,
  },
  shuffleButtonText: {
    fontSize: typography.base,
    fontWeight: typography.medium,
    color: colors.accentBlue,
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
  footer: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  footerHint: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '70%',
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
