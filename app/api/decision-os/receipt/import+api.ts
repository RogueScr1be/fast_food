/**
 * FAST FOOD: Receipt Import API
 * POST /api/decision-os/receipt/import
 * 
 * Imports a receipt via OCR, parses items, normalizes them, and updates inventory.
 * 
 * INVARIANTS (enforced):
 * - Response NEVER contains arrays
 * - Single receiptImportId + status returned
 * - Failures do not throw 500 (return status='failed' with valid response)
 * - assertNoArraysDeep on response payload
 * 
 * LIFECYCLE:
 * 1. Insert receipt_imports with status='received'
 * 2. OCR extract text
 * 3. Parse into line items
 * 4. Normalize items
 * 5. Insert receipt_line_items
 * 6. Upsert inventory_items (confidence >= 0.60 only)
 * 7. Update receipt_imports to status='parsed' or 'failed'
 */

import { randomUUID } from 'crypto';
import {
  isValidReceiptImportRequest,
  type ReceiptImportRequest,
  type ReceiptImportResponse,
} from '@/types/decision-os/receipt';
import { ocrExtractTextFromImageBase64 } from '@/lib/decision-os/ocr';
import { parseReceiptText, extractVendorName, extractPurchaseDate } from '@/lib/decision-os/receipt-parser';
import { normalizeItemName, normalizeUnitAndQty } from '@/lib/decision-os/normalizer';
import { assertNoArraysDeep } from '@/lib/decision-os/invariants';
import {
  insertReceiptImport,
  updateReceiptImportStatus,
  insertReceiptLineItem,
  upsertInventoryItemFromReceipt,
} from '@/lib/decision-os/database';

// Confidence threshold for inventory upsert
const INVENTORY_CONFIDENCE_THRESHOLD = 0.60;

/**
 * POST /api/decision-os/receipt/import
 * 
 * Request body:
 * {
 *   "householdKey": "default",
 *   "source": "image_upload",
 *   "purchasedAtIso": "optional",
 *   "vendorName": "optional",
 *   "receiptImageBase64": "<base64-string>"
 * }
 * 
 * Response:
 * {
 *   "receiptImportId": "<uuid>",
 *   "status": "received|parsed|failed"
 * }
 */
export async function POST(request: Request): Promise<Response> {
  let receiptImportId: string | null = null;
  
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate request
    if (!isValidReceiptImportRequest(body)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request body',
          details: 'Required: householdKey (string), source (image_upload|email_forward|manual_text), receiptImageBase64 (string)',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    const req: ReceiptImportRequest = body;
    receiptImportId = randomUUID();
    
    // Step 1: Insert receipt_imports with status='received'
    await insertReceiptImport({
      id: receiptImportId,
      household_key: req.householdKey,
      source: req.source,
      vendor_name: req.vendorName ?? null,
      purchased_at: req.purchasedAtIso ?? null,
      ocr_provider: null,
      ocr_raw_text: null,
      status: 'received',
      error_message: null,
    });
    
    // Step 2: OCR extract text
    const ocrResult = await ocrExtractTextFromImageBase64(req.receiptImageBase64);
    
    if (!ocrResult.rawText || ocrResult.rawText.trim() === '') {
      // OCR failed or returned empty - update status to failed
      await updateReceiptImportStatus(receiptImportId, {
        status: 'failed',
        ocr_provider: ocrResult.provider,
        ocr_raw_text: ocrResult.rawText || '',
        error_message: 'OCR returned empty text',
      });
      
      const response: ReceiptImportResponse = {
        receiptImportId,
        status: 'failed',
      };
      
      // INVARIANT CHECK: No arrays in response
      assertNoArraysDeep(response);
      
      return new Response(
        JSON.stringify(response),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    // Step 3: Parse receipt text into line items
    const parseResult = parseReceiptText(ocrResult.rawText);
    
    // PRECEDENCE: Request-provided values take precedence over parser-derived values
    // If request includes vendorName/purchasedAtIso, those are stored as-is
    // Parser extraction only fills in when request fields are absent
    
    // Vendor name: request > parser > null
    let vendorName = req.vendorName ?? null;
    if (vendorName === null) {
      // Only attempt parser extraction if request didn't provide a value
      vendorName = extractVendorName(ocrResult.rawText);
    }
    
    // Purchase date: request > parser > null
    let purchasedAt = req.purchasedAtIso ?? null;
    if (purchasedAt === null) {
      // Only attempt parser extraction if request didn't provide a value
      const extractedDate = extractPurchaseDate(ocrResult.rawText);
      if (extractedDate) {
        purchasedAt = extractedDate.toISOString();
      }
    }
    
    // Use purchase date or now for last_seen_at
    const lastSeenAt = purchasedAt ?? new Date().toISOString();
    
    // Step 4 & 5: Normalize items and insert receipt_line_items
    for (const parsedLine of parseResult.lines) {
      // Normalize item name
      const nameResult = normalizeItemName(parsedLine.rawItemName ?? parsedLine.rawLine);
      
      // Normalize unit and quantity
      const unitQtyResult = normalizeUnitAndQty(parsedLine.rawQtyText, parsedLine.rawLine);
      
      // Calculate final confidence
      let confidence = nameResult.confidence + unitQtyResult.confidenceDelta;
      confidence = Math.max(0, Math.min(1, confidence));
      
      // Generate line item ID
      const lineItemId = randomUUID();
      
      // Insert receipt_line_item
      await insertReceiptLineItem({
        id: lineItemId,
        receipt_import_id: receiptImportId,
        raw_line: parsedLine.rawLine,
        raw_item_name: parsedLine.rawItemName,
        raw_qty_text: parsedLine.rawQtyText,
        raw_price: parsedLine.rawPrice,
        normalized_item_name: nameResult.normalizedName,
        normalized_unit: unitQtyResult.unit,
        normalized_qty_estimated: unitQtyResult.qtyEstimated,
        confidence,
      });
      
      // Step 6: Upsert inventory_items (only if confidence >= threshold)
      if (confidence >= INVENTORY_CONFIDENCE_THRESHOLD && nameResult.normalizedName) {
        await upsertInventoryItemFromReceipt({
          id: randomUUID(), // Only used for new inserts
          householdKey: req.householdKey,
          itemName: nameResult.normalizedName,
          qtyEstimated: unitQtyResult.qtyEstimated,
          unit: unitQtyResult.unit,
          confidence,
          lastSeenAt,
        });
      }
    }
    
    // Step 7: Update receipt_imports to status='parsed'
    await updateReceiptImportStatus(receiptImportId, {
      status: 'parsed',
      ocr_provider: ocrResult.provider,
      ocr_raw_text: ocrResult.rawText,
      vendor_name: vendorName,
      purchased_at: purchasedAt,
    });
    
    // Build response
    const response: ReceiptImportResponse = {
      receiptImportId,
      status: 'parsed',
    };
    
    // INVARIANT CHECK: No arrays in response
    assertNoArraysDeep(response);
    
    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
    
  } catch (error) {
    console.error('Receipt import error:', error);
    
    // If we have a receiptImportId, update status to failed
    if (receiptImportId) {
      try {
        await updateReceiptImportStatus(receiptImportId, {
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        });
      } catch (updateError) {
        console.error('Failed to update receipt status:', updateError);
      }
      
      // Return valid response with failed status (NOT 500)
      const response: ReceiptImportResponse = {
        receiptImportId,
        status: 'failed',
      };
      
      return new Response(
        JSON.stringify(response),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    // Only return 500 for truly unexpected errors before receipt creation
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * GET /api/decision-os/receipt/import
 * 
 * Not supported - no browsing endpoints
 */
export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      error: 'Method not allowed',
      details: 'Use POST to import a receipt. Browsing receipts is not supported.',
    }),
    {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST',
      },
    }
  );
}
