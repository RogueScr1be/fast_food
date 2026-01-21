/**
 * Decision OS Feedback API Endpoint
 * 
 * AUTHENTICATION:
 * - Production: Requires valid Supabase JWT in Authorization header
 * - Dev/Test: Falls back to default household if no auth
 * 
 * Handles user feedback on decisions including:
 * - approved: User approves the decision
 * - rejected: User rejects the decision
 * - drm_triggered: User explicitly triggers DRM (e.g., "Dinner changed")
 * - undo: User undoes an autopilot-approved decision (within 10-minute window)
 * 
 * BANNED: 'modified' action is not allowed.
 * 
 * Response (CANONICAL CONTRACT):
 * { recorded: true }
 * 
 * Error Response (401):
 * { error: 'unauthorized' }
 * 
 * This is intentional for simplicity and to avoid array responses.
 */

import type { FeedbackRequest, FeedbackResponse, DecisionEvent } from '../../../types/decision-os';
import { 
  processFeedback, 
  processUndo,
  isAutopilotEvent,
  isWithinUndoWindow,
  shouldRunConsumption,
  shouldUpdateTasteGraph,
  shouldReverseConsumption,
} from '../../../lib/decision-os/feedback/handler';
import { computeTasteWeight } from '../../../lib/decision-os/taste/weights';
import { validateFeedbackResponse, validateErrorResponse } from '../../../lib/decision-os/invariants';
import { authenticateRequest } from '../../../lib/decision-os/auth/helper';
import { resolveFlags, getFlags } from '../../../lib/decision-os/config/flags';
import { record } from '../../../lib/decision-os/monitoring/metrics';
import { getDb } from '../../../lib/decision-os/db/client';

/**
 * Valid client-submitted actions.
 * NOTE: 'modified' is BANNED - not in this list.
 * NOTE: 'expired' and 'pending' are internal-only, not client actions.
 */
const VALID_CLIENT_ACTIONS = ['approved', 'rejected', 'drm_triggered', 'undo'] as const;

/**
 * Validates the feedback request body.
 * Returns null for invalid requests (including banned 'modified' action).
 */
function validateRequest(body: unknown): FeedbackRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  
  const req = body as Record<string, unknown>;
  
  if (typeof req.eventId !== 'string' || !req.eventId) {
    return null;
  }
  
  // Validate userAction against allowed client actions
  // 'modified' is BANNED and will fail this check
  if (typeof req.userAction !== 'string' || 
      !VALID_CLIENT_ACTIONS.includes(req.userAction as typeof VALID_CLIENT_ACTIONS[number])) {
    return null;
  }
  
  return {
    eventId: req.eventId,
    userAction: req.userAction as FeedbackRequest['userAction'],
  };
}

/**
 * Mock database functions - these would be replaced with actual DB calls
 */
async function getEventById(eventId: string): Promise<DecisionEvent | null> {
  // In a real implementation, this would query the database
  // For now, we return a mock that allows testing
  void eventId;
  return null;
}

async function getExistingCopies(originalEventId: string): Promise<DecisionEvent[]> {
  // In a real implementation, this would query for all feedback copies
  void originalEventId;
  return [];
}

async function insertDecisionEvent(event: DecisionEvent): Promise<void> {
  // In a real implementation, this would insert into the database
  void event;
}

async function insertTasteSignal(eventId: string, weight: number): Promise<void> {
  // In a real implementation, this would insert a taste signal
  void eventId;
  void weight;
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
function buildSuccessResponse(): Response {
  const response: FeedbackResponse = { recorded: true };
  const validation = validateFeedbackResponse(response);
  if (!validation.valid) {
    console.error('Feedback response validation failed:', validation.errors);
  }
  return Response.json(response, { status: 200 });
}

/**
 * POST /api/decision-os/feedback
 * 
 * Processes user feedback on a decision.
 * 
 * Request body:
 * {
 *   eventId: string,
 *   userAction: 'approved' | 'rejected' | 'drm_triggered' | 'undo'
 * }
 * 
 * BANNED: 'modified' action is rejected.
 * 
 * Response:
 * { recorded: true }
 * 
 * Undo behavior:
 * - Only allowed for autopilot-approved events
 * - Only allowed within 10-minute window
 * - Creates a new decision_event row with user_action='rejected' and notes='undo_autopilot'
 * - Inserts taste signal with -0.5 weight (autonomy penalty, not taste rejection)
 * - Does NOT reverse consumption (v1 limitation)
 * - Idempotent: multiple undos create only one undo copy
 */
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
      // Return 401 unauthorized when Decision OS is disabled
      return buildErrorResponse('unauthorized');
    }
    
    // Authenticate request
    const authHeader = request.headers.get('Authorization');
    const authResult = await authenticateRequest(authHeader);
    
    if (!authResult.success) {
      return buildErrorResponse('unauthorized');
    }
    
    const body = await request.json();
    const validatedRequest = validateRequest(body);
    
    if (!validatedRequest) {
      // Still return { recorded: true } to maintain response shape
      // Invalid requests (including banned 'modified') are no-ops
      return buildSuccessResponse();
    }
    
    // Track undo requests
    if (validatedRequest.userAction === 'undo') {
      record('undo_received');
    }
    
    // Get the original event
    const originalEvent = await getEventById(validatedRequest.eventId);
    if (!originalEvent) {
      // Event not found - no-op, return success
      return buildSuccessResponse();
    }
    
    // Get existing feedback copies
    const existingCopies = await getExistingCopies(originalEvent.id);
    
    // Process the feedback
    const result = processFeedback(originalEvent, existingCopies, validatedRequest);
    
    // If a new feedback copy was created, persist it
    if (result.feedbackCopy && !result.isDuplicate) {
      await insertDecisionEvent(result.feedbackCopy);
      
      // Update taste graph if applicable
      if (shouldUpdateTasteGraph(result.feedbackCopy)) {
        const weight = computeTasteWeight(result.feedbackCopy);
        await insertTasteSignal(result.feedbackCopy.id, weight);
      }
      
      // Run consumption if applicable (not for rejected/undo)
      if (shouldRunConsumption(result.feedbackCopy)) {
        // Trigger consumption logic here
      }
      
      // Check if we should reverse consumption (v1: always false)
      if (shouldReverseConsumption(result.feedbackCopy)) {
        // Would reverse consumption here in future versions
      }
    }
    
    // Always return { recorded: true } - maintains simple response shape
    return buildSuccessResponse();
  } catch (error) {
    // Even on error, return { recorded: true } to maintain response shape
    // Errors are logged but don't change the response
    console.error('Feedback processing error:', error);
    return buildSuccessResponse();
  }
}
