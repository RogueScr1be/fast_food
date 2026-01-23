/**
 * Decision OS Feedback API Endpoint
 * 
 * POST /api/decision-os/feedback
 * 
 * Handles user feedback on decisions (accept/reject) and updates session state.
 * 
 * AUTHENTICATION:
 * - Production: Requires valid Supabase JWT in Authorization header
 * - Dev/Test: Falls back to default household if no auth
 * 
 * Request body:
 * {
 *   sessionId: string,           // Required: session to update
 *   action: 'accepted' | 'rejected'
 * }
 * 
 * Response (CANONICAL CONTRACT):
 * { 
 *   recorded: true,
 *   drmRequired?: boolean,       // True if 2nd rejection triggered DRM
 *   sessionId?: string           // Session ID for DRM call
 * }
 * 
 * SESSION TRANSITIONS:
 * - accepted → session.outcome='accepted', ended_at=now(), record time_to_decision
 * - rejected → increment rejection_count
 *   - 1st rejection: return { recorded: true }
 *   - 2nd rejection: return { recorded: true, drmRequired: true, sessionId }
 * 
 * METRICS EMITTED:
 * - decision_accepted (on accept)
 * - decision_rejected (on reject)
 * - time_to_decision_ms (on accept, measured from session.started_at)
 */

import { getDb, isReadonlyModeError, type SessionRecord } from '../../../lib/decision-os/db/client';
import { validateFeedbackResponse, validateErrorResponse } from '../../../lib/decision-os/invariants';
import { authenticateRequest } from '../../../lib/decision-os/auth/helper';
import { resolveFlags, getFlags } from '../../../lib/decision-os/config/flags';
import { record, recordDuration } from '../../../lib/decision-os/monitoring/metrics';
import type { DecisionEventInsert } from '../../../types/decision-os';

// =============================================================================
// REQUEST TYPES
// =============================================================================

type FeedbackAction = 'accepted' | 'rejected';

interface FeedbackRequest {
  sessionId: string;
  action: FeedbackAction;
}

// =============================================================================
// RESPONSE TYPES (extended for DRM flow)
// =============================================================================

interface FeedbackResponseShape {
  recorded: true;
  drmRequired?: boolean;
  sessionId?: string;
}

// =============================================================================
// VALIDATION
// =============================================================================

function validateRequest(body: unknown): FeedbackRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  
  const req = body as Record<string, unknown>;
  
  // sessionId is required
  if (typeof req.sessionId !== 'string' || !req.sessionId) {
    return null;
  }
  
  // action must be 'accepted' or 'rejected'
  const validActions: FeedbackAction[] = ['accepted', 'rejected'];
  if (typeof req.action !== 'string' || !validActions.includes(req.action as FeedbackAction)) {
    return null;
  }
  
  return {
    sessionId: req.sessionId,
    action: req.action as FeedbackAction,
  };
}

// =============================================================================
// RESPONSE BUILDERS
// =============================================================================

function buildErrorResponse(error: string): Response {
  const response = { error };
  const validation = validateErrorResponse(response);
  if (!validation.valid) {
    console.error('Error response validation failed:', validation.errors);
  }
  return Response.json(response, { status: 401 });
}

function buildSuccessResponse(drmRequired?: boolean, sessionId?: string): Response {
  const response: FeedbackResponseShape = { recorded: true };
  
  if (drmRequired !== undefined) {
    response.drmRequired = drmRequired;
  }
  if (sessionId !== undefined) {
    response.sessionId = sessionId;
  }
  
  // Note: We extend the feedback response contract slightly for DRM flow
  // The base contract { recorded: true } is still valid
  return Response.json(response, { status: 200 });
}

// =============================================================================
// EVENT ID GENERATOR
// =============================================================================

function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `fb-${timestamp}-${random}`;
}

// =============================================================================
// POST HANDLER
// =============================================================================

export async function POST(request: Request): Promise<Response> {
  record('feedback_called');
  
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
      return buildErrorResponse('unauthorized');
    }
    
    // Authenticate request
    const authHeader = request.headers.get('Authorization');
    const authResult = await authenticateRequest(authHeader);
    
    if (!authResult.success) {
      return buildErrorResponse('unauthorized');
    }
    
    const authContext = authResult.context;
    const householdKey = authContext.householdKey;
    const userProfileId = authContext.userProfileId;
    
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const validatedRequest = validateRequest(body);
    
    if (!validatedRequest) {
      // Invalid request - still return success for response shape consistency
      return buildSuccessResponse();
    }
    
    const { sessionId, action } = validatedRequest;
    const nowIso = new Date().toISOString();
    
    // READONLY MODE: Return success without DB writes
    if (flags.readonlyMode) {
      record('readonly_hit');
      return buildSuccessResponse();
    }
    
    // Get session
    const session = await db.getSessionById(householdKey, sessionId);
    if (!session) {
      // Session not found - no-op, return success
      return buildSuccessResponse();
    }
    
    // Session already ended - return success (idempotent)
    if (session.outcome !== 'pending') {
      return buildSuccessResponse();
    }
    
    // Process based on action
    if (action === 'accepted') {
      // Record decision_accepted metric
      record('decision_accepted');
      
      // Calculate time_to_decision_ms
      const startTime = new Date(session.started_at).getTime();
      const endTime = Date.now();
      const timeToDecisionMs = endTime - startTime;
      recordDuration('time_to_decision_ms', timeToDecisionMs);
      
      // Update session: outcome = 'accepted', ended_at = now
      await db.updateSession(householdKey, sessionId, {
        outcome: 'accepted',
        ended_at: nowIso,
      });
      
      // Create decision event for audit trail
      const eventId = generateEventId();
      const event: DecisionEventInsert = {
        id: eventId,
        user_profile_id: userProfileId,
        household_key: householdKey,
        decided_at: session.started_at,
        actioned_at: nowIso,
        user_action: 'approved',
        notes: 'session_accepted',
        decision_payload: session.decision_payload ?? {},
        decision_type: 'meal_decision',
        meal_id: (session.decision_payload as any)?.meal_id,
      };
      
      await db.insertDecisionEvent(event);
      
      // Insert positive taste signal
      if ((session.decision_payload as any)?.meal_id) {
        await db.insertTasteSignal({
          id: `ts-${eventId}`,
          user_profile_id: userProfileId,
          household_key: householdKey,
          meal_id: (session.decision_payload as any).meal_id,
          weight: 1.0, // Positive weight for acceptance
          event_id: eventId,
          created_at: nowIso,
        });
      }
      
      return buildSuccessResponse();
      
    } else if (action === 'rejected') {
      // Record decision_rejected metric
      record('decision_rejected');
      
      // Increment rejection count
      const newRejectionCount = (session.rejection_count ?? 0) + 1;
      
      // Update session with new rejection count
      await db.updateSession(householdKey, sessionId, {
        rejection_count: newRejectionCount,
        // Store rejection in context for audit
        context: {
          ...session.context,
          rejections: [
            ...((session.context as any)?.rejections ?? []),
            { at: nowIso, meal: (session.decision_payload as any)?.meal },
          ],
        },
      });
      
      // Create decision event for audit trail
      const eventId = generateEventId();
      const event: DecisionEventInsert = {
        id: eventId,
        user_profile_id: userProfileId,
        household_key: householdKey,
        decided_at: session.started_at,
        actioned_at: nowIso,
        user_action: 'rejected',
        notes: `rejection_${newRejectionCount}`,
        decision_payload: session.decision_payload ?? {},
        decision_type: 'meal_decision',
        meal_id: (session.decision_payload as any)?.meal_id,
      };
      
      await db.insertDecisionEvent(event);
      
      // Insert negative taste signal
      if ((session.decision_payload as any)?.meal_id) {
        await db.insertTasteSignal({
          id: `ts-${eventId}`,
          user_profile_id: userProfileId,
          household_key: householdKey,
          meal_id: (session.decision_payload as any).meal_id,
          weight: -1.0, // Negative weight for rejection
          event_id: eventId,
          created_at: nowIso,
        });
      }
      
      // Check if DRM should be triggered (2+ rejections)
      if (newRejectionCount >= 2) {
        // Return drmRequired flag - client should call DRM endpoint
        return buildSuccessResponse(true, sessionId);
      }
      
      // First rejection - no DRM yet
      return buildSuccessResponse(false);
    }
    
    // Should never reach here
    return buildSuccessResponse();
    
  } catch (error) {
    // Handle readonly_mode error from DB layer (hard backstop)
    if (isReadonlyModeError(error)) {
      record('readonly_hit');
      return buildSuccessResponse();
    }
    
    console.error('Feedback processing error:', error);
    return buildSuccessResponse();
  }
}
