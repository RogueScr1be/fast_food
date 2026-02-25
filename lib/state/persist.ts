// lib/state/persist.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AllergenTag, ConstraintTag, Mode } from '../seeds/types';

const KEY_PREFIX = 'ff:v1:';

function key(k: string) {
  return `${KEY_PREFIX}${k}`;
}

function safeArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

async function getJson<T>(k: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key(k));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function setJson(k: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key(k), JSON.stringify(value));
}

// -----------------------------------------------------------------------------
// Idle affordance (silent onboarding)
// -----------------------------------------------------------------------------
const HAS_SEEN_AFFORDANCE = 'hasSeenAffordance';

const SELECTED_MODE = 'selectedMode';
const CONSTRAINTS = 'constraints';
const EXCLUDE_ALLERGENS = 'excludeAllergens';

export interface Prefs {
  selectedMode: Mode | null;
  constraints: ConstraintTag[];
  excludeAllergens: AllergenTag[];
}

const VALID_MODES: Mode[] = ['fancy', 'easy', 'cheap'];
const VALID_ALLERGENS: AllergenTag[] = ['dairy', 'nuts', 'gluten', 'eggs', 'soy', 'shellfish'];
const VALID_CONSTRAINTS: ConstraintTag[] = ['no_oven', 'kid_safe', '15_min', 'vegetarian', 'no_dairy'];

function validateMode(value: unknown): Mode | null {
  if (typeof value === 'string' && VALID_MODES.includes(value as Mode)) {
    return value as Mode;
  }
  return null;
}

function validateAllergens(value: unknown): AllergenTag[] {
  return safeArray(value).filter(
    (v): v is AllergenTag => typeof v === 'string' && VALID_ALLERGENS.includes(v as AllergenTag),
  );
}

function validateConstraints(value: unknown): ConstraintTag[] {
  return safeArray(value).filter(
    (v): v is ConstraintTag =>
      typeof v === 'string' && VALID_CONSTRAINTS.includes(v as ConstraintTag),
  );
}

export async function loadPrefs(): Promise<Prefs> {
  const [selectedMode, constraints, excludeAllergens] = await Promise.all([
    getJson<unknown>(SELECTED_MODE, null),
    getJson<unknown>(CONSTRAINTS, []),
    getJson<unknown>(EXCLUDE_ALLERGENS, []),
  ]);

  return {
    selectedMode: validateMode(selectedMode),
    constraints: validateConstraints(constraints),
    excludeAllergens: validateAllergens(excludeAllergens),
  };
}

export async function savePrefs(prefs: Partial<Prefs>): Promise<void> {
  const writes: Promise<void>[] = [];
  if (Object.prototype.hasOwnProperty.call(prefs, 'selectedMode')) {
    writes.push(setJson(SELECTED_MODE, prefs.selectedMode ?? null));
  }
  if (Object.prototype.hasOwnProperty.call(prefs, 'constraints')) {
    writes.push(setJson(CONSTRAINTS, prefs.constraints ?? []));
  }
  if (Object.prototype.hasOwnProperty.call(prefs, 'excludeAllergens')) {
    writes.push(setJson(EXCLUDE_ALLERGENS, prefs.excludeAllergens ?? []));
  }
  await Promise.all(writes);
}

export async function clearPrefs(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(key(SELECTED_MODE)),
    AsyncStorage.removeItem(key(CONSTRAINTS)),
    AsyncStorage.removeItem(key(EXCLUDE_ALLERGENS)),
  ]);
}

export async function getHasSeenAffordance(): Promise<boolean> {
  return getJson<boolean>(HAS_SEEN_AFFORDANCE, false);
}

export async function setHasSeenAffordance(v: boolean): Promise<void> {
  await setJson(HAS_SEEN_AFFORDANCE, v);
}

// -----------------------------------------------------------------------------
// Phase 3.1 feedback (kept intact if you’re still using it)
// -----------------------------------------------------------------------------
export type FeedbackRating = -1 | 0 | 1;

export type FeedbackEntry = {
  mealId: string;
  rating: FeedbackRating;
  timestamp: number;
  // optional metadata for future learning loop
  mode?: 'fancy' | 'easy' | 'cheap';
  isRescue?: boolean;
  source?: string;
};

const LAST_COMPLETED = 'lastCompleted';
const FEEDBACK_LOG = 'feedbackLog';

export async function getLastCompleted(): Promise<{ mealId: string; completedAt: number } | null> {
  return getJson<{ mealId: string; completedAt: number } | null>(LAST_COMPLETED, null);
}

export async function setLastCompleted(mealId: string, completedAt: number): Promise<void> {
  await setJson(LAST_COMPLETED, { mealId, completedAt });
}

export async function clearLastCompleted(): Promise<void> {
  await AsyncStorage.removeItem(key(LAST_COMPLETED));
}

export async function getFeedbackLog(): Promise<FeedbackEntry[]> {
  return getJson<FeedbackEntry[]>(FEEDBACK_LOG, []);
}

export async function appendFeedback(entry: FeedbackEntry): Promise<void> {
  const log = await getFeedbackLog();
  // idempotent by mealId (one rating per meal)
  if (log.some(e => e.mealId === entry.mealId)) return;
  log.push(entry);
  await setJson(FEEDBACK_LOG, log);
}
