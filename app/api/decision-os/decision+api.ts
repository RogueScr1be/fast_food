/**
 * Decision OS Decision API Endpoint
 * 
 * POST /api/decision-os/decision
 * 
 * AUTHENTICATION:
 * - Production: Requires valid Supabase JWT in Authorization header
 * - Dev/Test: Falls back to default household if no auth
 * 
 * Request body:
 * {
 *   context?: { time?: string, dayOfWeek?: string, ... }
 * }
 * 
 * NOTE: userProfileId is derived from auth, NOT from client input (production)
 * 
 * Response (CANONICAL CONTRACT - DO NOT ADD FIELDS):
 * {
 *   decision: object | null,
 *   drmRecommended: boolean,
 *   reason?: string,
 *   autopilot?: boolean
 * }
 * 
 * Error Response (401):
 * { error: 'unauthorized' }
 * 
 * BANNED FIELDS: decisionEventId, message
 * 
 * INVARIANTS:
 * - No arrays in response
 * - append-only: feedback creates NEW rows, never updates
 * - autopilot is optional boolean
 * - validateDecisionResponse() must pass before returning
 */

import { getDb, isReadonlyModeError } from '../../../lib/decision-os/db/client';
import { checkAutopilotEligibility } from '../../../lib/decision-os/autopilot/policy';
import { createAutopilotApproval, hasAutopilotApproval } from '../../../lib/decision-os/feedback/handler';
import { validateDecisionResponse, validateErrorResponse } from '../../../lib/decision-os/invariants';
import { authenticateRequest, type AuthContext } from '../../../lib/decision-os/auth/helper';
import { resolveFlags, getFlags } from '../../../lib/decision-os/config/flags';
import { record } from '../../../lib/decision-os/monitoring/metrics';
import type { DecisionResponse, DecisionEvent } from '../../../types/decision-os';

interface DecisionRequest {
  context?: Record<string, unknown>;
}

/**
 * Validate request body
 */
function validateRequest(body: unknown): DecisionRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  
  const req = body as Record<string, unknown>;
  
  return {
    context: req.context as Record<string, unknown> | undefined,
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
 * Generate a unique decision event ID (internal only, not exposed in response)
 */
function generateDecisionEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `dec-${timestamp}-${random}`;
}

/**
 * Generate a context hash for idempotency
 */
function generateContextHash(userId: number, context?: Record<string, unknown>): string {
  const base = `${userId}-${JSON.stringify(context || {})}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `ctx-${Math.abs(hash).toString(36)}`;
}

/**
 * Check if DRM should be recommended based on recent rejections
 */
function shouldRecommendDrm(events: DecisionEvent[]): boolean {
  const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
  
  const recentRejections = events.filter(e =>
    e.user_action === 'rejected' &&
    e.actioned_at &&
    new Date(e.actioned_at).getTime() > thirtyMinutesAgo
  );
  
  return recentRejections.length >= 2;
}

/**
 * Get a meal suggestion (simplified)
 */
function getMealSuggestion(context?: Record<string, unknown>): Record<string, unknown> {
  const time = context?.time as string || '18:00';
  const hour = parseInt(time.split(':')[0], 10);
  
  if (hour < 11) {
    return { meal: 'Scrambled Eggs', mealId: 7, category: 'breakfast' };
  } else if (hour < 15) {
    return { meal: 'Caesar Salad', mealId: 5, category: 'lunch' };
  } else {
    return { meal: 'Chicken Pasta', mealId: 1, category: 'dinner' };
  }
}

/**
 * Build and validate canonical response
 */
function buildResponse(
  decision: Record<string, unknown> | null,
  drmRecommended: boolean,
  reason?: string,
  autopilot?: boolean
): DecisionResponse {
  const response: DecisionResponse = {
    decision,
    drmRecommended,
  };
  
  if (reason !== undefined) {
    response.reason = reason;
  }
  
  if (autopilot !== undefined) {
    response.autopilot = autopilot;
  }
  
  // Validate before returning (fail-fast on contract violation)
  const validation = validateDecisionResponse(response);
  if (!validation.valid) {
    console.error('Decision response validation failed:', validation.errors);
    // Return minimal valid response
    return { decision: null, drmRecommended: false };
  }
  
  return response;
}

/**
 * POST handler for decision requests
 */
export async function POST(request: Request): Promise<Response> {
  record('decision_called');
  
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
      record('decision_unauthorized');
      return buildErrorResponse('unauthorized');
    }
    
    // Authenticate request
    const authHeader = request.headers.get('Authorization');
    const authResult = await authenticateRequest(authHeader);
    
    if (!authResult.success) {
      record('decision_unauthorized');
      return buildErrorResponse('unauthorized');
    }
    
    const authContext = authResult.context;
    const userProfileId = authContext.userProfileId;
    
    const body = await request.json();
    const validatedRequest = validateRequest(body);
    
    if (!validatedRequest) {
      const response = buildResponse(null, false, 'Invalid request');
      return Response.json(response, { status: 200 });
    }
    
    const { context } = validatedRequest;
    
    // Get user's decision history (household-scoped)
    const userEvents = await db.getDecisionEventsByUserId(userProfileId, authContext.householdKey, 100);
    
    // Check if DRM should be recommended
    const drmRecommended = shouldRecommendDrm(userEvents);
    
    // Get meal suggestion
    const mealSuggestion = getMealSuggestion(context);
    
    // Create decision event (internal, not exposed in response)
    const eventId = generateDecisionEventId();
    const contextHash = generateContextHash(userProfileId, context);
    const nowIso = new Date().toISOString();
    
    // Check autopilot eligibility (only if autopilot feature is enabled)
    const autopilotFeatureEnabled = flags.decisionOsEnabled && flags.autopilotEnabled;
    const autopilotEligibility = autopilotFeatureEnabled 
      ? checkAutopilotEligibility(userEvents)
      : { eligible: false, reason: 'autopilot_disabled' };
    
    // Create pending event (with household_key from auth context)
    const pendingEvent: DecisionEvent = {
      id: eventId,
      user_profile_id: userProfileId,
      household_key: authContext.householdKey,
      decided_at: nowIso,
      decision_payload: {
        ...mealSuggestion,
        context,
      },
      meal_id: mealSuggestion.mealId as number,
      context_hash: contextHash,
      decision_type: 'meal_decision',
    };
    
    // READONLY MODE: Skip all DB writes but return valid response
    if (flags.readonlyMode) {
      record('readonly_hit');
      // Return response without any DB writes
      const response = buildResponse(
        drmRecommended ? null : mealSuggestion,
        drmRecommended,
        drmRecommended ? 'Multiple rejections detected' : undefined,
        (autopilotFeatureEnabled && autopilotEligibility.eligible) ? true : undefined
      );
      return Response.json(response, { status: 200 });
    }
    
    // If autopilot eligible and not already applied, create autopilot approval
    // ONLY if autopilot feature is enabled
    if (autopilotFeatureEnabled && autopilotEligibility.eligible) {
      // Check for existing autopilot approval (idempotency, household-scoped)
      const existingCopies = await db.getDecisionEventsByContextHash(contextHash, authContext.householdKey);
      
      if (!hasAutopilotApproval(existingCopies)) {
        // Create and insert autopilot approval
        const autopilotCopy = createAutopilotApproval(pendingEvent);
        await db.insertDecisionEvent(autopilotCopy);
        record('autopilot_inserted');
        
        // Insert taste signal for autopilot approval
        await db.insertTasteSignal({
          id: `ts-${autopilotCopy.id}`,
          user_profile_id: userProfileId,
          household_key: authContext.householdKey,
          meal_id: mealSuggestion.mealId as number,
          weight: 1.0,
          event_id: autopilotCopy.id,
          created_at: nowIso,
        });
      }
    }
    
    // Build canonical response (NO decisionEventId, NO message)
    // autopilot field only included if autopilot is enabled AND eligible
    const response = buildResponse(
      drmRecommended ? null : mealSuggestion,
      drmRecommended,
      drmRecommended ? 'Multiple rejections detected' : undefined,
      (autopilotFeatureEnabled && autopilotEligibility.eligible) ? true : undefined
    );
    
    return Response.json(response, { status: 200 });
  } catch (error) {
    // Handle readonly_mode error from DB layer (hard backstop)
    if (isReadonlyModeError(error)) {
      record('readonly_hit');
      // Return canonical response - readonly is not an error from client perspective
      const response = buildResponse(null, false, undefined);
      return Response.json(response, { status: 200 });
    }
    
    console.error('Decision processing error:', error);
    
    // Best-effort canonical response
    const response = buildResponse(null, false, 'Error processing decision');
    return Response.json(response, { status: 200 });
  }
}
