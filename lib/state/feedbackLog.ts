/**
 * Feedback Log — Completion tracking + meal satisfaction logging
 *
 * AsyncStorage-backed, append-only feedback log.
 * Two storage keys:
 *   ff:v1:lastCompleted — latest meal completion (survives restart)
 *   ff:v1:feedbackLog   — array of feedback entries (append-only)
 *
 * Never throws. All errors are caught and logged.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const KEYS = {
  lastCompleted: 'ff:v1:lastCompleted',
  feedbackLog: 'ff:v1:feedbackLog',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompletedMeal {
  mealId: string;
  completedAt: number; // Date.now() timestamp
}

export type FeedbackRating = -1 | 0 | 1;

export interface FeedbackEntry {
  mealId: string;
  rating: FeedbackRating;
  timestamp: number;
}

/** 4 hours in milliseconds */
const FEEDBACK_DELAY_MS = 4 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Last Completed Meal
// ---------------------------------------------------------------------------

/**
 * Record that a meal was completed. Call from checklist/rescue Done.
 */
export async function recordCompletion(mealId: string): Promise<void> {
  try {
    const data: CompletedMeal = { mealId, completedAt: Date.now() };
    await AsyncStorage.setItem(KEYS.lastCompleted, JSON.stringify(data));
  } catch (error) {
    console.warn('[feedbackLog] Failed to record completion:', error);
  }
}

/**
 * Get the last completed meal, or null if none.
 */
export async function getLastCompleted(): Promise<CompletedMeal | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.lastCompleted);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.mealId === 'string' && typeof parsed.completedAt === 'number') {
      return parsed as CompletedMeal;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear the last completed meal (after feedback is logged or dismissed).
 */
export async function clearLastCompleted(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.lastCompleted);
  } catch {
    // Silent
  }
}

// ---------------------------------------------------------------------------
// Feedback Log
// ---------------------------------------------------------------------------

/**
 * Get all feedback entries.
 */
export async function getFeedbackLog(): Promise<FeedbackEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.feedbackLog);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

/**
 * Check if feedback has already been logged for a given mealId.
 */
export async function hasFeedbackFor(mealId: string): Promise<boolean> {
  const log = await getFeedbackLog();
  return log.some(entry => entry.mealId === mealId);
}

/**
 * Append a feedback entry. Idempotent — won't duplicate for same mealId.
 */
export async function logFeedback(
  mealId: string,
  rating: FeedbackRating,
): Promise<void> {
  try {
    const log = await getFeedbackLog();
    // Don't duplicate
    if (log.some(e => e.mealId === mealId)) return;

    log.push({ mealId, rating, timestamp: Date.now() });
    await AsyncStorage.setItem(KEYS.feedbackLog, JSON.stringify(log));
    // Clear completion after logging so prompt doesn't reappear
    await clearLastCompleted();
  } catch (error) {
    console.warn('[feedbackLog] Failed to log feedback:', error);
  }
}

// ---------------------------------------------------------------------------
// Eligibility Check
// ---------------------------------------------------------------------------

/**
 * Check if a feedback prompt should be shown.
 * Returns the mealId if eligible, null otherwise.
 *
 * Eligible when:
 *   - A completed meal exists
 *   - completedAt was 4+ hours ago
 *   - No feedback has been logged for that mealId
 */
export async function checkFeedbackEligibility(): Promise<string | null> {
  const completed = await getLastCompleted();
  if (!completed) return null;

  const elapsed = Date.now() - completed.completedAt;
  if (elapsed < FEEDBACK_DELAY_MS) return null;

  const alreadyLogged = await hasFeedbackFor(completed.mealId);
  if (alreadyLogged) {
    // Clean up stale completion
    await clearLastCompleted();
    return null;
  }

  return completed.mealId;
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export const STORAGE_KEYS = KEYS;
export const FEEDBACK_DELAY = FEEDBACK_DELAY_MS;
