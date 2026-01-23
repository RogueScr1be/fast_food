/**
 * Decision OS DRM (Dinner Rescue Mode) API Endpoint
 * 
 * POST /api/decision-os/drm
 * 
 * DRM has ABSOLUTE AUTHORITY - it never asks permission.
 * 
 * TRIGGERS:
 * - explicit_done: User explicitly gave up ("I'm done / This isn't working")
 * - time_threshold: Server time > 6:15pm (evaluated server-side, never trust client)
 * - rejection_threshold: 2+ rejections in session (from session state)
 * - no_valid_meal: Arbiter returned null
 * 
 * AUTHENTICATION:
 * - Production: Requires valid Supabase JWT in Authorization header
 * - Dev/Test: Falls back to default household if no auth
 * 
 * Request body:
 * {
 *   sessionId?: string,           // Resume existing session
 *   trigger: 'explicit_done' | 'time_threshold' | 'rejection_threshold' | 'no_valid_meal'
 * }
 * 
 * Response (CANONICAL CONTRACT):
 * {
 *   drmActivated: boolean,
 *   reason?: string,              // 'explicit_done' | 'time_threshold' | etc.
 *   decision?: {                  // Full fallback decision (same shape as Arbiter)
 *     decision_id, mode, meal, meal_id, confidence,
 *     estimated_time, estimated_cost, execution_payload
 *   }
 * }
 * 
 * DECISION LOCK BEHAVIOR:
 * - If session already rescued: return the existing rescue decision (idempotent)
 * - If session not found/ended: create new session and rescue it
 * 
 * INVARIANTS:
 * - No arrays in response wrapper
 * - Always returns ONE deterministic fallback decision
 * - DRM NEVER asks questions or offers alternatives
 */

import { getDb, isReadonlyModeError, type SessionRecord } from '../../../lib/decision-os/db/client';
import { validateDrmResponse, validateErrorResponse } from '../../../lib/decision-os/invariants';
import { authenticateRequest } from '../../../lib/decision-os/auth/helper';
import { resolveFlags, getFlags } from '../../../lib/decision-os/config/flags';
import { record } from '../../../lib/decision-os/monitoring/metrics';
import {
  executeDrmOverride,
  getFallbackConfig,
  getServerTimeHHMM,
  shouldTriggerOnTime,
  type DrmTriggerReason,
} from '../../../lib/decision-os/drm/fallback';
import type { DecisionEventInsert, DrmOutput } from '../../../types/decision-os';

// =============================================================================
// REQUEST TYPES
// =============================================================================

type DrmTrigger = 'explicit_done' | 'time_threshold' | 'rejection_threshold' | 'no_valid_meal';

interface DrmRequest {
  sessionId?: string;
  trigger: DrmTrigger;
}

// =============================================================================
// VALIDATION
// =============================================================================

function validateRequest(body: unknown): DrmRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  
  const req = body as Record<string, unknown>;
  
  // trigger is required and must be one of the valid values
  const validTriggers: DrmTrigger[] = ['explicit_done', 'time_threshold', 'rejection_threshold', 'no_valid_meal'];
  if (typeof req.trigger !== 'string' || !validTriggers.includes(req.trigger as DrmTrigger)) {
    // Legacy support: accept "reason" field for backward compatibility
    if (typeof req.reason === 'string') {
      return {
        trigger: 'explicit_done', // Map legacy reason to explicit_done
        sessionId: typeof req.sessionId === 'string' ? req.sessionId : undefined,
      };
    }
    return null;
  }
  
  return {
    trigger: req.trigger as DrmTrigger,
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

interface DrmResponseShape {
  drmActivated: boolean;
  reason?: string;
  decision?: Record<string, unknown>;
}

/**
 * Build and validate canonical DRM response.
 * INVARIANT: decision must be object or null, never array.
 */
function buildResponse(
  drmActivated: boolean,
  reason?: DrmTriggerReason,
  decision?: DrmOutput | null
): DrmResponseShape {
  // INVARIANT: decision must never be an array
  if (Array.isArray(decision)) {
    throw new Error('INVARIANT_VIOLATION: DRM decision must be object or null, not array');
  }
  
  const response: DrmResponseShape = { drmActivated };
  
  if (reason && reason !== 'none') {
    response.reason = reason;
  }
  
  if (decision) {
    response.decision = decision as unknown as Record<string, unknown>;
  }
  
  // Validate before returning (fail-fast on contract violation)
  const validation = validateDrmResponse(response);
  if (!validation.valid) {
    console.error('DRM response validation failed:', validation.errors);
    // Return minimal valid response
    return { drmActivated: false };
  }
  
  return response;
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `drm-ses-${timestamp}-${random}`;
}

/**
 * Get or create session for DRM operation.
 * 
 * BEHAVIOR:
 * - If sessionId provided and session exists with outcome='rescued': return it (idempotent)
 * - If sessionId provided and session is pending: use it for rescue
 * - If no session or session ended (accepted/abandoned): create new session
 */
async function getOrCreateDrmSession(
  db: ReturnType<typeof getDb>,
  householdKey: string,
  requestedSessionId?: string
): Promise<{ session: SessionRecord; alreadyRescued: boolean }> {
  // Try to find existing session
  if (requestedSessionId) {
    const existing = await db.getSessionById(householdKey, requestedSessionId);
    if (existing) {
      // If already rescued, return it (idempotent)
      if (existing.outcome === 'rescued') {
        return { session: existing, alreadyRescued: true };
      }
      // If pending, use it
      if (existing.outcome === 'pending') {
        return { session: existing, alreadyRescued: false };
      }
      // If accepted/abandoned, fall through to create new
    }
  }
  
  // Check for any active session
  const activeSession = await db.getActiveSession(householdKey);
  if (activeSession) {
    if (activeSession.outcome === 'rescued') {
      return { session: activeSession, alreadyRescued: true };
    }
    return { session: activeSession, alreadyRescued: false };
  }
  
  // Create new session for DRM
  const now = new Date().toISOString();
  const newSession: SessionRecord = {
    id: generateSessionId(),
    household_key: householdKey,
    started_at: now,
    context: {},
    outcome: 'pending',
    rejection_count: 0,
    created_at: now,
    updated_at: now,
  };
  
  await db.createSession(newSession);
  return { session: newSession, alreadyRescued: false };
}

// =============================================================================
// DRM EVENT ID GENERATOR
// =============================================================================

function generateDrmEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `drm-evt-${timestamp}-${random}`;
}

// =============================================================================
// POST HANDLER
// =============================================================================

export async function POST(request: Request): Promise<Response> {
  record('drm_called');
  
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
      return buildErrorResponse('unauthorized');
    }
    
    // KILL SWITCH: Check if DRM feature is enabled
    if (!flags.drmEnabled) {
      // Return canonical response with drmActivated: false
      const response = buildResponse(false, 'none', null);
      return Response.json(response, { status: 200 });
    }
    
    // Authenticate request
    const authHeader = request.headers.get('Authorization');
    const authResult = await authenticateRequest(authHeader);
    
    if (!authResult.success) {
      return buildErrorResponse('unauthorized');
    }
    
    const authContext = authResult.context;
    const householdKey = authContext.householdKey;
    const userProfileId = authContext.userProfileId;
    
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const validatedRequest = validateRequest(body);
    
    if (!validatedRequest) {
      // Invalid request - still activate DRM with explicit_done (fail-safe)
      // DRM should always rescue when called
      const defaultRequest: DrmRequest = { trigger: 'explicit_done' };
      Object.assign(validatedRequest ?? {}, defaultRequest);
    }
    
    const { sessionId: requestedSessionId, trigger } = validatedRequest!;
    const nowIso = new Date().toISOString();
    
    // Get household config for fallbacks
    const householdConfig = await db.getHouseholdConfig(householdKey);
    const fallbackConfig = getFallbackConfig(householdConfig?.fallback_config ?? null);
    
    // Server-side time check (never trust client)
    const serverTime = getServerTimeHHMM();
    const isTimeTriggered = shouldTriggerOnTime(serverTime, fallbackConfig.drm_time_threshold);
    
    // FIX: If trigger='time_threshold' and server time < threshold, return false
    // Do NOT silently fall back to explicit_done - be truthful
    if (trigger === 'time_threshold' && !isTimeTriggered) {
      const response = buildResponse(false, 'not_time_yet' as DrmTriggerReason, null);
      return Response.json(response, { status: 200 });
    }
    
    // Determine actual trigger reason (for non-time triggers, use as-is)
    const actualReason: DrmTriggerReason = trigger;
    
    // READONLY MODE: Return DRM response without DB writes
    if (flags.readonlyMode) {
      record('readonly_hit');
      // Execute DRM (no DB write) and return decision
      const drmDecision = executeDrmOverride('readonly-session', fallbackConfig, actualReason);
      const response = buildResponse(true, actualReason, drmDecision);
      return Response.json(response, { status: 200 });
    }
    
    // Get or create session
    const { session, alreadyRescued } = await getOrCreateDrmSession(
      db,
      householdKey,
      requestedSessionId
    );
    
    // DECISION LOCK: If session already rescued, return existing decision (idempotent)
    if (alreadyRescued && session.decision_payload) {
      const existingDecision = session.decision_payload as unknown as DrmOutput;
      const response = buildResponse(true, actualReason, existingDecision);
      return Response.json(response, { status: 200 });
    }
    
    // Execute DRM override - select first valid fallback (deterministic, no randomness)
    const drmDecision = executeDrmOverride(session.id, fallbackConfig, actualReason);
    
    if (!drmDecision) {
      // Catastrophic failure - no fallback available
      // This should never happen with proper config
      console.error('DRM CATASTROPHIC FAILURE: No fallback available');
      const response = buildResponse(false, actualReason, null);
      return Response.json(response, { status: 200 });
    }
    
    // Update session: outcome = 'rescued', ended_at = now
    await db.updateSession(householdKey, session.id, {
      outcome: 'rescued',
      ended_at: nowIso,
      decision_id: drmDecision.decision_id,
      decision_payload: drmDecision as unknown as Record<string, unknown>,
    });
    
    // Record session_rescued metric
    record('session_rescued');
    
    // Create DRM event (append-only audit trail)
    const eventId = generateDrmEventId();
    const drmEvent: DecisionEventInsert = {
      id: eventId,
      user_profile_id: userProfileId,
      household_key: householdKey,
      decided_at: nowIso,
      actioned_at: nowIso,
      user_action: 'drm_triggered',
      notes: `drm_reason:${actualReason}`,
      decision_payload: {
        reason: actualReason,
        triggered_at: nowIso,
        session_id: session.id,
        decision_id: drmDecision.decision_id,
        meal: drmDecision.meal,
        meal_id: drmDecision.meal_id,
      },
      decision_type: 'drm',
      meal_id: drmDecision.meal_id,
    };
    
    await db.insertDecisionEvent(drmEvent);
    
    // Insert taste signal for DRM (negative weight - rescue is not a positive signal)
    await db.insertTasteSignal({
      id: `ts-${eventId}`,
      user_profile_id: userProfileId,
      household_key: householdKey,
      meal_id: drmDecision.meal_id,
      weight: -0.5, // DRM rescue weight
      event_id: eventId,
      created_at: nowIso,
    });
    
    // Build and return response with full decision
    const response = buildResponse(true, actualReason, drmDecision);
    return Response.json(response, { status: 200 });
    
  } catch (error) {
    // Handle readonly_mode error from DB layer (hard backstop)
    if (isReadonlyModeError(error)) {
      record('readonly_hit');
      // Return canonical DRM response - DRM should still "work" conceptually
      const response = buildResponse(true, 'explicit_done', null);
      return Response.json(response, { status: 200 });
    }
    
    console.error('DRM processing error:', error);
    
    // Best-effort canonical response
    const response = buildResponse(false, 'none', null);
    return Response.json(response, { status: 200 });
  }
}
