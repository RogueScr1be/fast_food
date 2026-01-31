/**
 * Seed Data Helpers
 * 
 * Functions for filtering and selecting recipes from seed data.
 */

import { RECIPES, DRM_MEALS } from './recipes';
import type { 
  Mode, 
  AllergenTag, 
  ConstraintTag, 
  RecipeSeed, 
  DrmSeed 
} from './types';

// Re-export types for convenience
export type { Mode, AllergenTag, ConstraintTag, RecipeSeed, DrmSeed, Ingredient } from './types';

/**
 * Get all recipes for a specific mode
 */
export function getByMode(mode: Mode): RecipeSeed[] {
  return RECIPES.filter(r => r.mode === mode);
}

/**
 * Apply constraint filters to recipes
 * Returns only recipes that satisfy ALL specified constraints
 */
export function applyConstraints(
  recipes: RecipeSeed[],
  constraints: ConstraintTag[]
): RecipeSeed[] {
  if (constraints.length === 0) return recipes;
  return recipes.filter(recipe =>
    constraints.every(constraint => recipe.constraints.includes(constraint))
  );
}

/**
 * Exclude recipes containing any of the specified allergens
 */
export function excludeAllergens(
  recipes: RecipeSeed[],
  allergens: AllergenTag[]
): RecipeSeed[] {
  if (allergens.length === 0) return recipes;
  return recipes.filter(recipe =>
    !recipe.allergens.some(allergen => allergens.includes(allergen))
  );
}

/**
 * Pick next recipe from candidates, avoiding previously seen IDs
 * Returns null if no candidates available
 */
export function pickNext(
  candidates: RecipeSeed[],
  seenIds: string[]
): RecipeSeed | null {
  const available = candidates.filter(r => !seenIds.includes(r.id));
  if (available.length === 0) return null;
  const index = Math.floor(Math.random() * available.length);
  return available[index];
}

/**
 * Get a random "why this?" reason from a recipe
 */
export function getRandomWhy(recipe: RecipeSeed | DrmSeed): string {
  const index = Math.floor(Math.random() * recipe.whyReasons.length);
  return recipe.whyReasons[index];
}

/**
 * Get DRM candidates, optionally filtered by allergens
 */
export function getDrmCandidates(excludeAllergensList: AllergenTag[] = []): DrmSeed[] {
  if (excludeAllergensList.length === 0) return DRM_MEALS;
  return DRM_MEALS.filter(meal =>
    !meal.allergens.some(allergen => excludeAllergensList.includes(allergen))
  );
}

/**
 * Pick a random DRM meal, avoiding previously seen IDs
 */
export function pickDrm(
  seenIds: string[] = [],
  excludeAllergensList: AllergenTag[] = []
): DrmSeed | null {
  const candidates = getDrmCandidates(excludeAllergensList);
  const available = candidates.filter(m => !seenIds.includes(m.id));
  if (available.length === 0) return null;
  const index = Math.floor(Math.random() * available.length);
  return available[index];
}

/**
 * Get recipe by ID (for checklist screen)
 */
export function getRecipeById(id: string): RecipeSeed | DrmSeed | null {
  const recipe = RECIPES.find(r => r.id === id);
  if (recipe) return recipe;
  return DRM_MEALS.find(m => m.id === id) || null;
}

/**
 * Count recipes per mode (for stats/debugging)
 */
export function getModeCounts(): Record<Mode, number> {
  return {
    fancy: getByMode('fancy').length,
    easy: getByMode('easy').length,
    cheap: getByMode('cheap').length,
  };
}

/**
 * Pick next recipe for dealing.
 * Combines mode filtering, allergen exclusion, and history tracking.
 * 
 * @param mode - Recipe mode to filter by
 * @param excludeAllergensList - Allergens to exclude
 * @param dealHistory - Recipe IDs already shown
 * @param constraints - Optional constraints to apply
 * @returns Next recipe or null if none available
 */
export function pickNextRecipe(
  mode: Mode,
  excludeAllergensList: AllergenTag[] = [],
  dealHistory: string[] = [],
  constraints: ConstraintTag[] = []
): RecipeSeed | null {
  // Get recipes for mode
  let candidates = getByMode(mode);
  
  // Apply allergen filter
  candidates = excludeAllergens(candidates, excludeAllergensList);
  
  // Apply constraints if any
  if (constraints.length > 0) {
    candidates = applyConstraints(candidates, constraints);
  }
  
  // Pick from remaining, avoiding already-shown
  return pickNext(candidates, dealHistory);
}

/**
 * Get count of available recipes for a mode after filtering
 */
export function getAvailableCount(
  mode: Mode,
  excludeAllergensList: AllergenTag[] = [],
  dealHistory: string[] = []
): number {
  let candidates = getByMode(mode);
  candidates = excludeAllergens(candidates, excludeAllergensList);
  const available = candidates.filter(r => !dealHistory.includes(r.id));
  return available.length;
}

/**
 * Pick a DRM meal for rescue mode.
 * Convenience wrapper for pickDrm with simpler signature.
 * 
 * @param excludeAllergensList - Allergens to exclude
 * @param dealHistory - Optional meal IDs already shown (avoids repeats)
 * @returns DRM meal or null if none available
 */
export function pickDrmMeal(
  excludeAllergensList: AllergenTag[] = [],
  dealHistory: string[] = []
): DrmSeed | null {
  return pickDrm(dealHistory, excludeAllergensList);
}

/**
 * Check if a recipe has allergens that conflict with exclusions
 */
export function hasConflictingAllergens(
  recipe: RecipeSeed | DrmSeed,
  excludeAllergensList: AllergenTag[]
): boolean {
  if (excludeAllergensList.length === 0) return false;
  return recipe.allergens.some(allergen => excludeAllergensList.includes(allergen));
}

/**
 * Get any meal (recipe or DRM) by ID.
 * Unified fetch for checklist screen.
 */
export function getAnyMealById(id: string): RecipeSeed | DrmSeed | null {
  return getRecipeById(id);
}

/**
 * Get DRM meal by ID.
 * Used by rescue checklist screen.
 */
export function getDrmById(id: string): DrmSeed | null {
  return DRM_MEALS.find(m => m.id === id) || null;
}

/**
 * Get recipe (non-DRM) by ID.
 * Used when you need to ensure it's a RecipeSeed.
 */
export function getRecipeSeedById(id: string): RecipeSeed | null {
  return RECIPES.find(r => r.id === id) || null;
}

/**
 * Check if a step is a "prep" step based on keywords.
 * Used for Cook/Prep toggle reordering.
 */
const PREP_KEYWORDS = [
  'chop', 'slice', 'dice', 'prep', 'wash', 'measure', 
  'mix', 'whisk', 'preheat', 'set aside', 'marinate',
  'mince', 'grate', 'julienne', 'cut', 'rinse', 'drain'
];

export function isPrepStep(step: string): boolean {
  const lowerStep = step.toLowerCase();
  return PREP_KEYWORDS.some(keyword => lowerStep.includes(keyword));
}

/**
 * Reorder steps for prep-first mode.
 * Stable sort: prep steps first (in original order), then cook steps (in original order).
 * 
 * @deprecated Use reorderForPrepWithIndices for stable index mapping
 */
export function reorderForPrep(steps: string[]): string[] {
  const prepSteps: string[] = [];
  const cookSteps: string[] = [];
  
  steps.forEach(step => {
    if (isPrepStep(step)) {
      prepSteps.push(step);
    } else {
      cookSteps.push(step);
    }
  });
  
  return [...prepSteps, ...cookSteps];
}

/**
 * Reorder steps for prep-first mode WITH stable index tracking.
 * Returns array of { text, originalIndex } to avoid indexOf bugs with duplicate text.
 */
export function reorderForPrepWithIndices(steps: string[]): { text: string; originalIndex: number }[] {
  const prepSteps: { text: string; originalIndex: number }[] = [];
  const cookSteps: { text: string; originalIndex: number }[] = [];
  
  steps.forEach((step, index) => {
    const item = { text: step, originalIndex: index };
    if (isPrepStep(step)) {
      prepSteps.push(item);
    } else {
      cookSteps.push(item);
    }
  });
  
  return [...prepSteps, ...cookSteps];
}

/**
 * Calculate progress percentage from completed count.
 */
export function calculateProgress(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}
