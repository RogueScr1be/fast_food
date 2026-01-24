/**
 * Inventory Category Normalizer
 * 
 * Deterministic mapping of raw item names to standard categories.
 * Used for inventory advisory signals to the Arbiter.
 * 
 * DESIGN PRINCIPLES (per constitution.md):
 * - No user questions or choices
 * - Deterministic logic only (no ML)
 * - Silent operation (no UI feedback beyond acknowledgment)
 * 
 * CATEGORY HIERARCHY:
 * - protein: meat, fish, eggs, tofu
 * - carb: pasta, rice, bread, potato
 * - vegetable: fresh produce
 * - dairy: milk, cheese, butter, yogurt
 * - pantry: oils, spices, canned goods
 * - fruit: fresh fruits
 */

// =============================================================================
// CATEGORY DEFINITIONS
// =============================================================================

export type InventoryCategory = 
  | 'protein'
  | 'carb'
  | 'vegetable'
  | 'dairy'
  | 'pantry'
  | 'fruit'
  | 'unknown';

/**
 * Normalized inventory item with category
 */
export interface NormalizedInventoryItem {
  originalName: string;
  normalizedName: string;
  category: InventoryCategory;
  confidence: number;
}

// =============================================================================
// CATEGORY KEYWORDS (deterministic matching)
// =============================================================================

/**
 * Keyword to category mapping.
 * Order matters: first match wins.
 * All keywords are lowercase.
 */
const CATEGORY_KEYWORDS: Record<InventoryCategory, string[]> = {
  protein: [
    // Poultry
    'chicken', 'turkey', 'duck', 'poultry',
    // Red meat
    'beef', 'steak', 'ground beef', 'hamburger', 'pork', 'ham', 'bacon', 'sausage', 'lamb', 'veal',
    // Seafood
    'fish', 'salmon', 'tuna', 'cod', 'tilapia', 'shrimp', 'prawns', 'crab', 'lobster', 'scallops', 'mussels', 'clams', 'oysters',
    // Other protein
    'eggs', 'egg', 'tofu', 'tempeh', 'seitan',
  ],
  carb: [
    // Pasta
    'pasta', 'spaghetti', 'penne', 'fettuccine', 'linguine', 'macaroni', 'lasagna', 'noodles', 'ramen',
    // Rice & grains
    'rice', 'quinoa', 'couscous', 'barley', 'oats', 'oatmeal', 'bulgur', 'farro',
    // Bread
    'bread', 'baguette', 'rolls', 'tortilla', 'pita', 'naan', 'bagel', 'croissant', 'bun', 'buns',
    // Potato
    'potato', 'potatoes', 'sweet potato', 'yam',
    // Other starches
    'flour', 'cornmeal', 'polenta', 'gnocchi',
  ],
  vegetable: [
    // Leafy greens
    'lettuce', 'spinach', 'kale', 'arugula', 'chard', 'cabbage', 'bok choy', 'collard',
    // Alliums
    'onion', 'onions', 'garlic', 'shallot', 'leek', 'scallion', 'green onion',
    // Nightshades
    'tomato', 'tomatoes', 'pepper', 'peppers', 'bell pepper', 'eggplant', 'aubergine',
    // Cruciferous
    'broccoli', 'cauliflower', 'brussels', 'kohlrabi',
    // Root vegetables
    'carrot', 'carrots', 'celery', 'beet', 'beets', 'radish', 'turnip', 'parsnip',
    // Squash family
    'zucchini', 'squash', 'cucumber', 'pumpkin',
    // Legumes (as vegetable)
    'green beans', 'snap peas', 'snow peas', 'edamame',
    // Others
    'mushroom', 'mushrooms', 'asparagus', 'artichoke', 'corn', 'avocado',
  ],
  dairy: [
    // Milk
    'milk', 'whole milk', 'skim milk', '2% milk', 'cream', 'half and half', 'heavy cream',
    // Cheese
    'cheese', 'cheddar', 'mozzarella', 'parmesan', 'swiss', 'brie', 'feta', 'gouda', 'provolone', 'ricotta', 'cottage cheese', 'cream cheese',
    // Butter
    'butter', 'margarine',
    // Yogurt
    'yogurt', 'greek yogurt', 'sour cream',
  ],
  pantry: [
    // Oils
    'olive oil', 'vegetable oil', 'canola oil', 'coconut oil', 'sesame oil', 'oil',
    // Vinegars
    'vinegar', 'balsamic', 'apple cider vinegar', 'rice vinegar',
    // Seasonings
    'salt', 'pepper', 'black pepper', 'spice', 'seasoning', 'herb', 'basil', 'oregano', 'thyme', 'rosemary', 'cumin', 'paprika', 'cinnamon', 'nutmeg',
    // Canned goods
    'canned', 'beans', 'black beans', 'kidney beans', 'chickpeas', 'lentils', 'diced tomatoes', 'tomato sauce', 'tomato paste', 'coconut milk',
    // Sauces
    'soy sauce', 'hot sauce', 'sriracha', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'bbq sauce',
    // Baking
    'sugar', 'brown sugar', 'honey', 'maple syrup', 'baking soda', 'baking powder', 'yeast', 'vanilla',
    // Nuts & seeds
    'almonds', 'walnuts', 'peanuts', 'cashews', 'pecans', 'sunflower seeds', 'peanut butter',
    // Stock
    'broth', 'stock', 'chicken broth', 'beef broth', 'vegetable broth', 'bouillon',
  ],
  fruit: [
    'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges', 'lemon', 'lemons', 'lime', 'limes',
    'grapes', 'grape', 'strawberry', 'strawberries', 'blueberry', 'blueberries', 'raspberry', 'raspberries', 'blackberry', 'blackberries', 'berries',
    'mango', 'pineapple', 'watermelon', 'cantaloupe', 'honeydew', 'melon',
    'peach', 'peaches', 'plum', 'plums', 'pear', 'pears', 'cherry', 'cherries', 'apricot',
    'kiwi', 'papaya', 'pomegranate', 'fig', 'figs', 'dates', 'coconut',
    'grapefruit', 'tangerine', 'clementine', 'mandarin',
  ],
  unknown: [], // Fallback category
};

// =============================================================================
// NORMALIZATION FUNCTIONS
// =============================================================================

/**
 * Normalize an item name to lowercase, trimmed, with common variations resolved.
 */
export function normalizeItemName(rawName: string): string {
  let normalized = rawName.toLowerCase().trim();
  
  // Remove common prefixes/suffixes
  normalized = normalized
    .replace(/^(organic|fresh|frozen|canned|dried|raw|cooked|sliced|diced|chopped|minced|whole|boneless|skinless)\s+/i, '')
    .replace(/\s+(organic|fresh|frozen|lb|lbs|oz|kg|g|pack|bag|bunch|each|ct|count)$/i, '')
    .trim();
  
  // Remove brand names (simple heuristic: all caps words at start)
  normalized = normalized.replace(/^[A-Z]{2,}\s+/, '').trim();
  
  // Remove numeric prefixes (e.g., "2 lb chicken")
  normalized = normalized.replace(/^\d+\s*(lb|lbs|oz|kg|g|ct)?\s*/i, '').trim();
  
  return normalized;
}

/**
 * Determine category for a normalized item name.
 * Returns the first matching category.
 */
export function categorizeItem(normalizedName: string): InventoryCategory {
  const searchName = normalizedName.toLowerCase();
  
  // Check each category in order of specificity
  const categoryOrder: InventoryCategory[] = [
    'protein', 'dairy', 'carb', 'vegetable', 'fruit', 'pantry'
  ];
  
  for (const category of categoryOrder) {
    const keywords = CATEGORY_KEYWORDS[category];
    for (const keyword of keywords) {
      // Check if keyword is in the name (word boundary aware)
      if (searchName === keyword || 
          searchName.includes(keyword) ||
          keyword.includes(searchName)) {
        return category;
      }
    }
  }
  
  return 'unknown';
}

/**
 * Normalize a single inventory item.
 */
export function normalizeInventoryItem(
  rawName: string,
  originalConfidence: number
): NormalizedInventoryItem {
  const normalizedName = normalizeItemName(rawName);
  const category = categorizeItem(normalizedName);
  
  // Adjust confidence based on category match
  // Unknown items get lower confidence
  const confidence = category === 'unknown' 
    ? originalConfidence * 0.7 
    : originalConfidence;
  
  return {
    originalName: rawName,
    normalizedName,
    category,
    confidence,
  };
}

/**
 * Normalize a list of inventory items.
 * Deterministic: same input always produces same output.
 */
export function normalizeInventoryItems(
  items: Array<{ name: string; confidence: number }>
): NormalizedInventoryItem[] {
  return items.map(item => normalizeInventoryItem(item.name, item.confidence));
}

// =============================================================================
// INVENTORY SIGNAL FOR ARBITER
// =============================================================================

/**
 * Check if household has protein available.
 * Used by Arbiter for boolean gating.
 */
export function hasProteinAvailable(
  normalizedItems: NormalizedInventoryItem[],
  minConfidence: number = 0.5
): boolean {
  return normalizedItems.some(
    item => item.category === 'protein' && item.confidence >= minConfidence
  );
}

/**
 * Check if household has carbs available.
 */
export function hasCarbAvailable(
  normalizedItems: NormalizedInventoryItem[],
  minConfidence: number = 0.5
): boolean {
  return normalizedItems.some(
    item => item.category === 'carb' && item.confidence >= minConfidence
  );
}

/**
 * Check if household has vegetables available.
 */
export function hasVegetableAvailable(
  normalizedItems: NormalizedInventoryItem[],
  minConfidence: number = 0.5
): boolean {
  return normalizedItems.some(
    item => item.category === 'vegetable' && item.confidence >= minConfidence
  );
}

/**
 * Check if household has dairy available.
 */
export function hasDairyAvailable(
  normalizedItems: NormalizedInventoryItem[],
  minConfidence: number = 0.5
): boolean {
  return normalizedItems.some(
    item => item.category === 'dairy' && item.confidence >= minConfidence
  );
}

/**
 * Build inventory availability map for Arbiter.
 * Returns a simple object of category → boolean.
 */
export function buildInventoryAvailability(
  normalizedItems: NormalizedInventoryItem[],
  minConfidence: number = 0.5
): Record<InventoryCategory, boolean> {
  return {
    protein: hasProteinAvailable(normalizedItems, minConfidence),
    carb: hasCarbAvailable(normalizedItems, minConfidence),
    vegetable: hasVegetableAvailable(normalizedItems, minConfidence),
    dairy: hasDairyAvailable(normalizedItems, minConfidence),
    pantry: normalizedItems.some(i => i.category === 'pantry' && i.confidence >= minConfidence),
    fruit: normalizedItems.some(i => i.category === 'fruit' && i.confidence >= minConfidence),
    unknown: false, // Never "available"
  };
}

/**
 * Check if a specific item (by name) is available in inventory.
 * Used for ingredient-level checks.
 */
export function isItemAvailable(
  normalizedItems: NormalizedInventoryItem[],
  itemName: string,
  minConfidence: number = 0.4
): boolean {
  const searchName = normalizeItemName(itemName);
  
  return normalizedItems.some(item => {
    if (item.confidence < minConfidence) return false;
    
    // Exact match
    if (item.normalizedName === searchName) return true;
    
    // Partial match (item contains search or vice versa)
    if (item.normalizedName.includes(searchName) || 
        searchName.includes(item.normalizedName)) {
      return true;
    }
    
    return false;
  });
}

/**
 * Get all items in a specific category.
 */
export function getItemsByCategory(
  normalizedItems: NormalizedInventoryItem[],
  category: InventoryCategory
): NormalizedInventoryItem[] {
  return normalizedItems.filter(item => item.category === category);
}
