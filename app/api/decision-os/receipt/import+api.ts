/**
 * Receipt Import API Endpoint
 * 
 * POST /api/decision-os/receipt/import
 * 
 * Request body:
 * {
 *   imageBase64: string,    // Base64 encoded image
 *   userProfileId: number   // User's profile ID
 * }
 * 
 * Response (DO NOT CHANGE SHAPE):
 * {
 *   receiptImportId: string,
 *   status: 'received' | 'parsed' | 'failed'
 * }
 * 
 * INVARIANTS:
 * - Always returns 200 OK (best-effort)
 * - OCR failures return status='failed', not 500
 * - No arrays exposed in response
 */

import { processReceiptImport } from '../../../../lib/decision-os/receipt/handler';
import type { ReceiptImportRequest, ReceiptImportResponse } from '../../../../types/decision-os';

/**
 * Validate request body
 */
function validateRequest(body: unknown): ReceiptImportRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  
  const req = body as Record<string, unknown>;
  
  if (typeof req.imageBase64 !== 'string' || !req.imageBase64) {
    return null;
  }
  
  if (typeof req.userProfileId !== 'number' || req.userProfileId <= 0) {
    return null;
  }
  
  return {
    imageBase64: req.imageBase64,
    userProfileId: req.userProfileId,
  };
}

/**
 * POST handler for receipt import
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const validatedRequest = validateRequest(body);
    
    if (!validatedRequest) {
      // Invalid request - return failed status (best-effort, no 400)
      const response: ReceiptImportResponse = {
        receiptImportId: '',
        status: 'failed',
      };
      return Response.json(response, { status: 200 });
    }
    
    // Process the receipt import
    const result = await processReceiptImport(
      validatedRequest.imageBase64,
      validatedRequest.userProfileId
    );
    
    return Response.json(result, { status: 200 });
  } catch (error) {
    // Best-effort: return failed status, never 500
    const response: ReceiptImportResponse = {
      receiptImportId: '',
      status: 'failed',
    };
    return Response.json(response, { status: 200 });
  }
}
