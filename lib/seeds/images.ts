/**
 * Recipe Image Registry
 * 
 * Centralized image source management for recipe cards.
 * All require() calls live here to avoid Metro bundler issues.
 * 
 * To add new images:
 * 1. Add image file to assets/recipes/<key>.jpg
 * 2. Add require() to RECIPE_IMAGES with matching key
 * 3. Set imageKey in recipes.ts to match
 */

import { ImageSourcePropType } from 'react-native';

/**
 * Default fallback image - a calm neutral gradient.
 * 800x600 PNG, ~73KB - intentionally minimal for fast loading.
 * Used when a specific recipe image is not available.
 */
const FALLBACK_IMAGE = require('../../assets/recipes/_fallback.png');

/**
 * Recipe image registry.
 * Keys match imageKey values in RecipeSeed and DrmSeed.
 * 
 * All images:
 * - ~1024x1024 or similar aspect ratio
 * - Optimized for mobile (< 200KB per image)
 * - JPG format for photos
 */
export const RECIPE_IMAGES: Record<string, ImageSourcePropType> = {
  // Fancy recipes
  'salmon': require('../../assets/recipes/salmon.jpg'),
  'risotto': require('../../assets/recipes/risotto.jpg'),
  'steak': require('../../assets/recipes/steak.jpg'),
  'scampi': require('../../assets/recipes/scampi.jpg'),
  'chicken-marsala': require('../../assets/recipes/chicken-marsala.jpg'),
  'ratatouille': require('../../assets/recipes/ratatouille.jpg'),
  
  // Easy recipes
  'stir-fry': require('../../assets/recipes/stir-fry.jpg'),
  'pasta-marinara': require('../../assets/recipes/pasta-marinara.jpg'),
  'quesadillas': require('../../assets/recipes/quesadillas.jpg'),
  'fried-rice': require('../../assets/recipes/fried-rice.jpg'),
  'caprese-salad': require('../../assets/recipes/caprese-salad.jpg'),
  'sheet-pan-chicken': require('../../assets/recipes/sheet-pan-chicken.jpg'),
  
  // Cheap recipes
  'beans-rice': require('../../assets/recipes/beans-rice.jpg'),
  'ramen-upgrade': require('../../assets/recipes/ramen-upgrade.jpg'),
  'potato-soup': require('../../assets/recipes/potato-soup.jpg'),
  'egg-fried-rice': require('../../assets/recipes/egg-fried-rice.jpg'),
  'veggie-curry': require('../../assets/recipes/veggie-curry.jpg'),
  'pasta-aglio': require('../../assets/recipes/pasta-aglio.jpg'),
  
  // DRM (Dinner Rescue Mode) meals
  'cereal': require('../../assets/recipes/cereal.jpg'),
  'toast-pb': require('../../assets/recipes/toast-pb.jpg'),
  'grilled-cheese': require('../../assets/recipes/grilled-cheese.jpg'),
  'instant-noodles': require('../../assets/recipes/instant-noodles.jpg'),
  'crackers-cheese': require('../../assets/recipes/crackers-cheese.jpg'),
  'yogurt-granola': require('../../assets/recipes/yogurt-granola.jpg'),
  'banana-pb': require('../../assets/recipes/banana-pb.jpg'),
  'chips-salsa': require('../../assets/recipes/chips-salsa.jpg'),
  'soup-can': require('../../assets/recipes/soup-can.jpg'),
  'sandwich': require('../../assets/recipes/sandwich.jpg'),
  'frozen-pizza': require('../../assets/recipes/frozen-pizza.jpg'),
  'oatmeal': require('../../assets/recipes/oatmeal.jpg'),
};

/**
 * Get image source for a recipe by key.
 * Returns fallback placeholder if key is missing or not found.
 * 
 * @param imageKey - Key from RecipeSeed or DrmSeed
 * @returns ImageSourcePropType for use with Image component
 */
export function getImageSource(imageKey?: string): ImageSourcePropType {
  if (!imageKey) {
    return FALLBACK_IMAGE;
  }
  return RECIPE_IMAGES[imageKey] ?? FALLBACK_IMAGE;
}

/**
 * Check if a real image exists for a key (not just fallback).
 * Useful for conditional rendering when we have mixed real/placeholder images.
 */
export function hasRealImage(imageKey?: string): boolean {
  if (!imageKey) return false;
  // All keys now have real images wired via require()
  // Returns true if the key exists in the registry
  return imageKey in RECIPE_IMAGES;
}

/**
 * Default export for convenience
 */
export default {
  getImageSource,
  hasRealImage,
  RECIPE_IMAGES,
};
