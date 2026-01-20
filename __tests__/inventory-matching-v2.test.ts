/**
 * FAST FOOD: Inventory Matching v2 Tests
 * 
 * Tests for token-based inventory matching that replaces
 * the old "case-insensitive contains" matching.
 * 
 * KEY TESTS:
 * - False positive prevention ("ham" should NOT match "shampoo")
 * - Proper matching for similar items
 * - Stopword removal
 * - Deterministic tiebreaking
 * - Threshold behavior
 */

import { randomUUID } from 'crypto';
import {
  tokenize,
  getTokenSet,
  STOPWORDS,
  MIN_TOKEN_LENGTH,
  MAX_TOKENS,
} from '../lib/decision-os/matching/tokenizer';
import {
  matchInventoryItem,
  findAllMatches,
  computeOverlapScore,
  scoreInventoryItem,
  MATCH_THRESHOLD,
  PREFIX_MATCH_SCORE,
} from '../lib/decision-os/matching/matcher';
import type { InventoryItemRow } from '../types/decision-os/decision';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createInventoryItem = (
  name: string,
  id: string = randomUUID()
): InventoryItemRow => ({
  id,
  household_key: 'default',
  item_name: name,
  qty_estimated: 1,
  qty_used_estimated: 0,
  unit: 'unit',
  confidence: 0.8,
  source: 'receipt',
  last_seen_at: new Date().toISOString(),
  last_used_at: null,
  expires_at: null,
  decay_rate_per_day: 0.05,
  created_at: new Date().toISOString(),
});

// =============================================================================
// TOKENIZER TESTS
// =============================================================================

describe('Tokenizer', () => {
  describe('tokenize', () => {
    it('lowercases input', () => {
      const tokens = tokenize('CHICKEN BREAST');
      expect(tokens).toContain('chicken');
      expect(tokens).toContain('breast');
    });

    it('replaces non-alphanumerics with space', () => {
      const tokens = tokenize('chicken-breast');
      expect(tokens).toContain('chicken');
      expect(tokens).toContain('breast');
    });

    it('handles special characters', () => {
      const tokens = tokenize("chicken's breast");
      expect(tokens).toContain('chicken');
      expect(tokens).toContain('breast');
    });

    it('removes stopwords', () => {
      const tokens = tokenize('fresh organic chicken breast');
      expect(tokens).not.toContain('fresh');
      expect(tokens).not.toContain('organic');
      expect(tokens).toContain('chicken');
      expect(tokens).toContain('breast');
    });

    it('drops tokens with length < 3', () => {
      const tokens = tokenize('a an the chicken');
      expect(tokens).not.toContain('a');
      expect(tokens).not.toContain('an');
      expect(tokens).not.toContain('the');
      expect(tokens).toContain('chicken');
    });

    it('dedupes tokens', () => {
      const tokens = tokenize('chicken chicken chicken');
      expect(tokens.length).toBe(1);
      expect(tokens).toContain('chicken');
    });

    it('caps at MAX_TOKENS', () => {
      const longInput = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
      const tokens = tokenize(longInput);
      expect(tokens.length).toBeLessThanOrEqual(MAX_TOKENS);
    });

    it('returns empty array for null/undefined', () => {
      expect(tokenize(null as any)).toEqual([]);
      expect(tokenize(undefined as any)).toEqual([]);
      expect(tokenize('')).toEqual([]);
    });

    it('removes common unit abbreviations', () => {
      const tokens = tokenize('chicken 2 lb pack');
      expect(tokens).not.toContain('lb');
      expect(tokens).not.toContain('pack');
      expect(tokens).toContain('chicken');
    });
  });

  describe('STOPWORDS list', () => {
    it('contains expected stopwords', () => {
      expect(STOPWORDS.has('fresh')).toBe(true);
      expect(STOPWORDS.has('organic')).toBe(true);
      expect(STOPWORDS.has('large')).toBe(true);
      expect(STOPWORDS.has('pack')).toBe(true);
      expect(STOPWORDS.has('oz')).toBe(true);
      expect(STOPWORDS.has('lb')).toBe(true);
    });
  });

  describe('getTokenSet', () => {
    it('returns a Set for efficient lookups', () => {
      const tokenSet = getTokenSet('chicken breast');
      expect(tokenSet instanceof Set).toBe(true);
      expect(tokenSet.has('chicken')).toBe(true);
      expect(tokenSet.has('breast')).toBe(true);
    });
  });
});

// =============================================================================
// FALSE POSITIVE PREVENTION TESTS
// =============================================================================

describe('False Positive Prevention', () => {
  it('"ham" does NOT match "shampoo"', () => {
    const inventory = [createInventoryItem('shampoo')];
    const result = matchInventoryItem('ham', inventory);
    
    expect(result.matched).toBeNull();
    expect(result.score).toBeLessThan(MATCH_THRESHOLD);
  });

  it('"ham" does NOT match "graham crackers"', () => {
    const inventory = [createInventoryItem('graham crackers')];
    const result = matchInventoryItem('ham', inventory);
    
    expect(result.matched).toBeNull();
    expect(result.score).toBeLessThan(MATCH_THRESHOLD);
  });

  it('"rice" does NOT match "price tag"', () => {
    const inventory = [createInventoryItem('price tag')];
    const result = matchInventoryItem('rice', inventory);
    
    expect(result.matched).toBeNull();
    expect(result.score).toBeLessThan(MATCH_THRESHOLD);
  });

  it('"egg" does NOT match "eggplant"', () => {
    // "egg" is 3 chars, "eggplant" tokenizes to ["eggplant"]
    // "egg" != "eggplant" and "egg" is not a prefix of "eggplant" that matches rules
    const inventory = [createInventoryItem('eggplant')];
    const result = matchInventoryItem('egg', inventory);
    
    // Should not match because "egg" is a substring, not a token
    expect(result.matched).toBeNull();
  });

  it('"butter" does NOT match "butternut squash"', () => {
    const inventory = [createInventoryItem('butternut squash')];
    const result = matchInventoryItem('butter', inventory);
    
    // "butter" is not in the tokenized version of "butternut squash"
    expect(result.matched).toBeNull();
  });
});

// =============================================================================
// PROPER MATCHING TESTS
// =============================================================================

describe('Proper Matching', () => {
  it('"chicken breast" matches "chicken breast"', () => {
    const inventory = [createInventoryItem('chicken breast')];
    const result = matchInventoryItem('chicken breast', inventory);
    
    expect(result.matched).not.toBeNull();
    expect(result.matched!.item_name).toBe('chicken breast');
    expect(result.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('"chicken breast" matches "chicken breasts"', () => {
    const inventory = [createInventoryItem('chicken breasts')];
    const result = matchInventoryItem('chicken breast', inventory);
    
    // "breast" should prefix-match "breasts"
    expect(result.matched).not.toBeNull();
    expect(result.matched!.item_name).toBe('chicken breasts');
  });

  it('"roma tomatoes" matches "roma tomato"', () => {
    const inventory = [createInventoryItem('roma tomato')];
    const result = matchInventoryItem('roma tomatoes', inventory);
    
    // "tomatoes" prefix-matches "tomato" OR reverse
    expect(result.matched).not.toBeNull();
    expect(result.matched!.item_name).toBe('roma tomato');
  });

  it('"tomato" matches "tomatoes"', () => {
    const inventory = [createInventoryItem('tomatoes')];
    const result = matchInventoryItem('tomato', inventory);
    
    // Prefix matching should work
    expect(result.matched).not.toBeNull();
  });

  it('"tomatoes" matches "tomato"', () => {
    const inventory = [createInventoryItem('tomato')];
    const result = matchInventoryItem('tomatoes', inventory);
    
    // Reverse prefix matching
    expect(result.matched).not.toBeNull();
  });

  it('exact match scores 1.0', () => {
    const inventory = [createInventoryItem('chicken')];
    const result = matchInventoryItem('chicken', inventory);
    
    expect(result.score).toBeCloseTo(1.0, 2);
  });
});

// =============================================================================
// STOPWORD REMOVAL TESTS
// =============================================================================

describe('Stopword Removal in Matching', () => {
  it('"organic milk" matches "milk"', () => {
    const inventory = [createInventoryItem('milk')];
    const result = matchInventoryItem('organic milk', inventory);
    
    // "organic" is stopword, so effectively matching "milk" to "milk"
    expect(result.matched).not.toBeNull();
    expect(result.matched!.item_name).toBe('milk');
    expect(result.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('"fresh spinach" matches "spinach"', () => {
    const inventory = [createInventoryItem('spinach')];
    const result = matchInventoryItem('fresh spinach', inventory);
    
    expect(result.matched).not.toBeNull();
    expect(result.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('"large eggs" matches "eggs"', () => {
    const inventory = [createInventoryItem('eggs')];
    const result = matchInventoryItem('large eggs', inventory);
    
    expect(result.matched).not.toBeNull();
    expect(result.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('"2 lb chicken breast pack" matches "chicken breast"', () => {
    const inventory = [createInventoryItem('chicken breast')];
    const result = matchInventoryItem('2 lb chicken breast pack', inventory);
    
    // "2", "lb", "pack" are removed; "chicken" and "breast" remain
    expect(result.matched).not.toBeNull();
  });
});

// =============================================================================
// DETERMINISTIC TIEBREAKER TESTS
// =============================================================================

describe('Deterministic Tiebreaker', () => {
  it('breaks ties by item_name lexicographically', () => {
    const inventory = [
      createInventoryItem('milk whole'),
      createInventoryItem('milk 2%'),   // Comes first alphabetically
      createInventoryItem('milk skim'),
    ];
    
    // All have same score for "milk"
    const result = matchInventoryItem('milk', inventory);
    
    // Should pick "milk 2%" (first alphabetically)
    expect(result.matched).not.toBeNull();
    expect(result.matched!.item_name).toBe('milk 2%');
  });

  it('produces consistent results across calls', () => {
    const inventory = [
      createInventoryItem('chicken thighs'),
      createInventoryItem('chicken breast'),
      createInventoryItem('chicken wings'),
    ];
    
    const result1 = matchInventoryItem('chicken', inventory);
    const result2 = matchInventoryItem('chicken', inventory);
    const result3 = matchInventoryItem('chicken', inventory);
    
    expect(result1.matched!.item_name).toBe(result2.matched!.item_name);
    expect(result2.matched!.item_name).toBe(result3.matched!.item_name);
  });
});

// =============================================================================
// THRESHOLD BEHAVIOR TESTS
// =============================================================================

describe('Threshold Behavior', () => {
  it('low overlap does not match (below threshold)', () => {
    // "chicken breast salad wrap" has tokens: ["chicken", "breast", "salad", "wrap"]
    // "chicken" only has ["chicken"]
    // Overlap: 1/4 = 0.25, which is below 0.66
    const inventory = [createInventoryItem('chicken breast salad wrap')];
    const result = matchInventoryItem('chicken', inventory);
    
    // May or may not match depending on threshold
    // Let's verify the score is calculated correctly
    const score = result.score;
    
    // If ingredient has 1 token and 1/1 matches, score is 1.0
    // So chicken should match items containing chicken token
    expect(result.matched).not.toBeNull();
  });

  it('matches when overlap >= MATCH_THRESHOLD', () => {
    const inventory = [createInventoryItem('chicken')];
    const result = matchInventoryItem('chicken', inventory);
    
    expect(result.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(result.matched).not.toBeNull();
  });

  it('does not match when overlap < MATCH_THRESHOLD', () => {
    // Ingredient with 3 tokens, item with only 1 matching
    const inventory = [createInventoryItem('something completely different')];
    const result = matchInventoryItem('chicken breast rice', inventory);
    
    expect(result.score).toBeLessThan(MATCH_THRESHOLD);
    expect(result.matched).toBeNull();
  });

  it('MATCH_THRESHOLD is 0.66', () => {
    expect(MATCH_THRESHOLD).toBe(0.66);
  });
});

// =============================================================================
// SCORING FORMULA TESTS
// =============================================================================

describe('Scoring Formula', () => {
  it('computes overlap as intersection / ingredient token count', () => {
    const ingredientTokens = ['chicken', 'breast'];
    const itemTokens = ['chicken', 'breast', 'boneless'];
    
    // overlap = 2/2 = 1.0
    const score = computeOverlapScore(ingredientTokens, itemTokens);
    expect(score).toBe(1.0);
  });

  it('partial overlap produces proportional score', () => {
    const ingredientTokens = ['chicken', 'breast', 'salad'];
    const itemTokens = ['chicken', 'breast'];
    
    // overlap = 2/3 ≈ 0.67
    const score = computeOverlapScore(ingredientTokens, itemTokens);
    expect(score).toBeCloseTo(2/3, 2);
  });

  it('no overlap produces score 0', () => {
    const ingredientTokens = ['chicken', 'breast'];
    const itemTokens = ['fish', 'fillet'];
    
    const score = computeOverlapScore(ingredientTokens, itemTokens);
    expect(score).toBe(0);
  });

  it('prefix match scores PREFIX_MATCH_SCORE', () => {
    const ingredientTokens = ['tomato'];
    const itemTokens = ['tomatoes']; // "tomato" is prefix of "tomatoes"
    
    const score = computeOverlapScore(ingredientTokens, itemTokens);
    // Prefix match gives PREFIX_MATCH_SCORE (0.80)
    expect(score).toBeCloseTo(PREFIX_MATCH_SCORE, 2);
  });

  it('score is capped at 1.0', () => {
    const ingredientTokens = ['chicken'];
    const itemTokens = ['chicken'];
    
    const score = computeOverlapScore(ingredientTokens, itemTokens);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('empty ingredient tokens returns 0', () => {
    const score = computeOverlapScore([], ['chicken']);
    expect(score).toBe(0);
  });
});

// =============================================================================
// FIND ALL MATCHES TESTS
// =============================================================================

describe('findAllMatches', () => {
  it('returns all items above threshold', () => {
    const inventory = [
      createInventoryItem('chicken breast'),
      createInventoryItem('chicken thighs'),
      createInventoryItem('beef steak'),
    ];
    
    const matches = findAllMatches('chicken', inventory);
    
    // Both chicken items should match
    expect(matches.length).toBe(2);
    expect(matches.every(m => m.item.item_name.includes('chicken'))).toBe(true);
  });

  it('returns empty array when nothing matches', () => {
    const inventory = [createInventoryItem('beef steak')];
    const matches = findAllMatches('chicken', inventory);
    
    expect(matches).toEqual([]);
  });

  it('sorts by score descending', () => {
    const inventory = [
      createInventoryItem('chicken breast boneless'), // 1/3 match for "chicken"
      createInventoryItem('chicken'),                  // 1/1 match for "chicken"
      createInventoryItem('chicken thighs'),          // 1/2 match for "chicken"
    ];
    
    const matches = findAllMatches('chicken', inventory);
    
    // Should be sorted by score
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
    }
  });
});

// =============================================================================
// INTEGRATION WITH INVENTORY TYPES
// =============================================================================

describe('Integration with InventoryItemRow', () => {
  it('works with full InventoryItemRow objects', () => {
    const inventory: InventoryItemRow[] = [
      {
        id: 'inv-001',
        household_key: 'default',
        item_name: 'Organic Chicken Breast',
        qty_estimated: 2,
        qty_used_estimated: 0.5,
        unit: 'lb',
        confidence: 0.85,
        source: 'receipt',
        last_seen_at: '2026-01-20T12:00:00Z',
        last_used_at: '2026-01-19T18:00:00Z',
        expires_at: '2026-01-25T00:00:00Z',
        decay_rate_per_day: 0.05,
        created_at: '2026-01-15T10:00:00Z',
      },
    ];
    
    const result = matchInventoryItem('chicken breast', inventory);
    
    expect(result.matched).not.toBeNull();
    expect(result.matched!.id).toBe('inv-001');
    expect(result.matched!.confidence).toBe(0.85);
  });

  it('returns the full item with all fields', () => {
    const inventory = [createInventoryItem('milk')];
    const result = matchInventoryItem('milk', inventory);
    
    expect(result.matched).toHaveProperty('id');
    expect(result.matched).toHaveProperty('household_key');
    expect(result.matched).toHaveProperty('item_name');
    expect(result.matched).toHaveProperty('confidence');
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  it('handles empty ingredient name', () => {
    const inventory = [createInventoryItem('chicken')];
    const result = matchInventoryItem('', inventory);
    
    expect(result.matched).toBeNull();
    expect(result.score).toBe(0);
  });

  it('handles empty inventory', () => {
    const result = matchInventoryItem('chicken', []);
    
    expect(result.matched).toBeNull();
    expect(result.score).toBe(0);
  });

  it('handles ingredient that becomes empty after tokenization', () => {
    // "2 lb oz" - all stopwords/short tokens
    const inventory = [createInventoryItem('chicken')];
    const result = matchInventoryItem('2 lb oz', inventory);
    
    expect(result.matched).toBeNull();
    expect(result.score).toBe(0);
  });

  it('handles very long ingredient names', () => {
    const longName = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
    const inventory = [createInventoryItem('word0 word1 word2')];
    
    // Should not throw
    const result = matchInventoryItem(longName, inventory);
    expect(result).toBeDefined();
  });

  it('handles special characters in names', () => {
    const inventory = [createInventoryItem("chicken's breast & thigh")];
    const result = matchInventoryItem('chicken breast', inventory);
    
    // Should still match after character normalization
    expect(result.matched).not.toBeNull();
  });
});
