/**
 * POST /api/decision-os/decision
 * 
 * Returns a single decision for the household.
 * Returns null + drmRecommended if no good option available.
 */

import { DecisionStore } from '../../../services/DecisionStore';
import type { DecisionRequest, DecisionResponse } from '../../../types/decision-os';

export async function POST(request: Request): Promise<Response> {
  try {
    const body: DecisionRequest = await request.json();
    
    const { householdKey = 'default', nowIso, signal } = body;
    
    if (!nowIso) {
      return Response.json(
        { error: 'nowIso is required' },
        { status: 400 }
      );
    }
    
    const result = DecisionStore.getDecision(householdKey, nowIso, signal);
    
    const response: DecisionResponse = {
      decision: result.decision,
      drmRecommended: result.drmRecommended,
      decisionEventId: result.decisionEventId
    };
    
    return Response.json(response);
  } catch (error) {
    console.error('Decision API error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
