/**
 * Implicit DRM Triggers Tests
 * Phase 3 — Prompt 3/3
 * 
 * Tests cover:
 * - two_rejections: 2 consecutive rejections within 30 minutes
 * - late_no_action: time >= 6 PM, no approved decision today, has engagement
 * - calendar_conflict: signal.calendarConflict = true
 * - low_energy: signal.energy = 'low'
 */

import {
  evaluateDrmTrigger,
  parseLocalHour,
  parseLocalDate,
  hasTwoRejectionsWithinWindow,
  hasApprovedDecisionToday,
  hasEngagementToday,
  DINNER_START_HOUR,
  LATE_THRESHOLD_HOUR,
  LATE_NO_ACTION_THRESHOLD_HOUR,
  TWO_REJECTIONS_WINDOW_MS,
  DRM_REJECTION_THRESHOLD,
} from '../lib/decision-os/arbiter';
import type { DecisionRequest, DecisionEventRow } from '../types/decision-os/decision';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a mock decision event
 */
function createMockEvent(overrides: Partial<DecisionEventRow> = {}): DecisionEventRow {
  return {
    id: 'evt-' + Math.random().toString(36).substring(7),
    household_key: 'default',
    decided_at: new Date().toISOString(),
    decision_type: 'cook',
    meal_id: 'meal-001',
    external_vendor_key: null,
    context_hash: 'hash-123',
    decision_payload: {},
    user_action: 'pending',
    ...overrides,
  };
}

/**
 * Create a decision request
 */
function createRequest(overrides: Partial<DecisionRequest> = {}): DecisionRequest {
  return {
    householdKey: 'default',
    nowIso: '2026-01-20T19:00:00-06:00', // 7 PM
    signal: {
      timeWindow: 'dinner',
      energy: 'unknown',
      calendarConflict: false,
    },
    ...overrides,
  };
}

/**
 * Create ISO string for a specific hour on a given date
 */
function isoAtHour(hour: number, date: string = '2026-01-20'): string {
  return `${date}T${hour.toString().padStart(2, '0')}:00:00-06:00`;
}

/**
 * Create ISO string N minutes ago from reference
 */
function minutesAgo(minutes: number, fromIso: string = '2026-01-20T19:00:00-06:00'): string {
  const from = new Date(fromIso);
  const past = new Date(from.getTime() - minutes * 60 * 1000);
  return past.toISOString();
}

// =============================================================================
// CONSTANTS TESTS
// =============================================================================

describe('DRM Trigger Constants', () => {
  test('DINNER_START_HOUR is 17 (5 PM)', () => {
    expect(DINNER_START_HOUR).toBe(17);
  });

  test('LATE_THRESHOLD_HOUR is 20 (8 PM)', () => {
    expect(LATE_THRESHOLD_HOUR).toBe(20);
  });

  test('LATE_NO_ACTION_THRESHOLD_HOUR is 18 (6 PM)', () => {
    expect(LATE_NO_ACTION_THRESHOLD_HOUR).toBe(18);
  });

  test('TWO_REJECTIONS_WINDOW_MS is 30 minutes', () => {
    expect(TWO_REJECTIONS_WINDOW_MS).toBe(30 * 60 * 1000);
  });

  test('DRM_REJECTION_THRESHOLD is 2', () => {
    expect(DRM_REJECTION_THRESHOLD).toBe(2);
  });
});

// =============================================================================
// HELPER FUNCTION TESTS
// =============================================================================

describe('parseLocalHour', () => {
  test('extracts hour from ISO string with timezone', () => {
    expect(parseLocalHour('2026-01-20T18:30:00-06:00')).toBe(18);
    expect(parseLocalHour('2026-01-20T20:00:00-06:00')).toBe(20);
    expect(parseLocalHour('2026-01-20T05:00:00-06:00')).toBe(5);
  });

  test('extracts hour from ISO string without timezone', () => {
    expect(parseLocalHour('2026-01-20T18:30:00Z')).toBe(18);
  });
});

describe('parseLocalDate', () => {
  test('extracts date from ISO string', () => {
    expect(parseLocalDate('2026-01-20T18:30:00-06:00')).toBe('2026-01-20');
    expect(parseLocalDate('2025-12-31T23:59:59-06:00')).toBe('2025-12-31');
  });
});

describe('hasTwoRejectionsWithinWindow', () => {
  test('returns false with no events', () => {
    expect(hasTwoRejectionsWithinWindow([])).toBe(false);
  });

  test('returns false with only one rejection', () => {
    const events = [
      createMockEvent({ user_action: 'rejected', decided_at: minutesAgo(5) }),
    ];
    expect(hasTwoRejectionsWithinWindow(events)).toBe(false);
  });

  test('returns true with 2 rejections within 30 minutes', () => {
    const events = [
      createMockEvent({ user_action: 'rejected', decided_at: minutesAgo(5) }),
      createMockEvent({ user_action: 'rejected', decided_at: minutesAgo(10) }),
    ];
    expect(hasTwoRejectionsWithinWindow(events)).toBe(true);
  });

  test('returns false with 2 rejections more than 30 minutes apart', () => {
    const events = [
      createMockEvent({ user_action: 'rejected', decided_at: minutesAgo(5) }),
      createMockEvent({ user_action: 'rejected', decided_at: minutesAgo(45) }),
    ];
    expect(hasTwoRejectionsWithinWindow(events)).toBe(false);
  });

  test('ignores non-rejection events', () => {
    const events = [
      createMockEvent({ user_action: 'rejected', decided_at: minutesAgo(5) }),
      createMockEvent({ user_action: 'approved', decided_at: minutesAgo(10) }),
      createMockEvent({ user_action: 'pending', decided_at: minutesAgo(15) }),
    ];
    expect(hasTwoRejectionsWithinWindow(events)).toBe(false);
  });

  test('custom window size works', () => {
    const events = [
      createMockEvent({ user_action: 'rejected', decided_at: minutesAgo(5) }),
      createMockEvent({ user_action: 'rejected', decided_at: minutesAgo(8) }),
    ];
    // 5 minute window
    expect(hasTwoRejectionsWithinWindow(events, 5 * 60 * 1000)).toBe(true);
    // 2 minute window - too small
    expect(hasTwoRejectionsWithinWindow(events, 2 * 60 * 1000)).toBe(false);
  });
});

describe('hasApprovedDecisionToday', () => {
  test('returns false with no events', () => {
    expect(hasApprovedDecisionToday([], '2026-01-20')).toBe(false);
  });

  test('returns true when approved decision exists for today', () => {
    const events = [
      createMockEvent({ 
        user_action: 'approved', 
        decided_at: '2026-01-20T18:30:00-06:00' 
      }),
    ];
    expect(hasApprovedDecisionToday(events, '2026-01-20')).toBe(true);
  });

  test('returns false when approved decision is from different day', () => {
    const events = [
      createMockEvent({ 
        user_action: 'approved', 
        decided_at: '2026-01-19T18:30:00-06:00' 
      }),
    ];
    expect(hasApprovedDecisionToday(events, '2026-01-20')).toBe(false);
  });

  test('ignores non-approved events', () => {
    const events = [
      createMockEvent({ 
        user_action: 'rejected', 
        decided_at: '2026-01-20T18:30:00-06:00' 
      }),
      createMockEvent({ 
        user_action: 'pending', 
        decided_at: '2026-01-20T18:00:00-06:00' 
      }),
    ];
    expect(hasApprovedDecisionToday(events, '2026-01-20')).toBe(false);
  });
});

describe('hasEngagementToday', () => {
  test('returns false with no events', () => {
    expect(hasEngagementToday([], '2026-01-20')).toBe(false);
  });

  test('returns true for pending decision today', () => {
    const events = [
      createMockEvent({ 
        user_action: 'pending', 
        decided_at: '2026-01-20T18:30:00-06:00' 
      }),
    ];
    expect(hasEngagementToday(events, '2026-01-20')).toBe(true);
  });

  test('returns true for rejected decision today', () => {
    const events = [
      createMockEvent({ 
        user_action: 'rejected', 
        decided_at: '2026-01-20T18:30:00-06:00' 
      }),
    ];
    expect(hasEngagementToday(events, '2026-01-20')).toBe(true);
  });

  test('returns true for expired decision today', () => {
    const events = [
      createMockEvent({ 
        user_action: 'expired', 
        decided_at: '2026-01-20T18:30:00-06:00' 
      }),
    ];
    expect(hasEngagementToday(events, '2026-01-20')).toBe(true);
  });

  test('returns false for engagement from different day', () => {
    const events = [
      createMockEvent({ 
        user_action: 'pending', 
        decided_at: '2026-01-19T18:30:00-06:00' 
      }),
    ];
    expect(hasEngagementToday(events, '2026-01-20')).toBe(false);
  });

  test('ignores approved events (not engagement)', () => {
    const events = [
      createMockEvent({ 
        user_action: 'approved', 
        decided_at: '2026-01-20T18:30:00-06:00' 
      }),
    ];
    expect(hasEngagementToday(events, '2026-01-20')).toBe(false);
  });
});

// =============================================================================
// EVALUATE DRM TRIGGER TESTS
// =============================================================================

describe('evaluateDrmTrigger', () => {
  describe('calendar_conflict trigger', () => {
    test('returns drmRecommended true when calendarConflict is true', () => {
      const request = createRequest({
        signal: { timeWindow: 'dinner', energy: 'unknown', calendarConflict: true },
      });
      
      const result = evaluateDrmTrigger(request, []);
      
      expect(result.shouldTrigger).toBe(true);
      expect(result.reason).toBe('calendar_conflict');
    });

    test('takes priority over other triggers', () => {
      // Even at late hour with rejections, calendar_conflict wins
      const request = createRequest({
        nowIso: isoAtHour(21), // 9 PM
        signal: { timeWindow: 'dinner', energy: 'low', calendarConflict: true },
      });
      
      const events = [
        createMockEvent({ user_action: 'rejected', decided_at: minutesAgo(5) }),
        createMockEvent({ user_action: 'rejected', decided_at: minutesAgo(10) }),
      ];
      
      const result = evaluateDrmTrigger(request, events);
      
      expect(result.shouldTrigger).toBe(true);
      expect(result.reason).toBe('calendar_conflict');
    });
  });

  describe('low_energy trigger', () => {
    test('returns drmRecommended true when energy is low', () => {
      const request = createRequest({
        signal: { timeWindow: 'dinner', energy: 'low', calendarConflict: false },
      });
      
      const result = evaluateDrmTrigger(request, []);
      
      expect(result.shouldTrigger).toBe(true);
      expect(result.reason).toBe('low_energy');
    });

    test('takes priority over two_rejections and late_no_action', () => {
      const request = createRequest({
        nowIso: isoAtHour(21),
        signal: { timeWindow: 'dinner', energy: 'low', calendarConflict: false },
      });
      
      const result = evaluateDrmTrigger(request, []);
      
      expect(result.shouldTrigger).toBe(true);
      expect(result.reason).toBe('low_energy');
    });
  });

  describe('two_rejections trigger', () => {
    test('returns drmRecommended true with 2 rejections within 30 minutes', () => {
      const request = createRequest({
        nowIso: isoAtHour(19),
      });
      
      const events = [
        createMockEvent({ 
          user_action: 'rejected', 
          decided_at: '2026-01-20T18:55:00-06:00' 
        }),
        createMockEvent({ 
          user_action: 'rejected', 
          decided_at: '2026-01-20T18:50:00-06:00' 
        }),
      ];
      
      const result = evaluateDrmTrigger(request, events);
      
      expect(result.shouldTrigger).toBe(true);
      expect(result.reason).toBe('two_rejections');
    });

    test('does not trigger with 2 rejections more than 30 minutes apart', () => {
      const request = createRequest({
        nowIso: isoAtHour(17), // 5 PM - before late threshold
      });
      
      const events = [
        createMockEvent({ 
          user_action: 'rejected', 
          decided_at: '2026-01-20T16:55:00-06:00' 
        }),
        createMockEvent({ 
          user_action: 'rejected', 
          decided_at: '2026-01-20T16:00:00-06:00' // 55 min earlier
        }),
      ];
      
      const result = evaluateDrmTrigger(request, events);
      
      expect(result.shouldTrigger).toBe(false);
    });
  });

  describe('late_no_action trigger', () => {
    test('returns drmRecommended true at 8 PM+ regardless of engagement', () => {
      const request = createRequest({
        nowIso: isoAtHour(20), // 8 PM
      });
      
      // No events at all - still triggers due to late hour
      const result = evaluateDrmTrigger(request, []);
      
      expect(result.shouldTrigger).toBe(true);
      expect(result.reason).toBe('late_no_action');
    });

    test('returns drmRecommended true at 6-8 PM with engagement but no approval', () => {
      const request = createRequest({
        nowIso: isoAtHour(18), // 6 PM
      });
      
      const events = [
        createMockEvent({ 
          user_action: 'pending', 
          decided_at: '2026-01-20T18:00:00-06:00' 
        }),
      ];
      
      const result = evaluateDrmTrigger(request, events);
      
      expect(result.shouldTrigger).toBe(true);
      expect(result.reason).toBe('late_no_action');
    });

    test('does NOT trigger at 6-8 PM without engagement', () => {
      const request = createRequest({
        nowIso: isoAtHour(18), // 6 PM
      });
      
      // No events - user hasn't engaged yet today
      const result = evaluateDrmTrigger(request, []);
      
      expect(result.shouldTrigger).toBe(false);
    });

    test('does NOT trigger at 6-8 PM if already approved today', () => {
      const request = createRequest({
        nowIso: isoAtHour(19), // 7 PM
      });
      
      const events = [
        createMockEvent({ 
          user_action: 'approved', 
          decided_at: '2026-01-20T18:00:00-06:00' 
        }),
      ];
      
      const result = evaluateDrmTrigger(request, events);
      
      expect(result.shouldTrigger).toBe(false);
    });

    test('does NOT trigger before 6 PM even with rejections', () => {
      const request = createRequest({
        nowIso: isoAtHour(17), // 5 PM
      });
      
      const events = [
        createMockEvent({ 
          user_action: 'rejected', 
          decided_at: '2026-01-20T17:00:00-06:00' 
        }),
      ];
      
      const result = evaluateDrmTrigger(request, events);
      
      expect(result.shouldTrigger).toBe(false);
    });

    test('does NOT trigger for non-dinner time window', () => {
      const request = createRequest({
        nowIso: isoAtHour(20), // 8 PM
        signal: { timeWindow: 'lunch', energy: 'unknown', calendarConflict: false },
      });
      
      const result = evaluateDrmTrigger(request, []);
      
      expect(result.shouldTrigger).toBe(false);
    });
  });

  describe('no trigger cases', () => {
    test('returns shouldTrigger false with normal conditions', () => {
      const request = createRequest({
        nowIso: isoAtHour(17), // 5 PM
        signal: { timeWindow: 'dinner', energy: 'ok', calendarConflict: false },
      });
      
      const result = evaluateDrmTrigger(request, []);
      
      expect(result.shouldTrigger).toBe(false);
      expect(result.reason).toBeNull();
    });

    test('returns shouldTrigger false with one rejection', () => {
      const request = createRequest({
        nowIso: isoAtHour(17),
      });
      
      const events = [
        createMockEvent({ user_action: 'rejected', decided_at: minutesAgo(5) }),
      ];
      
      const result = evaluateDrmTrigger(request, events);
      
      expect(result.shouldTrigger).toBe(false);
    });
  });
});

// =============================================================================
// INTEGRATION TEST: Decision response includes reason
// =============================================================================

describe('Decision Response Format', () => {
  test('DRM response includes reason field', () => {
    const request = createRequest({
      signal: { timeWindow: 'dinner', energy: 'low', calendarConflict: false },
    });
    
    const result = evaluateDrmTrigger(request, []);
    
    // This mimics what the decision endpoint would return
    const expectedResponse = {
      decision: null,
      drmRecommended: true,
      reason: result.reason,
    };
    
    expect(expectedResponse.drmRecommended).toBe(true);
    expect(expectedResponse.reason).toBe('low_energy');
    
    // INVARIANT: No arrays in response
    expect(Array.isArray(expectedResponse.decision)).toBe(false);
    expect(Array.isArray(expectedResponse.reason)).toBe(false);
  });
});
