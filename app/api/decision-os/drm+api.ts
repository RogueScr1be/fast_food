/**
 * FAST FOOD: DRM API
 * POST /api/decision-os/drm
 * 
 * Dinner Rescue Mode - Hard override that bypasses normal arbiter.
 * Returns EXACTLY ONE rescue action or null with exhausted flag.
 * 
 * INVARIANTS (enforced):
 * - Response NEVER contains arrays (deep check)
 * - Single rescue object or null
 * - No browsing, no lists, no alternatives
 * - DRM does NOT call arbiter for meal selection
 * 
 * Route path: POST /api/decision-os/drm
 * (Expo Router prefixes with /api automatically)
 */

import { randomUUID } from 'crypto';
import {
  isValidDrmRequest,
  type DrmRequest,
  type DrmResponse,
} from '@/types/decision-os/drm';
import {
  executeDrmRescue,
} from '@/lib/decision-os/drm-service';
import {
  validateDrmResponse,
} from '@/lib/decision-os/invariants';
import {
  insertDrmEvent,
  insertDecisionEvent,
} from '@/lib/decision-os/database';

/**
 * POST /api/decision-os/drm
 * 
 * Request body:
 * {
 *   "householdKey": "default",
 *   "nowIso": "2026-01-19T19:30:00-06:00",
 *   "triggerType": "explicit|implicit",
 *   "triggerReason": "handle_it|im_done|late_no_action|two_rejections|calendar_conflict|low_energy"
 * }
 * 
 * Response (rescue available):
 * {
 *   "rescue": { ...singleRescue },
 *   "exhausted": false
 * }
 * 
 * Response (exhausted):
 * {
 *   "rescue": null,
 *   "exhausted": true
 * }
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate request
    if (!isValidDrmRequest(body)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request body',
          details: 'Required: householdKey (string), nowIso (ISO string), triggerType (explicit|implicit), triggerReason (handle_it|im_done|late_no_action|two_rejections|calendar_conflict|low_energy)',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    const drmRequest: DrmRequest = body;
    
    // Execute DRM rescue logic
    const response: DrmResponse = await executeDrmRescue({
      request: drmRequest,
      generateEventId: () => randomUUID(),
      persistDrmEvent: insertDrmEvent,
      persistDecisionEvent: insertDecisionEvent,
    });
    
    // INVARIANT CHECK: Deep validation - no arrays anywhere in response
    validateDrmResponse(response);
    
    // Return response
    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('DRM API error:', error);
    
    // Check if it's an invariant violation
    const isInvariantError = error instanceof Error && 
      error.message.includes('INVARIANT VIOLATION');
    
    // Return error response
    return new Response(
      JSON.stringify({
        error: isInvariantError ? 'Invariant violation' : 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * GET /api/decision-os/drm
 * 
 * Not supported - DRM requires POST with trigger data
 */
export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      error: 'Method not allowed',
      details: 'Use POST with request body to trigger DRM',
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
