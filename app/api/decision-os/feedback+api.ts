/**
 * FAST FOOD: Decision OS Feedback API
 * POST /api/decision-os/feedback
 * 
 * Records user feedback on a decision.
 * 
 * INVARIANTS (enforced):
 * - APPEND-ONLY: Never updates existing decision_events rows
 * - Instead, INSERTS a new row copying original data with user_action set
 * - Original event preserves user_action='pending'
 * - Feedback event has user_action='approved|rejected|drm_triggered' + actioned_at
 */

import { randomUUID } from 'crypto';
import {
  getDecisionEventByIdAndHousehold,
  insertDecisionEventFeedbackCopy,
} from '@/lib/decision-os/database';

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

export type UserAction = 'approved' | 'rejected' | 'drm_triggered';

export interface FeedbackRequest {
  householdKey: string;
  eventId: string;
  userAction: UserAction;
  nowIso: string;
}

export interface FeedbackResponse {
  recorded: boolean;
  feedbackEventId?: string;
}

// =============================================================================
// VALIDATION
// =============================================================================

function isValidFeedbackRequest(body: unknown): body is FeedbackRequest {
  if (typeof body !== 'object' || body === null) return false;
  
  const req = body as Record<string, unknown>;
  
  if (typeof req.householdKey !== 'string' || !req.householdKey) return false;
  if (typeof req.eventId !== 'string' || !req.eventId) return false;
  if (!['approved', 'rejected', 'drm_triggered'].includes(req.userAction as string)) return false;
  if (typeof req.nowIso !== 'string' || !req.nowIso) return false;
  
  return true;
}

// =============================================================================
// API HANDLER
// =============================================================================

/**
 * POST /api/decision-os/feedback
 * 
 * Request body:
 * {
 *   "householdKey": "default",
 *   "eventId": "<decisionEventId>",
 *   "userAction": "approved|rejected|drm_triggered",
 *   "nowIso": "2026-01-20T19:00:00-06:00"
 * }
 * 
 * Response:
 * {
 *   "recorded": true,
 *   "feedbackEventId": "<new-event-id>"
 * }
 * 
 * APPEND-ONLY BEHAVIOR:
 * - Finds original decision_event by eventId + householdKey
 * - Creates NEW row copying original's decision_payload/context_hash/etc
 * - New row has user_action=approved|rejected and actioned_at=nowIso
 * - Original row is NEVER updated (append-only)
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate request
    if (!isValidFeedbackRequest(body)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request body',
          details: 'Required: householdKey (string), eventId (string), userAction (approved|rejected|drm_triggered), nowIso (ISO string)',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    const feedbackRequest: FeedbackRequest = body;
    
    // Find original decision event
    const originalEvent = await getDecisionEventByIdAndHousehold(
      feedbackRequest.eventId,
      feedbackRequest.householdKey
    );
    
    if (!originalEvent) {
      return new Response(
        JSON.stringify({
          error: 'Event not found',
          details: `No decision event found with id=${feedbackRequest.eventId} for household=${feedbackRequest.householdKey}`,
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    // APPEND-ONLY: Insert new row with feedback, don't update original
    const newEventId = randomUUID();
    
    await insertDecisionEventFeedbackCopy(
      originalEvent,
      newEventId,
      feedbackRequest.userAction,
      feedbackRequest.nowIso
    );
    
    // Return success response
    const response: FeedbackResponse = {
      recorded: true,
      feedbackEventId: newEventId,
    };
    
    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Feedback API error:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
