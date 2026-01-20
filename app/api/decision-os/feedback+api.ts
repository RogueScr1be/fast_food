/**
 * Decision OS Feedback API Endpoint
 * 
 * Handles user feedback on decisions including:
 * - approved: User approves the decision
 * - rejected: User rejects the decision
 * - modified: User modifies the decision
 * - undo: User undoes an autopilot-approved decision (within 10-minute window)
 * 
 * Response shape is ALWAYS: { recorded: true }
 * This is intentional for simplicity and to avoid array responses.
 */

import type { FeedbackRequest, FeedbackResponse, DecisionEvent } from '../../../types/decision-os';
import { 
  processFeedback, 
  processUndo,
  isAutopilotEvent,
  isWithinUndoWindow,
  getTasteGraphWeight,
  shouldRunConsumption,
  shouldUpdateTasteGraph,
  shouldReverseConsumption,
} from '../../../lib/decision-os/feedback/handler';

/**
 * Validates the feedback request body.
 */
function validateRequest(body: unknown): FeedbackRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  
  const req = body as Record<string, unknown>;
  
  if (typeof req.eventId !== 'string' || !req.eventId) {
    return null;
  }
  
  const validActions = ['approved', 'rejected', 'modified', 'undo'];
  if (typeof req.userAction !== 'string' || !validActions.includes(req.userAction)) {
    return null;
  }
  
  // modifiedPayload is optional but must be an object if present
  if (req.modifiedPayload !== undefined && 
      (typeof req.modifiedPayload !== 'object' || req.modifiedPayload === null)) {
    return null;
  }
  
  return {
    eventId: req.eventId,
    userAction: req.userAction as FeedbackRequest['userAction'],
    modifiedPayload: req.modifiedPayload as Record<string, unknown> | undefined,
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
 * POST /api/decision-os/feedback
 * 
 * Processes user feedback on a decision.
 * 
 * Request body:
 * {
 *   eventId: string,
 *   userAction: 'approved' | 'rejected' | 'modified' | 'undo',
 *   modifiedPayload?: Record<string, unknown>
 * }
 * 
 * Response:
 * { recorded: true }
 * 
 * Undo behavior:
 * - Only allowed for autopilot-approved events
 * - Only allowed within 10-minute window
 * - Creates a new decision_event row with status='rejected' and notes='undo_autopilot'
 * - Inserts taste signal with -0.5 weight
 * - Does NOT reverse consumption (v1 limitation)
 * - Idempotent: multiple undos create only one undo copy
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const validatedRequest = validateRequest(body);
    
    if (!validatedRequest) {
      // Still return { recorded: true } to maintain response shape
      // Invalid requests are no-ops
      return Response.json({ recorded: true } satisfies FeedbackResponse);
    }
    
    // Get the original event
    const originalEvent = await getEventById(validatedRequest.eventId);
    if (!originalEvent) {
      // Event not found - no-op, return success
      return Response.json({ recorded: true } satisfies FeedbackResponse);
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
        const weight = getTasteGraphWeight(result.feedbackCopy);
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
    return Response.json({ recorded: true } satisfies FeedbackResponse);
  } catch (error) {
    // Even on error, return { recorded: true } to maintain response shape
    // Errors are logged but don't change the response
    console.error('Feedback processing error:', error);
    return Response.json({ recorded: true } satisfies FeedbackResponse);
  }
}
