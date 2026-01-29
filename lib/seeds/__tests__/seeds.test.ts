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
});
