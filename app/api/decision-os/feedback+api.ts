/**
 * POST /api/decision-os/feedback
 * 
 * Records user feedback on a decision.
 * 
 * IMPORTANT: This is APPEND-ONLY.
 * We do NOT update the original decision_events row.
 * Instead, we INSERT a new row with the user_action set.
 * This preserves the append-only invariant for audit/analytics.
 */

import { DecisionStore } from '../../../services/DecisionStore';
import type { FeedbackRequest, FeedbackResponse } from '../../../types/decision-os';

export async function POST(request: Request): Promise<Response> {
  try {
    const body: FeedbackRequest = await request.json();
    
    const { householdKey = 'default', eventId, userAction, nowIso } = body;
    
    if (!eventId) {
      return Response.json(
        { error: 'eventId is required' },
        { status: 400 }
      );
    }
    
    if (!userAction || !['approved', 'rejected', 'drm_triggered'].includes(userAction)) {
      return Response.json(
        { error: 'userAction must be approved, rejected, or drm_triggered' },
        { status: 400 }
      );
    }
    
    if (!nowIso) {
      return Response.json(
        { error: 'nowIso is required' },
        { status: 400 }
      );
    }
    
    // APPEND-ONLY: This inserts a new row, does not update
    const result = DecisionStore.recordFeedback(householdKey, eventId, userAction, nowIso);
    
    const response: FeedbackResponse = {
      recorded: result.recorded
    };
    
    return Response.json(response);
  } catch (error) {
    console.error('Feedback API error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
