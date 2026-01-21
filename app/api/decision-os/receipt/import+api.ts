/**
 * Receipt Import API Endpoint
 * 
 * POST /api/decision-os/receipt/import
 * 
 * AUTHENTICATION:
 * - Production: Requires valid Supabase JWT in Authorization header
 * - Dev/Test: Falls back to default household if no auth
 * 
 * Request body:
 * {
 *   imageBase64: string    // Base64 encoded image
 * }
 * 
 * NOTE: userProfileId is derived from auth, NOT from client input (production)
 * 
 * Response (CANONICAL CONTRACT - DO NOT CHANGE SHAPE):
 * {
 *   receiptImportId: string,
 *   status: 'received' | 'parsed' | 'failed'
 * }
 * 
 * Error Response (401):
 * { error: 'unauthorized' }
 * 
 * INVARIANTS:
 * - Always returns 200 OK for success (best-effort)
 * - OCR failures return status='failed', not 500
 * - No arrays exposed in response
 */

import { processReceiptImport } from '../../../../lib/decision-os/receipt/handler';
import { validateReceiptImportResponse, validateErrorResponse } from '../../../../lib/decision-os/invariants';
import { authenticateRequest } from '../../../../lib/decision-os/auth/helper';
import type { ReceiptImportResponse } from '../../../../types/decision-os';

interface ReceiptRequest {
  imageBase64: string;
}

/**
 * Validate request body
 */
function validateRequest(body: unknown): ReceiptRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  
  const req = body as Record<string, unknown>;
  
  if (typeof req.imageBase64 !== 'string' || !req.imageBase64) {
    return null;
  }
  
  return {
    imageBase64: req.imageBase64,
  };
}

/**
 * Build error response (401 Unauthorized)
 */
function buildErrorResponse(error: string): Response {
  const response = { error };
  const validation = validateErrorResponse(response);
  if (!validation.valid) {
    console.error('Error response validation failed:', validation.errors);
  }
  return Response.json(response, { status: 401 });
}

/**
 * Build success response
 */
function buildSuccessResponse(receiptImportId: string, status: ReceiptImportResponse['status']): Response {
  const response: ReceiptImportResponse = { receiptImportId, status };
  const validation = validateReceiptImportResponse(response);
  if (!validation.valid) {
    console.error('Receipt import response validation failed:', validation.errors);
  }
  return Response.json(response, { status: 200 });
}

/**
 * POST handler for receipt import
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Authenticate request
    const authHeader = request.headers.get('Authorization');
    const authResult = await authenticateRequest(authHeader);
    
    if (!authResult.success) {
      return buildErrorResponse('unauthorized');
    }
    
    const authContext = authResult.context;
    const userProfileId = authContext.userProfileId;
    
    const body = await request.json();
    const validatedRequest = validateRequest(body);
    
    if (!validatedRequest) {
      // Invalid request - return failed status (best-effort, no 400)
      return buildSuccessResponse('', 'failed');
    }
    
    // Process the receipt import
    const result = await processReceiptImport(
      validatedRequest.imageBase64,
      userProfileId
    );
    
    return buildSuccessResponse(result.receiptImportId, result.status);
  } catch (error) {
    // Best-effort: return failed status, never 500
    console.error('Receipt import error:', error);
    return buildSuccessResponse('', 'failed');
  }
}
