/**
 * FAST FOOD: Receipt Parser
 * 
 * Parses raw OCR text into structured line items.
 * 
 * DESIGN:
 * - Best-effort parsing (never fails)
 * - Ignores totals/tax/payment lines
 * - Extracts item name, quantity, price when possible
 * 
 * INVARIANTS:
 * - Returns array of parsed lines (internal use only, not exposed to clients)
 * - Unrecognized lines are skipped, not errored
 */

import {
  IGNORE_LINE_PATTERNS,
  PRICE_PATTERNS,
} from './normalize-dict';

// =============================================================================
// TYPES
// =============================================================================

export interface ParsedLine {
  rawLine: string;
  rawItemName: string | null;
  rawQtyText: string | null;
  rawPrice: number | null;
}

export interface ParseResult {
  lines: ParsedLine[];
  totalLinesProcessed: number;
  linesKept: number;
  linesIgnored: number;
}

// =============================================================================
// MAIN PARSER
// =============================================================================

/**
 * Parse raw OCR text into structured line items.
 * 
 * @param rawText - Raw OCR text from receipt
 * @returns Parsed result with lines and statistics
 */
export function parseReceiptText(rawText: string): ParseResult {
  const result: ParseResult = {
    lines: [],
    totalLinesProcessed: 0,
    linesKept: 0,
    linesIgnored: 0,
  };
  
  if (!rawText || rawText.trim() === '') {
    return result;
  }
  
  // Split into lines
  const lines = rawText.split(/\r?\n/);
  result.totalLinesProcessed = lines.length;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (trimmedLine === '') {
      result.linesIgnored++;
      continue;
    }
    
    // Check if line should be ignored
    if (shouldIgnoreLine(trimmedLine)) {
      result.linesIgnored++;
      continue;
    }
    
    // Parse the line
    const parsed = parseLine(trimmedLine);
    
    // Only keep lines that look like items
    if (looksLikeItem(trimmedLine, parsed)) {
      result.lines.push(parsed);
      result.linesKept++;
    } else {
      result.linesIgnored++;
    }
  }
  
  return result;
}

// =============================================================================
// LINE PARSING
// =============================================================================

/**
 * Parse a single receipt line into structured data
 */
function parseLine(line: string): ParsedLine {
  const result: ParsedLine = {
    rawLine: line,
    rawItemName: null,
    rawQtyText: null,
    rawPrice: null,
  };
  
  // Extract price (usually at the end)
  const priceResult = extractPrice(line);
  if (priceResult.price !== null) {
    result.rawPrice = priceResult.price;
  }
  
  // Extract quantity text
  const qtyResult = extractQuantity(line);
  if (qtyResult.qtyText !== null) {
    result.rawQtyText = qtyResult.qtyText;
  }
  
  // Extract item name (what remains after removing price and qty patterns)
  result.rawItemName = extractItemName(line, priceResult.priceText, qtyResult.qtyText);
  
  return result;
}

/**
 * Extract price from a line
 */
function extractPrice(line: string): { price: number | null; priceText: string | null } {
  // Try dollar sign pattern first
  const dollarMatch = line.match(/\$\s*(\d+\.\d{2})/);
  if (dollarMatch) {
    return {
      price: parseFloat(dollarMatch[1]),
      priceText: dollarMatch[0],
    };
  }
  
  // Try trailing decimal pattern (common on receipts)
  const trailingMatch = line.match(/(\d+\.\d{2})\s*[A-Z]?\s*$/);
  if (trailingMatch) {
    const price = parseFloat(trailingMatch[1]);
    // Sanity check: prices usually between $0.10 and $999.99
    if (price >= 0.10 && price < 1000) {
      return {
        price,
        priceText: trailingMatch[0],
      };
    }
  }
  
  return { price: null, priceText: null };
}

/**
 * Extract quantity information from a line
 */
function extractQuantity(line: string): { qtyText: string | null } {
  const lower = line.toLowerCase();
  
  // Pattern: "2.5 LB @ $X.XX/LB"
  const atMatch = lower.match(/(\d+\.?\d*)\s*(lb|lbs|oz|kg|g|gal|ct|ea)?\s*@/i);
  if (atMatch) {
    return { qtyText: atMatch[0].replace(/@/i, '').trim() };
  }
  
  // Pattern: "x2", "X 3"
  const xMatch = line.match(/x\s*(\d+)/i);
  if (xMatch) {
    return { qtyText: xMatch[0] };
  }
  
  // Pattern: "QTY: 2"
  const qtyMatch = line.match(/qty\s*:?\s*(\d+)/i);
  if (qtyMatch) {
    return { qtyText: qtyMatch[0] };
  }
  
  // Pattern: "3 CT", "2 DZ"
  const countMatch = line.match(/(\d+)\s*(ct|count|ea|each|pk|pack|dz|dozen)/i);
  if (countMatch) {
    return { qtyText: countMatch[0] };
  }
  
  // Pattern: "2.5 LB" (anywhere in line)
  const weightMatch = line.match(/(\d+\.?\d*)\s*(lb|lbs|oz|kg|g)/i);
  if (weightMatch) {
    return { qtyText: weightMatch[0] };
  }
  
  return { qtyText: null };
}

/**
 * Extract item name by removing price and quantity patterns
 */
function extractItemName(
  line: string,
  priceText: string | null,
  qtyText: string | null
): string | null {
  let cleaned = line;
  
  // Remove price text
  if (priceText) {
    cleaned = cleaned.replace(priceText, '');
  }
  
  // Remove common price patterns
  cleaned = cleaned
    .replace(/\$\s*\d+\.\d{2}/g, '')
    .replace(/\d+\.\d{2}\s*$/g, '');
  
  // Remove quantity patterns at start
  cleaned = cleaned
    .replace(/^\d+\s*@/g, '')
    .replace(/^\d+\.?\d*\s*(lb|lbs|oz|kg|g|gal|ct|ea|dz)\s*@?\s*/gi, '');
  
  // Remove "@ $X.XX/LB" patterns
  cleaned = cleaned.replace(/@\s*\$?\s*\d+\.?\d*\s*\/?\s*(lb|oz|kg|ea)?/gi, '');
  
  // Remove trailing weight/count indicators already captured
  cleaned = cleaned.replace(/\s+\d+\.?\d*\s*(lb|lbs|oz|kg|g|ct|ea|dz)\s*$/gi, '');
  
  // Remove per-unit price patterns
  cleaned = cleaned.replace(/\/\s*(lb|oz|kg|ea|ct)\b/gi, '');
  
  // Clean up
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .trim();
  
  // Don't return very short names (likely parsing artifacts)
  if (cleaned.length < 2) {
    return null;
  }
  
  return cleaned;
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Check if a line should be ignored
 */
function shouldIgnoreLine(line: string): boolean {
  const lower = line.toLowerCase();
  
  for (const pattern of IGNORE_LINE_PATTERNS) {
    if (pattern.test(lower)) {
      return true;
    }
  }
  
  // Also ignore lines that are too short
  if (line.length < 3) {
    return true;
  }
  
  // Ignore lines that are just numbers (dates, times, etc.)
  if (/^\d+[\s\/\-\.:,]*\d*$/.test(line.trim())) {
    return true;
  }
  
  return false;
}

/**
 * Check if a parsed line looks like an actual item
 */
function looksLikeItem(line: string, parsed: ParsedLine): boolean {
  // Must have some text content
  if (!parsed.rawItemName && !parsed.rawLine) {
    return false;
  }
  
  // Having a price is a good indicator
  if (parsed.rawPrice !== null && parsed.rawPrice > 0) {
    return true;
  }
  
  // Check for price patterns in line
  for (const pattern of PRICE_PATTERNS) {
    if (pattern.test(line)) {
      return true;
    }
  }
  
  // Has an item name with reasonable length
  if (parsed.rawItemName && parsed.rawItemName.length >= 3) {
    // Check it's not just numbers/special chars
    const hasLetters = /[a-z]/i.test(parsed.rawItemName);
    if (hasLetters) {
      return true;
    }
  }
  
  return false;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Try to extract vendor name from receipt text
 */
export function extractVendorName(rawText: string): string | null {
  const lines = rawText.split(/\r?\n/).slice(0, 5); // Check first 5 lines
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip very short lines
    if (trimmed.length < 3) continue;
    
    // Skip lines that look like addresses or phone numbers
    if (/^\d/.test(trimmed)) continue;
    if (/^tel|^phone|^fax/i.test(trimmed)) continue;
    
    // Skip lines that are all caps separators
    if (/^[-=_*#]+$/.test(trimmed)) continue;
    
    // First substantial text line is likely the store name
    if (/^[A-Za-z]/.test(trimmed) && trimmed.length >= 3) {
      // Clean up store name
      return trimmed
        .replace(/#\d+$/, '') // Remove store numbers
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
  
  return null;
}

/**
 * Try to extract purchase date from receipt text
 */
export function extractPurchaseDate(rawText: string): Date | null {
  // Common date patterns
  const patterns = [
    // MM/DD/YYYY, MM-DD-YYYY
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    // YYYY-MM-DD (ISO)
    /(\d{4})-(\d{2})-(\d{2})/,
  ];
  
  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match) {
      try {
        // Try to parse the date
        const parts = match.slice(1).map(p => parseInt(p, 10));
        
        // ISO format
        if (match[0].includes('-') && parts[0] > 1900) {
          return new Date(parts[0], parts[1] - 1, parts[2]);
        }
        
        // US format (MM/DD/YYYY)
        let year = parts[2];
        if (year < 100) {
          year += year > 50 ? 1900 : 2000;
        }
        return new Date(year, parts[0] - 1, parts[1]);
      } catch {
        continue;
      }
    }
  }
  
  return null;
}
