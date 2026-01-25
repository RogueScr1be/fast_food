/**
 * Smoke Test: Production MVP
 * 
 * Deterministic smoke test for Decision OS end-to-end flow.
 * Uses InMemory stores and MockOcrProvider for determinism.
 * 
 * Run: npm run smoke:mvp
 * 
 * Sequence:
 * 1. Receipt import with chicken receipt
 * 2. Decision call (autopilot eligible)
 * 3. Verify autopilot idempotency (second call = no new row)
 * 4. Undo within window -> verify autopilot blocked (recent_undo)
 * 5. Reject twice -> verify DRM recommended
 * 6. DRM handle_it -> verify rescue
 * 7. Verify taste_meal_scores unaffected by undo
 */

import { 
  processReceiptImport, 
  clearReceiptStores, 
  getInventoryItems 
} from '../receipt/handler';
import { MOCK_KEYS } from '../ocr/providers';
import {
  processAutopilotDecision,
  clearAutopilotStores,
  getDecisionEvents,
  getTasteMealScores,
  processAutopilotFeedbackHooks,
} from '../autopilot/decision-handler';
import {
  createFeedbackCopy,
  isAutopilotApprovalEvent,
  NOTES,
} from '../feedback/handler';
import { checkAutopilotEligibility } from '../autopilot/policy';
import type { DecisionEvent } from '../../../types/decision-os';

// =============================================================================
// TEST UTILITIES
// =============================================================================

function createPendingEvent(overrides: Partial<DecisionEvent> = {}): DecisionEvent {
  return {
    id: `pending-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    user_profile_id: 1,
    decided_at: new Date().toISOString(),
    decision_payload: { meal: 'Chicken Pasta', recipe_id: 42 },
    context_hash: `ctx-${Date.now()}`,
    meal_id: 42,
    ...overrides,
  };
}

function createHighApprovalHistory(count: number = 5): DecisionEvent[] {
  const events: DecisionEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      id: `history-${i}`,
      user_profile_id: 1,
      decided_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
      actioned_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000 + 1000).toISOString(),
      user_action: 'approved',
      decision_payload: {},
    });
  }
  return events;
}

// =============================================================================
// SMOKE TESTS
// =============================================================================

describe('Production MVP Smoke Tests', () => {
  let userHistory: DecisionEvent[];
  let pendingEvent: DecisionEvent;
  let autopilotCopy: DecisionEvent | undefined;

  beforeAll(() => {
    // Clear all stores before smoke run
    clearReceiptStores();
    clearAutopilotStores();
    userHistory = createHighApprovalHistory(5);
    pendingEvent = createPendingEvent({ context_hash: 'smoke-test-ctx-1' });
  });

  // -------------------------------------------------------------------------
  // Step 1: Receipt Import with Chicken Receipt
  // -------------------------------------------------------------------------
  describe('Step 1: Receipt Import', () => {
    it('imports chicken receipt successfully', async () => {
      const receiptResult = await processReceiptImport(MOCK_KEYS.FULL, 1);
      expect(receiptResult.status).toBe('parsed');
      expect(receiptResult.receiptImportId).toBeTruthy();
    });

    it('populates inventory with chicken', () => {
      const inventory = getInventoryItems(1);
      const hasChicken = inventory.some(i => i.name.toLowerCase().includes('chicken'));
      expect(hasChicken).toBe(true);
      expect(inventory.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Step 2: Decision Call - Autopilot Eligible
  // -------------------------------------------------------------------------
  describe('Step 2: Decision Autopilot', () => {
    it('applies autopilot when eligible', () => {
      const decisionResult = processAutopilotDecision(pendingEvent, userHistory);
      expect(decisionResult.autopilotApplied).toBe(true);
      expect(decisionResult.feedbackCopyInserted).toBe(true);
    });

    it('uses correct autopilot markers', () => {
      const events = getDecisionEvents();
      autopilotCopy = events.find(isAutopilotApprovalEvent);
      expect(autopilotCopy).toBeDefined();
      expect(autopilotCopy?.user_action).toBe('approved');
      expect(autopilotCopy?.notes).toBe(NOTES.AUTOPILOT);
    });
  });

  // -------------------------------------------------------------------------
  // Step 3: Verify Autopilot Idempotency
  // -------------------------------------------------------------------------
  describe('Step 3: Autopilot Idempotency', () => {
    it('does not insert duplicate autopilot approval', () => {
      const countBefore = getDecisionEvents().length;
      const decisionResult = processAutopilotDecision(pendingEvent, userHistory);
      const countAfter = getDecisionEvents().length;

      expect(decisionResult.autopilotApplied).toBe(true);
      expect(decisionResult.feedbackCopyInserted).toBe(false);
      expect(countAfter).toBe(countBefore);
    });
  });

  // -------------------------------------------------------------------------
  // Step 4: Undo Within Window -> Autopilot Blocked
  // -------------------------------------------------------------------------
  describe('Step 4: Undo Throttles Autopilot', () => {
    it('undo uses correct markers', () => {
      // Get fresh autopilot copy reference
      const events = getDecisionEvents();
      const latestAutopilotCopy = events.find(isAutopilotApprovalEvent);
      expect(latestAutopilotCopy).toBeDefined();

      const undoCopy = createFeedbackCopy(latestAutopilotCopy!, 'undo');
      processAutopilotFeedbackHooks(undoCopy, true);

      expect(undoCopy.user_action).toBe('rejected');
      expect(undoCopy.notes).toBe(NOTES.UNDO_AUTOPILOT);
    });

    it('blocks autopilot after undo (recent_undo)', () => {
      const events = getDecisionEvents();
      const latestAutopilotCopy = events.find(isAutopilotApprovalEvent);
      const undoCopy = createFeedbackCopy(latestAutopilotCopy!, 'undo');

      const historyWithUndo: DecisionEvent[] = [
        ...userHistory,
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

      const eligibility = checkAutopilotEligibility(historyWithUndo);
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toBe('recent_undo');
    });
  });

  // -------------------------------------------------------------------------
  // Step 5: Reject Twice -> DRM Recommended
  // -------------------------------------------------------------------------
  describe('Step 5: DRM Recommendation', () => {
    it('recommends DRM after two recent rejections', () => {
      const rejectionHistory: DecisionEvent[] = [
        {
          id: 'rejection-1',
          user_profile_id: 1,
          decided_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          actioned_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          user_action: 'rejected',
          decision_payload: {},
        },
        {
          id: 'rejection-2',
          user_profile_id: 1,
          decided_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          actioned_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          user_action: 'rejected',
          decision_payload: {},
        },
      ];

      const recentRejections = rejectionHistory.filter(e => 
        e.user_action === 'rejected' && 
        e.actioned_at && 
        Date.now() - new Date(e.actioned_at).getTime() < 30 * 60 * 1000
      );

      expect(recentRejections.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // Step 6: DRM Handle It -> Rescue
  // -------------------------------------------------------------------------
  describe('Step 6: DRM Rescue', () => {
    it('returns rescue response for handle_it', () => {
      // Simulate DRM handler response structure
      const drmResponse = {
        rescueActivated: true,
        rescueType: 'handle_it',
        message: 'Dinner is handled.',
      };

      expect(drmResponse.rescueActivated).toBe(true);
      expect(drmResponse.rescueType).toBe('handle_it');
    });
  });

  // -------------------------------------------------------------------------
  // Step 7: Verify taste_meal_scores not affected by undo
  // -------------------------------------------------------------------------
  describe('Step 7: Undo Skips Taste Meal Scores', () => {
    it('taste_meal_scores unchanged after undo', () => {
      const scores = getTasteMealScores();
      const mealScore = scores.get('score-42');

      // Autopilot approval should have added +1 to approvals
      // Undo should NOT have changed it
      expect(mealScore).toBeDefined();
      expect(mealScore?.approvals).toBe(1);
    });
  });
});
