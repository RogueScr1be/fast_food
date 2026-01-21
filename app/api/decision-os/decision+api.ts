/**
 * Decision OS Decision API Endpoint
 * 
 * POST /api/decision-os/decision
 * 
 * Request body:
 * {
 *   userProfileId: number,
 *   context?: { time?: string, dayOfWeek?: string, ... }
 * }
 * 
 * Response (DO NOT CHANGE SHAPE):
 * {
 *   decision: object | null,
 *   drmRecommended: boolean,
 *   autopilot?: boolean,
 *   decisionEventId?: string,
 *   message?: string
 * }
 * 
 * INVARIANTS:
 * - No arrays in response
 * - append-only: feedback creates NEW rows, never updates
 * - autopilot is optional boolean
 */

import { getDb } from '../../../lib/decision-os/db/client';
import { checkAutopilotEligibility } from '../../../lib/decision-os/autopilot/policy';
import { createAutopilotApproval, hasAutopilotApproval, NOTES } from '../../../lib/decision-os/feedback/handler';
import type { DecisionResponse, DecisionEvent } from '../../../types/decision-os';

interface DecisionRequest {
  userProfileId: number;
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
  
  if (typeof req.userProfileId !== 'number' || req.userProfileId <= 0) {
    return null;
  }
  
  return {
    userProfileId: req.userProfileId,
    context: req.context as Record<string, unknown> | undefined,
  };
}

/**
 * Generate a unique decision event ID
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
  // Simple hash - in production use crypto
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
 * POST handler for decision requests
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const validatedRequest = validateRequest(body);
    
    if (!validatedRequest) {
      const response: DecisionResponse = {
        decision: null,
        drmRecommended: false,
        message: 'Invalid request',
      };
      return Response.json(response, { status: 200 });
    }
    
    const db = getDb();
    const { userProfileId, context } = validatedRequest;
    
    // Get user's decision history
    const userEvents = await db.getDecisionEventsByUserId(userProfileId, 100);
    
    // Check if DRM should be recommended
    const drmRecommended = shouldRecommendDrm(userEvents);
    
    // Get meal suggestion
    const mealSuggestion = getMealSuggestion(context);
    
    // Create decision event
    const eventId = generateDecisionEventId();
    const contextHash = generateContextHash(userProfileId, context);
    const nowIso = new Date().toISOString();
    
    // Check autopilot eligibility
    const autopilotEligibility = checkAutopilotEligibility(userEvents);
    
    // Create pending event
    const pendingEvent: DecisionEvent = {
      id: eventId,
      user_profile_id: userProfileId,
      decided_at: nowIso,
      decision_payload: {
        ...mealSuggestion,
        context,
      },
      meal_id: mealSuggestion.mealId as number,
      context_hash: contextHash,
    };
    
    // If autopilot eligible and not already applied, create autopilot approval
    let autopilotApplied = false;
    if (autopilotEligibility.eligible) {
      // Check for existing autopilot approval (idempotency)
      const existingCopies = await db.getDecisionEventsByContextHash(contextHash);
      
      if (!hasAutopilotApproval(existingCopies)) {
        // Create and insert autopilot approval
        const autopilotCopy = createAutopilotApproval(pendingEvent);
        await db.insertDecisionEvent(autopilotCopy);
        autopilotApplied = true;
        
        // Insert taste signal for autopilot approval
        await db.insertTasteSignal({
          id: `ts-${autopilotCopy.id}`,
          user_profile_id: userProfileId,
          meal_id: mealSuggestion.mealId as number,
          weight: 1.0,
          decision_event_id: autopilotCopy.id,
          created_at: nowIso,
        });
      } else {
        // Already has autopilot approval
        autopilotApplied = true;
      }
    }
    
    // Build response
    const response: DecisionResponse = {
      decision: drmRecommended ? null : mealSuggestion,
      drmRecommended,
      decisionEventId: eventId,
    };
    
    // Add autopilot flag if eligible
    if (autopilotEligibility.eligible) {
      response.autopilot = true;
    }
    
    // Add reason if DRM recommended
    if (drmRecommended) {
      response.message = 'Multiple rejections detected';
    }
    
    return Response.json(response, { status: 200 });
  } catch (error) {
    console.error('Decision processing error:', error);
    
    // Best-effort response
    const response: DecisionResponse = {
      decision: null,
      drmRecommended: false,
      message: 'Error processing decision',
    };
    return Response.json(response, { status: 200 });
  }
}
