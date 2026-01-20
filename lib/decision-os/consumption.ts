/**
 * FAST FOOD: Inventory Consumption Service
 * 
 * Handles inventory updates when cook decisions are approved.
 * 
 * INVARIANTS:
 * - Consumption is best-effort; failures do not break the feedback flow
 * - Only non-pantry-staple ingredients are tracked
 * - qty_used_estimated is incremented (never directly reduce qty_estimated)
 * - Missing inventory matches are silently ignored (no crash)
 */

import type { DatabaseClient } from './database';
import type { MealIngredientRow, InventoryItemRow } from '@/types/decision-os/decision';
import { parseSimpleQty } from './inventory-model';
import { matchInventoryItem } from './matching/matcher';
import { tokenize } from './matching/tokenizer';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum number of tokens to use for candidate pre-filtering.
 * Longer tokens are preferred as they're more specific.
 */
const MAX_CANDIDATE_TOKENS = 3;

/**
 * Default limit for inventory candidates query.
 */
const INVENTORY_CANDIDATES_LIMIT = 50;

// =============================================================================
// TYPES
// =============================================================================

export interface ConsumeInventoryResult {
  success: boolean;
  itemsUpdated: number;
  errors: string[];
}

// =============================================================================
// DATABASE FUNCTIONS
// =============================================================================

/**
 * Get ingredients for a meal by meal_id
 */
export async function getMealIngredientsForMeal(
  mealId: string,
  client: DatabaseClient
): Promise<MealIngredientRow[]> {
  const result = await client.query<MealIngredientRow>(
    `SELECT * FROM decision_os.meal_ingredients WHERE meal_id = $1`,
    [mealId]
  );
  return result.rows;
}

/**
 * Get inventory candidates using token-based ILIKE pre-filtering.
 * 
 * This is more efficient than loading all items when inventory grows.
 * Uses longest tokens (up to 3) to narrow down candidates via ILIKE patterns.
 * 
 * @param householdKey - Household identifier
 * @param tokens - Tokens from ingredient name (longest will be selected)
 * @param client - Database client
 * @returns Candidate inventory items
 */
async function getInventoryCandidates(
  householdKey: string,
  tokens: string[],
  client: DatabaseClient
): Promise<InventoryItemRow[]> {
  if (tokens.length === 0) {
    return [];
  }
  
  // Sort by length descending and take up to MAX_CANDIDATE_TOKENS
  const sortedTokens = [...tokens].sort((a, b) => b.length - a.length);
  const selectedTokens = sortedTokens.slice(0, MAX_CANDIDATE_TOKENS);
  
  // Build ILIKE patterns: %token%
  const patterns = selectedTokens.map(t => `%${t}%`);
  
  const result = await client.query<InventoryItemRow>(
    `SELECT * FROM decision_os.inventory_items 
     WHERE household_key = $1 AND item_name ILIKE ANY($2)
     ORDER BY confidence DESC, last_seen_at DESC
     LIMIT $3`,
    [householdKey, patterns, INVENTORY_CANDIDATES_LIMIT]
  );
  
  return result.rows;
}

/**
 * Find best matching inventory item using token-based matching (v2).
 * 
 * Uses a two-step approach for efficiency:
 * 1. Pre-filter candidates using ILIKE patterns (DB-side)
 * 2. Run full token matcher on candidates only
 * 
 * @param householdKey - Household identifier
 * @param ingredientName - Ingredient to find
 * @param client - Database client
 * @returns Matching inventory items (0 or 1 item)
 */
export async function findInventoryByIngredientName(
  householdKey: string,
  ingredientName: string,
  client: DatabaseClient
): Promise<InventoryItemRow[]> {
  // Tokenize ingredient name
  const tokens = tokenize(ingredientName);
  
  // If no tokens after processing, skip silently
  if (tokens.length === 0) {
    return [];
  }
  
  // Get candidates using ILIKE pre-filter
  const candidates = await getInventoryCandidates(householdKey, tokens, client);
  
  // If no candidates, skip silently
  if (candidates.length === 0) {
    return [];
  }
  
  // Run full token matcher on candidates only
  const { matched } = matchInventoryItem(ingredientName, candidates);
  
  // Return as array for backward compatibility
  return matched ? [matched] : [];
}

/**
 * Update inventory item's qty_used_estimated and last_used_at
 */
export async function incrementInventoryUsage(
  inventoryItemId: string,
  qtyUsedIncrement: number,
  lastUsedAt: string,
  client: DatabaseClient
): Promise<void> {
  await client.query(
    `UPDATE decision_os.inventory_items 
     SET qty_used_estimated = COALESCE(qty_used_estimated, 0) + $1,
         last_used_at = $2
     WHERE id = $3`,
    [qtyUsedIncrement, lastUsedAt, inventoryItemId]
  );
}

// =============================================================================
// MAIN CONSUMPTION FUNCTION
// =============================================================================

/**
 * Consume inventory for a meal when a cook decision is approved.
 * 
 * Called from feedback endpoint when:
 * - userAction = 'approved'
 * - original decision_type = 'cook'
 * - meal_id is present
 * 
 * For each non-pantry-staple ingredient:
 * 1. Find matching inventory_items by case-insensitive contains match
 * 2. Increment qty_used_estimated by parsed qty or 1
 * 3. Set last_used_at to nowIso
 * 
 * @param householdKey - Household identifier
 * @param mealId - The meal being cooked
 * @param nowIso - Current timestamp (when meal was approved)
 * @param client - Database client
 * @returns Result with success status and counts
 * 
 * INVARIANTS:
 * - Never throws on missing inventory matches
 * - Does not modify pantry staples
 * - Does not reduce qty_estimated directly
 */
export async function consumeInventoryForMeal(
  householdKey: string,
  mealId: string,
  nowIso: string,
  client: DatabaseClient
): Promise<ConsumeInventoryResult> {
  const errors: string[] = [];
  let itemsUpdated = 0;
  
  try {
    // Get ingredients for the meal
    const ingredients = await getMealIngredientsForMeal(mealId, client);
    
    if (ingredients.length === 0) {
      // No ingredients found - not an error, just nothing to do
      return { success: true, itemsUpdated: 0, errors: [] };
    }
    
    // Process each non-pantry-staple ingredient
    for (const ingredient of ingredients) {
      // Skip pantry staples - they're assumed always available
      if (ingredient.is_pantry_staple) {
        continue;
      }
      
      try {
        // Find matching inventory items
        const matches = await findInventoryByIngredientName(
          householdKey,
          ingredient.ingredient_name,
          client
        );
        
        if (matches.length === 0) {
          // No match found - silently continue (not an error per invariant)
          continue;
        }
        
        // Parse quantity from ingredient (if available)
        // MealIngredientRow has qty_text field
        const ingredientWithQty = ingredient as MealIngredientRow & { qty_text?: string };
        const qtyToConsume = parseSimpleQty(ingredientWithQty.qty_text);
        
        // Update the first matching inventory item
        // (Could be refined later to pick "best" match)
        const matchedItem = matches[0];
        
        await incrementInventoryUsage(
          matchedItem.id,
          qtyToConsume,
          nowIso,
          client
        );
        
        itemsUpdated++;
      } catch (ingredientError) {
        // Log but don't fail - consumption is best-effort
        const errorMsg = ingredientError instanceof Error 
          ? ingredientError.message 
          : 'Unknown error';
        errors.push(`Failed to consume ${ingredient.ingredient_name}: ${errorMsg}`);
      }
    }
    
    return {
      success: true,
      itemsUpdated,
      errors,
    };
  } catch (error) {
    // Top-level error - return failure but don't throw
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      itemsUpdated,
      errors: [...errors, `Consumption failed: ${errorMsg}`],
    };
  }
}
