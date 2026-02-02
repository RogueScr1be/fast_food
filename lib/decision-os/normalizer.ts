/**
 * FAST FOOD: Receipt Item Normalizer
 * 
 * Normalizes raw receipt item names to canonical ingredient names.
 * 
 * DESIGN:
 * - Best-effort normalization (never fails)
 * - Returns confidence score for each normalization
 * - Uses abbreviation dictionary for common patterns
 * 
 * INVARIANTS:
 * - Unrecognized items return null without failing
 * - Confidence indicates reliability of normalization
 */

import {
  ABBREVIATION_MAP,
  UNIT_MAP,
  QTY_PATTERNS,
} from './normalize-dict';

// =============================================================================
// TYPES
// =============================================================================

export interface NormalizedItemResult {
  normalizedName: string | null;
  confidence: number;
}

export interface NormalizedUnitQtyResult {
  qtyEstimated: number | null;
  unit: string | null;
  confidenceDelta: number;
}

// =============================================================================
// ITEM NAME NORMALIZATION
// =============================================================================

/**
 * Normalize a raw item name to a canonical ingredient name.
 * 
 * Steps:
 * 1. Lowercase and trim
 * 2. Strip store codes, punctuation, trailing numbers
 * 3. Try direct dictionary lookup
 * 4. Try partial/fuzzy matching
 * 5. Return cleaned name with appropriate confidence
 * 
 * @param rawItemName - Raw item name from receipt OCR
 * @returns Normalized name and confidence score
 */
export function normalizeItemName(rawItemName: string | null | undefined): NormalizedItemResult {
  if (!rawItemName || rawItemName.trim() === '') {
    return { normalizedName: null, confidence: 0 };
  }
  
  // Step 1: Lowercase and trim
  let cleaned = rawItemName.toLowerCase().trim();
  
  // Step 2: Strip common patterns
  cleaned = stripStoreCodes(cleaned);
  cleaned = stripPunctuation(cleaned);
  cleaned = stripTrailingNumbers(cleaned);
  cleaned = stripWeightPrice(cleaned);
  cleaned = cleaned.trim();
  
  if (cleaned === '') {
    return { normalizedName: null, confidence: 0 };
  }
  
  // Step 3: Try exact dictionary lookup
  if (ABBREVIATION_MAP[cleaned]) {
    return {
      normalizedName: ABBREVIATION_MAP[cleaned],
      confidence: 0.95, // High confidence for exact match
    };
  }
  
  // Step 4: Try partial matches
  // Try progressively shorter prefixes
  const words = cleaned.split(/\s+/);
  
  // Try full phrase minus last word, minus last two words, etc.
  for (let i = words.length; i >= 1; i--) {
    const partial = words.slice(0, i).join(' ');
    if (ABBREVIATION_MAP[partial]) {
      // Confidence decreases with fewer matching words
      const confidence = 0.85 - (words.length - i) * 0.10;
      return {
        normalizedName: ABBREVIATION_MAP[partial],
        confidence: Math.max(confidence, 0.60),
      };
    }
  }
  
  // Step 5: Try first word only
  if (words.length > 1 && ABBREVIATION_MAP[words[0]]) {
    return {
      normalizedName: ABBREVIATION_MAP[words[0]],
      confidence: 0.65,
    };
  }
  
  // Step 6: Check if any dictionary value contains our cleaned string
  for (const [abbrev, canonical] of Object.entries(ABBREVIATION_MAP)) {
    if (cleaned.includes(abbrev) || abbrev.includes(cleaned)) {
      return {
        normalizedName: canonical,
        confidence: 0.55,
      };
    }
  }
  
  // Step 7: Return cleaned name as-is (best effort)
  // Remove single-char words and clean up
  const finalCleaned = words
    .filter(w => w.length > 1)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (finalCleaned.length >= 3) {
    return {
      normalizedName: finalCleaned,
      confidence: 0.40, // Low confidence for unrecognized
    };
  }
  
  return { normalizedName: null, confidence: 0 };
}

// =============================================================================
// UNIT AND QUANTITY NORMALIZATION
// =============================================================================

/**
 * Normalize quantity and unit from raw text.
 * 
 * @param rawQtyText - Raw quantity text (e.g., "2 LB", "3 CT")
 * @param rawLine - Full raw line for additional context
 * @returns Normalized quantity, unit, and confidence delta
 */
export function normalizeUnitAndQty(
  rawQtyText: string | null | undefined,
  rawLine: string | null | undefined
): NormalizedUnitQtyResult {
  const defaultResult: NormalizedUnitQtyResult = {
    qtyEstimated: null,
    unit: null,
    confidenceDelta: 0,
  };
  
  // Try raw qty text first
  if (rawQtyText && rawQtyText.trim() !== '') {
    const result = extractQtyAndUnit(rawQtyText);
    if (result.qtyEstimated !== null || result.unit !== null) {
      return result;
    }
  }
  
  // Fall back to full line
  if (rawLine && rawLine.trim() !== '') {
    const result = extractQtyAndUnit(rawLine);
    if (result.qtyEstimated !== null || result.unit !== null) {
      // Lower confidence for extraction from full line
      return {
        ...result,
        confidenceDelta: result.confidenceDelta - 0.05,
      };
    }
  }
  
  return defaultResult;
}

/**
 * Extract quantity and unit from a text string
 */
function extractQtyAndUnit(text: string): NormalizedUnitQtyResult {
  const result: NormalizedUnitQtyResult = {
    qtyEstimated: null,
    unit: null,
    confidenceDelta: 0,
  };
  
  const lower = text.toLowerCase();
  
  // Try quantity patterns
  for (const pattern of QTY_PATTERNS) {
    const match = lower.match(pattern);
    if (match && match[1]) {
      const qty = parseFloat(match[1]);
      if (!isNaN(qty) && qty > 0 && qty < 1000) {
        result.qtyEstimated = qty;
        result.confidenceDelta += 0.10;
        break;
      }
    }
  }
  
  // Try to extract unit
  for (const [abbrev, canonical] of Object.entries(UNIT_MAP)) {
    // Match unit at word boundary
    const unitPattern = new RegExp(`\\b${escapeRegex(abbrev)}\\b`, 'i');
    if (unitPattern.test(lower)) {
      result.unit = canonical;
      result.confidenceDelta += 0.05;
      break;
    }
  }
  
  // Special case: "2.5 LB @ $X.XX/LB" pattern
  const atPattern = /(\d+\.?\d*)\s*(lb|lbs|oz|kg|g|gal|ct)?\s*@/i;
  const atMatch = lower.match(atPattern);
  if (atMatch) {
    const qty = parseFloat(atMatch[1]);
    if (!isNaN(qty) && qty > 0) {
      result.qtyEstimated = qty;
      result.confidenceDelta += 0.10;
    }
    if (atMatch[2]) {
      const unit = UNIT_MAP[atMatch[2].toLowerCase()];
      if (unit) {
        result.unit = unit;
        result.confidenceDelta += 0.05;
      }
    }
  }
  
  // Special case: "16OZ" pattern (no space)
  const noSpacePattern = /(\d+)\s*(oz|lb|g|ml|ct)\b/i;
  const noSpaceMatch = lower.match(noSpacePattern);
  if (noSpaceMatch && result.qtyEstimated === null) {
    const qty = parseFloat(noSpaceMatch[1]);
    if (!isNaN(qty) && qty > 0 && qty < 1000) {
      result.qtyEstimated = qty;
      result.confidenceDelta += 0.05;
    }
    if (noSpaceMatch[2]) {
      const unit = UNIT_MAP[noSpaceMatch[2].toLowerCase()];
      if (unit) {
        result.unit = unit;
      }
    }
  }
  
  return result;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Strip store-specific codes (e.g., PLU codes, UPC prefixes)
 */
function stripStoreCodes(text: string): string {
  return text
    // Remove PLU codes at start (4-5 digit numbers)
    .replace(/^\d{4,5}\s+/, '')
    // Remove UPC-like patterns
    .replace(/\d{12,13}/, '')
    // Remove product codes like "SKU12345"
    .replace(/\b(sku|plu|upc|item)\s*#?\s*\d+\b/gi, '')
    // Remove department codes like "DEPT 5"
    .replace(/\bdept\s*\d+\b/gi, '')
    // Remove codes in parentheses
    .replace(/\(\d+\)/g, '')
    .trim();
}

/**
 * Strip punctuation except apostrophes in contractions
 */
function stripPunctuation(text: string): string {
  return text
    // Remove common punctuation
    .replace(/[.,;:!?*#@&%]/g, ' ')
    // Keep apostrophes in words but remove isolated ones
    .replace(/(?<![a-z])'|'(?![a-z])/gi, ' ')
    // Normalize multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip trailing numbers (often prices or weights already captured)
 */
function stripTrailingNumbers(text: string): string {
  return text
    // Remove trailing price-like numbers
    .replace(/\s+\d+\.\d{2}$/, '')
    // Remove trailing integers
    .replace(/\s+\d+$/, '')
    .trim();
}

/**
 * Strip weight/price patterns that got included
 */
function stripWeightPrice(text: string): string {
  return text
    // Remove "@" price patterns
    .replace(/@\s*\$?\s*\d+\.?\d*\/?\w*/g, '')
    // Remove price with dollar sign
    .replace(/\$\s*\d+\.?\d*/g, '')
    // Remove "per lb" type patterns
    .replace(/\/\s*(lb|oz|kg|ea|ct)\b/gi, '')
    .trim();
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// BATCH NORMALIZATION (for convenience)
// =============================================================================

/**
 * Normalize multiple items at once
 */
export function normalizeItems(
  items: Array<{
    rawItemName: string | null;
    rawQtyText: string | null;
    rawLine: string;
  }>
): Array<{
  normalizedName: string | null;
  unit: string | null;
  qtyEstimated: number | null;
  confidence: number;
}> {
  return items.map(item => {
    const nameResult = normalizeItemName(item.rawItemName ?? item.rawLine);
    const unitQtyResult = normalizeUnitAndQty(item.rawQtyText, item.rawLine);
    
    // Combine confidence
    let confidence = nameResult.confidence + unitQtyResult.confidenceDelta;
    confidence = Math.max(0, Math.min(1, confidence));
    
    return {
      normalizedName: nameResult.normalizedName,
      unit: unitQtyResult.unit,
      qtyEstimated: unitQtyResult.qtyEstimated,
      confidence,
    };
  });
}
