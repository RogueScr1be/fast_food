/**
 * Image Registry Verification Tests
 * 
 * Build-time validation that ensures:
 * 1) Every imageKey in recipes has a corresponding file or uses fallback
 * 2) No orphaned image files exist without corresponding keys
 * 3) Image registry is consistent with seed data
 */

import * as fs from 'fs';
import * as path from 'path';
import { RECIPES, DRM_MEALS } from '../recipes';
import {
  RECIPE_IMAGES,
  assertImageKeyConsistency,
  getImageSource,
  getImageSourceSafe,
  hasRealImage,
  recordImagePairingEvent,
} from '../images';

// Path to assets directory from project root
const ASSETS_DIR = path.resolve(process.cwd(), 'assets');
const RECIPES_DIR = path.resolve(ASSETS_DIR, 'recipes');

// Allowed non-recipe files in assets/recipes/
const ALLOWED_EXTRA_FILES = ['_fallback.png', '_fallback.jpg', '.gitkeep', '.DS_Store'];

describe('Image Registry', () => {
  // Collect all image keys from seeds
  const allImageKeys = new Set<string>();
  
  beforeAll(() => {
    RECIPES.forEach(r => {
      if (r.imageKey) allImageKeys.add(r.imageKey);
    });
    DRM_MEALS.forEach(m => {
      if (m.imageKey) allImageKeys.add(m.imageKey);
    });
  });

  describe('imageKey coverage', () => {
    it('every recipe has an imageKey defined', () => {
      RECIPES.forEach(recipe => {
        expect(recipe.imageKey).toBeDefined();
        expect(typeof recipe.imageKey).toBe('string');
        expect(recipe.imageKey!.length).toBeGreaterThan(0);
      });
    });

    it('every DRM meal has an imageKey defined', () => {
      DRM_MEALS.forEach(meal => {
        expect(meal.imageKey).toBeDefined();
        expect(typeof meal.imageKey).toBe('string');
        expect(meal.imageKey!.length).toBeGreaterThan(0);
      });
    });

    it('every seed has explicit heroSafeFrame metadata', () => {
      [...RECIPES, ...DRM_MEALS].forEach(seed => {
        expect(typeof seed.heroSafeFrame).toBe('boolean');
      });
    });

    it('all imageKeys are registered in RECIPE_IMAGES', () => {
      allImageKeys.forEach(key => {
        expect(RECIPE_IMAGES).toHaveProperty(key);
      });
    });

    it('RECIPE_IMAGES has exactly the expected number of keys (30)', () => {
      const registeredKeys = Object.keys(RECIPE_IMAGES);
      expect(registeredKeys.length).toBe(30);
    });
  });

  describe('getImageSource helper', () => {
    it('returns a valid source for each registered key', () => {
      allImageKeys.forEach(key => {
        const source = getImageSource(key);
        expect(source).toBeDefined();
      });
    });

    it('returns fallback for undefined key', () => {
      const source = getImageSource(undefined);
      expect(source).toBeDefined();
    });

    it('returns fallback for unknown key', () => {
      const source = getImageSource('definitely-not-a-real-key-12345');
      expect(source).toBeDefined();
    });
  });

  describe('file system consistency', () => {
    it('assets/recipes directory exists', () => {
      expect(fs.existsSync(RECIPES_DIR)).toBe(true);
    });

    it('fallback image exists', () => {
      const fallbackPath = path.join(RECIPES_DIR, '_fallback.png');
      expect(fs.existsSync(fallbackPath)).toBe(true);
    });

    it('no orphaned image files (files without corresponding keys)', () => {
      if (!fs.existsSync(RECIPES_DIR)) {
        return; // Skip if directory doesn't exist
      }

      const files = fs.readdirSync(RECIPES_DIR);
      const orphanedFiles: string[] = [];

      files.forEach(file => {
        // Skip allowed extra files
        if (ALLOWED_EXTRA_FILES.includes(file)) return;

        // Extract key from filename (remove extension)
        const key = file.replace(/\.(jpg|jpeg|png|webp)$/i, '');

        // Check if this key exists in our seeds
        if (!allImageKeys.has(key)) {
          orphanedFiles.push(file);
        }
      });

      expect(orphanedFiles).toEqual([]);
    });

    it('reports which keys have real images vs fallback', () => {
      const keysWithRealImages: string[] = [];
      const keysWithFallback: string[] = [];

      allImageKeys.forEach(key => {
        if (hasRealImage(key)) {
          keysWithRealImages.push(key);
        } else {
          keysWithFallback.push(key);
        }
      });

      // This test documents current state, doesn't assert specific counts
      // Uncomment to see the breakdown:
      // console.log('Keys with real images:', keysWithRealImages.length);
      // console.log('Keys using fallback:', keysWithFallback.length);
      
      // Basic sanity: total should match
      expect(keysWithRealImages.length + keysWithFallback.length).toBe(allImageKeys.size);
    });
  });

  describe('image file validation (when present)', () => {
    it('each registered key either has a real file or uses fallback correctly', () => {
      const missingButClaimed: string[] = [];

      Object.entries(RECIPE_IMAGES).forEach(([key, source]) => {
        // Check if a file exists for this key
        const jpgPath = path.join(RECIPES_DIR, `${key}.jpg`);
        const jpegPath = path.join(RECIPES_DIR, `${key}.jpeg`);
        const pngPath = path.join(RECIPES_DIR, `${key}.png`);
        
        const fileExists = 
          fs.existsSync(jpgPath) || 
          fs.existsSync(jpegPath) || 
          fs.existsSync(pngPath);

        // If hasRealImage returns true but file doesn't exist, that's a problem
        if (hasRealImage(key) && !fileExists) {
          missingButClaimed.push(key);
        }
      });

      expect(missingButClaimed).toEqual([]);
    });
  });
});

describe('Image Registry Constants', () => {
  it('has 18 recipe image keys', () => {
    const recipeKeys = RECIPES.map(r => r.imageKey).filter(Boolean);
    expect(recipeKeys.length).toBe(18);
  });

  it('has 12 DRM image keys', () => {
    const drmKeys = DRM_MEALS.map(m => m.imageKey).filter(Boolean);
    expect(drmKeys.length).toBe(12);
  });

  it('all keys are unique', () => {
    const allKeys = [
      ...RECIPES.map(r => r.imageKey),
      ...DRM_MEALS.map(m => m.imageKey),
    ].filter(Boolean);
    
    const uniqueKeys = new Set(allKeys);
    expect(uniqueKeys.size).toBe(allKeys.length);
  });
});

describe('Image Pairing Guardrails', () => {
  it('returns fallback safely and warns on missing imageKey', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const source = getImageSourceSafe({
      recipeId: 'test-recipe',
      imageKey: undefined,
      mode: 'fancy',
      screen: 'deal',
      phase: 'render',
    });

    expect(source).toBeDefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('assertImageKeyConsistency returns false for invalid key', () => {
    expect(assertImageKeyConsistency('test-recipe', 'not-real-key', {
      mode: 'easy',
      screen: 'deal',
      phase: 'prefetch',
    })).toBe(false);
  });

  it('recordImagePairingEvent does not throw', () => {
    expect(() => {
      recordImagePairingEvent({
        recipeId: 'test-recipe',
        imageKey: 'missing',
        mode: 'cheap',
        screen: 'deal',
        phase: 'resolve',
        reason: 'unknown_key',
      });
    }).not.toThrow();
  });
});
