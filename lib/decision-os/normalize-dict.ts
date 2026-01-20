/**
 * FAST FOOD: Normalization Dictionary
 * 
 * Maps common receipt abbreviations to canonical ingredient names.
 * Used by normalizer.ts to improve item recognition.
 * 
 * FORMAT:
 * - Keys: lowercase abbreviated forms as they appear on receipts
 * - Values: canonical ingredient name (lowercase)
 * 
 * MAINTENANCE:
 * - Add new mappings as they're encountered in production
 * - Keep alphabetically sorted within categories for readability
 */

// =============================================================================
// ABBREVIATION TO CANONICAL NAME MAPPING
// =============================================================================

/**
 * Direct abbreviation mappings
 * Key: receipt abbreviation (lowercase)
 * Value: canonical ingredient name (lowercase)
 */
export const ABBREVIATION_MAP: Record<string, string> = {
  // === PROTEINS ===
  'chk': 'chicken',
  'chk brst': 'chicken breast',
  'chk brst bnls': 'chicken breast',
  'chkn': 'chicken',
  'chkn brst': 'chicken breast',
  'chicken brst': 'chicken breast',
  'grnd bf': 'ground beef',
  'grnd beef': 'ground beef',
  'ground bf': 'ground beef',
  'bf grnd': 'ground beef',
  'beef grnd': 'ground beef',
  'grnd trky': 'ground turkey',
  'trky grnd': 'ground turkey',
  'pork chp': 'pork chop',
  'pork chps': 'pork chops',
  'bacon slcd': 'bacon',
  'bcn': 'bacon',
  'sausage lnk': 'sausage',
  'saus lnk': 'sausage',
  'salm flt': 'salmon fillet',
  'salmon flt': 'salmon fillet',
  'shrimp lg': 'shrimp',
  'shrmp': 'shrimp',
  'tuna cn': 'canned tuna',
  'tuna canned': 'canned tuna',
  
  // === DAIRY ===
  'eggs': 'eggs',
  'org eggs': 'eggs',
  'eggs lrg': 'eggs',
  'eggs lg': 'eggs',
  'eggs dz': 'eggs',
  'eggs lrg dz': 'eggs',
  'milk': 'milk',
  'milk 2%': 'milk',
  'milk whl': 'whole milk',
  'milk skim': 'skim milk',
  'mlk': 'milk',
  'butter': 'butter',
  'butter unslted': 'butter',
  'butter unslt': 'butter',
  'bttr': 'butter',
  'cheese chdr': 'cheddar cheese',
  'cheese cheddar': 'cheddar cheese',
  'chdr cheese': 'cheddar cheese',
  'cheese chdr shrd': 'shredded cheddar',
  'cheese mozz': 'mozzarella cheese',
  'mozz cheese': 'mozzarella cheese',
  'cheese parm': 'parmesan cheese',
  'parm cheese': 'parmesan cheese',
  'cream cheese': 'cream cheese',
  'crm cheese': 'cream cheese',
  'sour crm': 'sour cream',
  'sour cream': 'sour cream',
  'yogurt grk': 'greek yogurt',
  'greek yogurt': 'greek yogurt',
  
  // === PRODUCE ===
  'tom': 'tomatoes',
  'tom roma': 'roma tomatoes',
  'tomato': 'tomatoes',
  'tomatoes roma': 'roma tomatoes',
  'onion ylw': 'yellow onion',
  'onion wht': 'white onion',
  'onion red': 'red onion',
  'onn': 'onion',
  'garlic': 'garlic',
  'grlc': 'garlic',
  'potato': 'potatoes',
  'potatoes': 'potatoes',
  'pot': 'potatoes',
  'potato russ': 'russet potatoes',
  'carrot': 'carrots',
  'carrots': 'carrots',
  'crrt': 'carrots',
  'celery': 'celery',
  'clry': 'celery',
  'lettuce': 'lettuce',
  'lettuce rom': 'romaine lettuce',
  'lettuce icbrg': 'iceberg lettuce',
  'spinach': 'spinach',
  'spnch': 'spinach',
  'broccoli': 'broccoli',
  'broc': 'broccoli',
  'pepper grn': 'green pepper',
  'pepper red': 'red pepper',
  'bell pepper': 'bell pepper',
  'jalapeno': 'jalapeno',
  'avocado': 'avocado',
  'avo': 'avocado',
  'cucumber': 'cucumber',
  'cucu': 'cucumber',
  'mushroom': 'mushrooms',
  'mushrooms': 'mushrooms',
  'mush': 'mushrooms',
  'corn': 'corn',
  'corn swt': 'sweet corn',
  'green beans': 'green beans',
  'grn beans': 'green beans',
  
  // === FRUITS ===
  'banana': 'bananas',
  'bananas': 'bananas',
  'apple': 'apples',
  'apples': 'apples',
  'apl': 'apples',
  'orange': 'oranges',
  'oranges': 'oranges',
  'orng': 'oranges',
  'lemon': 'lemons',
  'lemons': 'lemons',
  'lime': 'limes',
  'limes': 'limes',
  'strawberry': 'strawberries',
  'strawberries': 'strawberries',
  'strwbry': 'strawberries',
  'blueberry': 'blueberries',
  'blueberries': 'blueberries',
  'grape': 'grapes',
  'grapes': 'grapes',
  
  // === BREAD/GRAINS ===
  'bread': 'bread',
  'brd': 'bread',
  'brd whl wht': 'whole wheat bread',
  'bread whl wht': 'whole wheat bread',
  'bread white': 'white bread',
  'tortilla': 'tortillas',
  'tortillas': 'tortillas',
  'tort flr': 'flour tortillas',
  'tort corn': 'corn tortillas',
  'pasta': 'pasta',
  'pasta spgti': 'spaghetti',
  'spaghetti': 'spaghetti',
  'penne': 'penne pasta',
  'rice wht': 'white rice',
  'rice brn': 'brown rice',
  'rice': 'rice',
  'oats': 'oats',
  'oatmeal': 'oatmeal',
  
  // === CANNED/JARRED ===
  'marinara': 'marinara sauce',
  'marinara sce': 'marinara sauce',
  'tomato sce': 'tomato sauce',
  'tomato paste': 'tomato paste',
  'tom paste': 'tomato paste',
  'beans blk': 'black beans',
  'black beans': 'black beans',
  'beans pinto': 'pinto beans',
  'beans kidney': 'kidney beans',
  'chickpeas': 'chickpeas',
  'chkpeas': 'chickpeas',
  'coconut milk': 'coconut milk',
  'coco milk': 'coconut milk',
  'broth chk': 'chicken broth',
  'broth veg': 'vegetable broth',
  'broth beef': 'beef broth',
  
  // === OILS/CONDIMENTS ===
  'olive oil': 'olive oil',
  'olive oil evoo': 'olive oil',
  'evoo': 'olive oil',
  'oil olv': 'olive oil',
  'vegetable oil': 'vegetable oil',
  'veg oil': 'vegetable oil',
  'canola oil': 'canola oil',
  'mayo': 'mayonnaise',
  'mayonnaise': 'mayonnaise',
  'ketchup': 'ketchup',
  'mustard': 'mustard',
  'soy sauce': 'soy sauce',
  'soy sce': 'soy sauce',
  'vinegar': 'vinegar',
  'balsamic': 'balsamic vinegar',
  'hot sauce': 'hot sauce',
  'salsa': 'salsa',
  
  // === SPICES/SEASONINGS ===
  'salt': 'salt',
  'salt iodized': 'salt',
  'pepper': 'black pepper',
  'black pepper': 'black pepper',
  'blk pepper': 'black pepper',
  'pepper grd': 'ground black pepper',
  'black pepper grd': 'ground black pepper',
  'garlic pwd': 'garlic powder',
  'garlic powder': 'garlic powder',
  'onion pwd': 'onion powder',
  'onion powder': 'onion powder',
  'cumin': 'cumin',
  'paprika': 'paprika',
  'oregano': 'oregano',
  'basil': 'basil',
  'thyme': 'thyme',
  'rosemary': 'rosemary',
  'cinnamon': 'cinnamon',
  'red pepper flk': 'red pepper flakes',
  'chili pwd': 'chili powder',
  'chili powder': 'chili powder',
  'italian seasn': 'italian seasoning',
  'taco seasn': 'taco seasoning',
  
  // === BAKING ===
  'flour ap': 'all-purpose flour',
  'flour all purp': 'all-purpose flour',
  'flour': 'flour',
  'sugar': 'sugar',
  'sugar wht': 'white sugar',
  'sugar brn': 'brown sugar',
  'brown sugar': 'brown sugar',
  'baking soda': 'baking soda',
  'baking pwd': 'baking powder',
  'vanilla ext': 'vanilla extract',
  'vanilla': 'vanilla extract',
  
  // === NUTS/SNACKS ===
  'peanut butter': 'peanut butter',
  'pb': 'peanut butter',
  'almond': 'almonds',
  'almonds': 'almonds',
  'walnut': 'walnuts',
  'walnuts': 'walnuts',
  'cashew': 'cashews',
  'cashews': 'cashews',
  
  // === FROZEN ===
  'frz peas': 'frozen peas',
  'peas frz': 'frozen peas',
  'frz corn': 'frozen corn',
  'frz veg': 'frozen vegetables',
  'frz berries': 'frozen berries',
};

// =============================================================================
// UNIT ABBREVIATION MAPPING
// =============================================================================

/**
 * Unit abbreviation mappings
 * Key: receipt abbreviation (lowercase)
 * Value: canonical unit name (lowercase)
 */
export const UNIT_MAP: Record<string, string> = {
  // Weight
  'lb': 'lb',
  'lbs': 'lb',
  'pound': 'lb',
  'pounds': 'lb',
  'oz': 'oz',
  'ounce': 'oz',
  'ounces': 'oz',
  'g': 'g',
  'gram': 'g',
  'grams': 'g',
  'kg': 'kg',
  'kilogram': 'kg',
  
  // Volume
  'gal': 'gal',
  'gallon': 'gal',
  'qt': 'qt',
  'quart': 'qt',
  'pt': 'pt',
  'pint': 'pt',
  'cup': 'cup',
  'cups': 'cup',
  'ml': 'ml',
  'l': 'l',
  'liter': 'l',
  'fl oz': 'fl oz',
  
  // Count
  'ct': 'count',
  'count': 'count',
  'ea': 'each',
  'each': 'each',
  'pk': 'pack',
  'pack': 'pack',
  'dz': 'dozen',
  'dozen': 'dozen',
  'bag': 'bag',
  'box': 'box',
  'can': 'can',
  'jar': 'jar',
  'btl': 'bottle',
  'bottle': 'bottle',
  'bunch': 'bunch',
};

// =============================================================================
// IGNORE PATTERNS (for parsing)
// =============================================================================

/**
 * Patterns that indicate a line should be ignored (not an item)
 */
export const IGNORE_LINE_PATTERNS: RegExp[] = [
  /^subtotal/i,
  /^sub total/i,
  /^total/i,
  /^tax/i,
  /^sales tax/i,
  /^payment/i,
  /^visa/i,
  /^mastercard/i,
  /^amex/i,
  /^discover/i,
  /^debit/i,
  /^credit/i,
  /^cash/i,
  /^change/i,
  /^auth/i,
  /^approval/i,
  /^thank you/i,
  /^thanks/i,
  /^welcome/i,
  /^receipt/i,
  /^store/i,
  /^address/i,
  /^phone/i,
  /^tel/i,
  /^fax/i,
  /^www\./i,
  /^http/i,
  /^\d{2}\/\d{2}\/\d{2,4}/, // Date pattern at start
  /^\d{1,2}:\d{2}/, // Time pattern at start
  /^[-=_*#]{3,}$/, // Separator lines
  /^\s*$/, // Empty lines
  /^savings/i,
  /^discount/i,
  /^coupon/i,
  /^you saved/i,
  /^member/i,
  /^balance/i,
  /^points/i,
  /^rewards/i,
];

/**
 * Patterns that strongly indicate a price (for validation)
 */
export const PRICE_PATTERNS: RegExp[] = [
  /\$\s*\d+\.\d{2}/, // $X.XX
  /\d+\.\d{2}\s*$/, // X.XX at end
  /\d+\.\d{2}\s*[A-Z]?$/, // X.XX possibly followed by tax indicator
];

/**
 * Patterns that indicate quantity in the line
 */
export const QTY_PATTERNS: RegExp[] = [
  /(\d+\.?\d*)\s*@/, // 2.5 @
  /x\s*(\d+)/i, // x2, X 3
  /qty\s*:?\s*(\d+)/i, // QTY: 2, qty 3
  /(\d+)\s*(?:ct|count|ea|each|pk|pack)/i, // 3 CT, 2 each
  /(\d+\.?\d*)\s*(?:lb|lbs|oz|kg|g)/i, // 2.5 lb, 16 oz
];
