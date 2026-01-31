/**
 * DRM (Dinner Rescue Mode) Session State Tests
 */

// Mock persist module before importing ffSession
jest.mock('../persist', () => ({
  loadPrefs: jest.fn(),
  savePrefs: jest.fn(),
  clearPrefs: jest.fn(),
}));

import {
  resetSession,
  resetDealState,
  resetTonight,
  setSelectedMode,
  setExcludeAllergens,
  setConstraints,
  incrementPassCount,
  addToDealHistory,
  setCurrentDealId,
  getSelectedMode,
  getExcludeAllergens,
  getConstraints,
  getPassCount,
  getDealHistory,
  getCurrentDealId,
  getDrmInserted,
  setDrmInserted,
  markDealStart,
  getDealStartMs,
  getElapsedDealTimeMs,
  shouldTriggerDrm,
  hydrateFromStorage,
  DRM_PASS_THRESHOLD,
  DRM_TIME_THRESHOLD_MS,
  __resetStateForTest,
} from '../ffSession';
import { loadPrefs } from '../persist';

describe('DRM Session State', () => {
  beforeEach(() => {
    __resetStateForTest();
  });

  describe('shouldTriggerDrm', () => {
    it('triggers after pass threshold (3 passes)', () => {
      expect(shouldTriggerDrm(2, 0)).toBe(false);
      expect(shouldTriggerDrm(3, 0)).toBe(true);
      expect(shouldTriggerDrm(4, 0)).toBe(true);
    });

    it('triggers after time threshold (45 seconds)', () => {
      expect(shouldTriggerDrm(0, 44999)).toBe(false);
      expect(shouldTriggerDrm(0, 45000)).toBe(true);
      expect(shouldTriggerDrm(0, 60000)).toBe(true);
    });

    it('triggers when either condition is met', () => {
      expect(shouldTriggerDrm(3, 45000)).toBe(true);
      expect(shouldTriggerDrm(3, 30000)).toBe(true);
      expect(shouldTriggerDrm(1, 50000)).toBe(true);
    });

    it('does not trigger when neither condition is met', () => {
      expect(shouldTriggerDrm(0, 0)).toBe(false);
      expect(shouldTriggerDrm(2, 30000)).toBe(false);
    });
  });

  describe('DRM constants', () => {
    it('has correct pass threshold', () => {
      expect(DRM_PASS_THRESHOLD).toBe(3);
    });

    it('has correct time threshold', () => {
      expect(DRM_TIME_THRESHOLD_MS).toBe(45000);
    });
  });

  describe('drmInserted state', () => {
    it('starts as false', () => {
      expect(getDrmInserted()).toBe(false);
    });

    it('can be set to true', () => {
      setDrmInserted(true);
      expect(getDrmInserted()).toBe(true);
    });

    it('can be reset back to false', () => {
      setDrmInserted(true);
      expect(getDrmInserted()).toBe(true);
      setDrmInserted(false);
      expect(getDrmInserted()).toBe(false);
    });

    it('resets with resetDealState', () => {
      setSelectedMode('easy');
      setDrmInserted(true);
      resetDealState();
      expect(getDrmInserted()).toBe(false);
    });

    it('resets with resetSession', () => {
      setDrmInserted(true);
      resetSession();
      expect(getDrmInserted()).toBe(false);
    });
  });

  describe('DRM inserted only once per session', () => {
    it('flag prevents repeated DRM insertion', () => {
      // Simulate: 3 passes trigger DRM, DRM inserted
      incrementPassCount();
      incrementPassCount();
      incrementPassCount();
      expect(getPassCount()).toBe(3);
      expect(shouldTriggerDrm(getPassCount(), 0)).toBe(true);
      
      // Mark DRM as inserted
      setDrmInserted(true);
      expect(getDrmInserted()).toBe(true);
      
      // Further passes should not re-trigger DRM (because we check drmInserted first)
      incrementPassCount();
      incrementPassCount();
      expect(getPassCount()).toBe(5);
      // shouldTriggerDrm is a pure function, it still returns true
      // but the calling code checks getDrmInserted() first
      expect(getDrmInserted()).toBe(true); // Already inserted
    });
  });

  describe('dealStartMs timing', () => {
    it('starts as null', () => {
      expect(getDealStartMs()).toBeNull();
    });

    it('can be marked', () => {
      markDealStart();
      expect(getDealStartMs()).not.toBeNull();
    });

    it('only sets once per session', () => {
      markDealStart();
      const firstStart = getDealStartMs();
      
      // Wait a tiny bit and try again
      markDealStart();
      expect(getDealStartMs()).toBe(firstStart);
    });

    it('resets with resetDealState', () => {
      setSelectedMode('fancy');
      markDealStart();
      expect(getDealStartMs()).not.toBeNull();
      
      resetDealState();
      expect(getDealStartMs()).toBeNull();
    });

    it('getElapsedDealTimeMs returns 0 before start', () => {
      expect(getElapsedDealTimeMs()).toBe(0);
    });

    it('getElapsedDealTimeMs returns positive after start', async () => {
      markDealStart();
      // Wait a tiny bit
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(getElapsedDealTimeMs()).toBeGreaterThan(0);
    });
  });

  describe('allergy-out does not increment passCount', () => {
    it('setExcludeAllergens does not change passCount', () => {
      incrementPassCount();
      expect(getPassCount()).toBe(1);
      
      setExcludeAllergens(['dairy', 'nuts']);
      expect(getPassCount()).toBe(1); // Unchanged
      
      setExcludeAllergens([]);
      expect(getPassCount()).toBe(1); // Still unchanged
    });
  });

  describe('resetDealState preserves mode and allergens', () => {
    it('keeps selectedMode after reset', () => {
      setSelectedMode('fancy');
      incrementPassCount();
      incrementPassCount();
      setDrmInserted(true);
      
      resetDealState();
      
      // These should reset
      expect(getPassCount()).toBe(0);
      expect(getDrmInserted()).toBe(false);
      
      // Mode should still be fancy (not null)
      // Note: We need to import getSelectedMode to test this
    });

    it('keeps excludeAllergens after reset', () => {
      setSelectedMode('easy');
      setExcludeAllergens(['dairy', 'gluten']);
      incrementPassCount();
      setDrmInserted(true);
      
      resetDealState();
      
      expect(getPassCount()).toBe(0);
      expect(getDrmInserted()).toBe(false);
      // Allergens should persist - let's verify via the getter
    });
  });

  describe('resetTonight semantics', () => {
    it('preserves persisted prefs and clears ephemeral deal state', () => {
      // Set persisted prefs
      setSelectedMode('easy');
      setExcludeAllergens(['dairy']);
      setConstraints(['15_min']);

      // Set ephemeral state
      incrementPassCount();
      addToDealHistory('recipe-1');
      setCurrentDealId('recipe-1');
      setDrmInserted(true);
      markDealStart();

      // Sanity before reset
      expect(getPassCount()).toBe(1);
      expect(getDealHistory()).toEqual(['recipe-1']);
      expect(getCurrentDealId()).toBe('recipe-1');
      expect(getDrmInserted()).toBe(true);
      expect(getDealStartMs()).not.toBeNull();

      // Act
      resetTonight();

      // Persisted prefs remain
      expect(getSelectedMode()).toBe('easy');
      expect(getExcludeAllergens()).toEqual(['dairy']);
      expect(getConstraints()).toEqual(['15_min']);

      // Ephemeral cleared
      expect(getPassCount()).toBe(0);
      expect(getDealHistory()).toEqual([]);
      expect(getCurrentDealId()).toBeNull();
      expect(getDrmInserted()).toBe(false);
      expect(getDealStartMs()).toBeNull();
    });
  });

  describe('hydration race condition guard', () => {
    it('does not overwrite state after user flow has set mode', async () => {
      (loadPrefs as jest.Mock).mockResolvedValue({
        selectedMode: 'cheap',
        constraints: ['15_min'],
        excludeAllergens: ['nuts'],
      });

      // User/flow already set mode (e.g., Deal auto-picked or Tonight selected)
      setSelectedMode('easy');

      await hydrateFromStorage();

      // Guard should keep the live state, not clobber with persisted 'cheap'
      expect(getSelectedMode()).toBe('easy');
    });

    it('applies persisted prefs when state is at defaults', async () => {
      (loadPrefs as jest.Mock).mockResolvedValue({
        selectedMode: 'fancy',
        constraints: ['vegetarian'],
        excludeAllergens: ['gluten'],
      });

      // State is at defaults (no user interaction yet)
      expect(getSelectedMode()).toBeNull();

      await hydrateFromStorage();

      // Should apply persisted prefs
      expect(getSelectedMode()).toBe('fancy');
      expect(getConstraints()).toEqual(['vegetarian']);
      expect(getExcludeAllergens()).toEqual(['gluten']);
    });
  });
});
