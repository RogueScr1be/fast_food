/**
 * FAST FOOD: Receipt Ingestion Types
 * 
 * INVARIANTS:
 * - No arrays in API response payloads
 * - Single receipt import ID returned (not list)
 * - Status indicates success/failure
 */

// =============================================================================
// REQUEST TYPES
// =============================================================================

export interface ReceiptImportRequest {
  householdKey: string;
  source: 'image_upload' | 'email_forward' | 'manual_text';
  purchasedAtIso?: string;  // Optional ISO timestamp
  vendorName?: string;      // Optional vendor name
  receiptImageBase64: string; // Base64-encoded image
}

// =============================================================================
// RESPONSE TYPES (STRICT - no arrays)
// =============================================================================

export interface ReceiptImportResponse {
  receiptImportId: string;
  status: 'received' | 'parsed' | 'failed';
}

// =============================================================================
// INTERNAL TYPES (not exposed to clients)
// =============================================================================

export type ReceiptSource = 'image_upload' | 'email_forward' | 'manual_text';
export type ReceiptStatus = 'received' | 'parsed' | 'failed';

/**
 * Parsed line item (internal - used during processing)
 */
export interface ParsedReceiptLine {
  rawLine: string;
  rawItemName: string | null;
  rawQtyText: string | null;
  rawPrice: number | null;
}

/**
 * Normalized line item (internal - stored in DB)
 */
export interface NormalizedReceiptLine extends ParsedReceiptLine {
  normalizedItemName: string | null;
  normalizedUnit: string | null;
  normalizedQtyEstimated: number | null;
  confidence: number;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate receipt import request
 */
export function isValidReceiptImportRequest(body: unknown): body is ReceiptImportRequest {
  if (typeof body !== 'object' || body === null) return false;
  
  const req = body as Record<string, unknown>;
  
  // Required fields
  if (typeof req.householdKey !== 'string' || !req.householdKey) return false;
  if (typeof req.receiptImageBase64 !== 'string' || !req.receiptImageBase64) return false;
  
  // Source must be valid enum
  const validSources = ['image_upload', 'email_forward', 'manual_text'];
  if (!validSources.includes(req.source as string)) return false;
  
  // Optional fields must be string if present
  if (req.purchasedAtIso !== undefined && typeof req.purchasedAtIso !== 'string') return false;
  if (req.vendorName !== undefined && typeof req.vendorName !== 'string') return false;
  
  return true;
}
