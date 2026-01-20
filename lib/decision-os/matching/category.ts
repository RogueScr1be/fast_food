/**
 * FAST FOOD: Inventory Matching - Category Inference
 * 
 * Lightweight category inference to reduce "wrong aisle" matches.
 * Uses simple keyword sets for deterministic categorization.
 * 
 * INVARIANTS:
 * - Deterministic: same tokens always produce same category
 * - Lightweight: max 7 categories (protein, produce, dairy, pantry, bakery, frozen, other)
 * - Best-effort: returns 'other' if no keywords match
 */

// =============================================================================
// TYPES
// =============================================================================

export type ItemCategory = 
  | 'protein' 
  | 'produce' 
  | 'dairy' 
  | 'pantry' 
  | 'bakery' 
  | 'frozen' 
  | 'other';

// =============================================================================
// CATEGORY KEYWORDS
// =============================================================================

/**
 * Keyword sets for each category.
 * Order matters for priority: first match wins.
 * Keywords are lowercase and should match tokenized text.
 */
export const CATEGORY_KEYWORDS: Record<Exclude<ItemCategory, 'other'>, Set<string>> = {
  protein: new Set([
    'chicken', 'beef', 'pork', 'fish', 'turkey', 'sausage', 'bacon', 'tofu', 'ham',
    'salmon', 'shrimp', 'steak', 'ground', 'breast', 'thigh', 'wing', 'drumstick',
    'lamb', 'veal', 'duck', 'tuna', 'cod', 'tilapia', 'meatball', 'patty',
  ]),
  
  produce: new Set([
    'tomato', 'tomatoes', 'onion', 'onions', 'lettuce', 'spinach', 'apple', 'apples',
    'banana', 'bananas', 'pepper', 'peppers', 'broccoli', 'carrot', 'carrots',
    'potato', 'potatoes', 'garlic', 'celery', 'cucumber', 'avocado', 'lemon',
    'lime', 'orange', 'oranges', 'ginger', 'cilantro', 'parsley', 'basil',
    'mushroom', 'mushrooms', 'zucchini', 'squash', 'cabbage', 'kale', 'arugula',
  ]),
  
  dairy: new Set([
    'milk', 'cheese', 'yogurt', 'butter', 'cream', 'egg', 'eggs',
    'cheddar', 'mozzarella', 'parmesan', 'sour', 'cottage', 'ricotta',
    'whipping', 'half',
  ]),
  
  pantry: new Set([
    'pasta', 'rice', 'beans', 'oil', 'flour', 'sugar', 'sauce', 'cereal',
    'vinegar', 'salt', 'pepper', 'spice', 'honey', 'syrup', 'stock', 'broth',
    'noodles', 'spaghetti', 'macaroni', 'lentils', 'chickpeas', 'canned',
    'olive', 'vegetable', 'canola', 'soy', 'teriyaki', 'ketchup', 'mustard',
    'mayo', 'mayonnaise', 'breadcrumbs', 'panko',
  ]),
  
  bakery: new Set([
    'bread', 'bun', 'buns', 'tortilla', 'tortillas', 'bagel', 'bagels',
    'roll', 'rolls', 'croissant', 'muffin', 'muffins', 'pita', 'wrap', 'wraps',
    'english', 'sourdough', 'wheat', 'white', 'whole',
  ]),
  
  frozen: new Set([
    'frozen', 'ice', 'pizza', 'freezer', 'fries', 'nuggets', 'popsicle',
    'icecream', 'sorbet', 'gelato',
  ]),
};

/**
 * Category priority order for disambiguation.
 * If tokens match multiple categories, first in this list wins.
 */
const CATEGORY_PRIORITY: Array<Exclude<ItemCategory, 'other'>> = [
  'protein',   // Most specific - meat/fish
  'produce',   // Fresh vegetables/fruits
  'dairy',     // Milk products
  'frozen',    // Frozen items
  'bakery',    // Bread products
  'pantry',    // Shelf-stable items (most general)
];

// =============================================================================
// GENERIC TOKENS REQUIRING CO-TOKENS
// =============================================================================

/**
 * Protein tokens that are too generic on their own.
 * These only classify as protein if accompanied by a core protein token.
 * E.g., "ground" alone could be coffee, but "ground beef" is protein.
 */
export const GENERIC_PROTEIN_TOKENS = new Set([
  'ground', 'breast', 'thigh', 'wing', 'drumstick', 'patty', 'meatball',
]);

/**
 * Core protein tokens that validate generic protein tokens.
 */
export const CORE_PROTEIN_TOKENS = new Set([
  'chicken', 'beef', 'pork', 'turkey', 'fish', 'lamb', 'veal', 'duck',
  'salmon', 'tuna', 'cod', 'tilapia', 'shrimp',
]);

/**
 * Bakery tokens that are too generic on their own.
 * These only classify as bakery if accompanied by a core bakery token.
 * E.g., "whole" alone could be anything, but "whole wheat bread" is bakery.
 */
export const GENERIC_BAKERY_TOKENS = new Set([
  'whole', 'white', 'wheat', 'english', 'sourdough',
]);

/**
 * Core bakery tokens that validate generic bakery tokens.
 */
export const CORE_BAKERY_TOKENS = new Set([
  'bread', 'bun', 'buns', 'bagel', 'bagels', 'muffin', 'muffins',
  'tortilla', 'tortillas', 'roll', 'rolls', 'croissant', 'pita', 'wrap', 'wraps',
]);

/**
 * Dairy tokens that are too generic on their own.
 * E.g., "half" alone is meaningless, but "half and half" or "half cream" is dairy.
 */
export const GENERIC_DAIRY_TOKENS = new Set([
  'half',
]);

/**
 * Core dairy tokens that validate generic dairy tokens.
 */
export const CORE_DAIRY_TOKENS = new Set([
  'milk', 'cream', 'cheese', 'yogurt', 'butter', 'egg', 'eggs',
]);

// =============================================================================
// INFERENCE FUNCTION
// =============================================================================

/**
 * Check if a token is a generic token that requires a co-token.
 * Returns the category it would belong to if validated, or null if not generic.
 */
function getGenericTokenCategory(token: string): Exclude<ItemCategory, 'other'> | null {
  if (GENERIC_PROTEIN_TOKENS.has(token)) return 'protein';
  if (GENERIC_BAKERY_TOKENS.has(token)) return 'bakery';
  if (GENERIC_DAIRY_TOKENS.has(token)) return 'dairy';
  return null;
}

/**
 * Check if tokens contain a core token for the given category.
 */
function hasCoreToken(tokens: string[], category: Exclude<ItemCategory, 'other'>): boolean {
  switch (category) {
    case 'protein':
      return tokens.some(t => CORE_PROTEIN_TOKENS.has(t));
    case 'bakery':
      return tokens.some(t => CORE_BAKERY_TOKENS.has(t));
    case 'dairy':
      return tokens.some(t => CORE_DAIRY_TOKENS.has(t));
    default:
      return false;
  }
}

/**
 * Infer item category from tokens using keyword matching.
 * 
 * Algorithm:
 * 1. For each token, check against each category's keyword set
 * 2. For generic tokens (ground, breast, whole, english, half, etc.),
 *    only count them if a core token for that category is present
 * 3. Track which categories have valid matches
 * 4. Return highest-priority category with matches
 * 5. Return 'other' if no matches
 * 
 * @param tokens - Tokenized item name (lowercase, already processed)
 * @returns Inferred category
 */
export function inferCategoryFromTokens(tokens: string[]): ItemCategory {
  if (tokens.length === 0) {
    return 'other';
  }
  
  const tokenSet = new Set(tokens);
  
  // Track categories with valid matches
  const matchedCategories = new Set<Exclude<ItemCategory, 'other'>>();
  
  for (const token of tokens) {
    for (const category of CATEGORY_PRIORITY) {
      if (CATEGORY_KEYWORDS[category].has(token)) {
        // Check if this is a generic token that requires a co-token
        const genericCategory = getGenericTokenCategory(token);
        
        if (genericCategory !== null) {
          // This is a generic token - only count if core token present
          if (hasCoreToken(tokens, genericCategory)) {
            matchedCategories.add(category);
          }
          // If no core token, don't count this match
        } else {
          // Not a generic token - count normally
          matchedCategories.add(category);
        }
      }
    }
  }
  
  // Return highest-priority matched category
  for (const category of CATEGORY_PRIORITY) {
    if (matchedCategories.has(category)) {
      return category;
    }
  }
  
  return 'other';
}

/**
 * Check if two categories are compatible (same or one is 'other').
 * Used to determine if category mismatch penalty should apply.
 * 
 * @param cat1 - First category
 * @param cat2 - Second category
 * @returns True if compatible, false if mismatch
 */
export function areCategoriesCompatible(cat1: ItemCategory, cat2: ItemCategory): boolean {
  // 'other' is always compatible (no penalty)
  if (cat1 === 'other' || cat2 === 'other') {
    return true;
  }
  
  // Same category is compatible
  return cat1 === cat2;
}
