/**
 * Recipe Image Registry
 *
 * Centralized image source management for recipe cards.
 * All require() calls live here to avoid Metro bundler issues.
 */

import { ImageSourcePropType } from 'react-native';

const FALLBACK_IMAGE = require('../../assets/recipes/_fallback.png');

export const RECIPE_IMAGES: Record<string, ImageSourcePropType> = {
  // FANCY (8 recipes)
  'salmon': require('../../assets/recipes/salmon.jpg'),
  'risotto': require('../../assets/recipes/risotto.jpg'),
  'chicken-herbs': require('../../assets/recipes/chicken-herbs.jpg'),
  'shrimp-scampi': require('../../assets/recipes/shrimp-scampi.jpg'),
  'beef-tenderloin': require('../../assets/recipes/beef-tenderloin.jpg'),
  'caprese': require('../../assets/recipes/caprese.jpg'),
  'scallops': require('../../assets/recipes/scallops.jpg'),
  'filet-mignon': require('../../assets/recipes/filet-mignon.jpg'),

  // EASY (8 recipes)
  'cheeseburger': require('../../assets/recipes/cheeseburger.jpg'),
  'pizza': require('../../assets/recipes/pizza.jpg'),
  'blt': require('../../assets/recipes/blt.jpg'),
  'mac-cheese': require('../../assets/recipes/mac-cheese.jpg'),
  'mashed-potatoes': require('../../assets/recipes/mashed-potatoes.jpg'),
  'tacos': require('../../assets/recipes/tacos.jpg'),
  'chili': require('../../assets/recipes/chili.jpg'),
  'french-fries': require('../../assets/recipes/french-fries.jpg'),

  // SWEET (5 recipes)
  'brownies': require('../../assets/recipes/brownies.jpg'),
  'apple-pie': require('../../assets/recipes/apple-pie.jpg'),
  'sundae': require('../../assets/recipes/sundae.jpg'),
  'cereal-bowl': require('../../assets/recipes/cereal-bowl.jpg'),
  'scrambled-eggs': require('../../assets/recipes/scrambled-eggs.jpg'),

  // RESCUE (12 meals)
  'rice-bowl': require('../../assets/recipes/rice-bowl.jpg'),
  'pasta-sauce': require('../../assets/recipes/pasta-sauce.jpg'),
  'quesadillas': require('../../assets/recipes/quesadillas.jpg'),
  'grilled-cheese': require('../../assets/recipes/grilled-cheese.jpg'),
  'frozen-pizza': require('../../assets/recipes/frozen-pizza.jpg'),
  'breakfast': require('../../assets/recipes/breakfast.jpg'),
  'chili-quick': require('../../assets/recipes/chili-quick.jpg'),
  'chicken-soup': require('../../assets/recipes/chicken-soup.jpg'),
  'leftover-soup': require('../../assets/recipes/leftover-soup.jpg'),
  'nachos': require('../../assets/recipes/nachos.jpg'),
  'ramen': require('../../assets/recipes/ramen.jpg'),
  'cereal-toast': require('../../assets/recipes/cereal-toast.jpg'),
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
