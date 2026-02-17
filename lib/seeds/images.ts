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
const imagePairingCounters = new Map<string, number>();

type ImagePairingPhase = 'resolve' | 'prefetch' | 'render';

interface ImagePairingEvent {
  recipeId: string;
  imageKey?: string;
  mode?: string;
  screen?: string;
  phase?: ImagePairingPhase;
  isRescue?: boolean;
  reason: 'missing_key' | 'unknown_key' | 'dev_assert';
}

function getEventCounterKey(event: ImagePairingEvent): string {
  return [
    event.reason,
    event.recipeId,
    event.imageKey ?? '__empty__',
    event.screen ?? 'unknown',
    event.phase ?? 'resolve',
  ].join(':');
}

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
  screen?: string;
  phase?: ImagePairingPhase;
}): ImageSourcePropType {
  const { imageKey, recipeId, mode, isRescue, screen, phase } = opts;

  if (!imageKey) {
    recordImagePairingEvent({
      recipeId,
      imageKey,
      mode,
      isRescue,
      screen,
      phase,
      reason: 'missing_key',
    });
    return FALLBACK_IMAGE;
  }

  if (!(imageKey in RECIPE_IMAGES)) {
    recordImagePairingEvent({
      recipeId,
      imageKey,
      mode,
      isRescue,
      screen,
      phase,
      reason: 'unknown_key',
    });
    return FALLBACK_IMAGE;
  }

  return RECIPE_IMAGES[imageKey];
}

/** Check if a real image exists (not fallback). Alias for hasImageKey. */
export function hasRealImage(imageKey?: string): boolean {
  if (!imageKey) return false;
  return imageKey in RECIPE_IMAGES;
}

export function recordImagePairingEvent(event: ImagePairingEvent): void {
  const countKey = getEventCounterKey(event);
  const nextCount = (imagePairingCounters.get(countKey) ?? 0) + 1;
  imagePairingCounters.set(countKey, nextCount);

  const warnKey = `${countKey}:${event.mode ?? 'none'}:${event.isRescue ? 'rescue' : 'default'}`;
  if (!warnedKeys.has(warnKey)) {
    warnedKeys.add(warnKey);
    console.warn('[IMAGE_PAIRING_WARNING]', { ...event, count: nextCount });
  }
}

export function assertImageKeyConsistency(
  recipeId: string,
  imageKey?: string,
  context?: Omit<ImagePairingEvent, 'recipeId' | 'imageKey' | 'reason'>,
): boolean {
  if (imageKey && imageKey in RECIPE_IMAGES) return true;
  if (__DEV__) {
    recordImagePairingEvent({
      recipeId,
      imageKey,
      mode: context?.mode,
      screen: context?.screen ?? 'unknown',
      phase: context?.phase ?? 'resolve',
      isRescue: context?.isRescue,
      reason: 'dev_assert',
    });
  }
  return false;
}

export default {
  getImageSource,
  getImageSourceSafe,
  hasImageKey,
  hasRealImage,
  RECIPE_IMAGES,
  assertImageKeyConsistency,
  recordImagePairingEvent,
};
