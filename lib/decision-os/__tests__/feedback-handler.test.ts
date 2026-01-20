import {
  createFeedbackCopy,
  hasDuplicateFeedback,
  processFeedback,
  shouldRunConsumption,
  shouldUpdateTasteGraph,
  getTasteGraphWeight,
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
});
