/**
 * Persisted user preferences + one-shot flags.
 *
 * Rules:
 * - Single AsyncStorage import (no duplicates).
 * - Backward compatible parsing (missing keys -> defaults).
 * - Validation is defensive (unknown tags are dropped).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AllergenTag, ConstraintTag } from '../seeds/types';

export type PrefsSchemaV1 = {
  excludeAllergens: AllergenTag[];
  constraints: ConstraintTag[];
};

export const STORAGE_KEYS = {
  prefs: 'ff:v1:prefs',
  hasSeenAffordance: 'ff:v1:hasSeenAffordance',
} as const;

const DEFAULT_PREFS: PrefsSchemaV1 = {
  excludeAllergens: [],
  constraints: [],
};

const ALLERGEN_SET = new Set<AllergenTag>([
  'dairy',
  'nuts',
  'gluten',
  'eggs',
  'soy',
  'shellfish',
]);

const CONSTRAINT_SET = new Set<ConstraintTag>([
  'vegetarian',
  'no_dairy',
  '15_min',
  'no_oven',
  'kid_safe',
]);

function isAllergenTag(x: unknown): x is AllergenTag {
  return typeof x === 'string' && ALLERGEN_SET.has(x as AllergenTag);
}

function isConstraintTag(x: unknown): x is ConstraintTag {
  return typeof x === 'string' && CONSTRAINT_SET.has(x as ConstraintTag);
}

function safeArray<T>(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function parsePrefs(raw: string | null): PrefsSchemaV1 {
  if (!raw) return DEFAULT_PREFS;

  try {
    const obj = JSON.parse(raw) as Partial<PrefsSchemaV1> | null;

    const excludeAllergens = safeArray(obj?.excludeAllergens)
      .filter(isAllergenTag) as AllergenTag[];

    const constraints = safeArray(obj?.constraints)
      .filter(isConstraintTag) as ConstraintTag[];

    return { excludeAllergens, constraints };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function loadPrefs(): Promise<PrefsSchemaV1> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.prefs);
  return parsePrefs(raw);
}

export async function savePrefs(prefs: PrefsSchemaV1): Promise<void> {
  // Defensive sanitize on write too.
  const cleaned: PrefsSchemaV1 = {
    excludeAllergens: safeArray(prefs?.excludeAllergens).filter(isAllergenTag) as AllergenTag[],
    constraints: safeArray(prefs?.constraints).filter(isConstraintTag) as ConstraintTag[],
  };

  await AsyncStorage.setItem(STORAGE_KEYS.prefs, JSON.stringify(cleaned));
}

export async function clearPrefs(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.prefs);
}

/**
 * One-shot idle affordance flag
 * - Missing -> false
 * - Stored as "true"/"false" string for simplicity
 */
export async function getHasSeenAffordance(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.hasSeenAffordance);
  return raw === 'true';
}

export async function setHasSeenAffordance(value: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.hasSeenAffordance, value ? 'true' : 'false');
}
