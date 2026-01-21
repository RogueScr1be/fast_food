import {
  createFeedbackCopy,
  createAutopilotApproval,
  hasDuplicateFeedback,
  hasAutopilotApproval,
  processFeedback,
  processUndo,
  shouldRunConsumption,
  shouldUpdateTasteGraph,
  shouldUpdateTasteMealScores,
  getTasteGraphWeight,
  isWithinUndoWindow,
  isAutopilotEvent,
  isUndoEvent,
  shouldReverseConsumption,
  findAutopilotApprovedCopy,
  UNDO_WINDOW_MS,
  IDEMPOTENCY_WINDOW_MS,
  NOTES,
} from '../feedback/handler';
import type { DecisionEvent, DecisionEventInsert, FeedbackRequest } from '../../../types/decision-os';

/**
 * Helper to create a schema-true event (using only DB columns)
 */
function createEvent(overrides: Partial<DecisionEvent> = {}): DecisionEvent {
  return {
    id: 'event-123',
    user_profile_id: 1,
    decided_at: '2026-01-20T10:00:00Z',
    decision_payload: { meal: 'tacos' },
    ...overrides,
  };
}

describe('createFeedbackCopy', () => {
  const originalEvent = createEvent({ id: 'original-123' });

  it('creates approved feedback copy with schema-true fields only', () => {
    const copy = createFeedbackCopy(originalEvent, 'approved');
    
    // Schema-true fields
    expect(copy.user_action).toBe('approved');
    expect(copy.user_profile_id).toBe(1);
    expect(copy.decided_at).toBe('2026-01-20T10:00:00Z');
    expect(copy.actioned_at).toBeDefined();
    expect(copy.decision_payload).toEqual({ meal: 'tacos' });
    expect(copy.notes).toBeUndefined(); // No marker for regular approval
    
    // NO phantom fields
    expect((copy as Record<string, unknown>).status).toBeUndefined();
    expect((copy as Record<string, unknown>).is_feedback_copy).toBeUndefined();
    expect((copy as Record<string, unknown>).is_autopilot).toBeUndefined();
    expect((copy as Record<string, unknown>).original_event_id).toBeUndefined();
  });

  it('creates rejected feedback copy', () => {
    const copy = createFeedbackCopy(originalEvent, 'rejected');
    
    expect(copy.user_action).toBe('rejected');
    expect(copy.notes).toBeUndefined();
  });

  it('creates drm_triggered feedback copy', () => {
    const copy = createFeedbackCopy(originalEvent, 'drm_triggered');
    
    expect(copy.user_action).toBe('drm_triggered');
    expect(copy.notes).toBeUndefined();
  });

  it('creates undo feedback copy with user_action=rejected and notes=undo_autopilot', () => {
    const copy = createFeedbackCopy(originalEvent, 'undo');
    
    // CRITICAL: undo is persisted as rejected with notes marker
    expect(copy.user_action).toBe('rejected');
    expect(copy.notes).toBe(NOTES.UNDO_AUTOPILOT);
  });

  it('generates unique ID for feedback copy', () => {
    const copy1 = createFeedbackCopy(originalEvent, 'approved');
    const copy2 = createFeedbackCopy(originalEvent, 'approved');
    
    expect(copy1.id).not.toBe(copy2.id);
    expect(copy1.id).toContain('original-123');
    expect(copy1.id).toContain('feedback');
  });
});

describe('createAutopilotApproval', () => {
  const originalEvent = createEvent({ id: 'original-123' });

  it('creates autopilot approval with notes=autopilot marker', () => {
    const copy = createAutopilotApproval(originalEvent);
    
    expect(copy.user_action).toBe('approved');
    expect(copy.notes).toBe(NOTES.AUTOPILOT);
    expect(copy.actioned_at).toBeDefined();
    expect(copy.decision_payload).toEqual({ meal: 'tacos' });
  });
});

describe('isAutopilotEvent', () => {
  it('returns true for autopilot-approved events (notes=autopilot)', () => {
    const event = createEvent({
      user_action: 'approved',
      notes: NOTES.AUTOPILOT,
    });
    
    expect(isAutopilotEvent(event)).toBe(true);
  });

  it('returns false for manual approved events (no notes)', () => {
    const event = createEvent({
      user_action: 'approved',
    });
    
    expect(isAutopilotEvent(event)).toBe(false);
  });

  it('returns false for rejected events even with notes', () => {
    const event = createEvent({
      user_action: 'rejected',
      notes: NOTES.AUTOPILOT,
    });
    
    expect(isAutopilotEvent(event)).toBe(false);
  });
});

describe('isUndoEvent', () => {
  it('returns true for undo events (user_action=rejected, notes=undo_autopilot)', () => {
    const event = createEvent({
      user_action: 'rejected',
      notes: NOTES.UNDO_AUTOPILOT,
    });
    
    expect(isUndoEvent(event)).toBe(true);
  });

  it('returns false for regular rejection (no notes)', () => {
    const event = createEvent({
      user_action: 'rejected',
    });
    
    expect(isUndoEvent(event)).toBe(false);
  });
});

describe('hasDuplicateFeedback', () => {
  it('returns false when no existing copies', () => {
    expect(hasDuplicateFeedback([], 'rejected')).toBe(false);
  });

  it('returns true when duplicate exists within window', () => {
    const recentCopy = createEvent({
      id: 'copy-1',
      actioned_at: new Date().toISOString(),
      user_action: 'rejected',
    });
    
    expect(hasDuplicateFeedback([recentCopy], 'rejected')).toBe(true);
  });

  it('returns false when duplicate is outside window', () => {
    const oldCopy = createEvent({
      id: 'copy-1',
      actioned_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      user_action: 'rejected',
    });
    
    expect(hasDuplicateFeedback([oldCopy], 'rejected')).toBe(false);
  });

  it('returns false when existing copy has different action', () => {
    const approvedCopy = createEvent({
      id: 'copy-1',
      actioned_at: new Date().toISOString(),
      user_action: 'approved',
    });
    
    expect(hasDuplicateFeedback([approvedCopy], 'rejected')).toBe(false);
  });

  describe('autopilot double-learn prevention', () => {
    it('treats client approved as duplicate if autopilot already approved', () => {
      const autopilotCopy = createEvent({
        id: 'autopilot-copy',
        actioned_at: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        user_action: 'approved',
        notes: NOTES.AUTOPILOT,
      });
      
      // Client tries to approve after autopilot - should be duplicate
      expect(hasDuplicateFeedback([autopilotCopy], 'approved')).toBe(true);
    });

    it('allows rejection after autopilot approval', () => {
      const autopilotCopy = createEvent({
        id: 'autopilot-copy',
        actioned_at: new Date().toISOString(),
        user_action: 'approved',
        notes: NOTES.AUTOPILOT,
      });
      
      // Client can still reject after autopilot approved
      expect(hasDuplicateFeedback([autopilotCopy], 'rejected')).toBe(false);
    });
  });

  describe('undo idempotency', () => {
    it('detects duplicate undo within idempotency window', () => {
      const undoCopy = createEvent({
        id: 'undo-copy-1',
        actioned_at: new Date().toISOString(),
        user_action: 'rejected',
        notes: NOTES.UNDO_AUTOPILOT,
      });
      
      expect(hasDuplicateFeedback([undoCopy], 'undo')).toBe(true);
    });

    it('does not confuse regular rejection with undo', () => {
      const regularRejection = createEvent({
        id: 'reject-copy-1',
        actioned_at: new Date().toISOString(),
        user_action: 'rejected',
        // No notes - regular rejection
      });
      
      expect(hasDuplicateFeedback([regularRejection], 'undo')).toBe(false);
    });

    it('undo outside idempotency window is not duplicate', () => {
      const oldUndo = createEvent({
        id: 'undo-copy-1',
        actioned_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        user_action: 'rejected',
        notes: NOTES.UNDO_AUTOPILOT,
      });
      
      expect(hasDuplicateFeedback([oldUndo], 'undo')).toBe(false);
    });
  });
});

describe('hasAutopilotApproval', () => {
  it('returns true when autopilot approval exists', () => {
    const copies = [
      createEvent({
        user_action: 'approved',
        notes: NOTES.AUTOPILOT,
      }),
    ];
    
    expect(hasAutopilotApproval(copies)).toBe(true);
  });

  it('returns false when no autopilot approval', () => {
    const copies = [
      createEvent({
        user_action: 'approved',
        // No notes - manual approval
      }),
    ];
    
    expect(hasAutopilotApproval(copies)).toBe(false);
  });
});

describe('findAutopilotApprovedCopy', () => {
  it('returns the most recent autopilot-approved copy', () => {
    const copies: DecisionEvent[] = [
      createEvent({
        id: 'copy-1',
        actioned_at: '2026-01-20T11:00:00Z',
        user_action: 'approved',
        notes: NOTES.AUTOPILOT,
      }),
      createEvent({
        id: 'copy-2',
        actioned_at: '2026-01-20T12:00:00Z', // More recent
        user_action: 'approved',
        notes: NOTES.AUTOPILOT,
      }),
    ];
    
    const result = findAutopilotApprovedCopy(copies);
    expect(result?.id).toBe('copy-2');
  });

  it('returns undefined when no autopilot copies exist', () => {
    const copies: DecisionEvent[] = [
      createEvent({
        id: 'copy-1',
        actioned_at: '2026-01-20T11:00:00Z',
        user_action: 'approved',
        // No notes - manual
      }),
    ];
    
    const result = findAutopilotApprovedCopy(copies);
    expect(result).toBeUndefined();
  });
});

describe('processUndo', () => {
  const createAutopilotEventForUndo = (minutesAgo: number): DecisionEvent => createEvent({
    id: 'autopilot-123',
    actioned_at: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
    user_action: 'approved',
    notes: NOTES.AUTOPILOT,
  });

  describe('undo within window', () => {
    it('inserts new row with user_action=rejected and notes=undo_autopilot', () => {
      const autopilotEvent = createAutopilotEventForUndo(5);
      
      const result = processUndo(autopilotEvent, []);
      
      expect(result.recorded).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.reason).toBe('success');
      expect(result.feedbackCopy).toBeDefined();
      
      // CRITICAL: Verify DB write uses correct columns
      expect(result.feedbackCopy?.user_action).toBe('rejected');
      expect(result.feedbackCopy?.notes).toBe(NOTES.UNDO_AUTOPILOT);
      expect(result.feedbackCopy?.actioned_at).toBeDefined();
      
      // NO phantom fields
      expect((result.feedbackCopy as Record<string, unknown>).status).toBeUndefined();
      expect((result.feedbackCopy as Record<string, unknown>).is_autopilot).toBeUndefined();
    });

    it('undo is idempotent - multiple undos create only one copy', () => {
      const autopilotEvent = createAutopilotEventForUndo(5);
      
      const firstResult = processUndo(autopilotEvent, []);
      expect(firstResult.isDuplicate).toBe(false);
      
      // Simulate persisted undo
      const undoCopy = createEvent({
        ...firstResult.feedbackCopy,
        actioned_at: new Date().toISOString(),
      });
      
      const secondResult = processUndo(autopilotEvent, [undoCopy]);
      expect(secondResult.recorded).toBe(true);
      expect(secondResult.isDuplicate).toBe(true);
      expect(secondResult.reason).toBe('duplicate');
    });
  });

  describe('undo outside window', () => {
    it('no new row inserted, returns {recorded:true}', () => {
      const autopilotEvent = createAutopilotEventForUndo(15);
      
      const result = processUndo(autopilotEvent, []);
      
      expect(result.recorded).toBe(true);
      expect(result.reason).toBe('outside_window');
      expect(result.feedbackCopy).toBeUndefined();
    });
  });

  describe('undo against non-autopilot event', () => {
    it('no-op for manual approval', () => {
      const manualApproved = createEvent({
        id: 'manual-123',
        actioned_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        user_action: 'approved',
        // No notes - manual
      });
      
      const result = processUndo(manualApproved, []);
      
      expect(result.recorded).toBe(true);
      expect(result.reason).toBe('not_autopilot');
      expect(result.feedbackCopy).toBeUndefined();
    });
  });
});

describe('processFeedback', () => {
  const originalEvent = createEvent({ id: 'original-123' });

  it('creates feedback copy for new request', () => {
    const request: FeedbackRequest = {
      eventId: 'original-123',
      userAction: 'rejected',
    };
    
    const result = processFeedback(originalEvent, [], request);
    
    expect(result.recorded).toBe(true);
    expect(result.isDuplicate).toBe(false);
    expect(result.feedbackCopy).toBeDefined();
    expect(result.feedbackCopy?.user_action).toBe('rejected');
  });

  it('returns duplicate=true for idempotent request', () => {
    const recentCopy = createEvent({
      id: 'copy-1',
      actioned_at: new Date().toISOString(),
      user_action: 'rejected',
    });
    
    const request: FeedbackRequest = {
      eventId: 'original-123',
      userAction: 'rejected',
    };
    
    const result = processFeedback(originalEvent, [recentCopy], request);
    
    expect(result.recorded).toBe(true);
    expect(result.isDuplicate).toBe(true);
    expect(result.feedbackCopy).toBeUndefined();
  });

  describe('undo action', () => {
    it('undo finds autopilot copy and creates undo row', () => {
      const autopilotCopy = createEvent({
        id: 'autopilot-copy-123',
        actioned_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        user_action: 'approved',
        notes: NOTES.AUTOPILOT,
      });
      
      const request: FeedbackRequest = {
        eventId: 'original-123',
        userAction: 'undo',
      };
      
      const result = processFeedback(originalEvent, [autopilotCopy], request);
      
      expect(result.recorded).toBe(true);
      expect(result.feedbackCopy).toBeDefined();
      expect(result.feedbackCopy?.user_action).toBe('rejected');
      expect(result.feedbackCopy?.notes).toBe(NOTES.UNDO_AUTOPILOT);
    });

    it('undo with no autopilot event returns not_autopilot', () => {
      const request: FeedbackRequest = {
        eventId: 'original-123',
        userAction: 'undo',
      };
      
      const result = processFeedback(originalEvent, [], request);
      
      expect(result.recorded).toBe(true);
      expect(result.reason).toBe('not_autopilot');
      expect(result.feedbackCopy).toBeUndefined();
    });
  });

  describe('autopilot double-learn prevention', () => {
    it('client approve after autopilot approve is no-op', () => {
      const autopilotCopy = createEvent({
        id: 'autopilot-copy',
        actioned_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        user_action: 'approved',
        notes: NOTES.AUTOPILOT,
      });
      
      const request: FeedbackRequest = {
        eventId: 'original-123',
        userAction: 'approved',
      };
      
      const result = processFeedback(originalEvent, [autopilotCopy], request);
      
      expect(result.recorded).toBe(true);
      expect(result.isDuplicate).toBe(true);
      expect(result.feedbackCopy).toBeUndefined();
    });

    it('client reject after autopilot approve creates new row', () => {
      const autopilotCopy = createEvent({
        id: 'autopilot-copy',
        actioned_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        user_action: 'approved',
        notes: NOTES.AUTOPILOT,
      });
      
      const request: FeedbackRequest = {
        eventId: 'original-123',
        userAction: 'rejected',
      };
      
      const result = processFeedback(originalEvent, [autopilotCopy], request);
      
      expect(result.recorded).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.feedbackCopy).toBeDefined();
      expect(result.feedbackCopy?.user_action).toBe('rejected');
    });
  });
});

describe('shouldRunConsumption', () => {
  it('returns true for approved events', () => {
    const event = createEvent({ user_action: 'approved' });
    expect(shouldRunConsumption(event)).toBe(true);
  });

  it('returns false for rejected events', () => {
    const event = createEvent({ user_action: 'rejected' });
    expect(shouldRunConsumption(event)).toBe(false);
  });

  it('returns false for events without user_action', () => {
    const event = createEvent({});
    expect(shouldRunConsumption(event)).toBe(false);
  });
});

describe('shouldUpdateTasteGraph', () => {
  it('returns true for approved events', () => {
    const event = createEvent({ user_action: 'approved' });
    expect(shouldUpdateTasteGraph(event)).toBe(true);
  });

  it('returns true for rejected events', () => {
    const event = createEvent({ user_action: 'rejected' });
    expect(shouldUpdateTasteGraph(event)).toBe(true);
  });

  it('returns true for drm_triggered events', () => {
    const event = createEvent({ user_action: 'drm_triggered' });
    expect(shouldUpdateTasteGraph(event)).toBe(true);
  });

  it('returns false for events without user_action', () => {
    const event = createEvent({});
    expect(shouldUpdateTasteGraph(event)).toBe(false);
  });
});

describe('shouldUpdateTasteMealScores', () => {
  it('returns true for regular approved', () => {
    const event = createEvent({ user_action: 'approved' });
    expect(shouldUpdateTasteMealScores(event)).toBe(true);
  });

  it('returns true for regular rejected', () => {
    const event = createEvent({ user_action: 'rejected' });
    expect(shouldUpdateTasteMealScores(event)).toBe(true);
  });

  it('returns FALSE for undo (autonomy penalty only)', () => {
    const event = createEvent({
      user_action: 'rejected',
      notes: NOTES.UNDO_AUTOPILOT,
    });
    
    // CRITICAL: Undo does NOT update taste_meal_scores
    expect(shouldUpdateTasteMealScores(event)).toBe(false);
  });

  it('returns true for autopilot approval', () => {
    const event = createEvent({
      user_action: 'approved',
      notes: NOTES.AUTOPILOT,
    });
    
    expect(shouldUpdateTasteMealScores(event)).toBe(true);
  });
});

describe('getTasteGraphWeight', () => {
  it('returns 1.0 for approved events', () => {
    const event = createEvent({ user_action: 'approved' });
    expect(getTasteGraphWeight(event)).toBe(1.0);
  });

  it('returns -1.0 for rejected events', () => {
    const event = createEvent({ user_action: 'rejected' });
    expect(getTasteGraphWeight(event)).toBe(-1.0);
  });

  it('returns -0.5 for drm_triggered events', () => {
    const event = createEvent({ user_action: 'drm_triggered' });
    expect(getTasteGraphWeight(event)).toBe(-0.5);
  });

  it('returns -0.5 for undo events (autonomy penalty)', () => {
    const event = createEvent({
      user_action: 'rejected',
      notes: NOTES.UNDO_AUTOPILOT,
    });
    
    expect(getTasteGraphWeight(event)).toBe(-0.5);
  });

  it('returns 0 for events without user_action', () => {
    const event = createEvent({});
    expect(getTasteGraphWeight(event)).toBe(0);
  });
});

describe('isWithinUndoWindow', () => {
  it('returns true when event is within 10 minute window', () => {
    const event = createEvent({
      actioned_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    });
    
    expect(isWithinUndoWindow(event)).toBe(true);
  });

  it('returns true at exactly 10 minutes', () => {
    const nowMs = Date.now();
    const event = createEvent({
      actioned_at: new Date(nowMs - UNDO_WINDOW_MS).toISOString(),
    });
    
    expect(isWithinUndoWindow(event, nowMs)).toBe(true);
  });

  it('returns false when event is outside 10 minute window', () => {
    const event = createEvent({
      actioned_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    });
    
    expect(isWithinUndoWindow(event)).toBe(false);
  });

  it('returns false when actioned_at is missing', () => {
    const event = createEvent({});
    expect(isWithinUndoWindow(event)).toBe(false);
  });
});

describe('shouldReverseConsumption', () => {
  it('returns false for all events (v1 limitation)', () => {
    const undoEvent = createEvent({
      user_action: 'rejected',
      notes: NOTES.UNDO_AUTOPILOT,
    });
    
    expect(shouldReverseConsumption(undoEvent)).toBe(false);
  });
});
