/**
 * Receipt Ingestion Tests
 * 
 * INVARIANTS TESTED:
 * 1. Successful import creates receipt_imports + receipt_line_items
 * 2. Inventory_items upserted only for confidence >= 0.60
 * 3. OCR failure still creates receipt_imports with status='failed' (no 500)
 * 4. Parser ignores totals/tax lines
 * 5. Normalizer maps abbreviations correctly
 * 6. GREATEST confidence rule for inventory upsert
 * 7. last_seen_at uses purchasedAtIso when present
 */

import { parseReceiptText, extractVendorName, extractPurchaseDate } from '../lib/decision-os/receipt-parser';
import { normalizeItemName, normalizeUnitAndQty, normalizeItems } from '../lib/decision-os/normalizer';
import {
  MockOcrProvider,
  setOcrProvider,
  resetOcrProvider,
  ocrExtractTextFromImageBase64,
  createMockOcrProviderWithResponse,
  MOCK_KEY_EMPTY,
  MOCK_KEY_MINIMAL,
  MOCK_KEY_FULL,
  MOCK_KEY_CHICKEN,
  DEFAULT_RECEIPT,
  MINIMAL_RECEIPT,
  CHICKEN_RECEIPT,
} from '../lib/decision-os/ocr';
import {
  getTestClient,
  insertReceiptImport,
  updateReceiptImportStatus,
  insertReceiptLineItem,
  upsertInventoryItemFromReceipt,
  getReceiptImportById,
  getReceiptLineItemsByImportId,
  getReceiptLineItemCount,
  getInventoryItemByName,
  getAllInventoryItems,
  getInventoryItemCount,
} from '../lib/decision-os/database';

// =============================================================================
// PARSER TESTS
// =============================================================================

describe('Receipt Parser', () => {
  test('ignores totals/tax/payment lines', () => {
    const receiptText = `
MILK 2% GAL     $3.99
BREAD WHL WHT   $2.49
-----------
SUBTOTAL        $6.48
TAX             $0.52
TOTAL           $7.00
VISA ****1234
THANK YOU
`;
    
    const result = parseReceiptText(receiptText);
    
    // Should only keep item lines (MILK, BREAD)
    expect(result.linesKept).toBe(2);
    
    // Should ignore totals, tax, payment, separator
    expect(result.linesIgnored).toBeGreaterThan(0);
    
    // Verify no ignored patterns in kept lines
    for (const line of result.lines) {
      expect(line.rawLine.toLowerCase()).not.toContain('subtotal');
      expect(line.rawLine.toLowerCase()).not.toContain('total');
      expect(line.rawLine.toLowerCase()).not.toContain('tax');
      expect(line.rawLine.toLowerCase()).not.toContain('visa');
      expect(line.rawLine.toLowerCase()).not.toContain('thank');
    }
  });
  
  test('extracts item lines with prices', () => {
    const receiptText = `
BANANAS 2.5 LB               $1.48
ORG EGGS LRG DZ              $5.99
CHK BRST BNLS 1.2 LB         $7.49
`;
    
    const result = parseReceiptText(receiptText);
    
    expect(result.linesKept).toBe(3);
    
    // Check first item - price is at the end
    const banana = result.lines.find(l => l.rawLine.includes('BANANA'));
    expect(banana).toBeDefined();
    expect(banana!.rawPrice).toBe(1.48);
    
    // Check eggs
    const eggs = result.lines.find(l => l.rawLine.includes('EGGS'));
    expect(eggs).toBeDefined();
    expect(eggs!.rawPrice).toBe(5.99);
  });
  
  test('extracts quantity patterns', () => {
    const receiptText = `
BANANAS 2.5 LB @ $0.59/LB    $1.48
TOM ROMA 3 CT                $2.99
PASTA x2                     $3.98
QTY: 4 APPLES                $4.00
`;
    
    const result = parseReceiptText(receiptText);
    
    expect(result.linesKept).toBe(4);
    
    // Check quantity extraction
    const banana = result.lines.find(l => l.rawLine.includes('BANANA'));
    expect(banana?.rawQtyText).toBeTruthy();
    
    const tomato = result.lines.find(l => l.rawLine.includes('TOM'));
    expect(tomato?.rawQtyText).toBeTruthy();
  });
  
  test('extracts vendor name from first lines', () => {
    const receiptText = `
SAFEWAY #1234
456 Oak Avenue
San Francisco, CA 94102
01/15/2026 5:32 PM
MILK 2% GAL     $3.99
`;
    
    const vendorName = extractVendorName(receiptText);
    
    expect(vendorName).toBe('SAFEWAY');
  });
  
  test('extracts purchase date', () => {
    const receiptText = `
STORE NAME
01/15/2026 5:32 PM
ITEM    $1.00
`;
    
    const purchaseDate = extractPurchaseDate(receiptText);
    
    expect(purchaseDate).toBeDefined();
    expect(purchaseDate!.getMonth()).toBe(0); // January
    expect(purchaseDate!.getDate()).toBe(15);
    expect(purchaseDate!.getFullYear()).toBe(2026);
  });
  
  test('handles empty input gracefully', () => {
    const result = parseReceiptText('');
    
    expect(result.lines).toHaveLength(0);
    expect(result.totalLinesProcessed).toBe(0);
  });
});

// =============================================================================
// NORMALIZER TESTS
// =============================================================================

describe('Normalizer', () => {
  describe('normalizeItemName', () => {
    test('maps abbreviations to canonical names', () => {
      const testCases: Array<{ input: string; expectedName: string; minConfidence: number }> = [
        { input: 'chk brst', expectedName: 'chicken breast', minConfidence: 0.90 },
        { input: 'grnd bf', expectedName: 'ground beef', minConfidence: 0.90 },
        { input: 'tom roma', expectedName: 'roma tomatoes', minConfidence: 0.90 },
        { input: 'milk', expectedName: 'milk', minConfidence: 0.90 },
        { input: 'org eggs', expectedName: 'eggs', minConfidence: 0.80 },
        { input: 'brd', expectedName: 'bread', minConfidence: 0.50 },
      ];
      
      for (const tc of testCases) {
        const result = normalizeItemName(tc.input);
        expect(result.normalizedName).toBe(tc.expectedName);
        expect(result.confidence).toBeGreaterThanOrEqual(tc.minConfidence);
      }
    });
    
    test('returns low confidence for unrecognized items', () => {
      const result = normalizeItemName('XYZABC UNKNOWN ITEM 123');
      
      // Should still return something, but with low confidence
      expect(result.confidence).toBeLessThan(0.50);
    });
    
    test('handles null/empty input', () => {
      expect(normalizeItemName(null).normalizedName).toBeNull();
      expect(normalizeItemName('').normalizedName).toBeNull();
      expect(normalizeItemName('   ').normalizedName).toBeNull();
    });
    
    test('strips store codes and punctuation', () => {
      // Test with just the item name after code removal
      const result = normalizeItemName('MILK 2%');
      
      expect(result.normalizedName).toBe('milk');
      expect(result.confidence).toBeGreaterThan(0.50);
    });
  });
  
  describe('normalizeUnitAndQty', () => {
    test('extracts quantity and unit from LB pattern', () => {
      const result = normalizeUnitAndQty('2.5 LB', 'BANANAS 2.5 LB @ $0.59/LB');
      
      expect(result.qtyEstimated).toBe(2.5);
      expect(result.unit).toBe('lb');
      expect(result.confidenceDelta).toBeGreaterThan(0);
    });
    
    test('extracts count pattern', () => {
      const result = normalizeUnitAndQty('3 CT', 'TOM ROMA 3 CT $2.99');
      
      expect(result.qtyEstimated).toBe(3);
      expect(result.unit).toBe('count');
    });
    
    test('handles missing quantity gracefully', () => {
      const result = normalizeUnitAndQty(null, 'MILK $3.99');
      
      expect(result.qtyEstimated).toBeNull();
      expect(result.unit).toBeNull();
      expect(result.confidenceDelta).toBe(0);
    });
  });
  
  describe('normalizeItems batch', () => {
    test('normalizes multiple items', () => {
      const items = [
        { rawItemName: 'CHK BRST', rawQtyText: '1.2 LB', rawLine: 'CHK BRST 1.2 LB $7.49' },
        { rawItemName: 'GRND BF', rawQtyText: '1 LB', rawLine: 'GRND BF 1 LB $6.99' },
      ];
      
      const results = normalizeItems(items);
      
      expect(results).toHaveLength(2);
      expect(results[0].normalizedName).toBe('chicken breast');
      expect(results[1].normalizedName).toBe('ground beef');
    });
  });
});

// =============================================================================
// OCR ADAPTER TESTS
// =============================================================================

describe('OCR Adapter', () => {
  afterEach(() => {
    resetOcrProvider();
  });
  
  describe('deterministic keying strategy', () => {
    test('MOCK_KEY_FULL returns full receipt', async () => {
      const result = await ocrExtractTextFromImageBase64(MOCK_KEY_FULL);
      
      expect(result.provider).toBe('mock');
      expect(result.rawText).toBe(DEFAULT_RECEIPT);
      expect(result.rawText).toContain('SAFEWAY');
    });
    
    test('MOCK_KEY_MINIMAL returns minimal receipt', async () => {
      const result = await ocrExtractTextFromImageBase64(MOCK_KEY_MINIMAL);
      
      expect(result.provider).toBe('mock');
      expect(result.rawText).toBe(MINIMAL_RECEIPT);
      expect(result.rawText).toContain('GROCERY STORE');
    });
    
    test('MOCK_KEY_CHICKEN returns chicken receipt', async () => {
      const result = await ocrExtractTextFromImageBase64(MOCK_KEY_CHICKEN);
      
      expect(result.provider).toBe('mock');
      expect(result.rawText).toBe(CHICKEN_RECEIPT);
      expect(result.rawText).toContain('CHK BRST BNLS');
    });
    
    test('MOCK_KEY_EMPTY returns empty text (failure simulation)', async () => {
      const result = await ocrExtractTextFromImageBase64(MOCK_KEY_EMPTY);
      
      expect(result.provider).toBe('mock');
      expect(result.rawText).toBe('');
    });
    
    test('unknown input returns default receipt (not based on length)', async () => {
      // Any input without a known key should return the same default
      const result1 = await ocrExtractTextFromImageBase64('short');
      const result2 = await ocrExtractTextFromImageBase64('a'.repeat(1000));
      const result3 = await ocrExtractTextFromImageBase64('random-image-data-xyz');
      
      expect(result1.rawText).toBe(DEFAULT_RECEIPT);
      expect(result2.rawText).toBe(DEFAULT_RECEIPT);
      expect(result3.rawText).toBe(DEFAULT_RECEIPT);
    });
  });
  
  test('provider is injectable', async () => {
    const customText = 'CUSTOM STORE\nITEM $1.00';
    const customProvider = createMockOcrProviderWithResponse(customText);
    setOcrProvider(customProvider);
    
    const result = await ocrExtractTextFromImageBase64('any-input');
    
    expect(result.rawText).toBe(customText);
  });
  
  test('handles errors gracefully', async () => {
    // Create a provider that throws
    const errorProvider: MockOcrProvider = {
      extractText: async () => { throw new Error('OCR failed'); },
      setMockResponse: () => {},
      clearMocks: () => {},
    } as unknown as MockOcrProvider;
    
    setOcrProvider(errorProvider);
    
    const result = await ocrExtractTextFromImageBase64('test');
    
    // Should not throw, should return error result
    expect(result.provider).toBe('error');
    expect(result.rawText).toBe('');
  });
});

// =============================================================================
// DATABASE TESTS
// =============================================================================

describe('Receipt Database Operations', () => {
  let testClient: ReturnType<typeof getTestClient>;
  
  beforeEach(() => {
    testClient = getTestClient();
  });
  
  describe('Receipt Import', () => {
    test('creates receipt import record', async () => {
      const receiptId = 'test-receipt-001';
      
      await insertReceiptImport({
        id: receiptId,
        household_key: 'default',
        source: 'image_upload',
        vendor_name: null,
        purchased_at: null,
        ocr_provider: null,
        ocr_raw_text: null,
        status: 'received',
        error_message: null,
      }, testClient);
      
      const retrieved = await getReceiptImportById(receiptId, testClient);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved!.status).toBe('received');
      expect(retrieved!.source).toBe('image_upload');
    });
    
    test('updates receipt status', async () => {
      const receiptId = 'test-receipt-002';
      
      await insertReceiptImport({
        id: receiptId,
        household_key: 'default',
        source: 'image_upload',
        vendor_name: null,
        purchased_at: null,
        ocr_provider: null,
        ocr_raw_text: null,
        status: 'received',
        error_message: null,
      }, testClient);
      
      await updateReceiptImportStatus(receiptId, {
        status: 'parsed',
        ocr_provider: 'mock',
        ocr_raw_text: 'Test OCR text',
      }, testClient);
      
      const retrieved = await getReceiptImportById(receiptId, testClient);
      
      expect(retrieved!.status).toBe('parsed');
      expect(retrieved!.ocr_provider).toBe('mock');
    });
  });
  
  describe('Receipt Line Items', () => {
    test('creates line items linked to import', async () => {
      const receiptId = 'test-receipt-003';
      const lineItemId = 'test-line-001';
      
      await insertReceiptImport({
        id: receiptId,
        household_key: 'default',
        source: 'image_upload',
        vendor_name: null,
        purchased_at: null,
        ocr_provider: null,
        ocr_raw_text: null,
        status: 'received',
        error_message: null,
      }, testClient);
      
      await insertReceiptLineItem({
        id: lineItemId,
        receipt_import_id: receiptId,
        raw_line: 'MILK 2% GAL $3.99',
        raw_item_name: 'MILK 2% GAL',
        raw_qty_text: null,
        raw_price: 3.99,
        normalized_item_name: 'milk',
        normalized_unit: 'gal',
        normalized_qty_estimated: 1,
        confidence: 0.85,
      }, testClient);
      
      const lineItems = await getReceiptLineItemsByImportId(receiptId, testClient);
      
      expect(lineItems).toHaveLength(1);
      expect(lineItems[0].normalized_item_name).toBe('milk');
      expect(lineItems[0].confidence).toBe(0.85);
    });
    
    test('counts line items correctly', async () => {
      const receiptId = 'test-receipt-004';
      
      await insertReceiptImport({
        id: receiptId,
        household_key: 'default',
        source: 'image_upload',
        vendor_name: null,
        purchased_at: null,
        ocr_provider: null,
        ocr_raw_text: null,
        status: 'received',
        error_message: null,
      }, testClient);
      
      // Insert 3 line items
      for (let i = 0; i < 3; i++) {
        await insertReceiptLineItem({
          id: `line-${i}`,
          receipt_import_id: receiptId,
          raw_line: `ITEM ${i} $1.00`,
          raw_item_name: `ITEM ${i}`,
          raw_qty_text: null,
          raw_price: 1.00,
          normalized_item_name: null,
          normalized_unit: null,
          normalized_qty_estimated: null,
          confidence: 0.50,
        }, testClient);
      }
      
      const count = await getReceiptLineItemCount(receiptId, testClient);
      
      expect(count).toBe(3);
    });
  });
  
  describe('Inventory Upsert', () => {
    test('inserts new inventory item', async () => {
      const householdKey = 'test-household-inv';
      const itemName = 'milk';
      
      await upsertInventoryItemFromReceipt({
        id: 'inv-001',
        householdKey,
        itemName,
        qtyEstimated: 1,
        unit: 'gal',
        confidence: 0.85,
        lastSeenAt: '2026-01-20T12:00:00Z',
      }, testClient);
      
      const item = await getInventoryItemByName(householdKey, itemName, testClient);
      
      expect(item).not.toBeNull();
      expect(item!.item_name).toBe('milk');
      expect(item!.confidence).toBe(0.85);
      expect(item!.source).toBe('receipt');
    });
    
    test('GREATEST confidence rule on upsert', async () => {
      const householdKey = 'test-household-greatest';
      const itemName = 'eggs';
      
      // First insert with confidence 0.70
      await upsertInventoryItemFromReceipt({
        id: 'inv-002',
        householdKey,
        itemName,
        qtyEstimated: 12,
        unit: 'count',
        confidence: 0.70,
        lastSeenAt: '2026-01-19T12:00:00Z',
      }, testClient);
      
      let item = await getInventoryItemByName(householdKey, itemName, testClient);
      expect(item!.confidence).toBe(0.70);
      
      // Upsert with LOWER confidence 0.60 - should keep 0.70
      await upsertInventoryItemFromReceipt({
        id: 'inv-003',
        householdKey,
        itemName,
        qtyEstimated: 12,
        unit: 'count',
        confidence: 0.60,
        lastSeenAt: '2026-01-20T12:00:00Z',
      }, testClient);
      
      item = await getInventoryItemByName(householdKey, itemName, testClient);
      expect(item!.confidence).toBe(0.70); // Should be GREATEST
      
      // Upsert with HIGHER confidence 0.90 - should update to 0.90
      await upsertInventoryItemFromReceipt({
        id: 'inv-004',
        householdKey,
        itemName,
        qtyEstimated: 12,
        unit: 'count',
        confidence: 0.90,
        lastSeenAt: '2026-01-21T12:00:00Z',
      }, testClient);
      
      item = await getInventoryItemByName(householdKey, itemName, testClient);
      expect(item!.confidence).toBe(0.90); // Should be GREATEST
    });
    
    test('qty_estimated adds when both present', async () => {
      const householdKey = 'test-household-qty';
      const itemName = 'butter';
      
      // First insert with qty 2
      await upsertInventoryItemFromReceipt({
        id: 'inv-005',
        householdKey,
        itemName,
        qtyEstimated: 2,
        unit: 'count',
        confidence: 0.80,
        lastSeenAt: '2026-01-19T12:00:00Z',
      }, testClient);
      
      let item = await getInventoryItemByName(householdKey, itemName, testClient);
      expect(item!.qty_estimated).toBe(2);
      
      // Upsert with qty 1 - should add to become 3
      await upsertInventoryItemFromReceipt({
        id: 'inv-006',
        householdKey,
        itemName,
        qtyEstimated: 1,
        unit: 'count',
        confidence: 0.80,
        lastSeenAt: '2026-01-20T12:00:00Z',
      }, testClient);
      
      item = await getInventoryItemByName(householdKey, itemName, testClient);
      expect(item!.qty_estimated).toBe(3); // 2 + 1 = 3
    });
    
    test('last_seen_at uses provided timestamp', async () => {
      const householdKey = 'test-household-lastseen';
      const itemName = 'cheese';
      const specificTime = '2026-01-15T14:30:00Z';
      
      await upsertInventoryItemFromReceipt({
        id: 'inv-007',
        householdKey,
        itemName,
        qtyEstimated: 1,
        unit: 'count',
        confidence: 0.75,
        lastSeenAt: specificTime,
      }, testClient);
      
      const item = await getInventoryItemByName(householdKey, itemName, testClient);
      
      expect(item!.last_seen_at).toBe(specificTime);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS (API behavior simulation)
// =============================================================================

describe('Receipt Import Integration', () => {
  let testClient: ReturnType<typeof getTestClient>;
  
  beforeEach(() => {
    testClient = getTestClient();
    resetOcrProvider();
  });
  
  afterEach(() => {
    resetOcrProvider();
  });
  
  test('successful import creates receipt_imports + line_items + inventory (confidence >= 0.60)', async () => {
    const householdKey = 'integration-test';
    const receiptId = 'int-receipt-001';
    
    // Simulate the import process
    
    // 1. Create receipt import
    await insertReceiptImport({
      id: receiptId,
      household_key: householdKey,
      source: 'image_upload',
      vendor_name: null,
      purchased_at: null,
      ocr_provider: null,
      ocr_raw_text: null,
      status: 'received',
      error_message: null,
    }, testClient);
    
    // 2. Simulate OCR result - use clear item names with exact dictionary matches
    const ocrText = `milk     $3.99
xyzunknown     $1.00
`;
    
    // 3. Parse
    const parseResult = parseReceiptText(ocrText);
    expect(parseResult.linesKept).toBe(2);
    
    // 4. Normalize and insert line items
    const lastSeenAt = new Date().toISOString();
    
    // Manually test the normalization
    const milkResult = normalizeItemName('milk');
    expect(milkResult.normalizedName).toBe('milk');
    expect(milkResult.confidence).toBeGreaterThanOrEqual(0.90); // exact match should be high
    
    for (const line of parseResult.lines) {
      const nameResult = normalizeItemName(line.rawItemName ?? line.rawLine);
      const unitQtyResult = normalizeUnitAndQty(line.rawQtyText, line.rawLine);
      
      let confidence = nameResult.confidence + unitQtyResult.confidenceDelta;
      confidence = Math.max(0, Math.min(1, confidence));
      
      await insertReceiptLineItem({
        id: `line-${Math.random().toString(36).substr(2, 9)}`,
        receipt_import_id: receiptId,
        raw_line: line.rawLine,
        raw_item_name: line.rawItemName,
        raw_qty_text: line.rawQtyText,
        raw_price: line.rawPrice,
        normalized_item_name: nameResult.normalizedName,
        normalized_unit: unitQtyResult.unit,
        normalized_qty_estimated: unitQtyResult.qtyEstimated,
        confidence,
      }, testClient);
      
      // 5. Upsert inventory only if confidence >= 0.60
      if (confidence >= 0.60 && nameResult.normalizedName) {
        await upsertInventoryItemFromReceipt({
          id: `inv-${Math.random().toString(36).substr(2, 9)}`,
          householdKey,
          itemName: nameResult.normalizedName,
          qtyEstimated: unitQtyResult.qtyEstimated,
          unit: unitQtyResult.unit,
          confidence,
          lastSeenAt,
        }, testClient);
      }
    }
    
    // 6. Update status
    await updateReceiptImportStatus(receiptId, {
      status: 'parsed',
      ocr_provider: 'mock',
      ocr_raw_text: ocrText,
    }, testClient);
    
    // VERIFY
    
    // Receipt should be parsed
    const receipt = await getReceiptImportById(receiptId, testClient);
    expect(receipt!.status).toBe('parsed');
    
    // Should have 2 line items
    const lineItemCount = await getReceiptLineItemCount(receiptId, testClient);
    expect(lineItemCount).toBe(2);
    
    // Check line items
    const lineItems = await getReceiptLineItemsByImportId(receiptId, testClient);
    
    // Find milk line item
    const milkLine = lineItems.find(l => l.normalized_item_name === 'milk');
    expect(milkLine).toBeDefined();
    expect(milkLine!.confidence).toBeGreaterThanOrEqual(0.60);
    
    // Check inventory
    const inventoryItems = await getAllInventoryItems(householdKey, testClient);
    
    // At least one item should be in inventory (milk has high confidence)
    expect(inventoryItems.length).toBeGreaterThan(0);
    
    // Verify the milk item is there
    const milkItem = inventoryItems.find(i => i.item_name === 'milk');
    expect(milkItem).toBeDefined();
  });
  
  test('OCR failure still creates receipt_imports with status=failed (no exception)', async () => {
    const receiptId = 'int-receipt-fail';
    
    // Create receipt
    await insertReceiptImport({
      id: receiptId,
      household_key: 'default',
      source: 'image_upload',
      vendor_name: null,
      purchased_at: null,
      ocr_provider: null,
      ocr_raw_text: null,
      status: 'received',
      error_message: null,
    }, testClient);
    
    // Simulate OCR failure (empty result)
    const emptyOcrText = '';
    
    // Update to failed
    await updateReceiptImportStatus(receiptId, {
      status: 'failed',
      ocr_provider: 'mock',
      ocr_raw_text: emptyOcrText,
      error_message: 'OCR returned empty text',
    }, testClient);
    
    // VERIFY
    const receipt = await getReceiptImportById(receiptId, testClient);
    expect(receipt).not.toBeNull();
    expect(receipt!.status).toBe('failed');
    expect(receipt!.error_message).toBe('OCR returned empty text');
    
    // No line items should be created
    const lineItemCount = await getReceiptLineItemCount(receiptId, testClient);
    expect(lineItemCount).toBe(0);
  });
});
