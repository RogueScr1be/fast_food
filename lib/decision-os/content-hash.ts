/**
 * FAST FOOD: Receipt Content Hash
 * 
 * Computes deterministic content hash for receipt deduplication.
 * 
 * HASHING RULES:
 * - Normalize OCR text: trim, collapse whitespace, lowercase
 * - Include vendorName if present
 * - Include purchasedAt rounded to date (YYYY-MM-DD) if present
 * - SHA256 hex output
 * 
 * INVARIANTS:
 * - Same logical content => same hash (deterministic)
 * - Slight whitespace/case differences => same hash (normalization)
 * - Different dates => different hash
 * - Different vendors => different hash
 */

import { createHash } from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export interface ContentHashInput {
  ocrRawText: string;
  vendorName?: string | null;
  purchasedAtIso?: string | null;
}

// =============================================================================
// NORMALIZATION
// =============================================================================

/**
 * Normalize text for consistent hashing.
 * - Trim leading/trailing whitespace
 * - Collapse multiple whitespace into single space
 * - Convert to lowercase
 * - Remove non-printable characters
 */
export function normalizeTextForHash(text: string | null | undefined): string {
  if (!text) return '';
  
  return text
    // Remove non-printable characters
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    // Collapse all whitespace (spaces, tabs, newlines) into single space
    .replace(/\s+/g, ' ')
    // Trim leading/trailing
    .trim()
    // Lowercase for case-insensitive comparison
    .toLowerCase();
}

/**
 * Extract date portion (YYYY-MM-DD) from ISO timestamp.
 * Returns empty string if input is null/undefined/invalid.
 */
export function extractDateFromIso(isoString: string | null | undefined): string {
  if (!isoString) return '';
  
  // Try to extract YYYY-MM-DD from the beginning
  const match = isoString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }
  
  // Fallback: try parsing as Date and formatting
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    
    // Format as YYYY-MM-DD in UTC
    return date.toISOString().split('T')[0];
  } catch {
    return '';
  }
}

// =============================================================================
// HASH COMPUTATION
// =============================================================================

/**
 * Compute content hash for receipt deduplication.
 * 
 * Algorithm:
 * 1. Normalize OCR text (trim, collapse whitespace, lowercase)
 * 2. Normalize vendor name (if present)
 * 3. Extract date from purchasedAt (YYYY-MM-DD only)
 * 4. Concatenate: "{normalizedText}|{vendor}|{date}"
 * 5. SHA256 hash, return full hex string
 * 
 * @param input - Hash input components
 * @returns SHA256 hex string (64 characters)
 */
export function computeContentHash(input: ContentHashInput): string {
  // Normalize components
  const normalizedText = normalizeTextForHash(input.ocrRawText);
  const normalizedVendor = normalizeTextForHash(input.vendorName);
  const dateOnly = extractDateFromIso(input.purchasedAtIso);
  
  // Concatenate with delimiter
  // Using | as delimiter (unlikely to appear in normalized text)
  const combined = `${normalizedText}|${normalizedVendor}|${dateOnly}`;
  
  // Compute SHA256 hash
  const hash = createHash('sha256')
    .update(combined, 'utf8')
    .digest('hex');
  
  return hash;
}

/**
 * Compute preliminary hash before OCR (just vendor + date if available).
 * This is used for initial insert, then updated after OCR completes.
 */
export function computePreliminaryHash(
  vendorName?: string | null,
  purchasedAtIso?: string | null
): string {
  return computeContentHash({
    ocrRawText: '',  // No OCR text yet
    vendorName,
    purchasedAtIso,
  });
}

/**
 * Check if two hashes indicate the same content.
 */
export function isSameContent(hash1: string, hash2: string): boolean {
  return hash1 === hash2 && hash1.length > 0;
}
