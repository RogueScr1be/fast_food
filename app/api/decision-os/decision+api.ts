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
  type DecisionEventRow,
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
import {
  evaluateAutopilotEligibility,
  wasMealUsedRecently,
  type AutopilotContext,
} from '@/lib/decision-os/autopilot/policy';
import { consumeInventoryForMeal } from '@/lib/decision-os/consumption';
import { updateTasteGraph } from '@/lib/decision-os/taste/updater';

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
    const arbiterResult = await makeDecision({
      request: decisionRequest,
      activeMeals,
      ingredients,
      inventory,
      recentDecisions,
      generateEventId: () => randomUUID(),
      persistDecisionEvent: insertDecisionEvent,
      tasteScores,
    });
    
    let response: DecisionResponse = arbiterResult.response;
    
    // Evaluate autopilot eligibility for cook decisions
    if (
      response.drmRecommended === false &&
      response.decision?.decisionType === 'cook' &&
      arbiterResult.internalContext
    ) {
      const { internalContext } = arbiterResult;
      
      // Check if meal was used in last 3 local days (computed from recent events)
      const usedInLast3Days = internalContext.selectedMealId
        ? wasMealUsedRecently(internalContext.selectedMealId, recentDecisions, decisionRequest.nowIso)
        : false;
      
      // Build autopilot context
      const autopilotContext: AutopilotContext = {
        nowIso: decisionRequest.nowIso,
        signal: decisionRequest.signal,
        mealId: internalContext.selectedMealId!,
        inventoryScore: internalContext.inventoryScore,
        tasteScore: internalContext.tasteScore,
        usedInLast3Days,
        recentEvents: recentDecisions,
      };
      
      const autopilotResult = evaluateAutopilotEligibility(autopilotContext);
      
      if (autopilotResult.eligible) {
        // AUTOPILOT ELIGIBLE: Insert feedback copy row with user_action='approved'
        const feedbackEventId = randomUUID();
        const feedbackEvent: DecisionEventRow = {
          id: feedbackEventId,
          household_key: decisionRequest.householdKey,
          decided_at: decisionRequest.nowIso,
          decision_type: 'cook',
          meal_id: internalContext.selectedMealId,
          external_vendor_key: null,
          context_hash: internalContext.contextHash,
          decision_payload: internalContext.decisionPayload,
          user_action: 'approved',
          actioned_at: decisionRequest.nowIso,
        };
        
        try {
          await insertDecisionEvent(feedbackEvent);
          
          // Trigger consumption hook (best-effort)
          if (internalContext.selectedMealId) {
            try {
              const client = await import('@/lib/decision-os/database').then(m => m.getClient());
              await consumeInventoryForMeal(
                decisionRequest.householdKey,
                internalContext.selectedMealId,
                decisionRequest.nowIso,
                client
              );
            } catch {
              // Best-effort - don't fail the request
            }
            
            // Trigger taste graph update (best-effort)
            try {
              const client = await import('@/lib/decision-os/database').then(m => m.getClient());
              await updateTasteGraph(feedbackEvent, client);
            } catch {
              // Best-effort - don't fail the request
            }
          }
          
          // Add autopilot flag to response
          response = {
            ...response,
            autopilot: true,
          };
        } catch {
          // If feedback insert fails, just return normal response (no autopilot)
        }
      }
    }
    
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
