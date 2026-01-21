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
import { resolveFlags, getFlags } from '../../../../lib/decision-os/config/flags';
import { record } from '../../../../lib/decision-os/monitoring/metrics';
import { getDb } from '../../../../lib/decision-os/db/client';
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
 * Generate a unique receipt import ID (used when OCR is disabled)
 */
function generateReceiptImportId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `rec-${timestamp}-${random}`;
}

/**
 * POST handler for receipt import
 */
export async function POST(request: Request): Promise<Response> {
  record('receipt_called');
  
  try {
    const db = getDb();
    
    // Resolve flags (ENV + optional DB override)
    const flags = await resolveFlags({
      env: getFlags(),
      db: db,
      useCache: true,
    });
    
    // KILL SWITCH: Check if Decision OS is enabled
    if (!flags.decisionOsEnabled) {
      // Return 401 unauthorized when Decision OS is disabled
      return buildErrorResponse('unauthorized');
    }
    
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
    
    // KILL SWITCH: Check if OCR feature is enabled
    if (!flags.ocrEnabled) {
      // Return canonical failed response (still 200 OK)
      // Generate a receipt import ID for tracking even when OCR is disabled
      record('ocr_provider_failed');
      const receiptImportId = generateReceiptImportId();
      return buildSuccessResponse(receiptImportId, 'failed');
    }
    
    // Process the receipt import
    const result = await processReceiptImport(
      validatedRequest.imageBase64,
      userProfileId
    );
    
    // Track OCR failures
    if (result.status === 'failed') {
      record('ocr_provider_failed');
    }
    
    return buildSuccessResponse(result.receiptImportId, result.status);
  } catch (error) {
    // Best-effort: return failed status, never 500
    console.error('Receipt import error:', error);
    record('ocr_provider_failed');
    return buildSuccessResponse('', 'failed');
  }
}
