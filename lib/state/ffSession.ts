/**
 * Fast Food Session State
 * 
 * Simple module singleton for storing session state across Phase 1–4.
 * No external dependencies - just a plain object with getters/setters.
 */

import type { AllergenTag, ConstraintTag, Mode } from '../seeds/types';

// DRM trigger constants
export const DRM_PASS_THRESHOLD = 3;
export const DRM_TIME_THRESHOLD_MS = 45000; // 45 seconds

interface FFSessionState {
  selectedMode: Mode | null;
  excludeAllergens: AllergenTag[];
  constraints: ConstraintTag[];
  sessionStartTime: number | null;
  // Phase 2: Deal tracking
  passCount: number;
  dealHistory: string[]; // Recipe IDs shown this session
  currentDealId: string | null;
  // Phase 3: DRM tracking
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

// Subscribers for reactive updates (optional, for future use)
type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach(listener => listener());
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
  if (mode && !state.sessionStartTime) {
    state.sessionStartTime = Date.now();
  }
  notifyListeners();
}

export function setExcludeAllergens(allergens: AllergenTag[]): void {
  state.excludeAllergens = [...allergens];
  notifyListeners();
}

export function addExcludeAllergen(allergen: AllergenTag): void {
  if (!state.excludeAllergens.includes(allergen)) {
    state.excludeAllergens = [...state.excludeAllergens, allergen];
    notifyListeners();
  }
}

export function removeExcludeAllergen(allergen: AllergenTag): void {
  state.excludeAllergens = state.excludeAllergens.filter(a => a !== allergen);
  notifyListeners();
}

export function setConstraints(constraints: ConstraintTag[]): void {
  state.constraints = [...constraints];
  notifyListeners();
}

export function toggleConstraint(constraint: ConstraintTag): void {
  if (state.constraints.includes(constraint)) {
    state.constraints = state.constraints.filter(c => c !== constraint);
  } else {
    state.constraints = [...state.constraints, constraint];
  }
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
 * Full session reset (back to mode selection)
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
  notifyListeners();
}

/**
 * Reset deal state only (keep mode + allergens, restart dealing)
 */
export function resetDealState(): void {
  state.passCount = 0;
  state.dealHistory = [];
  state.currentDealId = null;
  state.drmInserted = false;
  state.dealStartMs = null;
  state.sessionStartTime = Date.now();
  notifyListeners();
}

// ============================================
// SUBSCRIPTIONS (for reactive components)
// ============================================

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
