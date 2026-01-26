/**
 * FAST FOOD: Inventory Matching - Tokenizer
 * 
 * Deterministic tokenization for inventory matching.
 * 
 * INVARIANTS:
 * - Deterministic: same input always produces same output
 * - Stopwords removed to reduce false positives
 * - Tokens lowercase, de-duped, capped at 10
 */

// =============================================================================
// STOPWORDS
// =============================================================================

/**
 * Stopwords to remove during tokenization.
 * These are common descriptors that don't help with matching.
 */
export const STOPWORDS = new Set([
  // Freshness/quality descriptors
  'fresh',
  'organic',
  'natural',
  'raw',
  'cooked',
  'frozen',
  'canned',
  
  // Size descriptors
  'large',
  'small',
  'medium',
  'mini',
  'jumbo',
  
  // Package descriptors
  'pack',
  'pkg',
  'package',
  'family',
  'value',
  'brand',
  'store',
  'bulk',
  
  // Unit abbreviations
  'oz',
  'lb',
  'lbs',
  'ct',
  'each',
  'count',
  'gal',
  'qt',
  'pt',
  
  // Common filler words
  'the',
  'and',
  'for',
  'with',
]);

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Minimum token length to keep
 */
export const MIN_TOKEN_LENGTH = 3;

/**
 * Maximum number of tokens to return
 */
export const MAX_TOKENS = 10;

// =============================================================================
// TOKENIZER
// =============================================================================

/**
 * Tokenize text for inventory matching.
 * 
 * Process:
 * 1. Lowercase
 * 2. Replace non-alphanumerics with space
 * 3. Split on whitespace
 * 4. Remove stopwords
 * 5. Drop tokens with length < 3
 * 6. De-dupe (preserve first occurrence order)
 * 7. Cap at 10 tokens
 * 
 * @param text - Input text to tokenize
 * @returns Array of tokens (lowercase, de-duped, max 10)
 */
export function tokenize(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  // 1. Lowercase
  let processed = text.toLowerCase();
  
  // 2. Replace non-alphanumerics with space
  processed = processed.replace(/[^a-z0-9]+/g, ' ');
  
  // 3. Split on whitespace
  const rawTokens = processed.split(/\s+/).filter(Boolean);
  
  // 4-6. Remove stopwords, drop short tokens, de-dupe
  const seen = new Set<string>();
  const tokens: string[] = [];
  
  for (const token of rawTokens) {
    // Skip stopwords
    if (STOPWORDS.has(token)) {
      continue;
    }
    
    // Skip short tokens
    if (token.length < MIN_TOKEN_LENGTH) {
      continue;
    }
    
    // Skip duplicates
    if (seen.has(token)) {
      continue;
    }
    
    seen.add(token);
    tokens.push(token);
    
    // 7. Cap at MAX_TOKENS
    if (tokens.length >= MAX_TOKENS) {
      break;
    }
  }
  
  return tokens;
}

/**
 * Get the token set for comparison operations.
 * Returns a Set for efficient intersection/lookup.
 */
export function getTokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}
