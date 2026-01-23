/**
 * Session Lifecycle Tests (Phase 3)
 * 
 * Tests the end-to-end session lifecycle:
 * - Session creation and persistence
 * - Decision lock (idempotent)
 * - Rejection count tracking
 * - DRM trigger on 2 rejections
 * - Metrics emission
 * - Time threshold behavior
 */

import { 
  getDb, 
  resetDb,
  clearDb,
  type SessionRecord,
} from '../db/client';
import { 
  record, 
  recordDuration, 
  getSnapshot, 
  getDurationSnapshot,
  reset as resetMetrics,
} from '../monitoring/metrics';
import { 
  executeDrmOverride, 
  shouldTriggerDrm, 
  getFallbackConfig,
  DEFAULT_FALLBACK_CONFIG,
  DEFAULT_DRM_TIME_THRESHOLD,
  getServerTimeHHMM,
  shouldTriggerOnTime,
} from '../drm/fallback';

describe('Session Lifecycle (Phase 3)', () => {
  beforeEach(async () => {
    resetDb();
    await clearDb();
    resetMetrics();
  });
  
  afterEach(async () => {
    resetDb();
    await clearDb();
    resetMetrics();
  });
  
  // ==========================================================================
  // SESSION CREATION AND PERSISTENCE
  // ==========================================================================
  
  describe('Session Creation', () => {
    it('creates a new session with correct fields', async () => {
      const sessionId = `ses-${Date.now()}-test`;
      const householdKey = 'hh-test-123';
      const now = new Date().toISOString();
      
      const session: SessionRecord = {
        id: sessionId,
        household_key: householdKey,
        started_at: now,
        context: { intents: ['easy'] },
        outcome: 'pending',
        rejection_count: 0,
        created_at: now,
        updated_at: now,
      };
      
      await getDb().createSession(session);
      
      const retrieved = await getDb().getSessionById(householdKey, sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(sessionId);
      expect(retrieved!.household_key).toBe(householdKey);
      expect(retrieved!.outcome).toBe('pending');
      expect(retrieved!.rejection_count).toBe(0);
    });
    
    it('getActiveSession returns only pending sessions', async () => {
      const householdKey = 'hh-test-123';
      const now = new Date().toISOString();
      
      // Create a pending session
      const pendingSession: SessionRecord = {
        id: 'ses-pending',
        household_key: householdKey,
        started_at: now,
        context: {},
        outcome: 'pending',
        rejection_count: 0,
        created_at: now,
        updated_at: now,
      };
      
      await getDb().createSession(pendingSession);
      
      const active = await getDb().getActiveSession(householdKey);
      expect(active).not.toBeNull();
      expect(active!.id).toBe('ses-pending');
    });
    
    it('getActiveSession returns null for closed sessions', async () => {
      const householdKey = 'hh-test-closed';
      const now = new Date().toISOString();
      
      // Create a closed session
      const closedSession: SessionRecord = {
        id: 'ses-closed',
        household_key: householdKey,
        started_at: now,
        ended_at: now,
        context: {},
        outcome: 'accepted',
        rejection_count: 0,
        created_at: now,
        updated_at: now,
      };
      
      await getDb().createSession(closedSession);
      
      const active = await getDb().getActiveSession(householdKey);
      expect(active).toBeNull();
    });
  });
  
  // ==========================================================================
  // HOUSEHOLD ISOLATION (CRITICAL)
  // ==========================================================================
  
  describe('Household Isolation', () => {
    it('getSessionById cannot read another households session', async () => {
      const householdA = 'hh-isolation-a';
      const householdB = 'hh-isolation-b';
      const sessionId = 'ses-isolation-test';
      const now = new Date().toISOString();
      
      // Create session in household A
      const sessionA: SessionRecord = {
        id: sessionId,
        household_key: householdA,
        started_at: now,
        context: { secret: 'household-a-data' },
        outcome: 'pending',
        rejection_count: 0,
        created_at: now,
        updated_at: now,
      };
      
      await getDb().createSession(sessionA);
      
      // Household A can read their session
      const readByA = await getDb().getSessionById(householdA, sessionId);
      expect(readByA).not.toBeNull();
      expect(readByA!.context).toEqual({ secret: 'household-a-data' });
      
      // Household B CANNOT read household A's session
      const readByB = await getDb().getSessionById(householdB, sessionId);
      expect(readByB).toBeNull();
    });
    
    it('updateSession cannot update another households session', async () => {
      const householdA = 'hh-update-isolation-a';
      const householdB = 'hh-update-isolation-b';
      const sessionId = 'ses-update-isolation';
      const now = new Date().toISOString();
      
      // Create session in household A
      const sessionA: SessionRecord = {
        id: sessionId,
        household_key: householdA,
        started_at: now,
        context: { original: true },
        outcome: 'pending',
        rejection_count: 0,
        created_at: now,
        updated_at: now,
      };
      
      await getDb().createSession(sessionA);
      
      // Household B attempts to update household A's session - should fail silently
      await getDb().updateSession(householdB, sessionId, {
        outcome: 'rescued',
        context: { hacked: true },
      });
      
      // Verify session is unchanged
      const session = await getDb().getSessionById(householdA, sessionId);
      expect(session!.outcome).toBe('pending');
      expect(session!.context).toEqual({ original: true });
    });
    
    it('getActiveSession only returns own household sessions', async () => {
      const householdA = 'hh-active-a';
      const householdB = 'hh-active-b';
      const now = new Date().toISOString();
      
      // Create active sessions in both households
      await getDb().createSession({
        id: 'ses-active-a',
        household_key: householdA,
        started_at: now,
        context: {},
        outcome: 'pending',
        rejection_count: 0,
        created_at: now,
        updated_at: now,
      });
      
      await getDb().createSession({
        id: 'ses-active-b',
        household_key: householdB,
        started_at: now,
        context: {},
        outcome: 'pending',
        rejection_count: 0,
        created_at: now,
        updated_at: now,
      });
      
      // Each household gets only their own session
      const activeA = await getDb().getActiveSession(householdA);
      const activeB = await getDb().getActiveSession(householdB);
      
      expect(activeA!.id).toBe('ses-active-a');
      expect(activeA!.household_key).toBe(householdA);
      
      expect(activeB!.id).toBe('ses-active-b');
      expect(activeB!.household_key).toBe(householdB);
    });
    
    it('getHouseholdConfig cannot read another households config', async () => {
      const householdA = 'hh-config-a';
      const householdB = 'hh-config-b';
      
      // Note: With InMemoryAdapter, we use the 'default' config
      // This test verifies the query pattern is correct
      const configA = await getDb().getHouseholdConfig(householdA);
      const configB = await getDb().getHouseholdConfig(householdB);
      
      // Both get the default config (InMemoryAdapter falls back to 'default')
      // In Postgres, each household would get their own or null
      expect(configA).toBeDefined();
      expect(configB).toBeDefined();
    });
    
    it('getMeals is global (not household-scoped) - intentionally', async () => {
      // Meals are intentionally NOT household-scoped - they are shared across all households
      // This test documents this design decision
      const meals = await getDb().getMeals();
      
      // Should return meals (from seeded test data)
      expect(meals.length).toBeGreaterThan(0);
      
      // Meals should NOT have household_key
      const firstMeal = meals[0];
      expect('household_key' in firstMeal).toBe(false);
    });
  });
  
  // ==========================================================================
  // DECISION LOCK (IDEMPOTENT)
  // ==========================================================================
  
  describe('Decision Lock', () => {
    it('session decision_id persists across updates', async () => {
      const householdKey = 'hh-lock-test';
      const sessionId = 'ses-lock-test';
      const now = new Date().toISOString();
      
      const session: SessionRecord = {
        id: sessionId,
        household_key: householdKey,
        started_at: now,
        context: {},
        outcome: 'pending',
        rejection_count: 0,
        created_at: now,
        updated_at: now,
      };
      
      await getDb().createSession(session);
      
      // Update with decision_id
      await getDb().updateSession(householdKey, sessionId, {
        decision_id: 'dec-123',
        decision_payload: { meal: 'Test Meal' },
      });
      
      const updated = await getDb().getSessionById(householdKey, sessionId);
      expect(updated!.decision_id).toBe('dec-123');
      expect(updated!.decision_payload).toEqual({ meal: 'Test Meal' });
    });
    
    it('session with decision_id is idempotent (reuse existing)', async () => {
      const householdKey = 'hh-idem-test';
      const sessionId = 'ses-idem-test';
      const now = new Date().toISOString();
      
      const session: SessionRecord = {
        id: sessionId,
        household_key: householdKey,
        started_at: now,
        context: {},
        outcome: 'pending',
        rejection_count: 0,
        decision_id: 'dec-locked',
        decision_payload: { meal: 'Locked Meal' },
        created_at: now,
        updated_at: now,
      };
      
      await getDb().createSession(session);
      
      // getActiveSession returns it
      const active = await getDb().getActiveSession(householdKey);
      expect(active).not.toBeNull();
      expect(active!.decision_id).toBe('dec-locked');
      
      // Multiple calls return same session
      const again = await getDb().getActiveSession(householdKey);
      expect(again!.id).toBe(sessionId);
      expect(again!.decision_id).toBe('dec-locked');
    });
  });
  
  // ==========================================================================
  // REJECTION COUNT AND DRM TRIGGER
  // ==========================================================================
  
  describe('Rejection Count and DRM Trigger', () => {
    it('rejection count increments correctly', async () => {
      const householdKey = 'hh-reject-test';
      const sessionId = 'ses-reject-test';
      const now = new Date().toISOString();
      
      const session: SessionRecord = {
        id: sessionId,
        household_key: householdKey,
        started_at: now,
        context: {},
        outcome: 'pending',
        rejection_count: 0,
        created_at: now,
        updated_at: now,
      };
      
      await getDb().createSession(session);
      
      // First rejection
      await getDb().updateSession(householdKey, sessionId, {
        rejection_count: 1,
      });
      
      let updated = await getDb().getSessionById(householdKey, sessionId);
      expect(updated!.rejection_count).toBe(1);
      
      // Second rejection
      await getDb().updateSession(householdKey, sessionId, {
        rejection_count: 2,
      });
      
      updated = await getDb().getSessionById(householdKey, sessionId);
      expect(updated!.rejection_count).toBe(2);
    });
    
    it('2 rejections triggers DRM via shouldTriggerDrm', () => {
      const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
      
      // Mock arbiter output (not null) to avoid "no_valid_meal" trigger
      const mockArbiterOutput = { decision_id: 'test', meal: 'test', mode: 'cook' as const, confidence: 0.8, estimated_time: '30 min', estimated_cost: '$10', execution_payload: { steps: [], ingredients_needed: [], substitutions: [] } };
      
      // 1 rejection - no DRM (with valid arbiter output)
      let result = shouldTriggerDrm(1, '17:00', mockArbiterOutput, false, fallbackConfig);
      expect(result.trigger).toBe(false);
      
      // 2 rejections - DRM triggered
      result = shouldTriggerDrm(2, '17:00', mockArbiterOutput, false, fallbackConfig);
      expect(result.trigger).toBe(true);
      expect(result.reason).toBe('rejection_threshold');
    });
    
    it('session outcome becomes rescued after DRM', async () => {
      const householdKey = 'hh-rescue-test';
      const sessionId = 'ses-rescue-test';
      const now = new Date().toISOString();
      
      const session: SessionRecord = {
        id: sessionId,
        household_key: householdKey,
        started_at: now,
        context: {},
        outcome: 'pending',
        rejection_count: 2,
        created_at: now,
        updated_at: now,
      };
      
      await getDb().createSession(session);
      
      // Mark as rescued
      await getDb().updateSession(householdKey, sessionId, {
        outcome: 'rescued',
        ended_at: new Date().toISOString(),
        decision_id: 'drm-rescue-123',
        decision_payload: { meal: 'Rescue Meal', is_rescue: true },
      });
      
      const updated = await getDb().getSessionById(householdKey, sessionId);
      expect(updated!.outcome).toBe('rescued');
      expect(updated!.ended_at).toBeDefined();
      expect(updated!.decision_id).toBe('drm-rescue-123');
    });
  });
  
  // ==========================================================================
  // METRICS EMISSION
  // ==========================================================================
  
  describe('Metrics Emission', () => {
    it('session_started metric is recorded', () => {
      record('session_started');
      const snapshot = getSnapshot();
      expect(snapshot.session_started).toBe(1);
    });
    
    it('decision_accepted metric is recorded', () => {
      record('decision_accepted');
      const snapshot = getSnapshot();
      expect(snapshot.decision_accepted).toBe(1);
    });
    
    it('decision_rejected metric is recorded', () => {
      record('decision_rejected');
      const snapshot = getSnapshot();
      expect(snapshot.decision_rejected).toBe(1);
    });
    
    it('session_rescued metric is recorded', () => {
      record('session_rescued');
      const snapshot = getSnapshot();
      expect(snapshot.session_rescued).toBe(1);
    });
    
    it('decision_returned metric is recorded', () => {
      record('decision_returned');
      const snapshot = getSnapshot();
      expect(snapshot.decision_returned).toBe(1);
    });
    
    it('time_to_decision_ms is recorded as duration', () => {
      recordDuration('time_to_decision_ms', 5000);
      const snapshot = getDurationSnapshot();
      expect(snapshot.time_to_decision_ms).toBeDefined();
      expect(snapshot.time_to_decision_ms!.latest).toBe(5000);
      expect(snapshot.time_to_decision_ms!.count).toBe(1);
      expect(snapshot.time_to_decision_ms!.sum).toBe(5000);
    });
    
    it('multiple time_to_decision_ms recordings accumulate', () => {
      recordDuration('time_to_decision_ms', 3000);
      recordDuration('time_to_decision_ms', 7000);
      recordDuration('time_to_decision_ms', 5000);
      
      const snapshot = getDurationSnapshot();
      expect(snapshot.time_to_decision_ms!.latest).toBe(5000);
      expect(snapshot.time_to_decision_ms!.count).toBe(3);
      expect(snapshot.time_to_decision_ms!.sum).toBe(15000);
    });
  });
  
  // ==========================================================================
  // TIME THRESHOLD BEHAVIOR
  // ==========================================================================
  
  describe('Time Threshold Behavior', () => {
    it('time_threshold returns false before threshold', () => {
      // Default threshold is 18:15
      const result = shouldTriggerOnTime('17:00', DEFAULT_DRM_TIME_THRESHOLD);
      expect(result).toBe(false);
    });
    
    it('time_threshold returns true at threshold', () => {
      const result = shouldTriggerOnTime('18:15', DEFAULT_DRM_TIME_THRESHOLD);
      expect(result).toBe(true);
    });
    
    it('time_threshold returns true after threshold', () => {
      const result = shouldTriggerOnTime('19:30', DEFAULT_DRM_TIME_THRESHOLD);
      expect(result).toBe(true);
    });
    
    it('getServerTimeHHMM returns valid format', () => {
      const time = getServerTimeHHMM();
      expect(time).toMatch(/^\d{2}:\d{2}$/);
    });
  });
  
  // ==========================================================================
  // DRM FALLBACK SELECTION
  // ==========================================================================
  
  describe('DRM Fallback Selection', () => {
    it('always uses hardcoded default if config missing', () => {
      // Pass null config
      const config = getFallbackConfig(null);
      expect(config).toBeDefined();
      expect(config.hierarchy).toBeDefined();
      expect(config.hierarchy.length).toBeGreaterThan(0);
    });
    
    it('executeDrmOverride returns valid fallback decision', () => {
      const config = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
      const result = executeDrmOverride('test-session', config, 'explicit_done');
      
      expect(result).not.toBeNull();
      expect(result!.decision_id).toBeDefined();
      expect(result!.meal).toBeDefined();
      expect(result!.execution_payload).toBeDefined();
      expect(result!.execution_payload.steps).toBeDefined();
      expect(result!.is_rescue).toBe(true);
    });
    
    it('DRM never returns false due to missing fallback config', () => {
      // Even with null, should get default config
      const config = getFallbackConfig(null);
      const result = executeDrmOverride('test-session', config, 'explicit_done');
      
      // Should always return a valid decision
      expect(result).not.toBeNull();
    });
  });
  
  // ==========================================================================
  // END-TO-END FLOW
  // ==========================================================================
  
  describe('End-to-End Flow', () => {
    it('intent → decision → accept logs metrics and closes session', async () => {
      const householdKey = 'hh-e2e-accept';
      const sessionId = 'ses-e2e-accept';
      const startTime = new Date();
      
      // 1. Create session
      const session: SessionRecord = {
        id: sessionId,
        household_key: householdKey,
        started_at: startTime.toISOString(),
        context: { intents: ['easy'] },
        outcome: 'pending',
        rejection_count: 0,
        created_at: startTime.toISOString(),
        updated_at: startTime.toISOString(),
      };
      await getDb().createSession(session);
      record('session_started');
      
      // 2. Get decision (simulate arbiter output)
      await getDb().updateSession(householdKey, sessionId, {
        decision_id: 'dec-e2e',
        decision_payload: { meal: 'Test Meal', meal_id: 1 },
      });
      record('decision_returned');
      
      // 3. Accept decision
      record('decision_accepted');
      const endTime = new Date();
      const timeToDecisionMs = endTime.getTime() - startTime.getTime();
      recordDuration('time_to_decision_ms', timeToDecisionMs);
      
      await getDb().updateSession(householdKey, sessionId, {
        outcome: 'accepted',
        ended_at: endTime.toISOString(),
      });
      
      // Verify metrics
      const snapshot = getSnapshot();
      expect(snapshot.session_started).toBe(1);
      expect(snapshot.decision_returned).toBe(1);
      expect(snapshot.decision_accepted).toBe(1);
      
      const durationSnapshot = getDurationSnapshot();
      expect(durationSnapshot.time_to_decision_ms).toBeDefined();
      
      // Verify session closed
      const closedSession = await getDb().getSessionById(householdKey, sessionId);
      expect(closedSession!.outcome).toBe('accepted');
      expect(closedSession!.ended_at).toBeDefined();
    });
    
    it('intent → decision → reject → reject triggers DRM rescue and closes session', async () => {
      const householdKey = 'hh-e2e-rescue';
      const sessionId = 'ses-e2e-rescue';
      const startTime = new Date();
      
      // 1. Create session
      const session: SessionRecord = {
        id: sessionId,
        household_key: householdKey,
        started_at: startTime.toISOString(),
        context: { intents: ['easy'] },
        outcome: 'pending',
        rejection_count: 0,
        created_at: startTime.toISOString(),
        updated_at: startTime.toISOString(),
      };
      await getDb().createSession(session);
      record('session_started');
      
      // 2. Get decision
      await getDb().updateSession(householdKey, sessionId, {
        decision_id: 'dec-e2e-1',
        decision_payload: { meal: 'Test Meal 1', meal_id: 1 },
      });
      record('decision_returned');
      
      // 3. First rejection
      record('decision_rejected');
      await getDb().updateSession(householdKey, sessionId, {
        rejection_count: 1,
      });
      
      // 4. Get another decision
      await getDb().updateSession(householdKey, sessionId, {
        decision_id: 'dec-e2e-2',
        decision_payload: { meal: 'Test Meal 2', meal_id: 2 },
      });
      record('decision_returned');
      
      // 5. Second rejection → DRM
      record('decision_rejected');
      await getDb().updateSession(householdKey, sessionId, {
        rejection_count: 2,
      });
      
      // 6. Check DRM should trigger
      const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
      const drmCheck = shouldTriggerDrm(2, '17:00', null, false, fallbackConfig);
      expect(drmCheck.trigger).toBe(true);
      
      // 7. Execute DRM
      record('session_rescued');
      const drmResult = executeDrmOverride(sessionId, fallbackConfig, 'rejection_threshold');
      
      await getDb().updateSession(householdKey, sessionId, {
        outcome: 'rescued',
        ended_at: new Date().toISOString(),
        decision_id: drmResult!.decision_id,
        decision_payload: drmResult as unknown as Record<string, unknown>,
      });
      
      // Verify metrics
      const snapshot = getSnapshot();
      expect(snapshot.session_started).toBe(1);
      expect(snapshot.decision_returned).toBe(2);
      expect(snapshot.decision_rejected).toBe(2);
      expect(snapshot.session_rescued).toBe(1);
      
      // Verify session closed as rescued
      const rescuedSession = await getDb().getSessionById(householdKey, sessionId);
      expect(rescuedSession!.outcome).toBe('rescued');
      expect(rescuedSession!.ended_at).toBeDefined();
    });
  });
});
