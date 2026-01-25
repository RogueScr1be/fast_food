/**
 * Smoke Test: Receipt Import End-to-End
 * 
 * Tests the full receipt import flow:
 * - OCR extraction
 * - Item parsing
 * - Inventory upsert
 * - Deduplication
 */

import {
  processReceiptImport,
  clearReceiptStores,
  getReceiptImport,
  getInventoryItems,
} from '../receipt/handler';
import { MOCK_KEYS } from '../ocr/providers';

describe('Smoke Test: Receipt Import', () => {
  beforeEach(() => {
    clearReceiptStores();
  });

  describe('MOCK_KEY_FULL import', () => {
    it('returns status=parsed', async () => {
      const result = await processReceiptImport(MOCK_KEYS.FULL, 1);
      
      expect(result.status).toBe('parsed');
      expect(result.receiptImportId).toMatch(/^receipt-/);
    });

    it('creates inventory items with confidence >= 0.60', async () => {
      await processReceiptImport(MOCK_KEYS.FULL, 1);
      
      const items = getInventoryItems(1);
      
      // Should have at least one item
      expect(items.length).toBeGreaterThanOrEqual(1);
      
      // All items should have confidence >= 0.60
      for (const item of items) {
        expect(item.confidence).toBeGreaterThanOrEqual(0.60);
      }
    });

    it('stores raw OCR text in receipt import record', async () => {
      const result = await processReceiptImport(MOCK_KEYS.FULL, 1);
      
      const record = getReceiptImport(result.receiptImportId);
      
      expect(record).toBeDefined();
      expect(record?.raw_ocr_text).toContain('GROCERY MART');
      expect(record?.raw_ocr_text).toContain('Chicken Breast');
      expect(record?.parsed_items).toBeDefined();
      expect(record?.parsed_items?.length).toBeGreaterThan(0);
    });
  });

  describe('deduplication', () => {
    it('second identical import marks duplicate and does not upsert inventory', async () => {
      // First import
      const result1 = await processReceiptImport(MOCK_KEYS.FULL, 1);
      const itemsAfterFirst = getInventoryItems(1);
      const firstItemCount = itemsAfterFirst.length;
      const firstItemQuantities = new Map(
        itemsAfterFirst.map(item => [item.name, item.quantity])
      );
      
      // Second identical import
      const result2 = await processReceiptImport(MOCK_KEYS.FULL, 1);
      
      // Should return same receipt import ID (duplicate)
      expect(result2.receiptImportId).toBe(result1.receiptImportId);
      expect(result2.status).toBe('parsed');
      
      // Inventory should NOT have changed
      const itemsAfterSecond = getInventoryItems(1);
      expect(itemsAfterSecond.length).toBe(firstItemCount);
      
      // Quantities should be unchanged
      for (const item of itemsAfterSecond) {
        const originalQty = firstItemQuantities.get(item.name);
        expect(item.quantity).toBe(originalQty);
      }
    });

    it('different images create separate imports', async () => {
      // First import
      const result1 = await processReceiptImport(MOCK_KEYS.FULL, 1);
      
      // Different image (PARTIAL instead of FULL)
      const result2 = await processReceiptImport(MOCK_KEYS.PARTIAL, 1);
      
      // Should create separate import
      expect(result2.receiptImportId).not.toBe(result1.receiptImportId);
    });
  });

  describe('error handling', () => {
    it('OCR error returns status=failed with valid receiptImportId', async () => {
      const result = await processReceiptImport(MOCK_KEYS.ERROR, 1);
      
      expect(result.status).toBe('failed');
      expect(result.receiptImportId).toMatch(/^receipt-/);
      
      // Record should still be created
      const record = getReceiptImport(result.receiptImportId);
      expect(record).toBeDefined();
      expect(record?.status).toBe('failed');
      expect(record?.error_message).toBeDefined();
    });

    it('empty OCR result returns status=failed', async () => {
      const result = await processReceiptImport(MOCK_KEYS.EMPTY, 1);
      
      expect(result.status).toBe('failed');
      
      const record = getReceiptImport(result.receiptImportId);
      expect(record?.error_message).toContain('No text extracted');
    });
  });

  describe('response shape invariant', () => {
    it('response has exactly receiptImportId and status (no arrays)', async () => {
      const result = await processReceiptImport(MOCK_KEYS.FULL, 1);
      
      // Check response shape
      const keys = Object.keys(result);
      expect(keys).toContain('receiptImportId');
      expect(keys).toContain('status');
      expect(keys.length).toBe(2);
      
      // No arrays in response
      expect(Array.isArray(result.receiptImportId)).toBe(false);
      expect(Array.isArray(result.status)).toBe(false);
    });
  });
});
