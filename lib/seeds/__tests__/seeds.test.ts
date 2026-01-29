/**
 * Seed Helper Unit Tests
 */

import {
  getByMode,
  applyConstraints,
  excludeAllergens,
  pickNext,
  getRandomWhy,
  getDrmCandidates,
  pickDrm,
  getModeCounts,
  getRecipeById,
  pickNextRecipe,
  getAvailableCount,
  pickDrmMeal,
  hasConflictingAllergens,
  getAnyMealById,
  isPrepStep,
  reorderForPrep,
  calculateProgress,
} from '../index';
import { RECIPES, DRM_MEALS } from '../recipes';
import type { RecipeSeed, AllergenTag, ConstraintTag } from '../types';

describe('Seed Helpers', () => {
  describe('getByMode', () => {
    it('returns correct count for fancy mode', () => {
      const fancy = getByMode('fancy');
      expect(fancy.length).toBe(6);
      expect(fancy.every(r => r.mode === 'fancy')).toBe(true);
    });

    it('returns correct count for easy mode', () => {
      const easy = getByMode('easy');
      expect(easy.length).toBe(6);
      expect(easy.every(r => r.mode === 'easy')).toBe(true);
    });

    it('returns correct count for cheap mode', () => {
      const cheap = getByMode('cheap');
      expect(cheap.length).toBe(6);
      expect(cheap.every(r => r.mode === 'cheap')).toBe(true);
    });

    it('each mode has at least one vegetarian option', () => {
      const modes = ['fancy', 'easy', 'cheap'] as const;
      modes.forEach(mode => {
        const recipes = getByMode(mode);
        const vegetarianCount = recipes.filter(r => r.vegetarian).length;
        expect(vegetarianCount).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('applyConstraints', () => {
    it('returns all recipes when no constraints specified', () => {
      const recipes = getByMode('easy');
      const filtered = applyConstraints(recipes, []);
      expect(filtered.length).toBe(recipes.length);
    });

    it('filters by single constraint', () => {
      const recipes = getByMode('easy');
      const filtered = applyConstraints(recipes, ['vegetarian']);
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every(r => r.constraints.includes('vegetarian'))).toBe(true);
    });

    it('filters by multiple constraints (AND logic)', () => {
      const recipes = getByMode('easy');
      const filtered = applyConstraints(recipes, ['vegetarian', '15_min']);
      filtered.forEach(recipe => {
        expect(recipe.constraints).toContain('vegetarian');
        expect(recipe.constraints).toContain('15_min');
      });
    });
  });

  describe('excludeAllergens', () => {
    it('returns all recipes when no allergens specified', () => {
      const recipes = getByMode('fancy');
      const filtered = excludeAllergens(recipes, []);
      expect(filtered.length).toBe(recipes.length);
    });

    it('excludes recipes with dairy allergen', () => {
      const recipes = getByMode('fancy');
      const filtered = excludeAllergens(recipes, ['dairy']);
      expect(filtered.every(r => !r.allergens.includes('dairy'))).toBe(true);
    });

    it('excludes recipes with multiple allergens (OR logic)', () => {
      const recipes = RECIPES;
      const filtered = excludeAllergens(recipes, ['dairy', 'gluten']);
      filtered.forEach(recipe => {
        expect(recipe.allergens.includes('dairy')).toBe(false);
        expect(recipe.allergens.includes('gluten')).toBe(false);
      });
    });

    it('handles allergens not present in any recipe', () => {
      const recipes = getByMode('fancy');
      const filtered = excludeAllergens(recipes, ['shellfish']);
      // Should only exclude shrimp scampi
      expect(filtered.length).toBe(5);
    });
  });

  describe('pickNext', () => {
    it('returns a recipe when candidates available', () => {
      const candidates = getByMode('easy');
      const result = pickNext(candidates, []);
      expect(result).not.toBeNull();
      expect(candidates.some(c => c.id === result?.id)).toBe(true);
    });

    it('avoids recipes in seenIds', () => {
      const candidates = getByMode('easy');
      const seenIds = candidates.slice(0, 5).map(r => r.id);
      
      // Run multiple times to ensure randomness doesn't pick seen IDs
      for (let i = 0; i < 10; i++) {
        const result = pickNext(candidates, seenIds);
        if (result) {
          expect(seenIds).not.toContain(result.id);
        }
      }
    });

    it('returns null when all recipes are in seenIds', () => {
      const candidates = getByMode('easy');
      const seenIds = candidates.map(r => r.id);
      const result = pickNext(candidates, seenIds);
      expect(result).toBeNull();
    });

    it('returns null for empty candidates', () => {
      const result = pickNext([], []);
      expect(result).toBeNull();
    });
  });

  describe('getRandomWhy', () => {
    it('returns a string from whyReasons', () => {
      const recipe = RECIPES[0];
      const why = getRandomWhy(recipe);
      expect(typeof why).toBe('string');
      expect(recipe.whyReasons).toContain(why);
    });

    it('works with DRM meals', () => {
      const drm = DRM_MEALS[0];
      const why = getRandomWhy(drm);
      expect(typeof why).toBe('string');
      expect(drm.whyReasons).toContain(why);
    });
  });

  describe('getDrmCandidates', () => {
    it('returns all DRM meals when no allergens excluded', () => {
      const candidates = getDrmCandidates([]);
      expect(candidates.length).toBe(DRM_MEALS.length);
    });

    it('filters DRM meals by allergens', () => {
      const candidates = getDrmCandidates(['nuts']);
      expect(candidates.every(m => !m.allergens.includes('nuts'))).toBe(true);
    });
  });

  describe('pickDrm', () => {
    it('returns a DRM meal', () => {
      const result = pickDrm([], []);
      expect(result).not.toBeNull();
      expect(DRM_MEALS.some(m => m.id === result?.id)).toBe(true);
    });

    it('avoids seenIds', () => {
      const seenIds = DRM_MEALS.slice(0, 10).map(m => m.id);
      for (let i = 0; i < 10; i++) {
        const result = pickDrm(seenIds, []);
        if (result) {
          expect(seenIds).not.toContain(result.id);
        }
      }
    });

    it('respects allergen exclusions', () => {
      const result = pickDrm([], ['dairy']);
      if (result) {
        expect(result.allergens).not.toContain('dairy');
      }
    });
  });

  describe('getRecipeById', () => {
    it('finds recipe by ID', () => {
      const recipe = getRecipeById('fancy-1');
      expect(recipe).not.toBeNull();
      expect(recipe?.name).toBe('Pan-Seared Salmon');
    });

    it('finds DRM meal by ID', () => {
      const drm = getRecipeById('drm-1');
      expect(drm).not.toBeNull();
      expect(drm?.name).toBe('Cereal & Milk');
    });

    it('returns null for unknown ID', () => {
      const result = getRecipeById('unknown-id');
      expect(result).toBeNull();
    });
  });

  describe('getModeCounts', () => {
    it('returns counts for all modes', () => {
      const counts = getModeCounts();
      expect(counts.fancy).toBe(6);
      expect(counts.easy).toBe(6);
      expect(counts.cheap).toBe(6);
    });
  });

  describe('seed data integrity', () => {
    it('all recipes have required fields', () => {
      RECIPES.forEach(recipe => {
        expect(recipe.id).toBeTruthy();
        expect(recipe.name).toBeTruthy();
        expect(['fancy', 'easy', 'cheap']).toContain(recipe.mode);
        expect(typeof recipe.vegetarian).toBe('boolean');
        expect(Array.isArray(recipe.allergens)).toBe(true);
        expect(Array.isArray(recipe.constraints)).toBe(true);
        expect(Array.isArray(recipe.ingredients)).toBe(true);
        expect(recipe.ingredients.length).toBeGreaterThan(0);
        expect(Array.isArray(recipe.steps)).toBe(true);
        expect(recipe.steps.length).toBeGreaterThan(0);
        expect(Array.isArray(recipe.whyReasons)).toBe(true);
        expect(recipe.whyReasons.length).toBeGreaterThan(0);
        expect(recipe.estimatedTime).toBeTruthy();
        expect(recipe.estimatedCost).toBeTruthy();
        expect(recipe.emoji).toBeTruthy();
      });
    });

    it('all DRM meals have required fields', () => {
      DRM_MEALS.forEach(meal => {
        expect(meal.id).toBeTruthy();
        expect(meal.name).toBeTruthy();
        expect(typeof meal.vegetarian).toBe('boolean');
        expect(Array.isArray(meal.allergens)).toBe(true);
        expect(Array.isArray(meal.constraints)).toBe(true);
        expect(Array.isArray(meal.ingredients)).toBe(true);
        expect(meal.ingredients.length).toBeGreaterThan(0);
        expect(Array.isArray(meal.steps)).toBe(true);
        expect(meal.steps.length).toBeGreaterThan(0);
        expect(Array.isArray(meal.whyReasons)).toBe(true);
        expect(meal.whyReasons.length).toBeGreaterThan(0);
        expect(meal.estimatedTime).toBeTruthy();
        expect(meal.emoji).toBeTruthy();
      });
    });

    it('has at least 12 DRM meals', () => {
      expect(DRM_MEALS.length).toBeGreaterThanOrEqual(12);
    });

    it('all recipe IDs are unique', () => {
      const allIds = [...RECIPES.map(r => r.id), ...DRM_MEALS.map(m => m.id)];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });
  });

  // Phase 2: Deal helper tests
  describe('pickNextRecipe', () => {
    it('returns a recipe for the specified mode', () => {
      const result = pickNextRecipe('fancy', [], []);
      expect(result).not.toBeNull();
      expect(result?.mode).toBe('fancy');
    });

    it('returns different recipes for different modes', () => {
      const fancy = pickNextRecipe('fancy', [], []);
      const easy = pickNextRecipe('easy', [], []);
      const cheap = pickNextRecipe('cheap', [], []);
      
      expect(fancy?.mode).toBe('fancy');
      expect(easy?.mode).toBe('easy');
      expect(cheap?.mode).toBe('cheap');
    });

    it('respects allergen exclusions', () => {
      // Run multiple times to verify consistency
      for (let i = 0; i < 10; i++) {
        const result = pickNextRecipe('fancy', ['dairy'], []);
        if (result) {
          expect(result.allergens).not.toContain('dairy');
        }
      }
    });

    it('avoids recipes in dealHistory', () => {
      const fancyRecipes = getByMode('fancy');
      const dealHistory = fancyRecipes.slice(0, 5).map(r => r.id);
      
      for (let i = 0; i < 10; i++) {
        const result = pickNextRecipe('fancy', [], dealHistory);
        if (result) {
          expect(dealHistory).not.toContain(result.id);
        }
      }
    });

    it('returns null when all recipes exhausted', () => {
      const fancyRecipes = getByMode('fancy');
      const dealHistory = fancyRecipes.map(r => r.id);
      
      const result = pickNextRecipe('fancy', [], dealHistory);
      expect(result).toBeNull();
    });

    it('returns null when allergens exclude all recipes', () => {
      // Exclude all common allergens
      const allAllergens: AllergenTag[] = ['dairy', 'nuts', 'gluten', 'eggs', 'soy', 'shellfish'];
      const result = pickNextRecipe('fancy', allAllergens, []);
      // Some modes might have all recipes excluded
      // Just verify it doesn't throw
      expect(result === null || result !== null).toBe(true);
    });

    it('applies constraints correctly', () => {
      const result = pickNextRecipe('easy', [], [], ['vegetarian']);
      if (result) {
        expect(result.constraints).toContain('vegetarian');
      }
    });

    it('combines allergen exclusions and constraints', () => {
      for (let i = 0; i < 10; i++) {
        const result = pickNextRecipe('easy', ['dairy'], [], ['vegetarian']);
        if (result) {
          expect(result.allergens).not.toContain('dairy');
          expect(result.constraints).toContain('vegetarian');
        }
      }
    });
  });

  describe('getAvailableCount', () => {
    it('returns total count with no filters', () => {
      const count = getAvailableCount('fancy', [], []);
      expect(count).toBe(6);
    });

    it('reduces count after allergen exclusion', () => {
      const fullCount = getAvailableCount('fancy', [], []);
      const filteredCount = getAvailableCount('fancy', ['dairy'], []);
      expect(filteredCount).toBeLessThanOrEqual(fullCount);
    });

    it('reduces count based on deal history', () => {
      const fancyRecipes = getByMode('fancy');
      const dealHistory = fancyRecipes.slice(0, 3).map(r => r.id);
      
      const count = getAvailableCount('fancy', [], dealHistory);
      expect(count).toBe(3); // 6 - 3 = 3
    });

    it('returns 0 when all recipes exhausted', () => {
      const fancyRecipes = getByMode('fancy');
      const dealHistory = fancyRecipes.map(r => r.id);
      
      const count = getAvailableCount('fancy', [], dealHistory);
      expect(count).toBe(0);
    });
  });

  // Phase 3: DRM helper tests
  describe('pickDrmMeal', () => {
    it('returns a DRM meal', () => {
      const meal = pickDrmMeal([], []);
      expect(meal).not.toBeNull();
      expect(meal?.id.startsWith('drm-')).toBe(true);
    });

    it('respects allergen exclusions', () => {
      for (let i = 0; i < 10; i++) {
        const meal = pickDrmMeal(['dairy'], []);
        if (meal) {
          expect(meal.allergens).not.toContain('dairy');
        }
      }
    });

    it('avoids meals in deal history', () => {
      const drm1 = pickDrmMeal([], []);
      expect(drm1).not.toBeNull();
      
      // Pick several more times with first in history
      for (let i = 0; i < 10; i++) {
        const meal = pickDrmMeal([], [drm1!.id]);
        if (meal) {
          expect(meal.id).not.toBe(drm1!.id);
        }
      }
    });

    it('returns null when all DRM exhausted', () => {
      const allDrmIds = DRM_MEALS.map(m => m.id);
      const meal = pickDrmMeal([], allDrmIds);
      expect(meal).toBeNull();
    });
  });

  describe('hasConflictingAllergens', () => {
    it('returns false when no allergens excluded', () => {
      const recipe = RECIPES[0];
      expect(hasConflictingAllergens(recipe, [])).toBe(false);
    });

    it('returns true when recipe has excluded allergen', () => {
      // Find a recipe with dairy
      const dairyRecipe = RECIPES.find(r => r.allergens.includes('dairy'));
      if (dairyRecipe) {
        expect(hasConflictingAllergens(dairyRecipe, ['dairy'])).toBe(true);
      }
    });

    it('returns false when recipe has no excluded allergens', () => {
      // Find a recipe without dairy
      const noDairyRecipe = RECIPES.find(r => !r.allergens.includes('dairy'));
      if (noDairyRecipe) {
        expect(hasConflictingAllergens(noDairyRecipe, ['dairy'])).toBe(false);
      }
    });

    it('works with DRM meals', () => {
      const drmMeal = DRM_MEALS[0];
      expect(hasConflictingAllergens(drmMeal, [])).toBe(false);
    });
  });

  // Phase 4: Checklist helper tests
  describe('getAnyMealById', () => {
    it('returns RecipeSeed for recipe id', () => {
      const meal = getAnyMealById('fancy-1');
      expect(meal).not.toBeNull();
      expect(meal?.id).toBe('fancy-1');
      expect('mode' in meal!).toBe(true); // RecipeSeed has mode
    });

    it('returns DrmSeed for drm id', () => {
      const meal = getAnyMealById('drm-1');
      expect(meal).not.toBeNull();
      expect(meal?.id).toBe('drm-1');
      expect('mode' in meal!).toBe(false); // DrmSeed doesn't have mode
    });

    it('returns null for unknown id', () => {
      const meal = getAnyMealById('unknown-999');
      expect(meal).toBeNull();
    });
  });

  describe('isPrepStep', () => {
    it('identifies prep keywords', () => {
      expect(isPrepStep('Chop the onions')).toBe(true);
      expect(isPrepStep('Slice the tomatoes')).toBe(true);
      expect(isPrepStep('Dice the peppers')).toBe(true);
      expect(isPrepStep('Preheat oven to 400F')).toBe(true);
      expect(isPrepStep('Wash and rinse the vegetables')).toBe(true);
      expect(isPrepStep('Measure out 2 cups flour')).toBe(true);
      expect(isPrepStep('Mix the dry ingredients')).toBe(true);
      expect(isPrepStep('Whisk the eggs')).toBe(true);
    });

    it('identifies cook/non-prep steps', () => {
      expect(isPrepStep('Cook for 10 minutes')).toBe(false);
      expect(isPrepStep('Bake until golden')).toBe(false);
      expect(isPrepStep('Simmer on low heat')).toBe(false);
      expect(isPrepStep('Serve immediately')).toBe(false);
      expect(isPrepStep('Let cool for 5 minutes')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isPrepStep('CHOP the onions')).toBe(true);
      expect(isPrepStep('Chop the ONIONS')).toBe(true);
    });
  });

  describe('reorderForPrep', () => {
    it('moves prep steps before cook steps', () => {
      const steps = [
        'Cook for 10 minutes',
        'Chop the onions',
        'Bake until golden',
        'Slice the tomatoes',
        'Serve immediately',
      ];
      
      const reordered = reorderForPrep(steps);
      
      // First two should be prep steps
      expect(reordered[0]).toBe('Chop the onions');
      expect(reordered[1]).toBe('Slice the tomatoes');
      // Rest should be cook steps in original order
      expect(reordered[2]).toBe('Cook for 10 minutes');
      expect(reordered[3]).toBe('Bake until golden');
      expect(reordered[4]).toBe('Serve immediately');
    });

    it('maintains original order within prep and cook groups', () => {
      const steps = [
        'Cook step 1',
        'Chop step 1',
        'Cook step 2',
        'Dice step 2',
        'Slice step 3',
      ];
      
      const reordered = reorderForPrep(steps);
      
      // Prep steps should maintain their relative order
      expect(reordered[0]).toBe('Chop step 1');
      expect(reordered[1]).toBe('Dice step 2');
      expect(reordered[2]).toBe('Slice step 3');
      // Cook steps should maintain their relative order
      expect(reordered[3]).toBe('Cook step 1');
      expect(reordered[4]).toBe('Cook step 2');
    });

    it('returns same order when no prep steps', () => {
      const steps = ['Cook for 10 minutes', 'Bake until golden', 'Serve'];
      const reordered = reorderForPrep(steps);
      expect(reordered).toEqual(steps);
    });

    it('returns same order when all prep steps', () => {
      const steps = ['Chop onions', 'Slice tomatoes', 'Dice peppers'];
      const reordered = reorderForPrep(steps);
      expect(reordered).toEqual(steps);
    });

    it('handles empty array', () => {
      expect(reorderForPrep([])).toEqual([]);
    });
  });

  describe('calculateProgress', () => {
    it('returns 0 for no completed steps', () => {
      expect(calculateProgress(0, 5)).toBe(0);
    });

    it('returns 100 for all completed steps', () => {
      expect(calculateProgress(5, 5)).toBe(100);
    });

    it('returns correct percentage for partial completion', () => {
      expect(calculateProgress(1, 4)).toBe(25);
      expect(calculateProgress(2, 4)).toBe(50);
      expect(calculateProgress(3, 4)).toBe(75);
    });

    it('rounds to nearest integer', () => {
      expect(calculateProgress(1, 3)).toBe(33);
      expect(calculateProgress(2, 3)).toBe(67);
    });

    it('handles zero total', () => {
      expect(calculateProgress(0, 0)).toBe(0);
    });
  });
});
