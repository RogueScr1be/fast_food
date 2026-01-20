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
// INFERENCE FUNCTION
// =============================================================================

/**
 * Infer item category from tokens using keyword matching.
 * 
 * Algorithm:
 * 1. For each token, check against each category's keyword set
 * 2. Track which categories have matches
 * 3. Return highest-priority category with matches
 * 4. Return 'other' if no matches
 * 
 * @param tokens - Tokenized item name (lowercase, already processed)
 * @returns Inferred category
 */
export function inferCategoryFromTokens(tokens: string[]): ItemCategory {
  if (tokens.length === 0) {
    return 'other';
  }
  
  // Track categories with matches
  const matchedCategories = new Set<Exclude<ItemCategory, 'other'>>();
  
  for (const token of tokens) {
    for (const category of CATEGORY_PRIORITY) {
      if (CATEGORY_KEYWORDS[category].has(token)) {
        matchedCategories.add(category);
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
