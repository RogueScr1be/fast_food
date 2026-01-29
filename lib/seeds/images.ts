/**
 * Recipe Image Registry
 * 
 * Centralized image source management for recipe cards.
 * All require() calls live here to avoid Metro bundler issues.
 * 
 * To add new images:
 * 1. Add image file to assets/recipes/
 * 2. Add require() to RECIPE_IMAGES with matching key
 * 3. Set imageKey in recipes.ts to match
 */

import { ImageSourcePropType } from 'react-native';

/**
 * Default placeholder image when no specific image is available.
 * Uses app icon as fallback - replace with a proper food placeholder later.
 */
const DEFAULT_IMAGE = require('../../assets/icon.png');

/**
 * Recipe image registry.
 * Keys match imageKey values in RecipeSeed and DrmSeed.
 * 
 * When adding real images:
 * - Use 800x600 or similar 4:3 aspect ratio
 * - Optimize for mobile (< 200KB per image)
 * - Use jpg for photos, png for graphics
 */
export const RECIPE_IMAGES: Record<string, ImageSourcePropType> = {
  // Fancy recipes
  'salmon': DEFAULT_IMAGE,
  'risotto': DEFAULT_IMAGE,
  'steak': DEFAULT_IMAGE,
  'scampi': DEFAULT_IMAGE,
  'chicken-marsala': DEFAULT_IMAGE,
  'ratatouille': DEFAULT_IMAGE,
  
  // Easy recipes
  'stir-fry': DEFAULT_IMAGE,
  'pasta-marinara': DEFAULT_IMAGE,
  'quesadillas': DEFAULT_IMAGE,
  'fried-rice': DEFAULT_IMAGE,
  'caprese-salad': DEFAULT_IMAGE,
  'sheet-pan-chicken': DEFAULT_IMAGE,
  
  // Cheap recipes
  'beans-rice': DEFAULT_IMAGE,
  'ramen-upgrade': DEFAULT_IMAGE,
  'potato-soup': DEFAULT_IMAGE,
  'egg-fried-rice': DEFAULT_IMAGE,
  'veggie-curry': DEFAULT_IMAGE,
  'pasta-aglio': DEFAULT_IMAGE,
  
  // DRM (Dinner Rescue Mode) meals
  'cereal': DEFAULT_IMAGE,
  'toast-pb': DEFAULT_IMAGE,
  'grilled-cheese': DEFAULT_IMAGE,
  'instant-noodles': DEFAULT_IMAGE,
  'crackers-cheese': DEFAULT_IMAGE,
  'yogurt-granola': DEFAULT_IMAGE,
  'banana-pb': DEFAULT_IMAGE,
  'chips-salsa': DEFAULT_IMAGE,
  'soup-can': DEFAULT_IMAGE,
  'sandwich': DEFAULT_IMAGE,
  'frozen-pizza': DEFAULT_IMAGE,
  'oatmeal': DEFAULT_IMAGE,
};

/**
 * Get image source for a recipe by key.
 * Returns default placeholder if key is missing or not found.
 * 
 * @param imageKey - Key from RecipeSeed or DrmSeed
 * @returns ImageSourcePropType for use with Image component
 */
export function getImageSource(imageKey?: string): ImageSourcePropType {
  if (!imageKey) {
    return DEFAULT_IMAGE;
  }
  return RECIPE_IMAGES[imageKey] ?? DEFAULT_IMAGE;
}

/**
 * Check if a real image exists for a key (not just default).
 * Useful for conditional rendering when we have mixed real/placeholder images.
 */
export function hasRealImage(imageKey?: string): boolean {
  if (!imageKey) return false;
  const source = RECIPE_IMAGES[imageKey];
  // For now, all are DEFAULT_IMAGE, so return false
  // When real images are added, this will return true for those
  return source !== DEFAULT_IMAGE;
}

/**
 * Default export for convenience
 */
export default {
  getImageSource,
  hasRealImage,
  RECIPE_IMAGES,
};
