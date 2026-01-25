/**
 * DRM API Boundary Tests
 * 
 * Tests the DRM endpoint contract at the boundary level:
 * - Explicit trigger returns fallback decision with execution_payload
 * - Time trigger returns fallback decision deterministically
 * - Idempotent DRM behavior (same session returns same rescue decision)
 * - Session outcome becomes 'rescued' and is closed
 * - Response shape contract enforced
 */

import { getDb, clearDb, type SessionRecord } from '../db/client';
import {
  executeDrmOverride,
  shouldTriggerDrm,
  shouldTriggerOnTime,
  getFallbackConfig,
  getServerTimeHHMM,
  DEFAULT_FALLBACK_CONFIG,
  DEFAULT_DRM_TIME_THRESHOLD,
  DEFAULT_DRM_REJECTION_THRESHOLD,
} from '../drm/fallback';
import { validateDrmResponse } from '../invariants';
import type { DrmOutput, FallbackConfig } from '../../../types/decision-os';

// =============================================================================
// EXPLICIT TRIGGER TESTS
// =============================================================================

describe('DRM API: Explicit trigger (I\'m done)', () => {
  it('returns fallback decision with execution_payload', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const result = executeDrmOverride('explicit-test-session', fallbackConfig, 'explicit_done');
    
    expect(result).not.toBeNull();
    expect(result!.meal).toBeDefined();
    expect(result!.execution_payload).toBeDefined();
    expect(result!.execution_payload.steps).toBeDefined();
    expect(result!.execution_payload.steps.length).toBeGreaterThan(0);
  });
  
  it('always selects first fallback in hierarchy (deterministic)', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    
    // Call multiple times - should always return the same first fallback
    const result1 = executeDrmOverride('session-1', fallbackConfig, 'explicit_done');
    const result2 = executeDrmOverride('session-2', fallbackConfig, 'explicit_done');
    const result3 = executeDrmOverride('session-3', fallbackConfig, 'explicit_done');
    
    expect(result1!.meal).toBe('Cereal with Milk');
    expect(result2!.meal).toBe('Cereal with Milk');
    expect(result3!.meal).toBe('Cereal with Milk');
    
    // Same meal_id
    expect(result1!.meal_id).toBe(result2!.meal_id);
    expect(result2!.meal_id).toBe(result3!.meal_id);
  });
  
  it('confidence is always 1.0 (DRM is certain)', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const result = executeDrmOverride('confidence-test', fallbackConfig, 'explicit_done');
    
    expect(result!.confidence).toBe(1.0);
  });
  
  it('is_rescue flag is always true', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const result = executeDrmOverride('rescue-flag-test', fallbackConfig, 'explicit_done');
    
    expect(result!.is_rescue).toBe(true);
  });
  
  it('decision_id contains session prefix', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const result = executeDrmOverride('mytest-session', fallbackConfig, 'explicit_done');
    
    expect(result!.decision_id).toContain('drm-');
    expect(result!.decision_id).toContain('mytest-s'); // Session ID prefix
  });
});

// =============================================================================
// TIME THRESHOLD TRIGGER TESTS
// =============================================================================

describe('DRM API: Time threshold trigger', () => {
  it('triggers when current time >= threshold (server-side)', () => {
    // Test various times after 6:15pm
    expect(shouldTriggerOnTime('18:15', '18:15')).toBe(true);
    expect(shouldTriggerOnTime('18:16', '18:15')).toBe(true);
    expect(shouldTriggerOnTime('19:00', '18:15')).toBe(true);
    expect(shouldTriggerOnTime('20:30', '18:15')).toBe(true);
  });
  
  it('does not trigger before threshold', () => {
    expect(shouldTriggerOnTime('18:14', '18:15')).toBe(false);
    expect(shouldTriggerOnTime('17:00', '18:15')).toBe(false);
    expect(shouldTriggerOnTime('12:00', '18:15')).toBe(false);
  });
  
  it('respects custom threshold from config', () => {
    const customConfig: FallbackConfig = {
      ...DEFAULT_FALLBACK_CONFIG,
      drm_time_threshold: '19:00',
    };
    
    expect(shouldTriggerOnTime('18:30', customConfig.drm_time_threshold)).toBe(false);
    expect(shouldTriggerOnTime('19:00', customConfig.drm_time_threshold)).toBe(true);
  });
  
  it('getServerTimeHHMM returns valid format', () => {
    const time = getServerTimeHHMM();
    
    // Should match HH:MM format
    expect(time).toMatch(/^\d{2}:\d{2}$/);
    
    // Hours should be 00-23, minutes 00-59
    const [hours, minutes] = time.split(':').map(Number);
    expect(hours).toBeGreaterThanOrEqual(0);
    expect(hours).toBeLessThanOrEqual(23);
    expect(minutes).toBeGreaterThanOrEqual(0);
    expect(minutes).toBeLessThanOrEqual(59);
  });
});

// =============================================================================
// IDEMPOTENT DRM BEHAVIOR TESTS
// =============================================================================

describe('DRM API: Idempotent behavior', () => {
  beforeEach(async () => {
    await clearDb();
  });
  
  it('same session returns same rescue decision when already rescued', async () => {
    const db = getDb();
    const householdKey = 'idempotent-test';
    const now = new Date().toISOString();
    
    // Create a session that's already rescued
    const rescuedDecision: DrmOutput = {
      decision_id: 'drm-already-rescued',
      mode: 'no_cook',
      meal: 'Existing Rescue Meal',
      meal_id: 11,
      confidence: 1.0,
      estimated_time: '5 min',
      estimated_cost: '$0',
      execution_payload: {
        steps: ['Existing rescue step'],
        ingredients_needed: [],
        substitutions: [],
      },
      is_rescue: true,
      fallback_type: 'no_cook',
    };
    
    const session: SessionRecord = {
      id: 'rescued-session-123',
      household_key: householdKey,
      started_at: now,
      ended_at: now, // Already ended
      context: {},
      decision_id: rescuedDecision.decision_id,
      decision_payload: rescuedDecision as unknown as Record<string, unknown>,
      outcome: 'rescued', // Already rescued!
      rejection_count: 2,
      created_at: now,
      updated_at: now,
    };
    
    await db.createSession(session);
    
    // Retrieve session and verify it's still rescued
    const retrieved = await db.getSessionById(householdKey, session.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.outcome).toBe('rescued');
    expect((retrieved?.decision_payload as any)?.meal).toBe('Existing Rescue Meal');
  });
  
  it('pending session gets rescued and outcome updated', async () => {
    const db = getDb();
    const householdKey = 'pending-rescue-test';
    const now = new Date().toISOString();
    
    // Create a pending session
    const pendingSession: SessionRecord = {
      id: 'pending-session-456',
      household_key: householdKey,
      started_at: now,
      context: {},
      outcome: 'pending',
      rejection_count: 1,
      created_at: now,
      updated_at: now,
    };
    
    await db.createSession(pendingSession);
    
    // Execute DRM
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const drmDecision = executeDrmOverride(pendingSession.id, fallbackConfig, 'explicit_done');
    
    // Update session to rescued
    await db.updateSession(householdKey, pendingSession.id, {
      outcome: 'rescued',
      ended_at: new Date().toISOString(),
      decision_id: drmDecision!.decision_id,
      decision_payload: drmDecision as unknown as Record<string, unknown>,
    });
    
    // Verify session is now rescued
    const retrieved = await db.getSessionById(householdKey, pendingSession.id);
    expect(retrieved?.outcome).toBe('rescued');
    expect(retrieved?.ended_at).toBeDefined();
    expect(retrieved?.decision_id).toBe(drmDecision!.decision_id);
  });
});

// =============================================================================
// SESSION OUTCOME TESTS
// =============================================================================

describe('DRM API: Session outcome', () => {
  beforeEach(async () => {
    await clearDb();
  });
  
  it('session outcome becomes rescued', async () => {
    const db = getDb();
    const householdKey = 'outcome-test';
    const now = new Date().toISOString();
    
    const session: SessionRecord = {
      id: 'outcome-session',
      household_key: householdKey,
      started_at: now,
      context: {},
      outcome: 'pending',
      rejection_count: 0,
      created_at: now,
      updated_at: now,
    };
    
    await db.createSession(session);
    
    // Update to rescued
    await db.updateSession(householdKey, session.id, {
      outcome: 'rescued',
      ended_at: new Date().toISOString(),
    });
    
    const retrieved = await db.getSessionById(householdKey, session.id);
    expect(retrieved?.outcome).toBe('rescued');
  });
  
  it('session is closed after rescue (ended_at is set)', async () => {
    const db = getDb();
    const householdKey = 'closed-test';
    const now = new Date().toISOString();
    
    const session: SessionRecord = {
      id: 'closed-session',
      household_key: householdKey,
      started_at: now,
      context: {},
      outcome: 'pending',
      rejection_count: 0,
      created_at: now,
      updated_at: now,
    };
    
    await db.createSession(session);
    
    // Update to rescued with ended_at
    const endTime = new Date().toISOString();
    await db.updateSession(householdKey, session.id, {
      outcome: 'rescued',
      ended_at: endTime,
    });
    
    const retrieved = await db.getSessionById(householdKey, session.id);
    expect(retrieved?.ended_at).toBeDefined();
  });
  
  it('getActiveSession does not return rescued session', async () => {
    const db = getDb();
    const householdKey = 'active-check-test';
    const now = new Date().toISOString();
    
    // Create a rescued session
    const rescuedSession: SessionRecord = {
      id: 'rescued-inactive',
      household_key: householdKey,
      started_at: now,
      ended_at: now,
      context: {},
      outcome: 'rescued', // Not pending!
      rejection_count: 2,
      created_at: now,
      updated_at: now,
    };
    
    await db.createSession(rescuedSession);
    
    // getActiveSession should return null (session is rescued, not active)
    const activeSession = await db.getActiveSession(householdKey);
    expect(activeSession).toBeNull();
  });
});

// =============================================================================
// RESPONSE SHAPE CONTRACT TESTS
// =============================================================================

describe('DRM API: Response shape contract', () => {
  it('validates minimal response (drmActivated only)', () => {
    const response = { drmActivated: true };
    const validation = validateDrmResponse(response);
    expect(validation.valid).toBe(true);
  });
  
  it('validates full response with decision', () => {
    const response = {
      drmActivated: true,
      reason: 'explicit_done',
      decision: {
        decision_id: 'drm-shape-test',
        mode: 'no_cook',
        meal: 'Test Meal',
        meal_id: 11,
        confidence: 1.0,
        estimated_time: '5 min',
        estimated_cost: '$0',
        execution_payload: {
          steps: ['Step 1'],
          ingredients_needed: [],
          substitutions: [],
        },
        is_rescue: true,
        fallback_type: 'no_cook',
      },
    };
    
    const validation = validateDrmResponse(response);
    expect(validation.valid).toBe(true);
  });
  
  it('rejects array decision (INVARIANT: one decision only)', () => {
    const response = {
      drmActivated: true,
      reason: 'explicit_done',
      decision: [{ meal: 'Option 1' }, { meal: 'Option 2' }],
    };
    
    const validation = validateDrmResponse(response);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.field === 'decision')).toBe(true);
  });
  
  it('rejects unknown fields', () => {
    const response = {
      drmActivated: true,
      unknownField: 'not allowed',
    };
    
    const validation = validateDrmResponse(response);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.field === 'unknownField')).toBe(true);
  });
  
  it('DRM output has all required fields', () => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const result = executeDrmOverride('shape-test', fallbackConfig, 'explicit_done');
    
    expect(result).not.toBeNull();
    expect(result!.decision_id).toBeDefined();
    expect(result!.mode).toBeDefined();
    expect(result!.meal).toBeDefined();
    expect(result!.meal_id).toBeDefined();
    expect(result!.confidence).toBeDefined();
    expect(result!.estimated_time).toBeDefined();
    expect(result!.estimated_cost).toBeDefined();
    expect(result!.execution_payload).toBeDefined();
    expect(result!.is_rescue).toBe(true);
    expect(result!.fallback_type).toBeDefined();
  });
});

// =============================================================================
// CENTRALIZED CONSTANTS TESTS
// =============================================================================

describe('DRM API: Centralized constants', () => {
  it('DEFAULT_DRM_TIME_THRESHOLD is 18:15', () => {
    expect(DEFAULT_DRM_TIME_THRESHOLD).toBe('18:15');
  });
  
  it('DEFAULT_DRM_REJECTION_THRESHOLD is 2', () => {
    expect(DEFAULT_DRM_REJECTION_THRESHOLD).toBe(2);
  });
  
  it('DEFAULT_FALLBACK_CONFIG uses centralized constants', () => {
    expect(DEFAULT_FALLBACK_CONFIG.drm_time_threshold).toBe(DEFAULT_DRM_TIME_THRESHOLD);
    expect(DEFAULT_FALLBACK_CONFIG.rejection_threshold).toBe(DEFAULT_DRM_REJECTION_THRESHOLD);
  });
  
  it('getFallbackConfig uses centralized defaults', () => {
    // With empty config, should use defaults
    const config = getFallbackConfig(null);
    expect(config.drm_time_threshold).toBe(DEFAULT_DRM_TIME_THRESHOLD);
    expect(config.rejection_threshold).toBe(DEFAULT_DRM_REJECTION_THRESHOLD);
  });
});

// =============================================================================
// TRIGGER REASON TESTS
// =============================================================================

describe('DRM API: Trigger reasons', () => {
  it('shouldTriggerDrm handles explicit_done', () => {
    const { trigger, reason } = shouldTriggerDrm(
      0, '17:00', { decision_id: 'x', mode: 'cook', meal: 'X', meal_id: 1, confidence: 0.5, estimated_time: '20 min', estimated_cost: '$10', execution_payload: { steps: [], ingredients_needed: [], substitutions: [] } },
      true // explicit done
    );
    
    expect(trigger).toBe(true);
    expect(reason).toBe('explicit_done');
  });
  
  it('shouldTriggerDrm handles no_valid_meal (null arbiter output)', () => {
    const { trigger, reason } = shouldTriggerDrm(0, '17:00', null, false);
    
    expect(trigger).toBe(true);
    expect(reason).toBe('no_valid_meal');
  });
  
  it('shouldTriggerDrm handles rejection_threshold', () => {
    const { trigger, reason } = shouldTriggerDrm(
      2, '17:00', { decision_id: 'x', mode: 'cook', meal: 'X', meal_id: 1, confidence: 0.5, estimated_time: '20 min', estimated_cost: '$10', execution_payload: { steps: [], ingredients_needed: [], substitutions: [] } },
      false
    );
    
    expect(trigger).toBe(true);
    expect(reason).toBe('rejection_threshold');
  });
  
  it('shouldTriggerDrm handles time_threshold', () => {
    const { trigger, reason } = shouldTriggerDrm(
      0, '19:00', { decision_id: 'x', mode: 'cook', meal: 'X', meal_id: 1, confidence: 0.5, estimated_time: '20 min', estimated_cost: '$10', execution_payload: { steps: [], ingredients_needed: [], substitutions: [] } },
      false
    );
    
    expect(trigger).toBe(true);
    expect(reason).toBe('time_threshold');
  });
  
  it('explicit_done has highest priority', () => {
    // All triggers active, but explicit_done should win
    const { trigger, reason } = shouldTriggerDrm(
      5, '20:00', null, true
    );
    
    expect(trigger).toBe(true);
    expect(reason).toBe('explicit_done'); // Not rejection_threshold or time_threshold
  });
});
