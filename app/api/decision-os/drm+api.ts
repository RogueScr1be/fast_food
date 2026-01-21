/**
 * Decision OS DRM (Dinner Rescue Mode) API Endpoint
 * 
 * POST /api/decision-os/drm
 * 
 * Request body:
 * {
 *   userProfileId: number,
 *   reason: 'handle_it' | 'dinner_changed' | 'not_hungry' | string
 * }
 * 
 * Response (CANONICAL CONTRACT - DO NOT ADD FIELDS):
 * {
 *   drmActivated: boolean
 * }
 * 
 * BANNED FIELDS: rescueActivated, rescueType, message, recorded
 * 
 * INVARIANTS:
 * - No arrays in response
 * - Creates decision_event row with user_action='drm_triggered'
 * - validateDrmResponse() must pass before returning
 */

import { getDb } from '../../../lib/decision-os/db/client';
import { validateDrmResponse } from '../../../lib/decision-os/invariants';
import type { DecisionEventInsert, DrmResponse } from '../../../types/decision-os';

interface DrmRequest {
  userProfileId: number;
  reason: string;
}

/**
 * Validate request body
 */
function validateRequest(body: unknown): DrmRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  
  const req = body as Record<string, unknown>;
  
  if (typeof req.userProfileId !== 'number' || req.userProfileId <= 0) {
    return null;
  }
  
  if (typeof req.reason !== 'string' || !req.reason) {
    return null;
  }
  
  return {
    userProfileId: req.userProfileId,
    reason: req.reason,
  };
}

/**
 * Generate DRM event ID (internal only, not exposed in response)
 */
function generateDrmEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `drm-${timestamp}-${random}`;
}

/**
 * Build and validate canonical response
 */
function buildResponse(drmActivated: boolean): DrmResponse {
  const response: DrmResponse = { drmActivated };
  
  // Validate before returning (fail-fast on contract violation)
  const validation = validateDrmResponse(response);
  if (!validation.valid) {
    console.error('DRM response validation failed:', validation.errors);
    // Return minimal valid response
    return { drmActivated: false };
  }
  
  return response;
}

/**
 * POST handler for DRM requests
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const validatedRequest = validateRequest(body);
    
    if (!validatedRequest) {
      const response = buildResponse(false);
      return Response.json(response, { status: 200 });
    }
    
    const db = getDb();
    const { userProfileId, reason } = validatedRequest;
    const nowIso = new Date().toISOString();
    
    // Create DRM event (append-only, internal)
    const eventId = generateDrmEventId();
    const drmEvent: DecisionEventInsert = {
      id: eventId,
      user_profile_id: userProfileId,
      decided_at: nowIso,
      actioned_at: nowIso,
      user_action: 'drm_triggered',
      notes: `drm_reason:${reason}`,
      decision_payload: {
        reason,
        triggered_at: nowIso,
      },
    };
    
    // Insert event (append-only)
    await db.insertDecisionEvent(drmEvent);
    
    // Insert taste signal for DRM (negative weight)
    await db.insertTasteSignal({
      id: `ts-${eventId}`,
      user_profile_id: userProfileId,
      meal_id: 0, // No specific meal
      weight: -0.5, // DRM weight
      decision_event_id: eventId,
      created_at: nowIso,
    });
    
    // Build canonical response (ONLY drmActivated)
    const response = buildResponse(true);
    return Response.json(response, { status: 200 });
  } catch (error) {
    console.error('DRM processing error:', error);
    
    // Best-effort canonical response
    const response = buildResponse(false);
    return Response.json(response, { status: 200 });
  }
}
