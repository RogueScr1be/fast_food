// lib/state/persist.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

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
