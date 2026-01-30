/**
 * Persistence Layer Unit Tests
 * 
 * Tests for lib/state/persist.ts with mocked AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadPrefs,
  savePrefs,
  clearPrefs,
  DEFAULT_PREFS,
  STORAGE_KEYS,
  type Prefs,
} from '../persist';
import {
  resetSession,
  resetTonight,
  setSelectedMode,
  setConstraints,
  setExcludeAllergens,
  getSelectedMode,
  getConstraints,
  getExcludeAllergens,
  hydrateFromStorage,
  isHydrated,
  __resetHydrationForTest,
  subscribe,
} from '../ffSession';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiRemove: jest.fn(),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('Persistence Layer (persist.ts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset storage to empty state
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue();
    mockedAsyncStorage.multiRemove.mockResolvedValue();
  });

  describe('loadPrefs', () => {
    it('returns defaults when storage is empty', async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);
      
      const prefs = await loadPrefs();
      
      expect(prefs).toEqual(DEFAULT_PREFS);
      expect(prefs.selectedMode).toBeNull();
      expect(prefs.constraints).toEqual([]);
      expect(prefs.excludeAllergens).toEqual([]);
    });

    it('loads saved values correctly', async () => {
      mockedAsyncStorage.getItem.mockImplementation(async (key) => {
        if (key === STORAGE_KEYS.selectedMode) return JSON.stringify('fancy');
        if (key === STORAGE_KEYS.constraints) return JSON.stringify(['vegetarian', '15_min']);
        if (key === STORAGE_KEYS.excludeAllergens) return JSON.stringify(['dairy', 'nuts']);
        return null;
      });
      
      const prefs = await loadPrefs();
      
      expect(prefs.selectedMode).toBe('fancy');
      expect(prefs.constraints).toEqual(['vegetarian', '15_min']);
      expect(prefs.excludeAllergens).toEqual(['dairy', 'nuts']);
    });

    it('drops invalid/unknown constraint tags', async () => {
      mockedAsyncStorage.getItem.mockImplementation(async (key) => {
        if (key === STORAGE_KEYS.constraints) {
          return JSON.stringify(['vegetarian', 'unknown_tag', '15_min', 'bogus']);
        }
        return null;
      });
      
      const prefs = await loadPrefs();
      
      // Should only contain valid constraints
      expect(prefs.constraints).toEqual(['vegetarian', '15_min']);
    });

    it('drops invalid/unknown allergen tags', async () => {
      mockedAsyncStorage.getItem.mockImplementation(async (key) => {
        if (key === STORAGE_KEYS.excludeAllergens) {
          return JSON.stringify(['dairy', 'pollen', 'nuts', 'dust']);
        }
        return null;
      });
      
      const prefs = await loadPrefs();
      
      // Should only contain valid allergens
      expect(prefs.excludeAllergens).toEqual(['dairy', 'nuts']);
    });

    it('returns null for invalid mode value', async () => {
      mockedAsyncStorage.getItem.mockImplementation(async (key) => {
        if (key === STORAGE_KEYS.selectedMode) return JSON.stringify('invalid_mode');
        return null;
      });
      
      const prefs = await loadPrefs();
      
      expect(prefs.selectedMode).toBeNull();
    });

    it('handles malformed JSON gracefully', async () => {
      mockedAsyncStorage.getItem.mockImplementation(async (key) => {
        if (key === STORAGE_KEYS.selectedMode) return 'not valid json{';
        return null;
      });
      
      // Should not throw
      const prefs = await loadPrefs();
      
      // Should return defaults
      expect(prefs).toEqual(DEFAULT_PREFS);
    });

    it('handles AsyncStorage errors gracefully', async () => {
      mockedAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));
      
      // Should not throw
      const prefs = await loadPrefs();
      
      // Should return defaults
      expect(prefs).toEqual(DEFAULT_PREFS);
    });
  });

  describe('savePrefs', () => {
    it('saves selectedMode correctly', async () => {
      await savePrefs({ selectedMode: 'easy' });
      
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.selectedMode,
        JSON.stringify('easy')
      );
    });

    it('saves constraints correctly', async () => {
      await savePrefs({ constraints: ['vegetarian', 'no_oven'] });
      
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.constraints,
        JSON.stringify(['vegetarian', 'no_oven'])
      );
    });

    it('saves excludeAllergens correctly', async () => {
      await savePrefs({ excludeAllergens: ['dairy', 'gluten'] });
      
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.excludeAllergens,
        JSON.stringify(['dairy', 'gluten'])
      );
    });

    it('saves multiple fields at once', async () => {
      await savePrefs({
        selectedMode: 'cheap',
        constraints: ['15_min'],
        excludeAllergens: ['eggs'],
      });
      
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledTimes(3);
    });

    it('only saves provided fields (partial update)', async () => {
      await savePrefs({ selectedMode: 'fancy' });
      
      // Should only call setItem once
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledTimes(1);
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.selectedMode,
        JSON.stringify('fancy')
      );
    });

    it('handles AsyncStorage errors gracefully', async () => {
      mockedAsyncStorage.setItem.mockRejectedValue(new Error('Write error'));
      
      // Should not throw
      await expect(savePrefs({ selectedMode: 'easy' })).resolves.not.toThrow();
    });
  });

  describe('clearPrefs', () => {
    it('removes all preference keys', async () => {
      await clearPrefs();
      
      expect(mockedAsyncStorage.multiRemove).toHaveBeenCalledWith([
        STORAGE_KEYS.selectedMode,
        STORAGE_KEYS.constraints,
        STORAGE_KEYS.excludeAllergens,
      ]);
    });

    it('handles AsyncStorage errors gracefully', async () => {
      mockedAsyncStorage.multiRemove.mockRejectedValue(new Error('Remove error'));
      
      // Should not throw
      await expect(clearPrefs()).resolves.not.toThrow();
    });
  });
});

describe('ffSession Hydration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSession();
    __resetHydrationForTest();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue();
    mockedAsyncStorage.multiRemove.mockResolvedValue();
  });

  it('isHydrated returns false before hydration', () => {
    expect(isHydrated()).toBe(false);
  });

  it('hydrateFromStorage updates state from storage', async () => {
    mockedAsyncStorage.getItem.mockImplementation(async (key) => {
      if (key === STORAGE_KEYS.selectedMode) return JSON.stringify('fancy');
      if (key === STORAGE_KEYS.constraints) return JSON.stringify(['vegetarian']);
      if (key === STORAGE_KEYS.excludeAllergens) return JSON.stringify(['dairy']);
      return null;
    });

    await hydrateFromStorage();

    expect(isHydrated()).toBe(true);
    expect(getSelectedMode()).toBe('fancy');
    expect(getConstraints()).toEqual(['vegetarian']);
    expect(getExcludeAllergens()).toEqual(['dairy']);
  });

  it('hydrateFromStorage notifies subscribers once', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);

    await hydrateFromStorage();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('hydrateFromStorage only runs once', async () => {
    mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify('easy'));

    await hydrateFromStorage();
    await hydrateFromStorage();
    await hydrateFromStorage();

    // Should only call getItem 3 times (once for each key) total
    expect(mockedAsyncStorage.getItem).toHaveBeenCalledTimes(3);
  });

  it('handles hydration errors gracefully', async () => {
    mockedAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

    // Should not throw
    await expect(hydrateFromStorage()).resolves.not.toThrow();

    // Should still mark as hydrated
    expect(isHydrated()).toBe(true);
  });
});

describe('ffSession Reset Semantics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSession();
    __resetHydrationForTest();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue();
    mockedAsyncStorage.multiRemove.mockResolvedValue();
  });

  it('resetTonight clears deal state but keeps prefs', () => {
    // Set up state
    setSelectedMode('fancy');
    setExcludeAllergens(['dairy']);
    setConstraints(['vegetarian']);

    // Clear mocks from setup
    jest.clearAllMocks();

    // Reset tonight
    resetTonight();

    // Prefs should remain
    expect(getSelectedMode()).toBe('fancy');
    expect(getExcludeAllergens()).toEqual(['dairy']);
    expect(getConstraints()).toEqual(['vegetarian']);

    // Should NOT clear storage
    expect(mockedAsyncStorage.multiRemove).not.toHaveBeenCalled();
  });

  it('resetSession clears everything including stored prefs', () => {
    // Set up state
    setSelectedMode('fancy');
    setExcludeAllergens(['dairy']);
    setConstraints(['vegetarian']);

    // Clear mocks from setup
    jest.clearAllMocks();

    // Full reset
    resetSession();

    // Prefs should be cleared
    expect(getSelectedMode()).toBeNull();
    expect(getExcludeAllergens()).toEqual([]);
    expect(getConstraints()).toEqual([]);

    // Should clear storage
    expect(mockedAsyncStorage.multiRemove).toHaveBeenCalledWith([
      STORAGE_KEYS.selectedMode,
      STORAGE_KEYS.constraints,
      STORAGE_KEYS.excludeAllergens,
    ]);
  });
});

describe('ffSession Persistence on Set', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSession();
    __resetHydrationForTest();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue();
    mockedAsyncStorage.multiRemove.mockResolvedValue();
  });

  it('setSelectedMode persists to storage', () => {
    setSelectedMode('easy');

    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.selectedMode,
      JSON.stringify('easy')
    );
  });

  it('setExcludeAllergens persists to storage', () => {
    setExcludeAllergens(['nuts', 'gluten']);

    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.excludeAllergens,
      JSON.stringify(['nuts', 'gluten'])
    );
  });

  it('setConstraints persists to storage', () => {
    setConstraints(['no_oven', 'kid_safe']);

    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.constraints,
      JSON.stringify(['no_oven', 'kid_safe'])
    );
  });
});
