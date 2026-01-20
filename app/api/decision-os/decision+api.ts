/**
 * FAST FOOD: Decision OS API
 * POST /api/decision-os/decision
 * 
 * Returns EXACTLY ONE dinner action or null with drmRecommended flag.
 * 
 * INVARIANTS (enforced):
 * - Response NEVER contains arrays (deep check)
 * - Single decision object or null
 * - No "suggestions", "options", "alternatives"
 * - Missing inventory does NOT block decisions
 * 
 * Route path: POST /api/decision-os/decision
 * (Expo Router prefixes with /api automatically)
 */

import { randomUUID } from 'crypto';
import {
  isValidDecisionRequest,
  type DecisionRequest,
  type DecisionResponse,
} from '@/types/decision-os/decision';
import {
  makeDecision,
} from '@/lib/decision-os/arbiter';
import {
  validateDecisionResponse,
} from '@/lib/decision-os/invariants';
import {
  getActiveMeals,
  getMealIngredients,
  getInventoryItems,
  getRecentDecisionEvents,
  insertDecisionEvent,
  getTasteScoresForMeals,
} from '@/lib/decision-os/database';

/**
 * POST /api/decision-os/decision
 * 
 * Request body:
 * {
 *   "householdKey": "default",
 *   "nowIso": "2026-01-19T18:05:00-06:00",
 *   "signal": {
 *     "timeWindow": "dinner",
 *     "energy": "unknown|low|ok",
 *     "calendarConflict": false
 *   }
 * }
 * 
 * Response (success):
 * {
 *   "decision": { ...singleAction },
 *   "drmRecommended": false
 * }
 * 
 * Response (DRM recommended):
 * {
 *   "decision": null,
 *   "drmRecommended": true,
 *   "reason": "late_no_action|two_rejections|calendar_conflict|low_energy"
 * }
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate request
    if (!isValidDecisionRequest(body)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request body',
          details: 'Required: householdKey (string), nowIso (ISO string), signal (object with timeWindow, energy, calendarConflict)',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    const decisionRequest: DecisionRequest = body;
    
    // Fetch base data from database
    const [activeMeals, ingredients, inventory, recentDecisions] = await Promise.all([
      getActiveMeals(),
      getMealIngredients(),
      getInventoryItems(decisionRequest.householdKey),
      getRecentDecisionEvents(decisionRequest.householdKey, 7),
    ]);
    
    // Fetch taste scores for candidate meals (Phase 4)
    const mealIds = activeMeals.map(m => m.id);
    const tasteScores = await getTasteScoresForMeals(
      decisionRequest.householdKey,
      mealIds
    );
    
    // Make decision with taste-aware scoring
    const response: DecisionResponse = await makeDecision({
      request: decisionRequest,
      activeMeals,
      ingredients,
      inventory,
      recentDecisions,
      generateEventId: () => randomUUID(),
      persistDecisionEvent: insertDecisionEvent,
      tasteScores,
    });
    
    // INVARIANT CHECK: Deep validation - no arrays anywhere in response
    validateDecisionResponse(response);
    
    // Return response
    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Decision API error:', error);
    
    // Check if it's an invariant violation
    const isInvariantError = error instanceof Error && 
      error.message.includes('INVARIANT VIOLATION');
    
    // Return error response
    return new Response(
      JSON.stringify({
        error: isInvariantError ? 'Invariant violation' : 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: isInvariantError ? 500 : 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * GET /api/decision-os/decision
 * 
 * Not supported - decisions require POST with signal data
 */
export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      error: 'Method not allowed',
      details: 'Use POST with request body to get a decision',
    }),
    {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Allow': 'POST',
      },
    }
  );
}
