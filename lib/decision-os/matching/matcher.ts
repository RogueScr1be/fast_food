/**
 * FAST FOOD: Inventory Matching - Token-Based Matcher
 * 
 * Replaces the old "case-insensitive contains" matching with
 * a deterministic token-based matcher that reduces false positives.
 * 
 * INVARIANTS:
 * - Deterministic: same inputs always produce same output
 * - Whole-token matching only (no substring matching)
 * - Score in [0, 1]
 * - Threshold-based matching (>= 0.66 required)
 * - Advisory: never blocks dinner decisions
 */

import type { InventoryItemRow } from '@/types/decision-os/decision';
import { tokenize, getTokenSet } from './tokenizer';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Minimum overlap score required for a match.
 * 0.66 = at least 2/3 of ingredient tokens must match.
 */
export const MATCH_THRESHOLD = 0.66;

/**
 * Score for a prefix match (e.g., "tomato" matching "tomatoes").
 * Treated as 80% of a full match since it's likely the same item.
 */
export const PREFIX_MATCH_SCORE = 0.80;

/**
 * Maximum extra characters allowed for prefix match.
 * This prevents "egg" matching "eggplant" (5 extra chars)
 * while allowing "tomato" matching "tomatoes" (2 extra chars).
 */
export const MAX_PREFIX_EXTRA_CHARS = 3;

/**
 * Minimum length ratio for prefix match.
 * Shorter token must be at least this fraction of longer token.
 * e.g., 0.75 means "egg" (3) vs "eggs" (4) = 0.75 OK
 * but "egg" (3) vs "eggplant" (8) = 0.375 NOT OK
 */
export const MIN_PREFIX_LENGTH_RATIO = 0.70;

// =============================================================================
// TYPES
// =============================================================================

export interface MatchResult {
  /** The matched inventory item, or null if no match */
  matched: InventoryItemRow | null;
  /** Match score in [0, 1] */
  score: number;
}

export interface ScoredItem {
  item: InventoryItemRow;
  score: number;
}

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/**
 * Compute token overlap score between ingredient and inventory item.
 * 
 * Formula:
 *   For each ingredient token:
 *   - Exact match: 1.0
 *   - Prefix match: PREFIX_MATCH_SCORE (0.80)
 *   - No match: 0
 *   
 *   Final score = sum of match scores / ingredient token count
 * 
 * Uses WHOLE-TOKEN matching only - no substring matching.
 * This prevents false positives like "ham" matching "shampoo".
 * 
 * @param ingredientTokens - Tokens from ingredient name
 * @param itemTokens - Tokens from inventory item name
 * @returns Score in [0, 1]
 */
export function computeOverlapScore(
  ingredientTokens: string[],
  itemTokens: string[]
): number {
  if (ingredientTokens.length === 0) {
    return 0;
  }
  
  const itemTokenSet = new Set(itemTokens);
  
  let totalMatchScore = 0;
  
  for (const ingToken of ingredientTokens) {
    // Check for exact whole-token match
    if (itemTokenSet.has(ingToken)) {
      totalMatchScore += 1.0;
      continue;
    }
    
    // Check for prefix match (ingredient token is prefix of item token)
    // e.g., "tomato" matches "tomatoes"
    // Constrained to prevent false positives like "egg" matching "eggplant"
    let foundPrefixMatch = false;
    for (const itemToken of itemTokens) {
      // Ingredient token is prefix of item token
      if (itemToken.startsWith(ingToken) && itemToken.length > ingToken.length) {
        // Check constraints to avoid false positives
        const extraChars = itemToken.length - ingToken.length;
        const lengthRatio = ingToken.length / itemToken.length;
        
        if (extraChars <= MAX_PREFIX_EXTRA_CHARS && lengthRatio >= MIN_PREFIX_LENGTH_RATIO) {
          totalMatchScore += PREFIX_MATCH_SCORE;
          foundPrefixMatch = true;
          break;
        }
      }
      // Item token is prefix of ingredient token
      // e.g., "tomato" in inventory matches "tomatoes" in ingredient
      if (ingToken.startsWith(itemToken) && ingToken.length > itemToken.length) {
        // Check constraints
        const extraChars = ingToken.length - itemToken.length;
        const lengthRatio = itemToken.length / ingToken.length;
        
        if (extraChars <= MAX_PREFIX_EXTRA_CHARS && lengthRatio >= MIN_PREFIX_LENGTH_RATIO) {
          totalMatchScore += PREFIX_MATCH_SCORE;
          foundPrefixMatch = true;
          break;
        }
      }
    }
    
    // No match for this token - contributes 0
    if (!foundPrefixMatch) {
      // totalMatchScore += 0;
    }
  }
  
  // Final score is average match quality
  const score = totalMatchScore / ingredientTokens.length;
  
  // Cap at 1.0
  return Math.min(1, score);
}

/**
 * Score a single inventory item against an ingredient.
 * 
 * @param ingredientName - The ingredient name to match
 * @param item - The inventory item to score
 * @returns Score in [0, 1]
 */
export function scoreInventoryItem(
  ingredientName: string,
  item: InventoryItemRow
): number {
  const ingredientTokens = tokenize(ingredientName);
  const itemTokens = tokenize(item.item_name);
  
  return computeOverlapScore(ingredientTokens, itemTokens);
}

// =============================================================================
// MAIN MATCHER
// =============================================================================

/**
 * Find the best matching inventory item for an ingredient.
 * 
 * Algorithm:
 * 1. Tokenize ingredient name
 * 2. For each inventory item:
 *    - Tokenize item_name
 *    - Compute overlap score (whole-token matching only)
 *    - Add prefix bonuses
 * 3. Select best scoring item that meets threshold
 * 4. Deterministic tiebreaker by item_name (lexicographic)
 * 
 * @param ingredientName - The ingredient name to match
 * @param inventoryItems - Available inventory items
 * @returns Match result with item (or null) and score
 */
export function matchInventoryItem(
  ingredientName: string,
  inventoryItems: InventoryItemRow[]
): MatchResult {
  if (!ingredientName || inventoryItems.length === 0) {
    return { matched: null, score: 0 };
  }
  
  const ingredientTokens = tokenize(ingredientName);
  
  if (ingredientTokens.length === 0) {
    // No tokens after processing - can't match
    return { matched: null, score: 0 };
  }
  
  // Score all items
  const scored: ScoredItem[] = inventoryItems.map(item => ({
    item,
    score: computeOverlapScore(ingredientTokens, tokenize(item.item_name)),
  }));
  
  // Sort by score (descending), then by item_name (ascending) for deterministic tiebreaker
  scored.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 0.0001) {
      return scoreDiff;
    }
    // Tiebreaker: lexicographic by item_name
    return a.item.item_name.localeCompare(b.item.item_name);
  });
  
  // Get best match
  const best = scored[0];
  
  if (!best || best.score < MATCH_THRESHOLD) {
    // No match meets threshold
    return { matched: null, score: best?.score ?? 0 };
  }
  
  return {
    matched: best.item,
    score: best.score,
  };
}

/**
 * Find all inventory items that match an ingredient above threshold.
 * Used when we need multiple matches (e.g., for consumption).
 * 
 * @param ingredientName - The ingredient name to match
 * @param inventoryItems - Available inventory items
 * @returns Array of matching items with scores, sorted by score desc
 */
export function findAllMatches(
  ingredientName: string,
  inventoryItems: InventoryItemRow[]
): ScoredItem[] {
  if (!ingredientName || inventoryItems.length === 0) {
    return [];
  }
  
  const ingredientTokens = tokenize(ingredientName);
  
  if (ingredientTokens.length === 0) {
    return [];
  }
  
  // Score all items
  const scored: ScoredItem[] = inventoryItems.map(item => ({
    item,
    score: computeOverlapScore(ingredientTokens, tokenize(item.item_name)),
  }));
  
  // Filter by threshold and sort
  const matches = scored
    .filter(s => s.score >= MATCH_THRESHOLD)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) > 0.0001) {
        return scoreDiff;
      }
      return a.item.item_name.localeCompare(b.item.item_name);
    });
  
  return matches;
}
