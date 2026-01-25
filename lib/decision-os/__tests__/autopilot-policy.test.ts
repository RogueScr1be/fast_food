import {
  parseLocalDate,
  getWindowDates,
  getEventTimestamp,
  computeApprovalRate,
  shouldAutopilot,
  checkAutopilotEligibility,
  hasRecentUndo,
  isUndoEvent,
  DEFAULT_AUTOPILOT_CONFIG,
  RECENT_UNDO_WINDOW_HOURS,
} from '../autopilot/policy';
import { NOTES } from '../feedback/handler';
import type { DecisionEvent } from '../../../types/decision-os';

/**
 * Helper to create a schema-true event
 */
function createEvent(overrides: Partial<DecisionEvent> = {}): DecisionEvent {
  return {
    id: 'event-1',
    user_profile_id: 1,
    decided_at: '2026-01-20T10:00:00Z',
    decision_payload: {},
    ...overrides,
  };
}

describe('parseLocalDate', () => {
  it('extracts YYYY-MM-DD from ISO string with Z timezone', () => {
    expect(parseLocalDate('2026-01-20T15:30:00.000Z')).toBe('2026-01-20');
  });

  it('extracts YYYY-MM-DD from ISO string with offset timezone', () => {
    expect(parseLocalDate('2026-01-20T23:30:00-06:00')).toBe('2026-01-20');
  });

  it('extracts literal date from UTC string (no timezone conversion)', () => {
    expect(parseLocalDate('2026-01-21T04:30:00Z')).toBe('2026-01-21');
  });

  it('handles date-only strings', () => {
    expect(parseLocalDate('2026-01-20')).toBe('2026-01-20');
  });

  it('handles midnight UTC correctly', () => {
    expect(parseLocalDate('2026-01-20T00:00:00.000Z')).toBe('2026-01-20');
  });

  it('handles late night timestamps near midnight', () => {
    expect(parseLocalDate('2026-01-20T23:59:59.000Z')).toBe('2026-01-20');
  });

  it('handles timestamps with positive offset', () => {
    expect(parseLocalDate('2026-01-20T23:30:00+05:30')).toBe('2026-01-20');
  });

  it('throws for invalid format - missing dashes', () => {
    expect(() => parseLocalDate('20260120')).toThrow('Invalid ISO date format');
  });

  it('throws for invalid format - wrong order', () => {
    expect(() => parseLocalDate('20-01-2026')).toThrow('Invalid ISO date format');
  });

  it('throws for empty string', () => {
    expect(() => parseLocalDate('')).toThrow('Invalid ISO date format');
  });

  it('throws for non-date string', () => {
    expect(() => parseLocalDate('not-a-date')).toThrow('Invalid ISO date format');
  });
});

describe('getWindowDates', () => {
  it('returns 7 dates by default', () => {
    const dates = getWindowDates(7, new Date('2026-01-20T12:00:00'));
    expect(dates.size).toBe(7);
  });

  it('includes today as the first date', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const dates = getWindowDates(7, refDate);
    expect(dates.has('2026-01-20')).toBe(true);
  });

  it('includes dates going back windowDays-1 days', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const dates = getWindowDates(7, refDate);
    
    expect(dates.has('2026-01-20')).toBe(true);
    expect(dates.has('2026-01-19')).toBe(true);
    expect(dates.has('2026-01-14')).toBe(true);
    expect(dates.has('2026-01-13')).toBe(false);
  });

  it('handles month boundaries correctly', () => {
    const refDate = new Date('2026-02-03T12:00:00');
    const dates = getWindowDates(7, refDate);
    
    expect(dates.has('2026-02-03')).toBe(true);
    expect(dates.has('2026-01-28')).toBe(true);
  });
});

describe('getEventTimestamp', () => {
  it('returns actioned_at when present', () => {
    const event = createEvent({
      decided_at: '2026-01-19T10:00:00Z',
      actioned_at: '2026-01-20T15:00:00Z',
    });
    
    expect(getEventTimestamp(event)).toBe('2026-01-20T15:00:00Z');
  });

  it('returns decided_at when actioned_at is absent', () => {
    const event = createEvent({
      decided_at: '2026-01-19T10:00:00Z',
    });
    
    expect(getEventTimestamp(event)).toBe('2026-01-19T10:00:00Z');
  });
});

describe('isUndoEvent', () => {
  it('returns true for undo events', () => {
    const event = createEvent({
      user_action: 'rejected',
      notes: NOTES.UNDO_AUTOPILOT,
    });
    
    expect(isUndoEvent(event)).toBe(true);
  });

  it('returns false for regular rejection', () => {
    const event = createEvent({
      user_action: 'rejected',
    });
    
    expect(isUndoEvent(event)).toBe(false);
  });
});

describe('hasRecentUndo', () => {
  it('returns true when undo exists within 72h window', () => {
    const now = new Date('2026-01-20T12:00:00');
    const undoEvent = createEvent({
      id: 'undo-1',
      user_action: 'rejected',
      notes: NOTES.UNDO_AUTOPILOT,
      actioned_at: '2026-01-18T12:00:00Z', // 2 days ago (within 72h)
    });
    
    expect(hasRecentUndo([undoEvent], RECENT_UNDO_WINDOW_HOURS, now)).toBe(true);
  });

  it('returns false when undo is older than 72h', () => {
    const now = new Date('2026-01-20T12:00:00');
    const oldUndoEvent = createEvent({
      id: 'undo-1',
      user_action: 'rejected',
      notes: NOTES.UNDO_AUTOPILOT,
      actioned_at: '2026-01-16T11:59:00Z', // Just over 72h ago
    });
    
    expect(hasRecentUndo([oldUndoEvent], RECENT_UNDO_WINDOW_HOURS, now)).toBe(false);
  });

  it('returns false when no undo events exist', () => {
    const now = new Date('2026-01-20T12:00:00');
    const regularEvent = createEvent({
      id: 'event-1',
      user_action: 'rejected',
      actioned_at: '2026-01-19T12:00:00Z',
    });
    
    expect(hasRecentUndo([regularEvent], RECENT_UNDO_WINDOW_HOURS, now)).toBe(false);
  });
});

describe('computeApprovalRate', () => {
  it('returns 1.0 rate with eligible=false when no events', () => {
    const result = computeApprovalRate([]);
    
    expect(result.rate).toBe(1.0);
    expect(result.total).toBe(0);
    expect(result.eligible).toBe(false);
  });

  it('counts only approved and rejected user_actions', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent({ id: '1', user_action: 'approved', actioned_at: '2026-01-20T10:00:00Z' }),
      createEvent({ id: '2', user_action: 'rejected', actioned_at: '2026-01-20T11:00:00Z' }),
      createEvent({ id: '3', user_action: 'drm_triggered', actioned_at: '2026-01-20T12:00:00Z' }),
    ];
    
    const result = computeApprovalRate(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    expect(result.approved).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.total).toBe(2);
    expect(result.rate).toBe(0.5);
  });

  it('EXCLUDES undo events from approval rate calculation', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent({ id: '1', user_action: 'approved', actioned_at: '2026-01-20T10:00:00Z' }),
      createEvent({ id: '2', user_action: 'approved', actioned_at: '2026-01-19T10:00:00Z' }),
      createEvent({ id: '3', user_action: 'approved', actioned_at: '2026-01-18T10:00:00Z' }),
      createEvent({ id: '4', user_action: 'approved', actioned_at: '2026-01-17T10:00:00Z' }),
      createEvent({ id: '5', user_action: 'approved', actioned_at: '2026-01-16T10:00:00Z' }),
      // This undo should NOT count as a rejection
      createEvent({
        id: 'undo-1',
        user_action: 'rejected',
        notes: NOTES.UNDO_AUTOPILOT,
        actioned_at: '2026-01-15T10:00:00Z',
      }),
    ];
    
    const result = computeApprovalRate(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    // Undo is excluded, so 5 approved, 0 rejected
    expect(result.approved).toBe(5);
    expect(result.rejected).toBe(0);
    expect(result.total).toBe(5);
    expect(result.rate).toBe(1.0); // 100% approval (undo doesn't count)
    expect(result.eligible).toBe(true);
  });

  it('uses actioned_at for windowing when present', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    
    const eventInWindow = createEvent({
      id: '1',
      user_action: 'approved',
      decided_at: '2026-01-10T10:00:00Z',
      actioned_at: '2026-01-20T10:00:00Z', // Within window
    });
    
    const eventOutWindow = createEvent({
      id: '2',
      user_action: 'approved',
      decided_at: '2026-01-20T10:00:00Z',
      actioned_at: '2026-01-10T10:00:00Z', // Outside window
    });
    
    const result1 = computeApprovalRate([eventInWindow], DEFAULT_AUTOPILOT_CONFIG, refDate);
    expect(result1.approved).toBe(1);
    
    const result2 = computeApprovalRate([eventOutWindow], DEFAULT_AUTOPILOT_CONFIG, refDate);
    expect(result2.approved).toBe(0);
  });

  it('calculates correct approval rate', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent({ id: '1', user_action: 'approved', actioned_at: '2026-01-20T10:00:00Z' }),
      createEvent({ id: '2', user_action: 'approved', actioned_at: '2026-01-19T10:00:00Z' }),
      createEvent({ id: '3', user_action: 'approved', actioned_at: '2026-01-18T10:00:00Z' }),
      createEvent({ id: '4', user_action: 'approved', actioned_at: '2026-01-17T10:00:00Z' }),
      createEvent({ id: '5', user_action: 'rejected', actioned_at: '2026-01-16T10:00:00Z' }),
    ];
    
    const result = computeApprovalRate(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    expect(result.approved).toBe(4);
    expect(result.rejected).toBe(1);
    expect(result.total).toBe(5);
    expect(result.rate).toBe(0.8);
    expect(result.eligible).toBe(true);
  });

  it('returns eligible=false when below min decisions', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent({ id: '1', user_action: 'approved', actioned_at: '2026-01-20T10:00:00Z' }),
      createEvent({ id: '2', user_action: 'approved', actioned_at: '2026-01-19T10:00:00Z' }),
    ];
    
    const result = computeApprovalRate(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    expect(result.total).toBe(2);
    expect(result.rate).toBe(1.0);
    expect(result.eligible).toBe(false);
  });

  it('returns eligible=false when below min approval rate', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent({ id: '1', user_action: 'approved', actioned_at: '2026-01-20T10:00:00Z' }),
      createEvent({ id: '2', user_action: 'approved', actioned_at: '2026-01-19T10:00:00Z' }),
      createEvent({ id: '3', user_action: 'rejected', actioned_at: '2026-01-18T10:00:00Z' }),
      createEvent({ id: '4', user_action: 'rejected', actioned_at: '2026-01-17T10:00:00Z' }),
      createEvent({ id: '5', user_action: 'rejected', actioned_at: '2026-01-16T10:00:00Z' }),
    ];
    
    const result = computeApprovalRate(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    expect(result.total).toBe(5);
    expect(result.rate).toBe(0.4);
    expect(result.eligible).toBe(false);
  });
});

describe('checkAutopilotEligibility', () => {
  it('returns disabled when config.enabled is false', () => {
    const config = { ...DEFAULT_AUTOPILOT_CONFIG, enabled: false };
    
    const result = checkAutopilotEligibility([], config);
    
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('disabled');
  });

  it('returns recent_undo when undo within 72h', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      // 5 approvals to meet threshold
      createEvent({ id: '1', user_action: 'approved', actioned_at: '2026-01-20T10:00:00Z' }),
      createEvent({ id: '2', user_action: 'approved', actioned_at: '2026-01-19T10:00:00Z' }),
      createEvent({ id: '3', user_action: 'approved', actioned_at: '2026-01-18T10:00:00Z' }),
      createEvent({ id: '4', user_action: 'approved', actioned_at: '2026-01-17T10:00:00Z' }),
      createEvent({ id: '5', user_action: 'approved', actioned_at: '2026-01-16T10:00:00Z' }),
      // Recent undo should block autopilot
      createEvent({
        id: 'undo-1',
        user_action: 'rejected',
        notes: NOTES.UNDO_AUTOPILOT,
        actioned_at: '2026-01-19T12:00:00Z', // 1 day ago (within 72h)
      }),
    ];
    
    const result = checkAutopilotEligibility(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('recent_undo');
  });

  it('returns insufficient_decisions when below minDecisions', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent({ id: '1', user_action: 'approved', actioned_at: '2026-01-20T10:00:00Z' }),
    ];
    
    const result = checkAutopilotEligibility(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('insufficient_decisions');
  });

  it('returns low_approval_rate when below minApprovalRate', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent({ id: '1', user_action: 'approved', actioned_at: '2026-01-20T10:00:00Z' }),
      createEvent({ id: '2', user_action: 'rejected', actioned_at: '2026-01-19T10:00:00Z' }),
      createEvent({ id: '3', user_action: 'rejected', actioned_at: '2026-01-18T10:00:00Z' }),
      createEvent({ id: '4', user_action: 'rejected', actioned_at: '2026-01-17T10:00:00Z' }),
      createEvent({ id: '5', user_action: 'rejected', actioned_at: '2026-01-16T10:00:00Z' }),
    ];
    
    const result = checkAutopilotEligibility(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('low_approval_rate');
  });

  it('returns enabled when all criteria met', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent({ id: '1', user_action: 'approved', actioned_at: '2026-01-20T10:00:00Z' }),
      createEvent({ id: '2', user_action: 'approved', actioned_at: '2026-01-19T10:00:00Z' }),
      createEvent({ id: '3', user_action: 'approved', actioned_at: '2026-01-18T10:00:00Z' }),
      createEvent({ id: '4', user_action: 'approved', actioned_at: '2026-01-17T10:00:00Z' }),
      createEvent({ id: '5', user_action: 'approved', actioned_at: '2026-01-16T10:00:00Z' }),
    ];
    
    const result = checkAutopilotEligibility(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('enabled');
  });

  it('undo older than 72h does not block autopilot', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent({ id: '1', user_action: 'approved', actioned_at: '2026-01-20T10:00:00Z' }),
      createEvent({ id: '2', user_action: 'approved', actioned_at: '2026-01-19T10:00:00Z' }),
      createEvent({ id: '3', user_action: 'approved', actioned_at: '2026-01-18T10:00:00Z' }),
      createEvent({ id: '4', user_action: 'approved', actioned_at: '2026-01-17T10:00:00Z' }),
      createEvent({ id: '5', user_action: 'approved', actioned_at: '2026-01-16T10:00:00Z' }),
      // Old undo (4 days ago) - should NOT block
      createEvent({
        id: 'undo-1',
        user_action: 'rejected',
        notes: NOTES.UNDO_AUTOPILOT,
        actioned_at: '2026-01-16T11:59:00Z', // Just over 72h ago
      }),
    ];
    
    const result = checkAutopilotEligibility(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('enabled');
  });
});

describe('shouldAutopilot', () => {
  it('returns false when autopilot is disabled', () => {
    const config = { ...DEFAULT_AUTOPILOT_CONFIG, enabled: false };
    expect(shouldAutopilot([], config)).toBe(false);
  });

  it('returns true when eligible', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent({ id: '1', user_action: 'approved', actioned_at: '2026-01-20T10:00:00Z' }),
      createEvent({ id: '2', user_action: 'approved', actioned_at: '2026-01-19T10:00:00Z' }),
      createEvent({ id: '3', user_action: 'approved', actioned_at: '2026-01-18T10:00:00Z' }),
      createEvent({ id: '4', user_action: 'approved', actioned_at: '2026-01-17T10:00:00Z' }),
      createEvent({ id: '5', user_action: 'approved', actioned_at: '2026-01-16T10:00:00Z' }),
    ];
    
    expect(shouldAutopilot(events, DEFAULT_AUTOPILOT_CONFIG, refDate)).toBe(true);
  });

  it('returns false when not enough decisions', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent({ id: '1', user_action: 'approved', actioned_at: '2026-01-20T10:00:00Z' }),
    ];
    
    expect(shouldAutopilot(events, DEFAULT_AUTOPILOT_CONFIG, refDate)).toBe(false);
  });

  it('returns false when recent undo exists', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent({ id: '1', user_action: 'approved', actioned_at: '2026-01-20T10:00:00Z' }),
      createEvent({ id: '2', user_action: 'approved', actioned_at: '2026-01-19T10:00:00Z' }),
      createEvent({ id: '3', user_action: 'approved', actioned_at: '2026-01-18T10:00:00Z' }),
      createEvent({ id: '4', user_action: 'approved', actioned_at: '2026-01-17T10:00:00Z' }),
      createEvent({ id: '5', user_action: 'approved', actioned_at: '2026-01-16T10:00:00Z' }),
      createEvent({
        id: 'undo-1',
        user_action: 'rejected',
        notes: NOTES.UNDO_AUTOPILOT,
        actioned_at: '2026-01-19T12:00:00Z',
      }),
    ];
    
    expect(shouldAutopilot(events, DEFAULT_AUTOPILOT_CONFIG, refDate)).toBe(false);
  });
});
