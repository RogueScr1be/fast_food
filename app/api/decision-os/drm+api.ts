/**
 * POST /api/decision-os/drm
 * 
 * Decision Recovery Mode - returns a rescue decision.
 * Always provides a fast fallback option.
 */

import { DecisionStore } from '../../../services/DecisionStore';
import type { DrmRequest, DrmResponse } from '../../../types/decision-os';

export async function POST(request: Request): Promise<Response> {
  try {
    const body: DrmRequest = await request.json();
    
    const { householdKey = 'default', nowIso, triggerReason } = body;
    
    if (!nowIso) {
      return Response.json(
        { error: 'nowIso is required' },
        { status: 400 }
      );
    }
    
    if (!triggerReason) {
      return Response.json(
        { error: 'triggerReason is required' },
        { status: 400 }
      );
    }
    
    const result = DecisionStore.getDrmRescue(householdKey, nowIso, triggerReason);
    
    const response: DrmResponse = {
      rescue: result.rescue,
      decisionEventId: result.decisionEventId
    };
    
    return Response.json(response);
  } catch (error) {
    console.error('DRM API error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
