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
