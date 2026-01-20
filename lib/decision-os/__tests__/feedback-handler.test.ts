import {
  createFeedbackCopy,
  hasDuplicateFeedback,
  processFeedback,
  processUndo,
  shouldRunConsumption,
  shouldUpdateTasteGraph,
  getTasteGraphWeight,
  isWithinUndoWindow,
  isAutopilotEvent,
  shouldReverseConsumption,
  findAutopilotApprovedCopy,
  UNDO_WINDOW_MS,
  IDEMPOTENCY_WINDOW_MS,
} from '../feedback/handler';
import type { DecisionEvent, FeedbackRequest } from '../../../types/decision-os';

describe('createFeedbackCopy', () => {
  const originalEvent: DecisionEvent = {
    id: 'original-123',
    user_profile_id: 1,
    decided_at: '2026-01-20T10:00:00Z',
    status: 'pending',
    decision_payload: { meal: 'tacos', recipe_id: 42 },
  };

  it('creates approved feedback copy', () => {
    const copy = createFeedbackCopy(originalEvent, 'approved');
    
    expect(copy.is_feedback_copy).toBe(true);
    expect(copy.original_event_id).toBe('original-123');
    expect(copy.status).toBe('approved');
    expect(copy.user_profile_id).toBe(1);
    expect(copy.decided_at).toBe('2026-01-20T10:00:00Z');
    expect(copy.actioned_at).toBeDefined();
    expect(copy.decision_payload).toEqual({ meal: 'tacos', recipe_id: 42 });
  });

  it('creates rejected feedback copy', () => {
    const copy = createFeedbackCopy(originalEvent, 'rejected');
    
    expect(copy.status).toBe('rejected');
    expect(copy.is_feedback_copy).toBe(true);
    expect(copy.original_event_id).toBe('original-123');
  });

  it('uses modified payload when provided', () => {
    const modifiedPayload = { meal: 'burritos', recipe_id: 99 };
    const copy = createFeedbackCopy(originalEvent, 'modified', modifiedPayload);
    
    expect(copy.decision_payload).toEqual(modifiedPayload);
    expect(copy.status).toBe('rejected'); // modified maps to rejected status
  });

  it('generates unique ID for feedback copy', () => {
    const copy1 = createFeedbackCopy(originalEvent, 'approved');
    const copy2 = createFeedbackCopy(originalEvent, 'approved');
    
    expect(copy1.id).not.toBe(copy2.id);
    expect(copy1.id).toContain('original-123');
    expect(copy1.id).toContain('feedback');
  });
});

describe('hasDuplicateFeedback', () => {
  it('returns false when no existing copies', () => {
    expect(hasDuplicateFeedback([], 'rejected')).toBe(false);
  });

  it('returns true when duplicate exists within window', () => {
    const recentCopy: DecisionEvent = {
      id: 'copy-1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      actioned_at: new Date().toISOString(), // Just now
      status: 'rejected',
      decision_payload: {},
      is_feedback_copy: true,
      original_event_id: 'original-123',
    };
    
    expect(hasDuplicateFeedback([recentCopy], 'rejected')).toBe(true);
  });

  it('returns false when duplicate is outside window', () => {
    const oldCopy: DecisionEvent = {
      id: 'copy-1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      actioned_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
      status: 'rejected',
      decision_payload: {},
      is_feedback_copy: true,
      original_event_id: 'original-123',
    };
    
    expect(hasDuplicateFeedback([oldCopy], 'rejected')).toBe(false);
  });

  it('returns false when existing copy has different action', () => {
    const approvedCopy: DecisionEvent = {
      id: 'copy-1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      actioned_at: new Date().toISOString(),
      status: 'approved',
      decision_payload: {},
      is_feedback_copy: true,
      original_event_id: 'original-123',
    };
    
    // Looking for rejected duplicate, but only approved exists
    expect(hasDuplicateFeedback([approvedCopy], 'rejected')).toBe(false);
  });
});

describe('processFeedback', () => {
  const originalEvent: DecisionEvent = {
    id: 'original-123',
    user_profile_id: 1,
    decided_at: '2026-01-20T10:00:00Z',
    status: 'pending',
    decision_payload: { meal: 'tacos' },
  };

  it('creates feedback copy for new request', () => {
    const request: FeedbackRequest = {
      eventId: 'original-123',
      userAction: 'rejected',
    };
    
    const result = processFeedback(originalEvent, [], request);
    
    expect(result.recorded).toBe(true);
    expect(result.isDuplicate).toBe(false);
    expect(result.feedbackCopy).toBeDefined();
    expect(result.feedbackCopy?.status).toBe('rejected');
  });

  it('returns duplicate=true for idempotent request', () => {
    const recentCopy: DecisionEvent = {
      id: 'copy-1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      actioned_at: new Date().toISOString(),
      status: 'rejected',
      decision_payload: {},
      is_feedback_copy: true,
      original_event_id: 'original-123',
    };
    
    const request: FeedbackRequest = {
      eventId: 'original-123',
      userAction: 'rejected',
    };
    
    const result = processFeedback(originalEvent, [recentCopy], request);
    
    expect(result.recorded).toBe(true);
    expect(result.isDuplicate).toBe(true);
    expect(result.feedbackCopy).toBeUndefined();
  });

  describe('Undo after autopilot', () => {
    it('allows rejected feedback after autopilot approved copy', () => {
      // Simulate autopilot: an approved copy already exists
      const autopilotApprovedCopy: DecisionEvent = {
        id: 'copy-autopilot',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: new Date(Date.now() - 5000).toISOString(), // 5 seconds ago
        status: 'approved',
        decision_payload: { meal: 'tacos' },
        is_feedback_copy: true,
        original_event_id: 'original-123',
      };
      
      // User sends Undo (rejected)
      const undoRequest: FeedbackRequest = {
        eventId: 'original-123',
        userAction: 'rejected',
      };
      
      const result = processFeedback(originalEvent, [autopilotApprovedCopy], undoRequest);
      
      // Should create a new rejected copy (not a duplicate since it's different action)
      expect(result.recorded).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.feedbackCopy).toBeDefined();
      expect(result.feedbackCopy?.status).toBe('rejected');
      expect(result.feedbackCopy?.original_event_id).toBe('original-123');
    });

    it('idempotent undo only inserts one rejected copy', () => {
      // Autopilot approved copy
      const autopilotCopy: DecisionEvent = {
        id: 'copy-autopilot',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        status: 'approved',
        decision_payload: { meal: 'tacos' },
        is_feedback_copy: true,
        original_event_id: 'original-123',
      };
      
      // First undo
      const undoRequest: FeedbackRequest = {
        eventId: 'original-123',
        userAction: 'rejected',
      };
      
      const firstResult = processFeedback(originalEvent, [autopilotCopy], undoRequest);
      expect(firstResult.isDuplicate).toBe(false);
      expect(firstResult.feedbackCopy).toBeDefined();
      
      // Simulate that the first undo was inserted
      const undoCopy: DecisionEvent = {
        ...firstResult.feedbackCopy!,
        actioned_at: new Date().toISOString(),
      };
      
      // Second undo (should be idempotent)
      const secondResult = processFeedback(
        originalEvent, 
        [autopilotCopy, undoCopy], 
        undoRequest
      );
      
      expect(secondResult.recorded).toBe(true);
      expect(secondResult.isDuplicate).toBe(true);
      expect(secondResult.feedbackCopy).toBeUndefined();
    });
  });
});

describe('shouldRunConsumption', () => {
  it('returns true for approved events', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'approved',
      decision_payload: {},
    };
    
    expect(shouldRunConsumption(event)).toBe(true);
  });

  it('returns false for rejected events', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'rejected',
      decision_payload: {},
    };
    
    expect(shouldRunConsumption(event)).toBe(false);
  });

  it('returns false for pending events', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'pending',
      decision_payload: {},
    };
    
    expect(shouldRunConsumption(event)).toBe(false);
  });
});

describe('shouldUpdateTasteGraph', () => {
  it('returns true for approved events', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'approved',
      decision_payload: {},
    };
    
    expect(shouldUpdateTasteGraph(event)).toBe(true);
  });

  it('returns true for rejected events', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'rejected',
      decision_payload: {},
    };
    
    expect(shouldUpdateTasteGraph(event)).toBe(true);
  });

  it('returns false for pending events', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'pending',
      decision_payload: {},
    };
    
    expect(shouldUpdateTasteGraph(event)).toBe(false);
  });
});

describe('getTasteGraphWeight', () => {
  it('returns 1.0 for approved events', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'approved',
      decision_payload: {},
    };
    
    expect(getTasteGraphWeight(event)).toBe(1.0);
  });

  it('returns -0.5 for rejected events', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'rejected',
      decision_payload: {},
    };
    
    expect(getTasteGraphWeight(event)).toBe(-0.5);
  });

  it('returns 0 for pending events', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'pending',
      decision_payload: {},
    };
    
    expect(getTasteGraphWeight(event)).toBe(0);
  });

  it('returns -0.5 for undo events (same as rejected)', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'rejected',
      decision_payload: {},
      notes: 'undo_autopilot',
    };
    
    expect(getTasteGraphWeight(event)).toBe(-0.5);
  });
});

describe('isWithinUndoWindow', () => {
  it('returns true when event is within 10 minute window', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      actioned_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
      status: 'approved',
      decision_payload: {},
      is_autopilot: true,
    };
    
    expect(isWithinUndoWindow(event)).toBe(true);
  });

  it('returns true at exactly 10 minutes', () => {
    const nowMs = Date.now();
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      actioned_at: new Date(nowMs - UNDO_WINDOW_MS).toISOString(), // Exactly 10 minutes ago
      status: 'approved',
      decision_payload: {},
      is_autopilot: true,
    };
    
    expect(isWithinUndoWindow(event, nowMs)).toBe(true);
  });

  it('returns false when event is outside 10 minute window', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      actioned_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
      status: 'approved',
      decision_payload: {},
      is_autopilot: true,
    };
    
    expect(isWithinUndoWindow(event)).toBe(false);
  });

  it('returns false when actioned_at is missing', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'approved',
      decision_payload: {},
      is_autopilot: true,
    };
    
    expect(isWithinUndoWindow(event)).toBe(false);
  });
});

describe('isAutopilotEvent', () => {
  it('returns true for autopilot-approved events', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'approved',
      decision_payload: {},
      is_autopilot: true,
    };
    
    expect(isAutopilotEvent(event)).toBe(true);
  });

  it('returns false for non-autopilot approved events', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'approved',
      decision_payload: {},
    };
    
    expect(isAutopilotEvent(event)).toBe(false);
  });

  it('returns false for autopilot but rejected events', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'rejected',
      decision_payload: {},
      is_autopilot: true,
    };
    
    expect(isAutopilotEvent(event)).toBe(false);
  });

  it('returns false for pending events', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'pending',
      decision_payload: {},
    };
    
    expect(isAutopilotEvent(event)).toBe(false);
  });
});

describe('findAutopilotApprovedCopy', () => {
  it('returns the most recent autopilot-approved copy', () => {
    const copies: DecisionEvent[] = [
      {
        id: 'copy-1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: '2026-01-20T11:00:00Z',
        status: 'approved',
        decision_payload: {},
        is_autopilot: true,
      },
      {
        id: 'copy-2',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: '2026-01-20T12:00:00Z', // More recent
        status: 'approved',
        decision_payload: {},
        is_autopilot: true,
      },
    ];
    
    const result = findAutopilotApprovedCopy(copies);
    expect(result?.id).toBe('copy-2');
  });

  it('returns undefined when no autopilot copies exist', () => {
    const copies: DecisionEvent[] = [
      {
        id: 'copy-1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: '2026-01-20T11:00:00Z',
        status: 'approved',
        decision_payload: {},
        // Not autopilot
      },
    ];
    
    const result = findAutopilotApprovedCopy(copies);
    expect(result).toBeUndefined();
  });
});

describe('processUndo', () => {
  const createAutopilotEvent = (minutesAgo: number): DecisionEvent => ({
    id: 'autopilot-123',
    user_profile_id: 1,
    decided_at: '2026-01-20T10:00:00Z',
    actioned_at: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
    status: 'approved',
    decision_payload: { meal: 'tacos' },
    is_autopilot: true,
  });

  describe('undo within window', () => {
    it('inserts exactly ONE new decision_event row (append-only)', () => {
      const autopilotEvent = createAutopilotEvent(5); // 5 minutes ago
      
      const result = processUndo(autopilotEvent, []);
      
      expect(result.recorded).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.reason).toBe('success');
      expect(result.feedbackCopy).toBeDefined();
      expect(result.feedbackCopy?.status).toBe('rejected');
      expect(result.feedbackCopy?.notes).toBe('undo_autopilot');
      expect(result.feedbackCopy?.is_feedback_copy).toBe(true);
    });

    it('undo is idempotent - multiple undos create only one copy', () => {
      const autopilotEvent = createAutopilotEvent(5);
      
      // First undo succeeds
      const firstResult = processUndo(autopilotEvent, []);
      expect(firstResult.isDuplicate).toBe(false);
      expect(firstResult.feedbackCopy).toBeDefined();
      
      // Simulate persisting the first undo
      const undoCopy: DecisionEvent = {
        ...firstResult.feedbackCopy!,
        actioned_at: new Date().toISOString(),
        notes: 'undo_autopilot',
      };
      
      // Second undo is detected as duplicate
      const secondResult = processUndo(autopilotEvent, [undoCopy]);
      expect(secondResult.recorded).toBe(true);
      expect(secondResult.isDuplicate).toBe(true);
      expect(secondResult.reason).toBe('duplicate');
      expect(secondResult.feedbackCopy).toBeUndefined();
    });
  });

  describe('undo outside window', () => {
    it('no new row inserted, still returns {recorded:true}', () => {
      const autopilotEvent = createAutopilotEvent(15); // 15 minutes ago (outside window)
      
      const result = processUndo(autopilotEvent, []);
      
      expect(result.recorded).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.reason).toBe('outside_window');
      expect(result.feedbackCopy).toBeUndefined();
    });

    it('undo at exactly 10 minutes + 1ms returns outside_window', () => {
      const nowMs = Date.now();
      const autopilotEvent: DecisionEvent = {
        id: 'autopilot-123',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: new Date(nowMs - UNDO_WINDOW_MS - 1).toISOString(), // Just over 10 minutes
        status: 'approved',
        decision_payload: { meal: 'tacos' },
        is_autopilot: true,
      };
      
      const result = processUndo(autopilotEvent, [], nowMs);
      
      expect(result.recorded).toBe(true);
      expect(result.reason).toBe('outside_window');
      expect(result.feedbackCopy).toBeUndefined();
    });
  });

  describe('undo against non-autopilot event', () => {
    it('no-op, returns {recorded:true}', () => {
      const manualApprovedEvent: DecisionEvent = {
        id: 'manual-123',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        status: 'approved',
        decision_payload: { meal: 'tacos' },
        // is_autopilot is NOT set
      };
      
      const result = processUndo(manualApprovedEvent, []);
      
      expect(result.recorded).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.reason).toBe('not_autopilot');
      expect(result.feedbackCopy).toBeUndefined();
    });

    it('undo against pending event is no-op', () => {
      const pendingEvent: DecisionEvent = {
        id: 'pending-123',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        status: 'pending',
        decision_payload: { meal: 'tacos' },
      };
      
      const result = processUndo(pendingEvent, []);
      
      expect(result.recorded).toBe(true);
      expect(result.reason).toBe('not_autopilot');
      expect(result.feedbackCopy).toBeUndefined();
    });
  });
});

describe('processFeedback with undo action', () => {
  const originalEvent: DecisionEvent = {
    id: 'original-123',
    user_profile_id: 1,
    decided_at: '2026-01-20T10:00:00Z',
    status: 'pending',
    decision_payload: { meal: 'tacos' },
  };

  it('undo action finds autopilot copy and processes', () => {
    const autopilotCopy: DecisionEvent = {
      id: 'autopilot-copy-123',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      actioned_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      status: 'approved',
      decision_payload: { meal: 'tacos' },
      is_autopilot: true,
      is_feedback_copy: true,
      original_event_id: 'original-123',
    };
    
    const request: FeedbackRequest = {
      eventId: 'original-123',
      userAction: 'undo',
    };
    
    const result = processFeedback(originalEvent, [autopilotCopy], request);
    
    expect(result.recorded).toBe(true);
    expect(result.feedbackCopy).toBeDefined();
    expect(result.feedbackCopy?.notes).toBe('undo_autopilot');
  });

  it('undo action on autopilot original event processes correctly', () => {
    const autopilotOriginal: DecisionEvent = {
      id: 'original-123',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      actioned_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      status: 'approved',
      decision_payload: { meal: 'tacos' },
      is_autopilot: true,
    };
    
    const request: FeedbackRequest = {
      eventId: 'original-123',
      userAction: 'undo',
    };
    
    const result = processFeedback(autopilotOriginal, [], request);
    
    expect(result.recorded).toBe(true);
    expect(result.feedbackCopy).toBeDefined();
    expect(result.feedbackCopy?.notes).toBe('undo_autopilot');
  });

  it('undo action with no autopilot event returns not_autopilot', () => {
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

describe('shouldReverseConsumption', () => {
  it('returns false for all events (v1 limitation)', () => {
    const undoEvent: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'rejected',
      decision_payload: {},
      notes: 'undo_autopilot',
    };
    
    expect(shouldReverseConsumption(undoEvent)).toBe(false);
  });

  it('documents v1 limitation: consumption not reversed', () => {
    // This test documents the intentional v1 behavior:
    // We do NOT reverse consumption because we don't track 
    // exact consumption amounts per decision event.
    const approvedEvent: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'approved',
      decision_payload: {},
    };
    
    expect(shouldReverseConsumption(approvedEvent)).toBe(false);
  });
});

describe('createFeedbackCopy with undo', () => {
  const autopilotEvent: DecisionEvent = {
    id: 'autopilot-123',
    user_profile_id: 1,
    decided_at: '2026-01-20T10:00:00Z',
    actioned_at: '2026-01-20T10:05:00Z',
    status: 'approved',
    decision_payload: { meal: 'tacos' },
    is_autopilot: true,
  };

  it('creates undo feedback copy with notes=undo_autopilot', () => {
    const copy = createFeedbackCopy(autopilotEvent, 'undo');
    
    expect(copy.status).toBe('rejected');
    expect(copy.notes).toBe('undo_autopilot');
    expect(copy.is_feedback_copy).toBe(true);
    expect(copy.original_event_id).toBe('autopilot-123');
  });

  it('undo copy preserves original payload', () => {
    const copy = createFeedbackCopy(autopilotEvent, 'undo');
    
    expect(copy.decision_payload).toEqual({ meal: 'tacos' });
  });
});

describe('hasDuplicateFeedback with undo', () => {
  it('detects duplicate undo within idempotency window', () => {
    const undoCopy: DecisionEvent = {
      id: 'undo-copy-1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      actioned_at: new Date().toISOString(),
      status: 'rejected',
      decision_payload: {},
      is_feedback_copy: true,
      notes: 'undo_autopilot',
    };
    
    expect(hasDuplicateFeedback([undoCopy], 'undo')).toBe(true);
  });

  it('does not confuse regular rejection with undo', () => {
    const regularRejection: DecisionEvent = {
      id: 'reject-copy-1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      actioned_at: new Date().toISOString(),
      status: 'rejected',
      decision_payload: {},
      is_feedback_copy: true,
      // No notes - this is a regular rejection
    };
    
    // Regular rejection should NOT be detected as duplicate undo
    expect(hasDuplicateFeedback([regularRejection], 'undo')).toBe(false);
  });

  it('undo outside idempotency window is not duplicate', () => {
    const oldUndo: DecisionEvent = {
      id: 'undo-copy-1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      actioned_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
      status: 'rejected',
      decision_payload: {},
      is_feedback_copy: true,
      notes: 'undo_autopilot',
    };
    
    expect(hasDuplicateFeedback([oldUndo], 'undo')).toBe(false);
  });
});
