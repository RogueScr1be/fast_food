/**
 * Seed Data Types for Fast Food MVP
 * 
 * These types define the shape of local recipe and DRM (Dinner Rescue Mode) data.
 * Used for offline-first card dealing before backend integration.
 */

/** Meal mode categories */
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
 * Recipe seed for normal modes (fancy/easy/cheap)
 */
export interface RecipeSeed {
  id: string;
  name: string;
  mode: Mode;
  vegetarian: boolean;
  allergens: AllergenTag[];
  constraints: ConstraintTag[];
  ingredients: Ingredient[];
  steps: string[];
  whyReasons: string[]; // Rotate one at display time
  estimatedTime: string; // e.g., "25 min"
  estimatedCost: string; // e.g., "$15"
  imageKey?: string; // Key for hero image lookup
}

/**
 * DRM (Dinner Rescue Mode) seed for panic meals
 */
export interface DrmSeed {
  id: string;
  name: string;
  vegetarian: boolean;
  allergens: AllergenTag[];
  constraints: ConstraintTag[];
  ingredients: Ingredient[];
  steps: string[];
  whyReasons: string[];
  estimatedTime: string;
  imageKey?: string; // Key for hero image lookup
}
