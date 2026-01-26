/**
 * FAST FOOD: Taste Graph - Feature Extraction
 * 
 * Extracts internal-only learning features from meals.
 * 
 * INVARIANTS:
 * - Features are INTERNAL ONLY - never sent to client
 * - Deterministic extraction
 * - ingredientTokens are lowercase, de-duped, max 12
 */

import type { MealRow, MealIngredientRow } from '@/types/decision-os/decision';
import type { DatabaseClient } from '../database';

// =============================================================================
// TYPES (INTERNAL ONLY)
// =============================================================================

/**
 * Internal learning features for a meal.
 * NEVER sent to client - used only for taste graph scoring.
 */
export interface TasteMealFeatures {
  canonicalKey: string;
  estMinutes: number;
  costBand: string;
  ingredientTokens: string[];
  isPantryFriendly: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum number of ingredient tokens to store
 * Keeps feature vectors compact
 */
export const MAX_INGREDIENT_TOKENS = 12;

/**
 * Tags that indicate a meal is pantry-friendly
 */
const PANTRY_FRIENDLY_TAGS = ['pantry_friendly', 'pantry-friendly', 'pantry'];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Tokenize an ingredient name into lowercase tokens
 * - Splits on spaces and special characters
 * - Removes common filler words
 * - Returns lowercase tokens
 */
export function tokenizeIngredient(name: string): string[] {
  // Split on spaces and common delimiters
  const raw = name.toLowerCase().split(/[\s,/-]+/);
  
  // Filter out common filler words
  const fillerWords = new Set([
    'and', 'or', 'with', 'fresh', 'dried', 'canned', 
    'frozen', 'sliced', 'diced', 'chopped', 'minced',
    'large', 'small', 'medium', 'cup', 'cups', 'tablespoon',
    'teaspoon', 'oz', 'lb', 'pound', 'pounds', 'ounce', 'ounces'
  ]);
  
  return raw.filter(t => t.length > 1 && !fillerWords.has(t));
}

/**
 * Extract ingredient tokens from a list of ingredients
 * - De-duped
 * - Lowercase
 * - Max MAX_INGREDIENT_TOKENS
 */
export function extractIngredientTokens(ingredients: MealIngredientRow[]): string[] {
  const tokenSet = new Set<string>();
  
  for (const ing of ingredients) {
    const tokens = tokenizeIngredient(ing.ingredient_name);
    for (const token of tokens) {
      tokenSet.add(token);
    }
  }
  
  // Convert to array and take first MAX_INGREDIENT_TOKENS
  const tokens = Array.from(tokenSet).sort();
  return tokens.slice(0, MAX_INGREDIENT_TOKENS);
}

/**
 * Determine if a meal is pantry-friendly based on tags
 */
export function isPantryFriendly(meal: MealRow): boolean {
  const tags = meal.tags_internal;
  
  if (!tags || !Array.isArray(tags)) {
    return false;
  }
  
  return tags.some((tag: unknown) => 
    typeof tag === 'string' && PANTRY_FRIENDLY_TAGS.includes(tag.toLowerCase())
  );
}

// =============================================================================
// MAIN FEATURE EXTRACTION
// =============================================================================

/**
 * Extract features from a meal for taste graph learning.
 * 
 * INTERNAL ONLY - Features are never sent to client.
 * 
 * @param meal - The meal row
 * @param ingredients - The meal's ingredients
 * @returns Feature object for learning, or null if meal not found
 */
export function extractMealFeatures(
  meal: MealRow,
  ingredients: MealIngredientRow[]
): TasteMealFeatures {
  return {
    canonicalKey: meal.canonical_key,
    estMinutes: meal.est_minutes,
    costBand: meal.est_cost_band ?? '$',
    ingredientTokens: extractIngredientTokens(ingredients),
    isPantryFriendly: isPantryFriendly(meal),
  };
}

/**
 * Load a meal and its ingredients, then extract features.
 * 
 * @param mealId - The meal ID
 * @param client - Database client
 * @returns Feature object or null if meal not found
 */
export async function loadAndExtractFeatures(
  mealId: string,
  client: DatabaseClient
): Promise<TasteMealFeatures | null> {
  // Load meal
  const mealResult = await client.query<MealRow>(
    'SELECT * FROM decision_os.meals WHERE id = $1',
    [mealId]
  );
  
  const meal = mealResult.rows[0];
  if (!meal) {
    return null;
  }
  
  // Load ingredients
  const ingredientsResult = await client.query<MealIngredientRow>(
    'SELECT * FROM decision_os.meal_ingredients WHERE meal_id = $1',
    [mealId]
  );
  
  return extractMealFeatures(meal, ingredientsResult.rows);
}

/**
 * Create an empty features object for non-meal decisions (order/zero_cook)
 */
export function createEmptyFeatures(): Record<string, never> {
  return {};
}
