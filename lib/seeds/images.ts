/**
 * Recipe Image Registry
 *
 * Centralized image source management for recipe cards.
 * All require() calls live here to avoid Metro bundler issues.
 */

import { ImageSourcePropType } from 'react-native';

const FALLBACK_IMAGE = require('../../assets/recipes/_fallback.png');

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
  // DRM meals
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

// ---------------------------------------------------------------------------
// Warn-once tracking (module-level, reset on app restart)
// ---------------------------------------------------------------------------

const warnedKeys = new Set<string>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Check if an image key exists in the registry. */
export function hasImageKey(imageKey: string): boolean {
  return imageKey in RECIPE_IMAGES;
}

/**
 * Get image source by key. Returns fallback if missing.
 * Does NOT warn — use getImageSourceSafe for warnings.
 */
export function getImageSource(imageKey?: string): ImageSourcePropType {
  if (!imageKey) return FALLBACK_IMAGE;
  return RECIPE_IMAGES[imageKey] ?? FALLBACK_IMAGE;
}

/**
 * Get image source with warn-once policy for missing keys.
 * Logs [IMAGE_MISSING] with context on first occurrence per key.
 */
export function getImageSourceSafe(opts: {
  imageKey?: string;
  recipeId: string;
  mode?: string;
  isRescue?: boolean;
}): ImageSourcePropType {
  const { imageKey, recipeId, mode, isRescue } = opts;

  if (!imageKey) {
    const warnKey = `${recipeId}:__empty__`;
    if (!warnedKeys.has(warnKey)) {
      warnedKeys.add(warnKey);
      console.warn('[IMAGE_MISSING] No imageKey defined', { recipeId, mode, isRescue });
    }
    return FALLBACK_IMAGE;
  }

  if (!(imageKey in RECIPE_IMAGES)) {
    const warnKey = `${recipeId}:${imageKey}`;
    if (!warnedKeys.has(warnKey)) {
      warnedKeys.add(warnKey);
      console.warn('[IMAGE_MISSING] imageKey not found in registry', {
        recipeId,
        imageKey,
        mode,
        isRescue,
      });
    }
    return FALLBACK_IMAGE;
  }

  return RECIPE_IMAGES[imageKey];
}

/** Check if a real image exists (not fallback). Alias for hasImageKey. */
export function hasRealImage(imageKey?: string): boolean {
  if (!imageKey) return false;
  return imageKey in RECIPE_IMAGES;
}

export default { getImageSource, getImageSourceSafe, hasImageKey, hasRealImage, RECIPE_IMAGES };
