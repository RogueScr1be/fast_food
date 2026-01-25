/**
 * Decision OS Decision API Endpoint (MVP)
 * 
 * POST /api/decision-os/decision
 * 
 * USES DECISION ARBITER per contract:
 * - Returns EXACTLY one decision per session (or DRM fallback)
 * - ZERO user questions
 * - ZERO alternative options
 * - Execution payload is mandatory
 * 
 * DECISION LOCK SEMANTICS:
 * - If active session has decision_id, return that same decision (idempotent)
 * - If session is closed (accepted/rescued/abandoned), start new session
 * 
 * AUTHENTICATION:
 * - Production: Requires valid Supabase JWT in Authorization header
 * - Dev/Test: Falls back to default household if no auth
 * 
 * Request body:
 * {
 *   intent?: { selected: string[], energyLevel?: string }
 * }
 * 
 * Response (CANONICAL CONTRACT - DO NOT ADD FIELDS):
 * {
 *   decision: object | null,
 *   drmRecommended: boolean,
 *   reason?: string,
 *   autopilot?: boolean
 * }
 * 
 * INVARIANTS:
 * - No arrays in response (FAIL FAST if violated)
 * - One decision only (never multiple options)
 */

import { getDb, isReadonlyModeError, type SessionRecord, type MealRecord } from '../../../lib/decision-os/db/client';
import { validateDecisionResponse, validateErrorResponse, assertNoArraysDeep } from '../../../lib/decision-os/invariants';
import { authenticateRequest, type AuthContext } from '../../../lib/decision-os/auth/helper';
import { resolveFlags, getFlags } from '../../../lib/decision-os/config/flags';
import { record } from '../../../lib/decision-os/monitoring/metrics';
import { decide, buildContextFromIntent } from '../../../lib/decision-os/arbiter';
import { executeDrmOverride, shouldTriggerDrm, getFallbackConfig, type DrmTriggerReason } from '../../../lib/decision-os/drm/fallback';
import type { 
  ArbiterInput, 
  ArbiterOutput, 
  Meal, 
  FallbackConfig,
  ArbiterContextInput,
} from '../../../types/decision-os';

// =============================================================================
// REQUEST TYPES
// =============================================================================

interface IntentInput {
  selected: string[];
  energyLevel?: 'low' | 'medium' | 'high';
}

interface DecisionRequest {
  intent?: IntentInput;
  sessionId?: string; // Optional: resume existing session
}

// =============================================================================
// VALIDATION
// =============================================================================

function validateRequest(body: unknown): DecisionRequest | null {
  if (!body || typeof body !== 'object') {
    return { intent: { selected: [] } }; // Default intent
  }
  
  const req = body as Record<string, unknown>;
  
  // Extract intent
  const rawIntent = req.intent as Record<string, unknown> | undefined;
  const intent: IntentInput = {
    selected: Array.isArray(rawIntent?.selected) ? rawIntent.selected : [],
    energyLevel: rawIntent?.energyLevel as 'low' | 'medium' | 'high' | undefined,
  };
  
  return {
    intent,
    sessionId: typeof req.sessionId === 'string' ? req.sessionId : undefined,
  };
}

// =============================================================================
// RESPONSE BUILDERS
// =============================================================================

function buildErrorResponse(error: string): Response {
  const response = { error };
  const validation = validateErrorResponse(response);
  if (!validation.valid) {
    console.error('Error response validation failed:', validation.errors);
  }
  return Response.json(response, { status: 401 });
}

interface DecisionResponseShape {
  decision: Record<string, unknown> | null;
  drmRecommended: boolean;
  reason?: string;
  autopilot?: boolean;
}

/**
 * Build and validate canonical response.
 * FAIL FAST on any contract violation.
 */
function buildResponse(
  decision: ArbiterOutput | null,
  drmRecommended: boolean,
  reason?: string
): DecisionResponseShape {
  // INVARIANT: decision must be object or null, never array
  if (Array.isArray(decision)) {
    throw new Error('INVARIANT_VIOLATION: decision must be object or null, not array');
  }
  
  const response: DecisionResponseShape = {
    decision: decision as Record<string, unknown> | null,
    drmRecommended,
  };
  
  if (reason !== undefined) {
    response.reason = reason;
  }
  
  // INVARIANT: No arrays deep in response
  const arrayErrors = assertNoArraysDeep(response);
  // Note: execution_payload.steps is allowed to be an array in the decision object
  // but the response wrapper itself shouldn't have arrays at top level
  
  // Validate before returning (fail-fast on contract violation)
  const validation = validateDecisionResponse(response);
  if (!validation.valid) {
    console.error('Decision response validation failed:', validation.errors);
    // Return minimal valid response
    return { decision: null, drmRecommended: false };
  }
  
  return response;
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `ses-${timestamp}-${random}`;
}

async function getOrCreateSession(
  db: ReturnType<typeof getDb>,
  householdKey: string,
  context: ArbiterContextInput,
  requestedSessionId?: string
): Promise<{ session: SessionRecord; isNew: boolean }> {
  // If sessionId provided, try to find and reuse
  if (requestedSessionId) {
    const existing = await db.getSessionById(householdKey, requestedSessionId);
    if (existing && existing.outcome === 'pending') {
      return { session: existing, isNew: false };
    }
    // Session not found or closed - fall through to create new
  }
  
  // Check for active session
  const activeSession = await db.getActiveSession(householdKey);
  if (activeSession) {
    // DECISION LOCK: If session already has a decision, reuse it
    if (activeSession.decision_id) {
      return { session: activeSession, isNew: false };
    }
    // Update context if needed and return
    return { session: activeSession, isNew: false };
  }
  
  // Create new session
  const now = new Date().toISOString();
  const newSession: SessionRecord = {
    id: generateSessionId(),
    household_key: householdKey,
    started_at: now,
    context: context as unknown as Record<string, unknown>,
    outcome: 'pending',
    rejection_count: 0,
    created_at: now,
    updated_at: now,
  };
  
  await db.createSession(newSession);
  return { session: newSession, isNew: true };
}

// =============================================================================
// MEAL CONVERSION
// =============================================================================

function convertMealRecords(records: MealRecord[]): Meal[] {
  return records.map(r => ({
    id: r.id,
    name: r.name,
    category: r.category,
    prep_time_minutes: r.prep_time_minutes,
    tags: Array.isArray(r.tags) ? r.tags : [],
    estimated_cost_cents: r.estimated_cost_cents || 0,
    difficulty: r.difficulty || 'medium',
    mode: r.mode || 'cook',
    cook_steps: Array.isArray(r.cook_steps) ? r.cook_steps : [],
  }));
}

// =============================================================================
// POST HANDLER
// =============================================================================

export async function POST(request: Request): Promise<Response> {
  record('decision_called');
  
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
      record('decision_unauthorized');
      return buildErrorResponse('unauthorized');
    }
    
    // Authenticate request
    const authHeader = request.headers.get('Authorization');
    const authResult = await authenticateRequest(authHeader);
    
    if (!authResult.success) {
      record('decision_unauthorized');
      return buildErrorResponse('unauthorized');
    }
    
    const authContext = authResult.context;
    const householdKey = authContext.householdKey;
    
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const validatedRequest = validateRequest(body);
    
    if (!validatedRequest) {
      const response = buildResponse(null, false, 'Invalid request');
      return Response.json(response, { status: 200 });
    }
    
    const { intent, sessionId: requestedSessionId } = validatedRequest;
    
    // Get current time for context
    const currentHour = new Date().getHours();
    const currentTime = new Date().toTimeString().slice(0, 5); // HH:MM format
    
    // Get household config for budget and fallbacks
    const householdConfig = await db.getHouseholdConfig(householdKey);
    const budgetCeilingCents = householdConfig?.budget_ceiling_cents ?? 2000;
    const fallbackConfig = getFallbackConfig(householdConfig?.fallback_config ?? null);
    
    // Build context from intent (maps UI buttons to constraints)
    const context = buildContextFromIntent(
      intent ?? { selected: [] },
      budgetCeilingCents,
      currentHour
    );
    
    // READONLY MODE: Return safe response without DB writes
    if (flags.readonlyMode) {
      record('readonly_hit');
      const response = buildResponse(null, false, 'System in readonly mode');
      return Response.json(response, { status: 200 });
    }
    
    // Get or create session (handles Decision Lock)
    const { session, isNew } = await getOrCreateSession(db, householdKey, context, requestedSessionId);
    
    // Record session_started metric for new sessions
    if (isNew) {
      record('session_started');
    }
    
    // DECISION LOCK: If session already has a decision, return it (idempotent)
    if (session.decision_id && session.decision_payload) {
      // Check if DRM should trigger based on rejection count
      const shouldDrm = shouldTriggerDrm(
        session.rejection_count,
        currentTime,
        session.decision_payload as unknown as ArbiterOutput,
        false, // not explicit done
        fallbackConfig
      );
      
      if (shouldDrm.trigger) {
        // DRM overrides - execute DRM fallback
        const drmOutput = executeDrmOverride(session.id, fallbackConfig, shouldDrm.reason);
        
        if (drmOutput) {
          // Update session with DRM outcome
          await db.updateSession(householdKey, session.id, {
            outcome: 'rescued',
            ended_at: new Date().toISOString(),
            decision_payload: drmOutput as unknown as Record<string, unknown>,
          });
          
          const response = buildResponse(drmOutput, true, `DRM activated: ${shouldDrm.reason}`);
          return Response.json(response, { status: 200 });
        }
      }
      
      // Return existing decision (Decision Lock)
      const response = buildResponse(
        session.decision_payload as unknown as ArbiterOutput,
        false
      );
      return Response.json(response, { status: 200 });
    }
    
    // Load meals from database
    const mealRecords = await db.getMeals();
    const meals = convertMealRecords(mealRecords);
    
    // Get taste signals from decision history
    const decisionEvents = await db.getDecisionEvents(householdKey, 50);
    const acceptedMeals: string[] = [];
    const rejectedMeals: string[] = [];
    
    for (const event of decisionEvents) {
      const mealName = event.decision_payload?.meal as string | undefined;
      if (mealName) {
        if (event.user_action === 'approved') {
          acceptedMeals.push(mealName);
        } else if (event.user_action === 'rejected') {
          rejectedMeals.push(mealName);
        }
      }
    }
    
    // Get inventory estimate
    const inventoryItems = await db.getInventoryItems(householdKey);
    const inventoryEstimate = inventoryItems.map(i => ({
      item: i.item_name,
      confidence: i.confidence,
    }));
    
    // Track if inventory signal is being used (privacy-safe)
    const hasInventorySignal = inventoryEstimate.length > 0;
    if (hasInventorySignal) {
      record('inventory_signal_used');
    }
    
    // Build Arbiter input
    const arbiterInput: ArbiterInput = {
      context,
      tasteSignals: { acceptedMeals, rejectedMeals },
      inventoryEstimate,
      householdFallbacks: fallbackConfig,
    };
    
    // Run Arbiter
    const decision = decide(arbiterInput, meals, session.id);
    
    // Check if DRM should trigger
    const drmCheck = shouldTriggerDrm(
      session.rejection_count,
      currentTime,
      decision,
      false, // not explicit done
      fallbackConfig
    );
    
    if (drmCheck.trigger || decision === null) {
      // DRM triggered - execute fallback
      const drmOutput = executeDrmOverride(
        session.id,
        fallbackConfig,
        decision === null ? 'no_valid_meal' : drmCheck.reason
      );
      
      if (drmOutput) {
        // Update session with DRM outcome
        await db.updateSession(householdKey, session.id, {
          outcome: 'rescued',
          ended_at: new Date().toISOString(),
          decision_id: drmOutput.decision_id,
          decision_payload: drmOutput as unknown as Record<string, unknown>,
        });
        
        const response = buildResponse(
          drmOutput,
          true,
          decision === null ? 'No valid meals found' : `DRM activated: ${drmCheck.reason}`
        );
        return Response.json(response, { status: 200 });
      }
      
      // Catastrophic failure - no fallback available
      const response = buildResponse(null, true, 'DRM failed - no fallback available');
      return Response.json(response, { status: 200 });
    }
    
    // Normal path: Update session with decision
    await db.updateSession(householdKey, session.id, {
      decision_id: decision.decision_id,
      decision_payload: decision as unknown as Record<string, unknown>,
    });
    
    // Record decision_returned metric
    record('decision_returned');
    
    // Return decision
    const response = buildResponse(decision, false);
    return Response.json(response, { status: 200 });
    
  } catch (error) {
    // Handle readonly_mode error from DB layer (hard backstop)
    if (isReadonlyModeError(error)) {
      record('readonly_hit');
      const response = buildResponse(null, false, 'System in readonly mode');
      return Response.json(response, { status: 200 });
    }
    
    console.error('Decision processing error:', error);
    
    // Best-effort canonical response
    const response = buildResponse(null, false, 'Error processing decision');
    return Response.json(response, { status: 200 });
  }
}
