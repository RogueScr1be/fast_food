/**
 * Autopilot Decision Handler Tests
 * 
 * Tests for:
 * - Autopilot idempotency (no duplicate inserts)
 * - Autopilot does not double-learn (consumption + taste)
 * - Undo throttles autopilot for 72h
 * - Taste meal scores not updated on undo
 */

import {
  processAutopilotDecision,
  processAutopilotFeedbackHooks,
  clearAutopilotStores,
  getDecisionEvents,
  getTasteSignals,
  getTasteMealScores,
  getConsumptionLog,
  seedDecisionEvents,
  insertDecisionEvent,
} from '../autopilot/decision-handler';
import {
  createFeedbackCopy,
  isAutopilotApprovalEvent,
  isUndoAutopilotEvent,
  NOTES,
} from '../feedback/handler';
import { RECENT_UNDO_WINDOW_HOURS } from '../autopilot/policy';
import type { DecisionEvent } from '../../../types/decision-os';

/**
 * Helper to create a pending decision event
 * Uses FIXED_MORNING_DATE to ensure consistent timestamps before 8pm (no stress multiplier)
 */
function createPendingEvent(overrides: Partial<DecisionEvent> = {}): DecisionEvent {
  return {
    id: `pending-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    user_profile_id: 1,
    household_key: 'test-household',
    decided_at: FIXED_MORNING_DATE.toISOString(),
    decision_payload: { meal: 'tacos' },
    context_hash: 'test-context-hash',
    meal_id: 42,
    decision_type: 'meal_decision',
    ...overrides,
  };
}

/**
 * Helper to create user history with high approval rate
 */
function createHighApprovalHistory(count: number = 5): DecisionEvent[] {
  const events: DecisionEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      id: `history-${i}`,
      user_profile_id: 1,
      household_key: 'test-household',
      decided_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
      actioned_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000 + 1000).toISOString(),
      user_action: 'approved',
      decision_payload: {},
      decision_type: 'meal_decision',
    });
  }
  return events;
}

// Use fixed time early in the day (10:00 local) to avoid stress multiplier (1.10x after 8pm)
// We use local time format to ensure this is always before 8pm in any timezone
const FIXED_MORNING_DATE = new Date('2025-01-15T10:00:00'); // 10am LOCAL time

describe('Autopilot Decision Handler', () => {
  let RealDate: DateConstructor;

  beforeEach(() => {
    clearAutopilotStores();
    // Save real Date constructor
    RealDate = global.Date as DateConstructor;
    // Mock Date constructor and Date.now() to use fixed time
    const MockDate = class extends RealDate {
      constructor(...args: Parameters<DateConstructor>) {
        if (args.length === 0) {
          super(FIXED_MORNING_DATE.getTime());
        } else {
          // @ts-expect-error - spread in constructor
          super(...args);
        }
      }
      static now() {
        return FIXED_MORNING_DATE.getTime();
      }
    } as DateConstructor;
    global.Date = MockDate;
  });

  afterEach(() => {
    // Restore real Date
    global.Date = RealDate;
    jest.restoreAllMocks();
  });

  describe('Autopilot eligibility', () => {
    it('applies autopilot when eligible (high approval rate)', () => {
      const pendingEvent = createPendingEvent();
      const userHistory = createHighApprovalHistory(5);
      
      const result = processAutopilotDecision(pendingEvent, userHistory);
      
      expect(result.autopilotApplied).toBe(true);
      expect(result.autopilotEligibility.eligible).toBe(true);
      expect(result.autopilotEligibility.reason).toBe('enabled');
      expect(result.feedbackCopyInserted).toBe(true);
    });

    it('does not apply autopilot when ineligible (insufficient decisions)', () => {
      const pendingEvent = createPendingEvent();
      const userHistory = createHighApprovalHistory(2); // Only 2 decisions
      
      const result = processAutopilotDecision(pendingEvent, userHistory);
      
      expect(result.autopilotApplied).toBe(false);
      expect(result.autopilotEligibility.eligible).toBe(false);
      expect(result.autopilotEligibility.reason).toBe('insufficient_decisions');
      expect(result.feedbackCopyInserted).toBe(false);
    });
  });

  describe('Autopilot idempotency', () => {
    it('does NOT create duplicate autopilot approvals on second call', () => {
      const pendingEvent = createPendingEvent();
      const userHistory = createHighApprovalHistory(5);
      
      // First call - should create autopilot approval
      const result1 = processAutopilotDecision(pendingEvent, userHistory);
      expect(result1.feedbackCopyInserted).toBe(true);
      
      const eventsAfterFirst = getDecisionEvents();
      const autopilotApprovals1 = eventsAfterFirst.filter(isAutopilotApprovalEvent);
      expect(autopilotApprovals1.length).toBe(1);
      
      // Second call with same context - should NOT create new approval
      const result2 = processAutopilotDecision(pendingEvent, userHistory);
      expect(result2.autopilotApplied).toBe(true); // Still "applied" (exists)
      expect(result2.feedbackCopyInserted).toBe(false); // No new insert
      
      const eventsAfterSecond = getDecisionEvents();
      const autopilotApprovals2 = eventsAfterSecond.filter(isAutopilotApprovalEvent);
      expect(autopilotApprovals2.length).toBe(1); // Still just 1
    });

    it('counts inserted rows correctly (idempotency proof)', () => {
      const pendingEvent = createPendingEvent();
      const userHistory = createHighApprovalHistory(5);
      
      const initialCount = getDecisionEvents().length;
      
      // Call 3 times
      processAutopilotDecision(pendingEvent, userHistory);
      processAutopilotDecision(pendingEvent, userHistory);
      processAutopilotDecision(pendingEvent, userHistory);
      
      const finalCount = getDecisionEvents().length;
      
      // Only 1 new row should have been inserted
      expect(finalCount - initialCount).toBe(1);
    });
  });

  describe('Autopilot does not double-run consumption', () => {
    it('runs consumption only once for autopilot approval', () => {
      const pendingEvent = createPendingEvent({ meal_id: 42 });
      const userHistory = createHighApprovalHistory(5);
      
      // First call
      const result1 = processAutopilotDecision(pendingEvent, userHistory);
      expect(result1.consumptionRan).toBe(true);
      
      const consumptionAfterFirst = getConsumptionLog();
      expect(consumptionAfterFirst.length).toBe(1);
      expect(consumptionAfterFirst[0].meal_id).toBe(42);
      
      // Second call - should not run consumption again
      const result2 = processAutopilotDecision(pendingEvent, userHistory);
      expect(result2.consumptionRan).toBe(false);
      
      const consumptionAfterSecond = getConsumptionLog();
      expect(consumptionAfterSecond.length).toBe(1); // Still just 1
    });

    it('consumption qty_used_estimated increments only once', () => {
      const pendingEvent = createPendingEvent({ meal_id: 42 });
      const userHistory = createHighApprovalHistory(5);
      
      processAutopilotDecision(pendingEvent, userHistory);
      processAutopilotDecision(pendingEvent, userHistory);
      processAutopilotDecision(pendingEvent, userHistory);
      
      const consumptionLog = getConsumptionLog();
      const totalQty = consumptionLog.reduce((sum, c) => sum + c.qty_used_estimated, 0);
      
      // Should only be 1 consumption entry
      expect(totalQty).toBe(1);
    });
  });

  describe('Autopilot does not double-update taste_meal_scores', () => {
    it('updates taste_meal_scores only once for autopilot approval', () => {
      const pendingEvent = createPendingEvent({ meal_id: 42 });
      const userHistory = createHighApprovalHistory(5);
      
      // First call
      const result1 = processAutopilotDecision(pendingEvent, userHistory);
      expect(result1.tasteMealScoresUpdated).toBe(true);
      
      const scoresAfterFirst = getTasteMealScores();
      const mealScore1 = scoresAfterFirst.get('score-42');
      expect(mealScore1?.approvals).toBe(1);
      
      // Second call - should not update again
      const result2 = processAutopilotDecision(pendingEvent, userHistory);
      expect(result2.tasteMealScoresUpdated).toBe(false);
      
      const scoresAfterSecond = getTasteMealScores();
      const mealScore2 = scoresAfterSecond.get('score-42');
      expect(mealScore2?.approvals).toBe(1); // Still just 1
    });

    it('taste_meal_scores.score increments only once', () => {
      const pendingEvent = createPendingEvent({ meal_id: 42 });
      const userHistory = createHighApprovalHistory(5);
      
      processAutopilotDecision(pendingEvent, userHistory);
      processAutopilotDecision(pendingEvent, userHistory);
      
      const scores = getTasteMealScores();
      const mealScore = scores.get('score-42');
      
      // Score should only reflect 1 approval
      expect(mealScore?.score).toBeCloseTo(1.0); // +1.0 for approved
      expect(mealScore?.approvals).toBe(1);
    });
  });

  describe('Undo throttles autopilot for 72h', () => {
    it('recent undo blocks autopilot eligibility', () => {
      const pendingEvent = createPendingEvent();
      
      // Create history with recent undo
      const userHistory: DecisionEvent[] = [
        ...createHighApprovalHistory(5),
        // Recent undo (1 day ago)
        {
          id: 'undo-1',
          user_profile_id: 1,
          household_key: 'test-household',
          decided_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          actioned_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          user_action: 'rejected',
          notes: NOTES.UNDO_AUTOPILOT,
          decision_payload: {},
          decision_type: 'meal_decision',
        },
      ];
      
      const result = processAutopilotDecision(pendingEvent, userHistory);
      
      expect(result.autopilotApplied).toBe(false);
      expect(result.autopilotEligibility.eligible).toBe(false);
      expect(result.autopilotEligibility.reason).toBe('recent_undo');
    });

    it('undo older than 72h does not block autopilot', () => {
      const pendingEvent = createPendingEvent();
      
      // Create history with old undo (4 days ago)
      const userHistory: DecisionEvent[] = [
        ...createHighApprovalHistory(5),
        {
          id: 'undo-old',
          user_profile_id: 1,
          household_key: 'test-household',
          decided_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          actioned_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          user_action: 'rejected',
          notes: NOTES.UNDO_AUTOPILOT,
          decision_payload: {},
          decision_type: 'meal_decision',
        },
      ];
      
      const result = processAutopilotDecision(pendingEvent, userHistory);
      
      expect(result.autopilotApplied).toBe(true);
      expect(result.autopilotEligibility.eligible).toBe(true);
      expect(result.autopilotEligibility.reason).toBe('enabled');
    });

    it('verifies 72h window constant is correct', () => {
      expect(RECENT_UNDO_WINDOW_HOURS).toBe(72);
    });
  });

  describe('End-to-end autopilot -> undo -> throttle flow', () => {
    it('full flow: autopilot eligible -> undo -> throttled for 72h', () => {
      const pendingEvent = createPendingEvent({ meal_id: 42 });
      const userHistory = createHighApprovalHistory(5);
      
      // Step 1: Autopilot eligible and applies
      const result1 = processAutopilotDecision(pendingEvent, userHistory);
      expect(result1.autopilotApplied).toBe(true);
      expect(result1.feedbackCopyInserted).toBe(true);
      
      // Verify autopilot approval was created
      const events = getDecisionEvents();
      const autopilotApproval = events.find(isAutopilotApprovalEvent);
      expect(autopilotApproval).toBeDefined();
      expect(autopilotApproval?.notes).toBe(NOTES.AUTOPILOT);
      
      // Step 2: User undoes within 10 minutes
      const undoCopy = createFeedbackCopy(autopilotApproval!, 'undo');
      const undoHooks = processAutopilotFeedbackHooks(undoCopy, true);
      
      // Verify undo was processed
      expect(isUndoAutopilotEvent(undoCopy)).toBe(true);
      expect(undoCopy.user_action).toBe('rejected');
      expect(undoCopy.notes).toBe(NOTES.UNDO_AUTOPILOT);
      
      // Step 3: Next decision request - autopilot should be throttled
      const newHistory = [
        ...userHistory,
        // The undo event (recent)
        {
          id: undoCopy.id,
          user_profile_id: 1,
          decided_at: undoCopy.decided_at,
          actioned_at: undoCopy.actioned_at,
          user_action: undoCopy.user_action,
          notes: undoCopy.notes,
          decision_payload: {},
        },
      ];
      
      const newPendingEvent = createPendingEvent({ 
        context_hash: 'new-context-hash' 
      });
      
      const result2 = processAutopilotDecision(newPendingEvent, newHistory);
      
      expect(result2.autopilotApplied).toBe(false);
      expect(result2.autopilotEligibility.eligible).toBe(false);
      expect(result2.autopilotEligibility.reason).toBe('recent_undo');
    });
  });
});

describe('Taste learning rules', () => {
  beforeEach(() => {
    clearAutopilotStores();
  });

  describe('Undo taste behavior', () => {
    it('undo generates taste_signal with weight -0.5', () => {
      const autopilotEvent: DecisionEvent = {
        id: 'autopilot-123',
        user_profile_id: 1,
        household_key: 'test-household',
        decided_at: FIXED_MORNING_DATE.toISOString(),
        actioned_at: FIXED_MORNING_DATE.toISOString(),
        user_action: 'approved',
        notes: NOTES.AUTOPILOT,
        decision_payload: {},
        meal_id: 42,
        context_hash: 'test-hash',
        decision_type: 'meal_decision',
      };
      
      const undoCopy = createFeedbackCopy(autopilotEvent, 'undo');
      processAutopilotFeedbackHooks(undoCopy, true);
      
      const signals = getTasteSignals();
      const undoSignal = signals.find(s => s.event_id === undoCopy.id);
      
      expect(undoSignal).toBeDefined();
      // Base weight is -0.5, but stress multiplier (1.10) may be applied after 8pm
      // So expect weight between -0.55 and -0.5
      expect(undoSignal?.weight).toBeLessThanOrEqual(-0.5);
      expect(undoSignal?.weight).toBeGreaterThanOrEqual(-0.55);
    });

    it('undo does NOT update taste_meal_scores', () => {
      // Setup: create initial meal score
      const autopilotEvent: DecisionEvent = {
        id: 'autopilot-123',
        user_profile_id: 1,
        household_key: 'test-household',
        decided_at: FIXED_MORNING_DATE.toISOString(),
        actioned_at: FIXED_MORNING_DATE.toISOString(),
        user_action: 'approved',
        notes: NOTES.AUTOPILOT,
        decision_payload: {},
        meal_id: 42,
        context_hash: 'test-hash',
        decision_type: 'meal_decision',
      };
      
      // First, process autopilot approval
      insertDecisionEvent(autopilotEvent);
      const approvalCopy = createFeedbackCopy(autopilotEvent, 'approved', true);
      processAutopilotFeedbackHooks(approvalCopy, true);
      
      const scoresBefore = getTasteMealScores();
      const mealScoreBefore = scoresBefore.get('score-42');
      const approvalsBefore = mealScoreBefore?.approvals || 0;
      const rejectionsBefore = mealScoreBefore?.rejections || 0;
      const scoreBefore = mealScoreBefore?.score || 0;
      
      // Now process undo
      const undoCopy = createFeedbackCopy(autopilotEvent, 'undo');
      processAutopilotFeedbackHooks(undoCopy, true);
      
      const scoresAfter = getTasteMealScores();
      const mealScoreAfter = scoresAfter.get('score-42');
      
      // Approvals and rejections should be UNCHANGED
      expect(mealScoreAfter?.approvals).toBe(approvalsBefore);
      expect(mealScoreAfter?.rejections).toBe(rejectionsBefore);
      expect(mealScoreAfter?.score).toBe(scoreBefore);
    });

    it('explicit rejection DOES update taste_meal_scores', () => {
      const event: DecisionEvent = {
        id: 'event-123',
        user_profile_id: 1,
        household_key: 'test-household',
        decided_at: FIXED_MORNING_DATE.toISOString(),
        decision_payload: {},
        meal_id: 42,
        context_hash: 'test-hash',
        decision_type: 'meal_decision',
      };
      
      const rejectionCopy = createFeedbackCopy(event, 'rejected');
      processAutopilotFeedbackHooks(rejectionCopy, true);
      
      const scores = getTasteMealScores();
      const mealScore = scores.get('score-42');
      
      // Rejection should update taste_meal_scores
      // Base weight is -1.0, but stress multiplier (1.10) may be applied after 8pm
      expect(mealScore?.rejections).toBe(1);
      expect(mealScore?.score).toBeLessThanOrEqual(-1.0);
      expect(mealScore?.score).toBeGreaterThanOrEqual(-1.1);
    });
  });
});

describe('Helper predicates', () => {
  it('isAutopilotApprovalEvent returns true for autopilot approval', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: new Date().toISOString(),
      user_action: 'approved',
      notes: NOTES.AUTOPILOT,
      decision_payload: {},
    };
    
    expect(isAutopilotApprovalEvent(event)).toBe(true);
  });

  it('isAutopilotApprovalEvent returns false for manual approval', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: new Date().toISOString(),
      user_action: 'approved',
      decision_payload: {},
    };
    
    expect(isAutopilotApprovalEvent(event)).toBe(false);
  });

  it('isUndoAutopilotEvent returns true for undo event', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: new Date().toISOString(),
      user_action: 'rejected',
      notes: NOTES.UNDO_AUTOPILOT,
      decision_payload: {},
    };
    
    expect(isUndoAutopilotEvent(event)).toBe(true);
  });

  it('isUndoAutopilotEvent returns false for regular rejection', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: new Date().toISOString(),
      user_action: 'rejected',
      decision_payload: {},
    };
    
    expect(isUndoAutopilotEvent(event)).toBe(false);
  });
});
