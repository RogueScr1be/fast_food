/**
 * Fast Food Session State
 * 
 * Simple module singleton for storing session state across Phase 1–6.
 * Persisted prefs: selectedMode, constraints, excludeAllergens
 * Ephemeral state: passCount, dealHistory, currentDealId, drmInserted, dealStartMs
 */

import type { AllergenTag, ConstraintTag, Mode } from '../seeds/types';
import { loadPrefs, savePrefs, clearPrefs } from './persist';

// DRM trigger constants
export const DRM_PASS_THRESHOLD = 3;
export const DRM_TIME_THRESHOLD_MS = 45000; // 45 seconds

interface FFSessionState {
  selectedMode: Mode | null;
  excludeAllergens: AllergenTag[];
  constraints: ConstraintTag[];
  sessionStartTime: number | null; // When the current "Tonight" session began (set by resetTonight)
  // Phase 2: Deal tracking (ephemeral)
  passCount: number;
  dealHistory: string[]; // Recipe IDs shown this session
  currentDealId: string | null;
  // Phase 3: DRM tracking (ephemeral)
  drmInserted: boolean;
  dealStartMs: number | null; // When dealing started (for 45s timer)
}

// Module-level state (singleton)
let state: FFSessionState = {
  selectedMode: null,
  excludeAllergens: [],
  constraints: [],
  sessionStartTime: null,
  passCount: 0,
  dealHistory: [],
  currentDealId: null,
  drmInserted: false,
  dealStartMs: null,
};

// Hydration tracking
let hydrated = false;
let hydratingPromise: Promise<void> | null = null;

// Subscribers for reactive updates
type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach(listener => listener());
}

// ============================================
// HYDRATION
// ============================================

/**
 * Check if session state has been hydrated from storage
 */
export function isHydrated(): boolean {
  return hydrated;
}

/**
 * Load persisted preferences from storage and update state.
 * Call once on app launch (e.g., in root layout).
 * Safe to call multiple times - only hydrates once.
 * Concurrency-safe: concurrent calls return the same promise.
 * 
 * IMPORTANT: Will NOT overwrite state if user/flow has already set values
 * (e.g., Deal screen's random-mode fallback). This prevents race conditions.
 */
export async function hydrateFromStorage(): Promise<void> {
  if (hydrated) return;
  if (hydratingPromise) return hydratingPromise;

  hydratingPromise = (async () => {
    try {
      const prefs = await loadPrefs();

      // Guard: only apply persisted prefs if state is still at defaults
      // This prevents hydration from clobbering live state set by user/flow
      const stateIsDefault =
        state.selectedMode === null &&
        state.constraints.length === 0 &&
        state.excludeAllergens.length === 0;

      if (stateIsDefault) {
        state.selectedMode = prefs.selectedMode;
        state.constraints = [...prefs.constraints];
        state.excludeAllergens = [...prefs.excludeAllergens];
        notifyListeners();
      }

      hydrated = true;
    } catch (error) {
      // Mark as hydrated even on error to prevent retry loops
      hydrated = true;
      console.warn('[ffSession] Hydration failed:', error);
    } finally {
      hydratingPromise = null;
    }
  })();

  return hydratingPromise;
}

// ============================================
// GETTERS
// ============================================

export function getSelectedMode(): Mode | null {
  return state.selectedMode;
}

export function getExcludeAllergens(): AllergenTag[] {
  return [...state.excludeAllergens];
}

export function getConstraints(): ConstraintTag[] {
  return [...state.constraints];
}

export function getSessionStartTime(): number | null {
  return state.sessionStartTime;
}

export function getPassCount(): number {
  return state.passCount;
}

export function getDealHistory(): string[] {
  return [...state.dealHistory];
}

export function getCurrentDealId(): string | null {
  return state.currentDealId;
}

export function getDrmInserted(): boolean {
  return state.drmInserted;
}

export function getDealStartMs(): number | null {
  return state.dealStartMs;
}

export function getSessionState(): Readonly<FFSessionState> {
  return { ...state };
}

// ============================================
// SETTERS
// ============================================

export function setSelectedMode(mode: Mode | null): void {
  state.selectedMode = mode;
  // Persist preference
  savePrefs({ selectedMode: mode });
  notifyListeners();
}

export function setExcludeAllergens(allergens: AllergenTag[]): void {
  state.excludeAllergens = [...allergens];
  // Persist preference
  savePrefs({ excludeAllergens: allergens });
  notifyListeners();
}

export function addExcludeAllergen(allergen: AllergenTag): void {
  if (!state.excludeAllergens.includes(allergen)) {
    state.excludeAllergens = [...state.excludeAllergens, allergen];
    // Persist preference
    savePrefs({ excludeAllergens: state.excludeAllergens });
    notifyListeners();
  }
}

export function removeExcludeAllergen(allergen: AllergenTag): void {
  state.excludeAllergens = state.excludeAllergens.filter(a => a !== allergen);
  // Persist preference
  savePrefs({ excludeAllergens: state.excludeAllergens });
  notifyListeners();
}

export function setConstraints(constraints: ConstraintTag[]): void {
  state.constraints = [...constraints];
  // Persist preference
  savePrefs({ constraints });
  notifyListeners();
}

export function toggleConstraint(constraint: ConstraintTag): void {
  if (state.constraints.includes(constraint)) {
    state.constraints = state.constraints.filter(c => c !== constraint);
  } else {
    state.constraints = [...state.constraints, constraint];
  }
  // Persist preference
  savePrefs({ constraints: state.constraints });
  notifyListeners();
}

export function setCurrentDealId(id: string | null): void {
  state.currentDealId = id;
  notifyListeners();
}

export function incrementPassCount(): void {
  state.passCount++;
  notifyListeners();
}

export function addToDealHistory(recipeId: string): void {
  if (!state.dealHistory.includes(recipeId)) {
    state.dealHistory = [...state.dealHistory, recipeId];
  }
  notifyListeners();
}

export function setDrmInserted(value: boolean): void {
  state.drmInserted = value;
  notifyListeners();
}

/**
 * Mark the start of deal session (for 45s timer)
 */
export function markDealStart(): void {
  if (state.dealStartMs === null) {
    state.dealStartMs = Date.now();
    notifyListeners();
  }
}

// ============================================
// DRM TRIGGER LOGIC
// ============================================

/**
 * Check if DRM should be triggered.
 * Pure function - does not modify state.
 * 
 * @param passCount - Current pass count
 * @param elapsedMs - Milliseconds since deal started
 * @returns true if DRM should be inserted
 */
export function shouldTriggerDrm(passCount: number, elapsedMs: number): boolean {
  return passCount >= DRM_PASS_THRESHOLD || elapsedMs >= DRM_TIME_THRESHOLD_MS;
}

/**
 * Get elapsed time since deal started
 */
export function getElapsedDealTimeMs(): number {
  if (state.dealStartMs === null) return 0;
  return Date.now() - state.dealStartMs;
}

// ============================================
// RESET
// ============================================

/**
 * Reset deal state only (keep mode + allergens + constraints, restart dealing).
 * Use this for "Shuffle again" or after completing a meal.
 * Persisted prefs remain unchanged.
 */
export function resetTonight(): void {
  state.passCount = 0;
  state.dealHistory = [];
  state.currentDealId = null;
  state.drmInserted = false;
  state.dealStartMs = null;
  state.sessionStartTime = Date.now();
  notifyListeners();
}

/**
 * Alias for resetTonight() for backward compatibility
 * @deprecated Use resetTonight() instead
 */
export function resetDealState(): void {
  resetTonight();
}

/**
 * Full session reset (back to mode selection).
 * Clears persisted prefs AND ephemeral deal state.
 * Use this for complete "start fresh" behavior.
 */
export function resetSession(): void {
  state = {
    selectedMode: null,
    excludeAllergens: [],
    constraints: [],
    sessionStartTime: null,
    passCount: 0,
    dealHistory: [],
    currentDealId: null,
    drmInserted: false,
    dealStartMs: null,
  };
  // Clear persisted prefs
  clearPrefs();
  notifyListeners();
}

/**
 * Full reset including persisted preferences.
 * Alias for resetSession() with clearer intent.
 */
export function resetAll(): void {
  resetSession();
}

// ============================================
// SUBSCRIPTIONS (for reactive components)
// ============================================

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ============================================
// TEST UTILITIES (only for unit tests)
// ============================================

/**
 * Reset hydration state for testing.
 * DO NOT use in production code.
 */
export function __resetHydrationForTest(): void {
  hydrated = false;
}

/**
 * Full state reset for testing - clears everything including hydration flag.
 * Preferred over __resetHydrationForTest for test isolation.
 * DO NOT use in production code.
 */
export function __resetStateForTest(): void {
  hydrated = false;
  hydratingPromise = null;
  state = {
    selectedMode: null,
    excludeAllergens: [],
    constraints: [],
    sessionStartTime: null,
    passCount: 0,
    dealHistory: [],
    currentDealId: null,
    drmInserted: false,
    dealStartMs: null,
  };
  listeners.clear();
}
