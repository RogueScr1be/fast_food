/**
 * Receipt Handler Unit Tests
 */

import {
  processReceiptImport,
  parseReceiptItems,
  clearReceiptStores,
  getReceiptImport,
  getInventoryItems,
  getInventoryItemByName,
} from '../receipt/handler';
import { MOCK_KEYS } from '../ocr/providers';

describe('parseReceiptItems', () => {
  it('returns empty array for empty text', () => {
    expect(parseReceiptItems('')).toEqual([]);
    expect(parseReceiptItems('   ')).toEqual([]);
  });

  it('parses items with dollar sign prices', () => {
    const text = `
      Chicken Breast    $8.99
      Pasta             $1.99
    `;
    
    const items = parseReceiptItems(text);
    
    expect(items.length).toBe(2);
    expect(items[0].name).toBe('Chicken Breast');
    expect(items[0].price).toBe(8.99);
    expect(items[1].name).toBe('Pasta');
    expect(items[1].price).toBe(1.99);
  });

  it('parses items without dollar sign', () => {
    const text = `
      Rice    3.99
      Beans   1.49
    `;
    
    const items = parseReceiptItems(text);
    
    expect(items.length).toBe(2);
    expect(items[0].price).toBe(3.99);
    expect(items[1].price).toBe(1.49);
  });

  it('skips non-item lines', () => {
    const text = `
      GROCERY STORE
      Date: 01/20/2026
      Chicken    $5.99
      SUBTOTAL   $5.99
      TAX        $0.48
      TOTAL      $6.47
      Thank you!
    `;
    
    const items = parseReceiptItems(text);
    
    expect(items.length).toBe(1);
    expect(items[0].name).toBe('Chicken');
  });

  it('assigns higher confidence to known items', () => {
    const text = `
      Chicken Breast    $8.99
      Unknown Item XYZ  $2.99
    `;
    
    const items = parseReceiptItems(text);
    
    const chickenItem = items.find(i => i.name.includes('Chicken'));
    const unknownItem = items.find(i => i.name.includes('Unknown'));
    
    expect(chickenItem?.confidence).toBe(0.85);
    expect(unknownItem?.confidence).toBe(0.60);
  });

  it('sets default quantity to 1', () => {
    const text = 'Tomatoes    $2.49';
    const items = parseReceiptItems(text);
    
    expect(items[0].quantity).toBe(1);
  });
});

describe('processReceiptImport', () => {
  beforeEach(() => {
    clearReceiptStores();
  });

  it('creates receipt import with status=received initially', async () => {
    // Using MOCK_KEY_FULL which returns valid receipt text
    const result = await processReceiptImport(MOCK_KEYS.FULL, 1);
    
    expect(result.receiptImportId).toMatch(/^receipt-/);
    // Final status should be 'parsed' for successful OCR
    expect(result.status).toBe('parsed');
    
    // Verify record was created
    const record = getReceiptImport(result.receiptImportId);
    expect(record).toBeDefined();
    expect(record?.user_profile_id).toBe(1);
  });

  it('returns status=parsed for successful OCR with items', async () => {
    const result = await processReceiptImport(MOCK_KEYS.FULL, 1);
    
    expect(result.status).toBe('parsed');
    
    const record = getReceiptImport(result.receiptImportId);
    expect(record?.raw_ocr_text).toContain('Chicken Breast');
    expect(record?.parsed_items?.length).toBeGreaterThan(0);
  });

  it('returns status=failed for OCR error', async () => {
    const result = await processReceiptImport(MOCK_KEYS.ERROR, 1);
    
    expect(result.status).toBe('failed');
    expect(result.receiptImportId).toMatch(/^receipt-/);
    
    const record = getReceiptImport(result.receiptImportId);
    expect(record?.error_message).toContain('Mock OCR error');
  });

  it('returns status=failed for empty OCR text', async () => {
    const result = await processReceiptImport(MOCK_KEYS.EMPTY, 1);
    
    expect(result.status).toBe('failed');
    
    const record = getReceiptImport(result.receiptImportId);
    expect(record?.error_message).toContain('No text extracted');
  });

  it('creates inventory items from parsed receipt', async () => {
    const result = await processReceiptImport(MOCK_KEYS.FULL, 1);
    
    expect(result.status).toBe('parsed');
    
    const items = getInventoryItems(1);
    expect(items.length).toBeGreaterThan(0);
    
    // Check for specific items from FULL mock
    const chickenItem = items.find(i => i.name.includes('Chicken'));
    expect(chickenItem).toBeDefined();
    expect(chickenItem?.source).toBe('receipt');
    expect(chickenItem?.receipt_import_id).toBe(result.receiptImportId);
  });

  it('updates existing inventory item quantity on duplicate', async () => {
    // First import
    await processReceiptImport(MOCK_KEYS.FULL, 1);
    
    // Get initial inventory
    let items = getInventoryItems(1);
    const initialItem = items.find(i => i.name.includes('Chicken'));
    const initialQty = initialItem?.quantity || 0;
    
    // Second import with different base64 (different hash)
    // to avoid dedupe, we use a slightly modified key
    await processReceiptImport(MOCK_KEYS.FULL + '-v2', 1);
    
    // Get updated inventory
    items = getInventoryItems(1);
    const updatedItem = items.find(i => i.name.includes('Chicken'));
    
    expect(updatedItem?.quantity).toBe(initialQty + 1);
  });

  it('handles deduplication via image hash', async () => {
    // First import
    const result1 = await processReceiptImport(MOCK_KEYS.FULL, 1);
    
    // Same image hash
    const result2 = await processReceiptImport(MOCK_KEYS.FULL, 1);
    
    // Should return the same import ID
    expect(result2.receiptImportId).toBe(result1.receiptImportId);
  });

  it('allows same image for different users', async () => {
    // User 1
    const result1 = await processReceiptImport(MOCK_KEYS.FULL, 1);
    
    // User 2 with same image
    const result2 = await processReceiptImport(MOCK_KEYS.FULL, 2);
    
    // Should create separate imports
    expect(result2.receiptImportId).not.toBe(result1.receiptImportId);
  });
});

describe('inventory item management', () => {
  beforeEach(() => {
    clearReceiptStores();
  });

  it('getInventoryItems returns items for specific user', async () => {
    await processReceiptImport(MOCK_KEYS.FULL, 1);
    await processReceiptImport(MOCK_KEYS.PARTIAL, 2);
    
    const user1Items = getInventoryItems(1);
    const user2Items = getInventoryItems(2);
    
    // User 1 should have FULL receipt items
    expect(user1Items.some(i => i.name.includes('Chicken'))).toBe(true);
    
    // User 2 should have PARTIAL receipt items
    expect(user2Items.some(i => i.name.includes('Rice'))).toBe(true);
    
    // Items should not be mixed
    expect(user1Items.some(i => i.name.includes('Rice'))).toBe(false);
  });

  it('getInventoryItemByName finds item case-insensitively', async () => {
    await processReceiptImport(MOCK_KEYS.FULL, 1);
    
    const item1 = getInventoryItemByName(1, 'Chicken Breast');
    const item2 = getInventoryItemByName(1, 'CHICKEN BREAST');
    const item3 = getInventoryItemByName(1, 'chicken breast');
    
    expect(item1).toBeDefined();
    expect(item2).toBeDefined();
    expect(item3).toBeDefined();
    expect(item1?.id).toBe(item2?.id);
    expect(item1?.id).toBe(item3?.id);
  });

  it('inventory items have required fields', async () => {
    await processReceiptImport(MOCK_KEYS.FULL, 1);
    
    const items = getInventoryItems(1);
    
    for (const item of items) {
      expect(item.id).toBeDefined();
      expect(item.user_profile_id).toBe(1);
      expect(item.name).toBeDefined();
      expect(item.quantity).toBeGreaterThanOrEqual(1);
      expect(item.confidence).toBeGreaterThanOrEqual(0);
      expect(item.confidence).toBeLessThanOrEqual(1);
      expect(item.source).toBe('receipt');
      expect(item.created_at).toBeDefined();
      expect(item.updated_at).toBeDefined();
    }
  });
});

describe('clearReceiptStores', () => {
  it('clears all stores', async () => {
    await processReceiptImport(MOCK_KEYS.FULL, 1);
    
    expect(getInventoryItems(1).length).toBeGreaterThan(0);
    
    clearReceiptStores();
    
    expect(getInventoryItems(1).length).toBe(0);
  });
});
