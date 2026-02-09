/**
 * Fast Food Preferences Persistence
 * 
 * Lightweight AsyncStorage wrapper for persisting user preferences across app restarts.
 * Deal state (passCount, drmInserted, etc.) remains ephemeral and resets each session.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AllergenTag, ConstraintTag, Mode } from '../seeds/types';

// lib/state/persist.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_HAS_SEEN_AFFORDANCE = 'ff:v1:hasSeenAffordance';

export async function getHasSeenAffordance(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY_HAS_SEEN_AFFORDANCE);
    return raw === 'true';
  } catch {
    return false;
  }
}

export async function setHasSeenAffordance(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_HAS_SEEN_AFFORDANCE, value ? 'true' : 'false');
  } catch {
    // no-op
  }
}

// Versioned storage keys to allow future migrations
const STORAGE_VERSION = 'v1';
const KEYS = {
  selectedMode: `ff:${STORAGE_VERSION}:selectedMode`,
  constraints: `ff:${STORAGE_VERSION}:constraints`,
  excludeAllergens: `ff:${STORAGE_VERSION}:excludeAllergens`,
  hasSeenAffordance: `ff:${STORAGE_VERSION}:hasSeenAffordance`,
} as const;

/**
 * User preferences that persist across app restarts
 */
export interface Prefs {
  selectedMode: Mode | null;
  constraints: ConstraintTag[];
  excludeAllergens: AllergenTag[];
}

// Valid values for validation
const VALID_MODES: Mode[] = ['fancy', 'easy', 'cheap'];
const VALID_ALLERGENS: AllergenTag[] = ['dairy', 'nuts', 'gluten', 'eggs', 'soy', 'shellfish'];
const VALID_CONSTRAINTS: ConstraintTag[] = ['no_oven', 'kid_safe', '15_min', 'vegetarian', 'no_dairy'];

/**
 * Default preferences (used when storage is empty or invalid)
 */
export const DEFAULT_PREFS: Prefs = {
  selectedMode: null,
  constraints: [],
  excludeAllergens: [],
};

/**
 * Validate and filter mode value
 */
function validateMode(value: unknown): Mode | null {
  if (typeof value === 'string' && VALID_MODES.includes(value as Mode)) {
    return value as Mode;
  }
  return null;
}

/**
 * Validate and filter allergen tags (drops unknown values)
 */
function validateAllergens(value: unknown): AllergenTag[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is AllergenTag => 
    typeof v === 'string' && VALID_ALLERGENS.includes(v as AllergenTag)
  );
}

/**
 * Validate and filter constraint tags (drops unknown values)
 */
function validateConstraints(value: unknown): ConstraintTag[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is ConstraintTag => 
    typeof v === 'string' && VALID_CONSTRAINTS.includes(v as ConstraintTag)
  );
}

/**
 * Load persisted preferences from AsyncStorage.
 * Returns defaults on any error or missing data.
 * Never throws.
 */
export async function loadPrefs(): Promise<Prefs> {
  try {
    const [modeJson, constraintsJson, allergensJson] = await Promise.all([
      AsyncStorage.getItem(KEYS.selectedMode),
      AsyncStorage.getItem(KEYS.constraints),
      AsyncStorage.getItem(KEYS.excludeAllergens),
    ]);

    // Parse and validate each field
    const selectedMode = modeJson !== null 
      ? validateMode(JSON.parse(modeJson)) 
      : null;
    
    const constraints = constraintsJson !== null 
      ? validateConstraints(JSON.parse(constraintsJson)) 
      : [];
    
    const excludeAllergens = allergensJson !== null 
      ? validateAllergens(JSON.parse(allergensJson)) 
      : [];

    return {
      selectedMode,
      constraints,
      excludeAllergens,
    };
  } catch (error) {
    // Log but don't throw - return defaults
    console.warn('[persist] Failed to load preferences:', error);
    return { ...DEFAULT_PREFS };
  }
}

/**
 * Save preferences to AsyncStorage.
 * Partial updates supported - only saves provided fields.
 * Never throws.
 */
export async function savePrefs(prefs: Partial<Prefs>): Promise<void> {
  try {
    const updates: Promise<void>[] = [];

    if (prefs.selectedMode !== undefined) {
      updates.push(
        AsyncStorage.setItem(KEYS.selectedMode, JSON.stringify(prefs.selectedMode))
      );
    }

    if (prefs.constraints !== undefined) {
      updates.push(
        AsyncStorage.setItem(KEYS.constraints, JSON.stringify(prefs.constraints))
      );
    }

    if (prefs.excludeAllergens !== undefined) {
      updates.push(
        AsyncStorage.setItem(KEYS.excludeAllergens, JSON.stringify(prefs.excludeAllergens))
      );
    }

    await Promise.all(updates);
  } catch (error) {
    // Log but don't throw
    console.warn('[persist] Failed to save preferences:', error);
  }
}

/**
 * Clear all persisted preferences.
 * Used by "Reset All" flow.
 * Never throws.
 */
export async function clearPrefs(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      KEYS.selectedMode,
      KEYS.constraints,
      KEYS.excludeAllergens,
    ]);
  } catch (error) {
    // Log but don't throw
    console.warn('[persist] Failed to clear preferences:', error);
  }
}

// ---------------------------------------------------------------------------
// Affordance flag (first-run onboarding)
// ---------------------------------------------------------------------------

/**
 * Check if user has seen the idle affordance. Default false.
 */
export async function getHasSeenAffordance(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(KEYS.hasSeenAffordance);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark that user has seen (or interacted before) the idle affordance.
 * Once set, the affordance never fires again.
 */
export async function setHasSeenAffordance(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.hasSeenAffordance, 'true');
  } catch {
    // Silent — non-critical
  }
}

/**
 * Export keys for testing purposes
 */
export const STORAGE_KEYS = KEYS;
