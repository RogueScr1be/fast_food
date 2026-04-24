import { useCallback, useMemo } from 'react';
import { recipes } from '../seeds/recipes';
import type { Recipe } from '../seeds/recipes';
import {
  selectDeterministicItem,
  getDeterministicString,
  getDeterministicIndex,
} from '../utils/deterministic-selector';
import { getTodaySeedKey } from '../utils/date-key';

export interface RecommendationResult {
  recipeId: string;
  recipeName: string;
  recipe: Recipe;
  why: string;
  category: Recipe['category'];
}

const whyCopyByMood = {
  tired: [
    'Sunday vibe, fresh start',
    'Keep it simple tonight',
    'Low effort, high reward',
    'Comfort food time',
    'Zero friction pick',
  ],
  celebrating: [
    'Dinner guest approved',
    'Weekend feels',
    'Show-off meal',
    'Worth the extra steps',
    'Elevated evening',
  ],
  default: [
    'Tonight's pick',
    'Random rotation',
    'New in rotation',
    'From the vault',
    'Today's special',
  ],
};

/**
 * Map mood to recipe category preference.
 * Mood → preferred category for recommendation.
 */
function getMoodCategory(mood: 'tired' | 'celebrating' | 'default'): Recipe['category'] {
  switch (mood) {
    case 'tired':
      return 'rescue'; // Low friction
    case 'celebrating':
      return 'fancy'; // Higher effort OK
    case 'default':
      return 'easy'; // Balanced
  }
}

/**
 * Get available recipes in category, excluding recently accepted ones.
 */
function getAvailableRecipesInCategory(
  category: Recipe['category'],
  recentlyAccepted: string[] = []
): Recipe[] {
  return recipes.filter(
    r =>
      r.category === category &&
      !recentlyAccepted.includes(r.id)
  );
}

/**
 * Get fallback recipes if preferred category is empty.
 * Fallback priority: rescue → easy → fancy → cheap
 */
function getFallbackRecipesIfEmpty(
  primaryCategory: Recipe['category'],
  recentlyAccepted: string[] = []
): Recipe[] {
  const fallbackOrder: Recipe['category'][] = ['rescue', 'easy', 'fancy', 'cheap'];

  for (const category of fallbackOrder) {
    if (category === primaryCategory) continue;
    const candidates = getAvailableRecipesInCategory(category, recentlyAccepted);
    if (candidates.length > 0) return candidates;
  }

  // If all categories exhausted, return any recipe (repeat prevention disabled)
  return recipes.filter(r => !recentlyAccepted.includes(r.id));
}

/**
 * Hook to get deterministic daily recommendation.
 * Input: userId, mood, recently accepted recipes (7-day window)
 * Output: One recipe recommendation (deterministic per user/date)
 */
export function useDeterministicRecommendation(
  userId: string,
  mood: 'tired' | 'celebrating' | 'default' = 'default',
  recentlyAccepted: string[] = []
): RecommendationResult | null {
  const seedKey = useMemo(() => getTodaySeedKey(userId), [userId]);

  return useMemo(() => {
    // 1. Determine preferred category
    const preferredCategory = getMoodCategory(mood);

    // 2. Get available recipes in category
    let candidates = getAvailableRecipesInCategory(preferredCategory, recentlyAccepted);

    // 3. Fallback if category is empty
    if (candidates.length === 0) {
      candidates = getFallbackRecipesIfEmpty(preferredCategory, recentlyAccepted);
    }

    // 4. Handle total exhaustion (no recipes available)
    if (candidates.length === 0) {
      console.warn(
        `No recipes available after repeat prevention. Mood: ${mood}, Recently accepted: ${recentlyAccepted.join(', ')}`
      );
      return null;
    }

    // 5. Select deterministically
    const selectedRecipe = selectDeterministicItem(candidates, seedKey);
    if (!selectedRecipe) return null;

    // 6. Get deterministic "why" copy
    const whyCandidates = whyCopyByMood[mood];
    const why =
      getDeterministicString(whyCandidates, selectedRecipe.id) ||
      whyCandidates[0];

    return {
      recipeId: selectedRecipe.id,
      recipeName: selectedRecipe.name,
      recipe: selectedRecipe,
      why,
      category: selectedRecipe.category,
    };
  }, [seedKey, mood, recentlyAccepted]);
}

/**
 * Get all recipes in category without any filtering.
 * Used by UI to show alternatives (fancy/easy/cheap cards).
 */
export function useRecipesByCategory(
  category: Recipe['category']
): Recipe[] {
  return useMemo(() => {
    return recipes.filter(r => r.category === category);
  }, [category]);
}

/**
 * Get recommendation + alternatives for Deal screen.
 * Returns: primary recommendation + 2 alternatives.
 */
export function useDealRecommendations(
  userId: string,
  mood: 'tired' | 'celebrating' | 'default' = 'default',
  recentlyAccepted: string[] = []
) {
  const primary = useDeterministicRecommendation(userId, mood, recentlyAccepted);

  const fancyRecipes = useRecipesByCategory('fancy');
  const easyRecipes = useRecipesByCategory('easy');
  const cheapRecipes = useRecipesByCategory('cheap');

  return useMemo(() => {
    if (!primary) return null;

    return {
      primary,
      fancy:
        primary.category === 'fancy'
          ? primary.recipe
          : fancyRecipes[0] || null,
      easy:
        primary.category === 'easy'
          ? primary.recipe
          : easyRecipes[0] || null,
      cheap:
        primary.category === 'cheap'
          ? primary.recipe
          : cheapRecipes[0] || null,
    };
  }, [primary, fancyRecipes, easyRecipes, cheapRecipes]);
}
