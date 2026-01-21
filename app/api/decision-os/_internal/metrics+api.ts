/**
 * Internal Metrics Endpoint (dev/staging only)
 * 
 * GET /api/decision-os/_internal/metrics
 * 
 * Security:
 * - Production: ALWAYS returns 401 { error: 'unauthorized' }
 * - Dev/Staging: Requires auth if SUPABASE_JWT_SECRET exists
 * 
 * Response (CANONICAL CONTRACT):
 * {
 *   ok: boolean,
 *   counters: { [metricName]: number }
 * }
 * 
 * Error Response (401):
 * { error: 'unauthorized' }
 * 
 * INVARIANTS:
 * - No arrays in response
 * - counters must be flat object of numbers only
 * - No user IDs, tokens, meal names, or sensitive data
 */

import { getSnapshot } from '../../../../lib/decision-os/monitoring/metrics';
import { validateInternalMetricsResponse, validateErrorResponse } from '../../../../lib/decision-os/invariants';
import { authenticateRequest } from '../../../../lib/decision-os/auth/helper';

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
function buildSuccessResponse(counters: Record<string, number>): Response {
  const response = { ok: true, counters };
  
  // Validate before returning
  const validation = validateInternalMetricsResponse(response);
  if (!validation.valid) {
    console.error('Internal metrics response validation failed:', validation.errors);
    return Response.json({ ok: false, counters: {} }, { status: 200 });
  }
  
  return Response.json(response, { status: 200 });
}

/**
 * Check if auth is required (SUPABASE_JWT_SECRET exists)
 */
function isAuthRequired(): boolean {
  return Boolean(process.env.SUPABASE_JWT_SECRET);
}

/**
 * GET /api/decision-os/_internal/metrics
 */
export async function GET(request: Request): Promise<Response> {
  // HARD BLOCK: Never expose in production
  if (process.env.NODE_ENV === 'production') {
    return buildErrorResponse('unauthorized');
  }
  
  // In dev/staging: require auth if JWT secret is configured
  if (isAuthRequired()) {
    const authHeader = request.headers.get('Authorization');
    const authResult = await authenticateRequest(authHeader);
    
    if (!authResult.success) {
      return buildErrorResponse('unauthorized');
    }
  }
  
  // Get current metrics snapshot
  const snapshot = getSnapshot();
  
  // Convert to flat counters object (ensure all values are numbers)
  const counters: Record<string, number> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (typeof value === 'number') {
      counters[key] = value;
    }
  }
  
  return buildSuccessResponse(counters);
}
