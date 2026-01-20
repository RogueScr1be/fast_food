/**
 * FAST FOOD: Decision OS API
 * POST /api/decision-os/decision
 * 
 * Returns EXACTLY ONE dinner action or null with drmRecommended flag.
 * 
 * INVARIANTS (enforced):
 * - Response NEVER contains arrays
 * - Single decision object or null
 * - No "suggestions", "options", "alternatives"
 * - Missing inventory does NOT block decisions
 */

import { randomUUID } from 'crypto';
import {
  isValidDecisionRequest,
  assertNoArraysInResponse,
  type DecisionRequest,
  type DecisionResponse,
} from '@/types/decision-os/decision';
import {
  makeDecision,
} from '@/lib/decision-os/arbiter';
import {
  getActiveMeals,
  getMealIngredients,
  getInventoryItems,
  getRecentDecisionEvents,
  insertDecisionEvent,
  loadTestSeedData,
} from '@/lib/decision-os/database';

// Initialize mock data on module load (development only)
// In production, this would be removed and real DB used
let initialized = false;

function ensureInitialized(): void {
  if (!initialized) {
    loadTestSeedData();
    initialized = true;
  }
}

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
    // Ensure mock data is initialized (development)
    ensureInitialized();
    
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
    
    // Fetch data from database
    const [activeMeals, ingredients, inventory, recentDecisions] = await Promise.all([
      getActiveMeals(),
      getMealIngredients(),
      getInventoryItems(decisionRequest.householdKey),
      getRecentDecisionEvents(decisionRequest.householdKey, 7),
    ]);
    
    // Make decision
    const response: DecisionResponse = await makeDecision({
      request: decisionRequest,
      activeMeals,
      ingredients,
      inventory,
      recentDecisions,
      generateEventId: () => randomUUID(),
      persistDecisionEvent: insertDecisionEvent,
    });
    
    // INVARIANT CHECK: Ensure no arrays in response
    assertNoArraysInResponse(response);
    
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
    
    // Return error response
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
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
