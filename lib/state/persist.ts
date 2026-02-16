/**
 * Fast Food Preferences Persistence
 * 
 * Lightweight AsyncStorage wrapper for persisting user preferences across app restarts.
 * Deal state (passCount, drmInserted, etc.) remains ephemeral and resets each session.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AllergenTag, ConstraintTag, Mode } from '../seeds/types';

// Versioned storage keys to allow future migrations
const STORAGE_VERSION = 'v1';
const KEYS = {
  selectedMode: `ff:${STORAGE_VERSION}:selectedMode`,
  constraints: `ff:${STORAGE_VERSION}:constraints`,
  excludeAllergens: `ff:${STORAGE_VERSION}:excludeAllergens`,
  hapticsEnabled: `ff:${STORAGE_VERSION}:hapticsEnabled`,
  hasSeenAffordance: `ff:${STORAGE_VERSION}:hasSeenAffordance`,
  idleAffordanceShownThisSession: `ff:${STORAGE_VERSION}:idleAffordanceShownThisSession`,
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
      KEYS.hapticsEnabled,
    ]);
  } catch (error) {
    // Log but don't throw
    console.warn('[persist] Failed to clear preferences:', error);
  }
}

// ---------------------------------------------------------------------------
// Haptics preference
// ---------------------------------------------------------------------------

/** Returns whether haptics are enabled. Safe fallback is true. */
export async function getHapticsEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.hapticsEnabled);
    if (raw === null) return true;
    return JSON.parse(raw) !== false;
  } catch {
    return true;
  }
}

/** Persist haptics preference. Storage failures are ignored. */
export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.hapticsEnabled, JSON.stringify(enabled));
  } catch {
    // No-op on persistence failure.
  }
}

// ---------------------------------------------------------------------------
// Affordance flag (first-run onboarding)
// ---------------------------------------------------------------------------

let idleAffordanceSessionBootstrapped = false;

export type IdleAffordanceSessionState = {
  shownThisSession: boolean;
};

async function bootstrapIdleAffordanceSession(): Promise<void> {
  if (idleAffordanceSessionBootstrapped) return;
  idleAffordanceSessionBootstrapped = true;
  try {
    await AsyncStorage.setItem(KEYS.idleAffordanceShownThisSession, JSON.stringify(false));
  } catch {
    // Ignore storage failures; callers use safe fallbacks.
  }
}

export async function getIdleAffordanceSessionState(): Promise<IdleAffordanceSessionState> {
  try {
    await bootstrapIdleAffordanceSession();
    const raw = await AsyncStorage.getItem(KEYS.idleAffordanceShownThisSession);
    if (!raw) return { shownThisSession: false };
    return { shownThisSession: JSON.parse(raw) === true };
  } catch {
    return { shownThisSession: false };
  }
}

export async function setIdleAffordanceShownThisSession(v: boolean): Promise<void> {
  try {
    await bootstrapIdleAffordanceSession();
    await AsyncStorage.setItem(KEYS.idleAffordanceShownThisSession, JSON.stringify(v));
  } catch {
    // No-op on persistence failure.
  }
}

/**
 * Check if user has seen the idle affordance. Default false.
 */
export async function getHasSeenAffordance(): Promise<boolean> {
  const { shownThisSession } = await getIdleAffordanceSessionState();
  return shownThisSession;
}

/**
 * Mark that user has seen (or interacted before) the idle affordance.
 * Once set, the affordance never fires again.
 */
export async function setHasSeenAffordance(): Promise<void> {
  await setIdleAffordanceShownThisSession(true);
}

/**
 * Export keys for testing purposes
 */
export const STORAGE_KEYS = KEYS;
