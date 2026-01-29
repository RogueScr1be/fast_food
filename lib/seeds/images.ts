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
 * Default fallback image - a calm neutral gradient.
 * 800x600 PNG, ~73KB - intentionally minimal for fast loading.
 * Replace individual recipe keys with real food photos as available.
 */
const FALLBACK_IMAGE = require('../../assets/recipes/_fallback.png');

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
  'salmon': FALLBACK_IMAGE,
  'risotto': FALLBACK_IMAGE,
  'steak': FALLBACK_IMAGE,
  'scampi': FALLBACK_IMAGE,
  'chicken-marsala': FALLBACK_IMAGE,
  'ratatouille': FALLBACK_IMAGE,
  
  // Easy recipes
  'stir-fry': FALLBACK_IMAGE,
  'pasta-marinara': FALLBACK_IMAGE,
  'quesadillas': FALLBACK_IMAGE,
  'fried-rice': FALLBACK_IMAGE,
  'caprese-salad': FALLBACK_IMAGE,
  'sheet-pan-chicken': FALLBACK_IMAGE,
  
  // Cheap recipes
  'beans-rice': FALLBACK_IMAGE,
  'ramen-upgrade': FALLBACK_IMAGE,
  'potato-soup': FALLBACK_IMAGE,
  'egg-fried-rice': FALLBACK_IMAGE,
  'veggie-curry': FALLBACK_IMAGE,
  'pasta-aglio': FALLBACK_IMAGE,
  
  // DRM (Dinner Rescue Mode) meals
  'cereal': FALLBACK_IMAGE,
  'toast-pb': FALLBACK_IMAGE,
  'grilled-cheese': FALLBACK_IMAGE,
  'instant-noodles': FALLBACK_IMAGE,
  'crackers-cheese': FALLBACK_IMAGE,
  'yogurt-granola': FALLBACK_IMAGE,
  'banana-pb': FALLBACK_IMAGE,
  'chips-salsa': FALLBACK_IMAGE,
  'soup-can': FALLBACK_IMAGE,
  'sandwich': FALLBACK_IMAGE,
  'frozen-pizza': FALLBACK_IMAGE,
  'oatmeal': FALLBACK_IMAGE,
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
  const source = RECIPE_IMAGES[imageKey];
  // For now, all are FALLBACK_IMAGE, so return false
  // When real images are added, this will return true for those
  return source !== FALLBACK_IMAGE;
}

/**
 * Default export for convenience
 */
export default {
  getImageSource,
  hasRealImage,
  RECIPE_IMAGES,
};
