/**
 * Receipt Import Handler
 * 
 * Handles receipt image processing:
 * 1. Create receipt_imports record with status='received'
 * 2. Extract text via OCR provider
 * 3. Parse items from text
 * 4. Upsert inventory items
 * 5. Update status to 'parsed' or 'failed'
 * 
 * INVARIANTS:
 * - Response is always { receiptImportId, status } - no arrays exposed
 * - OCR failures return status='failed' with 200 OK, never 500
 * - Dedupe via image hash
 */

import { ocrExtractTextFromImageBase64 } from '../ocr/providers';
import type {
  ReceiptImportStatus,
  ReceiptImportResponse,
  ReceiptImportRecord,
  ParsedReceiptItem,
  InventoryItem,
} from '../../../types/decision-os';

/**
 * Generate a simple hash from a string (for deduplication)
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Generate UUID for receipt import
 */
function generateReceiptImportId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `receipt-${timestamp}-${random}`;
}

/**
 * Parse grocery items from OCR text.
 * Returns items with confidence scores.
 */
export function parseReceiptItems(rawText: string): ParsedReceiptItem[] {
  if (!rawText || rawText.trim().length === 0) {
    return [];
  }
  
  const items: ParsedReceiptItem[] = [];
  const lines = rawText.split('\n');
  
  // Common grocery item patterns
  const itemPatterns = [
    // "Item Name    $X.XX" or "Item Name $X.XX"
    /^(.+?)\s+\$(\d+\.?\d*)$/,
    // "Item Name    X.XX" (no $ sign)
    /^(.+?)\s+(\d+\.\d{2})$/,
  ];
  
  // Known grocery items for higher confidence matching
  const knownItems = new Set([
    'chicken', 'beef', 'pork', 'fish', 'salmon', 'shrimp',
    'pasta', 'rice', 'bread', 'flour', 'sugar',
    'tomatoes', 'tomato', 'onion', 'garlic', 'potato', 'potatoes',
    'milk', 'cheese', 'butter', 'eggs', 'yogurt',
    'olive oil', 'vegetable oil', 'salt', 'pepper',
    'lettuce', 'spinach', 'broccoli', 'carrots', 'celery',
    'apples', 'bananas', 'oranges', 'grapes', 'berries',
    'beans', 'lentils', 'chickpeas',
    'parmesan', 'cheddar', 'mozzarella',
  ]);
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Skip common non-item lines
    if (/^(subtotal|tax|total|thank|date|store|receipt|phone)/i.test(trimmed)) {
      continue;
    }
    
    for (const pattern of itemPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const name = match[1].trim();
        const price = parseFloat(match[2]);
        
        // Skip if name is too short or looks like a header
        if (name.length < 2 || /^\d+$/.test(name)) continue;
        
        // Calculate confidence based on known items
        const nameLower = name.toLowerCase();
        const isKnown = Array.from(knownItems).some(item => 
          nameLower.includes(item) || item.includes(nameLower)
        );
        
        const confidence = isKnown ? 0.85 : 0.60;
        
        items.push({
          name,
          price: isNaN(price) ? undefined : price,
          quantity: 1,
          confidence,
        });
        
        break; // Found match, move to next line
      }
    }
  }
  
  return items;
}

// =============================================================================
// IN-MEMORY STORAGE (Mock DB for testing)
// =============================================================================

/**
 * In-memory receipt imports storage (mock DB)
 */
const receiptImportsStore: Map<string, ReceiptImportRecord> = new Map();

/**
 * In-memory inventory items storage (mock DB)
 */
const inventoryItemsStore: Map<string, InventoryItem> = new Map();

/**
 * Image hash to receipt import ID mapping (for deduplication)
 */
const imageHashIndex: Map<string, string> = new Map();

/**
 * Clear all in-memory stores (for testing)
 */
export function clearReceiptStores(): void {
  receiptImportsStore.clear();
  inventoryItemsStore.clear();
  imageHashIndex.clear();
}

/**
 * Get receipt import by ID
 */
export function getReceiptImport(id: string): ReceiptImportRecord | undefined {
  return receiptImportsStore.get(id);
}

/**
 * Get all inventory items for a user
 */
export function getInventoryItems(userProfileId: number): InventoryItem[] {
  return Array.from(inventoryItemsStore.values())
    .filter(item => item.user_profile_id === userProfileId);
}

/**
 * Get inventory item by name and user
 */
export function getInventoryItemByName(
  userProfileId: number,
  name: string
): InventoryItem | undefined {
  const normalizedName = name.toLowerCase().trim();
  return Array.from(inventoryItemsStore.values())
    .find(item => 
      item.user_profile_id === userProfileId && 
      item.name.toLowerCase().trim() === normalizedName
    );
}

// =============================================================================
// RECEIPT IMPORT PROCESSING
// =============================================================================

/**
 * Process a receipt import request.
 * 
 * @param imageBase64 - Base64 encoded image
 * @param userProfileId - User's profile ID
 * @param householdKey - Household partition key (required)
 * @returns ReceiptImportResponse with receiptImportId and status
 */
export async function processReceiptImport(
  imageBase64: string,
  userProfileId: number,
  householdKey: string = 'default'
): Promise<ReceiptImportResponse> {
  const nowIso = new Date().toISOString();
  const receiptImportId = generateReceiptImportId();
  
  // Calculate image hash for deduplication
  const imageHash = hashString(imageBase64);
  
  // Check for duplicate
  const existingImportId = imageHashIndex.get(imageHash);
  if (existingImportId) {
    const existingImport = receiptImportsStore.get(existingImportId);
    if (existingImport && existingImport.user_profile_id === userProfileId) {
      // Return existing import as duplicate (don't re-process)
      return {
        receiptImportId: existingImportId,
        status: existingImport.status,
      };
    }
  }
  
  // Create initial record with status='received'
  const record: ReceiptImportRecord = {
    id: receiptImportId,
    user_profile_id: userProfileId,
    household_key: householdKey, // Partition key for multi-tenant isolation
    created_at: nowIso,
    status: 'received',
    image_hash: imageHash,
  };
  
  receiptImportsStore.set(receiptImportId, record);
  imageHashIndex.set(imageHash, receiptImportId);
  
  // Extract text via OCR
  const ocrResult = await ocrExtractTextFromImageBase64(imageBase64);
  
  // Handle OCR error
  if (ocrResult.error) {
    record.status = 'failed';
    record.error_message = ocrResult.error;
    receiptImportsStore.set(receiptImportId, record);
    
    return {
      receiptImportId,
      status: 'failed',
    };
  }
  
  // Store raw OCR text
  record.raw_ocr_text = ocrResult.rawText;
  
  // Parse items from OCR text
  const parsedItems = parseReceiptItems(ocrResult.rawText);
  record.parsed_items = parsedItems;
  
  // Upsert inventory items
  const inventoryUpdated = upsertInventoryFromReceipt(
    userProfileId,
    householdKey,
    parsedItems,
    receiptImportId,
    nowIso
  );
  
  // Update status based on parsing success
  if (parsedItems.length === 0 && ocrResult.rawText.length === 0) {
    record.status = 'failed';
    record.error_message = 'No text extracted from image';
  } else if (parsedItems.length === 0) {
    record.status = 'failed';
    record.error_message = 'Could not parse any items from receipt';
  } else {
    record.status = 'parsed';
  }
  
  receiptImportsStore.set(receiptImportId, record);
  
  return {
    receiptImportId,
    status: record.status,
  };
}

/**
 * Upsert inventory items from parsed receipt items.
 * 
 * @returns Number of items upserted
 */
function upsertInventoryFromReceipt(
  userProfileId: number,
  householdKey: string,
  parsedItems: ParsedReceiptItem[],
  receiptImportId: string,
  nowIso: string
): number {
  let count = 0;
  
  for (const item of parsedItems) {
    // Only process items with sufficient confidence
    if (item.confidence < 0.50) continue;
    
    const existingItem = getInventoryItemByName(userProfileId, item.name);
    
    if (existingItem) {
      // Update existing item using canonical columns
      existingItem.remaining_qty = (existingItem.remaining_qty || existingItem.quantity || 0) + (item.quantity || 1);
      existingItem.quantity = existingItem.remaining_qty; // Legacy column
      existingItem.last_seen_at = nowIso;
      existingItem.updated_at = nowIso; // Legacy column
      // Keep higher confidence
      if (item.confidence > existingItem.confidence) {
        existingItem.confidence = item.confidence;
      }
      inventoryItemsStore.set(existingItem.id, existingItem);
    } else {
      // Create new inventory item using canonical columns
      const newItem: InventoryItem = {
        id: `inv-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`,
        user_profile_id: userProfileId,
        household_key: householdKey, // Partition key
        // Canonical columns
        item_name: item.name,
        remaining_qty: item.quantity || 1,
        confidence: item.confidence,
        last_seen_at: nowIso,
        // Legacy columns (for backward compatibility)
        name: item.name,
        quantity: item.quantity || 1,
        source: 'receipt',
        receipt_import_id: receiptImportId,
        created_at: nowIso,
        updated_at: nowIso,
      };
      inventoryItemsStore.set(newItem.id, newItem);
    }
    
    count++;
  }
  
  return count;
}
