/**
 * Fast Food Session State
 * 
 * Simple module singleton for storing session state across Phase 1–4.
 * No external dependencies - just a plain object with getters/setters.
 */

import type { AllergenTag, ConstraintTag, Mode } from '../seeds/types';

interface FFSessionState {
  selectedMode: Mode | null;
  excludeAllergens: AllergenTag[];
  constraints: ConstraintTag[];
  sessionStartTime: number | null;
}

// Module-level state (singleton)
let state: FFSessionState = {
  selectedMode: null,
  excludeAllergens: [],
  constraints: [],
  sessionStartTime: null,
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

// ============================================
// RESET
// ============================================

export function resetSession(): void {
  state = {
    selectedMode: null,
    excludeAllergens: [],
    constraints: [],
    sessionStartTime: null,
  };
  notifyListeners();
}

// ============================================
// SUBSCRIPTIONS (for reactive components)
// ============================================

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
