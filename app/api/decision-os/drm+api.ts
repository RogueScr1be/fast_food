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
 * Response:
 * {
 *   rescueActivated: boolean,
 *   rescueType: string,
 *   message: string,
 *   recorded: boolean
 * }
 * 
 * INVARIANTS:
 * - No arrays in response
 * - Creates decision_event row with user_action='drm_triggered'
 */

import { getDb } from '../../../lib/decision-os/db/client';
import type { DecisionEventInsert } from '../../../types/decision-os';

interface DrmRequest {
  userProfileId: number;
  reason: string;
}

interface DrmResponse {
  rescueActivated: boolean;
  rescueType: string;
  message: string;
  recorded: boolean;
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
 * Generate DRM event ID
 */
function generateDrmEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `drm-${timestamp}-${random}`;
}

/**
 * Get rescue response based on reason
 */
function getRescueResponse(reason: string): { message: string; rescueType: string } {
  switch (reason) {
    case 'handle_it':
      return {
        rescueType: 'handle_it',
        message: 'Dinner is handled. Take a break.',
      };
    case 'dinner_changed':
      return {
        rescueType: 'dinner_changed',
        message: 'Plans changed. No worries.',
      };
    case 'not_hungry':
      return {
        rescueType: 'not_hungry',
        message: 'Skipping dinner. That\'s okay.',
      };
    default:
      return {
        rescueType: 'custom',
        message: 'Dinner rescue activated.',
      };
  }
}

/**
 * POST handler for DRM requests
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const validatedRequest = validateRequest(body);
    
    if (!validatedRequest) {
      const response: DrmResponse = {
        rescueActivated: false,
        rescueType: 'none',
        message: 'Invalid request',
        recorded: false,
      };
      return Response.json(response, { status: 200 });
    }
    
    const db = getDb();
    const { userProfileId, reason } = validatedRequest;
    const nowIso = new Date().toISOString();
    
    // Create DRM event (append-only)
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
    
    // Get rescue response
    const rescue = getRescueResponse(reason);
    
    const response: DrmResponse = {
      rescueActivated: true,
      rescueType: rescue.rescueType,
      message: rescue.message,
      recorded: true,
    };
    
    return Response.json(response, { status: 200 });
  } catch (error) {
    console.error('DRM processing error:', error);
    
    // Best-effort response
    const response: DrmResponse = {
      rescueActivated: false,
      rescueType: 'error',
      message: 'Error processing DRM request',
      recorded: false,
    };
    return Response.json(response, { status: 200 });
  }
}
