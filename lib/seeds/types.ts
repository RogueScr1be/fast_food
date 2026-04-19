/**
 * Seed Data Types for Fast Food MVP
 * 
 * These types define the shape of local recipe and DRM (Dinner Rescue Mode) data.
 * Used for offline-first card dealing before backend integration.
 */

/** Recipe category (unified model) */
export type RecipeCategory = 'fancy' | 'easy' | 'cheap' | 'sweet' | 'rescue';

/** User-selectable mode (subset of categories) */
export type Mode = 'fancy' | 'easy' | 'cheap';

/** Common food allergens for filtering */
export type AllergenTag = 'dairy' | 'nuts' | 'gluten' | 'eggs' | 'soy' | 'shellfish';

/** Constraint tags for recipe filtering */
export type ConstraintTag = 'no_oven' | 'kid_safe' | '15_min' | 'vegetarian' | 'no_dairy';

/** Ingredient with quantity */
export interface Ingredient {
  name: string;
  quantity: string;
}

/**
 * Unified recipe model (replaces separate RecipeSeed and DrmSeed)
 * category='rescue' is used for DRM/panic meals
 */
export interface Recipe {
  id: string;
  name: string;
  category: RecipeCategory;
  vegetarian: boolean;
  allergens: AllergenTag[];
  constraints: ConstraintTag[];
  ingredients: Ingredient[];
  steps: string[];
  whyReasons: string[]; // Rotate one at display time
  time: string; // e.g., "25 min"
  cost: string; // e.g., "$15" or "-" for rescue meals
  image: string; // Hero image key
  /** When true, hero image uses contain+scale-up to avoid clipping bowls/plates */
  heroSafeFrame?: boolean;
}

/** Legacy types for backward compatibility */
export type RecipeSeed = Recipe;
export type DrmSeed = Recipe;
