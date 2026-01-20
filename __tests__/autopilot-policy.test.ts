/**
 * FAST FOOD: Autopilot Policy Tests
 * 
 * Tests for the Earned Autonomy autopilot eligibility policy.
 * 
 * ALL gates must pass for autopilot eligibility:
 * 1. Local time between 17:00 and 18:15
 * 2. calendarConflict === false
 * 3. energy !== 'low'
 * 4. inventoryScore >= 0.85
 * 5. tasteScore >= 0.70
 * 6. Meal not used in last 3 local days
 * 7. Last 7 days approval rate >= 0.70
 * 8. No rejection in last 24 hours
 */

import {
  evaluateAutopilotEligibility,
  parseLocalTime,
  parseLocalDate,
  isWithinAutopilotWindow,
  computeApprovalRate,
  hasRecentRejection,
  wasMealUsedRecently,
  AUTOPILOT_START_HOUR,
  AUTOPILOT_START_MINUTE,
  AUTOPILOT_END_HOUR,
  AUTOPILOT_END_MINUTE,
  MIN_INVENTORY_SCORE,
  MIN_TASTE_SCORE,
  MIN_APPROVAL_RATE,
  APPROVAL_RATE_WINDOW_DAYS,
  RECENTLY_USED_WINDOW_DAYS,
  RECENT_REJECTION_WINDOW_HOURS,
  type AutopilotContext,
} from '../lib/decision-os/autopilot/policy';
import type { DecisionEventRow } from '../types/decision-os/decision';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createDecisionEvent(
  id: string,
  mealId: string,
  userAction: 'pending' | 'approved' | 'rejected' | 'drm_triggered' | 'expired',
  decidedAt: string,
  actionedAt?: string
): DecisionEventRow {
  return {
    id,
    household_key: 'default',
    decided_at: decidedAt,
    decision_type: 'cook',
    meal_id: mealId,
    external_vendor_key: null,
    context_hash: 'ctx-' + id,
    decision_payload: {},
    user_action: userAction,
    actioned_at: actionedAt || null,
  };
}

function createEligibleContext(): AutopilotContext {
  // Create a context that passes all gates
  return {
    nowIso: '2026-01-20T17:30:00Z', // Within window (17:00-18:15)
    signal: {
      timeWindow: 'prime',
      energy: 'normal',
      calendarConflict: false,
    },
    mealId: 'meal-chicken',
    inventoryScore: 0.90, // >= 0.85
    tasteScore: 0.75, // >= 0.70
    usedInLast3Days: false,
    recentEvents: [
      // 80% approval rate in last 7 days
      createDecisionEvent('ev1', 'meal-1', 'approved', '2026-01-18T18:00:00Z'),
      createDecisionEvent('ev2', 'meal-2', 'approved', '2026-01-17T18:00:00Z'),
      createDecisionEvent('ev3', 'meal-3', 'approved', '2026-01-16T18:00:00Z'),
      createDecisionEvent('ev4', 'meal-4', 'approved', '2026-01-15T18:00:00Z'),
      createDecisionEvent('ev5', 'meal-5', 'rejected', '2026-01-14T18:00:00Z'),
    ],
  };
}

// =============================================================================
// LOCAL TIME PARSING TESTS
// =============================================================================

describe('Local Time Parsing', () => {
  test('parses hour and minute from ISO timestamp with timezone', () => {
    const result = parseLocalTime('2026-01-20T17:30:45-06:00');
    expect(result.hour).toBe(17);
    expect(result.minute).toBe(30);
  });

  test('parses hour and minute from ISO timestamp with Z suffix', () => {
    const result = parseLocalTime('2026-01-20T18:15:00Z');
    expect(result.hour).toBe(18);
    expect(result.minute).toBe(15);
  });

  test('parses hour and minute from ISO timestamp without suffix', () => {
    const result = parseLocalTime('2026-01-20T05:00:00');
    expect(result.hour).toBe(5);
    expect(result.minute).toBe(0);
  });

  test('returns zeros for invalid format', () => {
    const result = parseLocalTime('invalid-timestamp');
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
  });

  test('handles midnight correctly', () => {
    const result = parseLocalTime('2026-01-20T00:00:00Z');
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
  });

  test('handles single-digit hour strings correctly', () => {
    const result = parseLocalTime('2026-01-20T09:05:00Z');
    expect(result.hour).toBe(9);
    expect(result.minute).toBe(5);
  });
});

describe('Local Date Parsing', () => {
  test('extracts date from ISO timestamp', () => {
    expect(parseLocalDate('2026-01-20T17:30:00Z')).toBe('2026-01-20');
  });

  test('extracts date from timestamp with timezone', () => {
    expect(parseLocalDate('2026-01-20T17:30:00-06:00')).toBe('2026-01-20');
  });

  test('returns empty string for invalid format', () => {
    expect(parseLocalDate('invalid')).toBe('');
  });
});

// =============================================================================
// AUTOPILOT WINDOW TESTS
// =============================================================================

describe('Autopilot Window', () => {
  test('window constants are correct', () => {
    expect(AUTOPILOT_START_HOUR).toBe(17);
    expect(AUTOPILOT_START_MINUTE).toBe(0);
    expect(AUTOPILOT_END_HOUR).toBe(18);
    expect(AUTOPILOT_END_MINUTE).toBe(15);
  });

  test('17:00 is within window (start)', () => {
    expect(isWithinAutopilotWindow(17, 0)).toBe(true);
  });

  test('18:15 is within window (end)', () => {
    expect(isWithinAutopilotWindow(18, 15)).toBe(true);
  });

  test('17:30 is within window (middle)', () => {
    expect(isWithinAutopilotWindow(17, 30)).toBe(true);
  });

  test('16:59 is outside window (too early)', () => {
    expect(isWithinAutopilotWindow(16, 59)).toBe(false);
  });

  test('18:16 is outside window (too late)', () => {
    expect(isWithinAutopilotWindow(18, 16)).toBe(false);
  });

  test('12:00 (noon) is outside window', () => {
    expect(isWithinAutopilotWindow(12, 0)).toBe(false);
  });

  test('19:00 is outside window', () => {
    expect(isWithinAutopilotWindow(19, 0)).toBe(false);
  });
});

// =============================================================================
// APPROVAL RATE CALCULATION TESTS
// =============================================================================

describe('Approval Rate Calculation', () => {
  test('threshold constant is correct', () => {
    expect(MIN_APPROVAL_RATE).toBe(0.70);
    expect(APPROVAL_RATE_WINDOW_DAYS).toBe(7);
  });

  test('100% approval rate when all approved', () => {
    const events = [
      createDecisionEvent('1', 'm1', 'approved', '2026-01-19T18:00:00Z'),
      createDecisionEvent('2', 'm2', 'approved', '2026-01-18T18:00:00Z'),
      createDecisionEvent('3', 'm3', 'approved', '2026-01-17T18:00:00Z'),
    ];
    expect(computeApprovalRate(events, '2026-01-20T17:00:00Z')).toBe(1.0);
  });

  test('0% approval rate when all rejected', () => {
    const events = [
      createDecisionEvent('1', 'm1', 'rejected', '2026-01-19T18:00:00Z'),
      createDecisionEvent('2', 'm2', 'rejected', '2026-01-18T18:00:00Z'),
    ];
    expect(computeApprovalRate(events, '2026-01-20T17:00:00Z')).toBe(0);
  });

  test('50% approval rate with mixed results', () => {
    const events = [
      createDecisionEvent('1', 'm1', 'approved', '2026-01-19T18:00:00Z'),
      createDecisionEvent('2', 'm2', 'rejected', '2026-01-18T18:00:00Z'),
    ];
    expect(computeApprovalRate(events, '2026-01-20T17:00:00Z')).toBe(0.5);
  });

  test('ignores pending events', () => {
    const events = [
      createDecisionEvent('1', 'm1', 'approved', '2026-01-19T18:00:00Z'),
      createDecisionEvent('2', 'm2', 'pending', '2026-01-18T18:00:00Z'),
    ];
    expect(computeApprovalRate(events, '2026-01-20T17:00:00Z')).toBe(1.0);
  });

  test('ignores expired events', () => {
    const events = [
      createDecisionEvent('1', 'm1', 'approved', '2026-01-19T18:00:00Z'),
      createDecisionEvent('2', 'm2', 'expired', '2026-01-18T18:00:00Z'),
    ];
    expect(computeApprovalRate(events, '2026-01-20T17:00:00Z')).toBe(1.0);
  });

  test('ignores drm_triggered events', () => {
    const events = [
      createDecisionEvent('1', 'm1', 'approved', '2026-01-19T18:00:00Z'),
      createDecisionEvent('2', 'm2', 'drm_triggered', '2026-01-18T18:00:00Z'),
    ];
    expect(computeApprovalRate(events, '2026-01-20T17:00:00Z')).toBe(1.0);
  });

  test('returns 1.0 when no approved/rejected events', () => {
    const events = [
      createDecisionEvent('1', 'm1', 'pending', '2026-01-19T18:00:00Z'),
      createDecisionEvent('2', 'm2', 'drm_triggered', '2026-01-18T18:00:00Z'),
    ];
    // Benefit of the doubt when no decisions to evaluate
    expect(computeApprovalRate(events, '2026-01-20T17:00:00Z')).toBe(1.0);
  });

  test('ignores events outside 7-day window', () => {
    const events = [
      createDecisionEvent('1', 'm1', 'rejected', '2026-01-10T18:00:00Z'), // 10 days ago
      createDecisionEvent('2', 'm2', 'approved', '2026-01-19T18:00:00Z'), // 1 day ago
    ];
    // Only the recent approval counts
    expect(computeApprovalRate(events, '2026-01-20T17:00:00Z')).toBe(1.0);
  });

  test('80% approval rate (4 approved, 1 rejected)', () => {
    const events = [
      createDecisionEvent('1', 'm1', 'approved', '2026-01-19T18:00:00Z'),
      createDecisionEvent('2', 'm2', 'approved', '2026-01-18T18:00:00Z'),
      createDecisionEvent('3', 'm3', 'approved', '2026-01-17T18:00:00Z'),
      createDecisionEvent('4', 'm4', 'approved', '2026-01-16T18:00:00Z'),
      createDecisionEvent('5', 'm5', 'rejected', '2026-01-15T18:00:00Z'),
    ];
    expect(computeApprovalRate(events, '2026-01-20T17:00:00Z')).toBe(0.8);
  });
});

// =============================================================================
// RECENT REJECTION TESTS
// =============================================================================

describe('Recent Rejection Check', () => {
  test('threshold constant is correct', () => {
    expect(RECENT_REJECTION_WINDOW_HOURS).toBe(24);
  });

  test('returns true when rejection within 24 hours', () => {
    const events = [
      createDecisionEvent('1', 'm1', 'rejected', '2026-01-20T12:00:00Z'),
    ];
    expect(hasRecentRejection(events, '2026-01-20T17:00:00Z')).toBe(true);
  });

  test('returns false when no rejection', () => {
    const events = [
      createDecisionEvent('1', 'm1', 'approved', '2026-01-20T12:00:00Z'),
    ];
    expect(hasRecentRejection(events, '2026-01-20T17:00:00Z')).toBe(false);
  });

  test('returns false when rejection is older than 24 hours', () => {
    const events = [
      createDecisionEvent('1', 'm1', 'rejected', '2026-01-18T12:00:00Z'), // ~53 hours ago
    ];
    expect(hasRecentRejection(events, '2026-01-20T17:00:00Z')).toBe(false);
  });

  test('returns true when rejection at exactly 24 hours ago', () => {
    const events = [
      createDecisionEvent('1', 'm1', 'rejected', '2026-01-19T17:00:00Z'), // Exactly 24 hours ago
    ];
    expect(hasRecentRejection(events, '2026-01-20T17:00:00Z')).toBe(true);
  });

  test('returns false for empty events', () => {
    expect(hasRecentRejection([], '2026-01-20T17:00:00Z')).toBe(false);
  });
});

// =============================================================================
// MEAL USED RECENTLY TESTS
// =============================================================================

describe('Meal Used Recently Check', () => {
  test('threshold constant is correct', () => {
    expect(RECENTLY_USED_WINDOW_DAYS).toBe(3);
  });

  test('returns true when meal approved today', () => {
    const events = [
      createDecisionEvent('1', 'meal-a', 'approved', '2026-01-20T12:00:00Z'),
    ];
    expect(wasMealUsedRecently('meal-a', events, '2026-01-20T17:00:00Z')).toBe(true);
  });

  test('returns true when meal approved yesterday', () => {
    const events = [
      createDecisionEvent('1', 'meal-a', 'approved', '2026-01-19T18:00:00Z'),
    ];
    expect(wasMealUsedRecently('meal-a', events, '2026-01-20T17:00:00Z')).toBe(true);
  });

  test('returns true when meal approved 2 days ago', () => {
    const events = [
      createDecisionEvent('1', 'meal-a', 'approved', '2026-01-18T18:00:00Z'),
    ];
    expect(wasMealUsedRecently('meal-a', events, '2026-01-20T17:00:00Z')).toBe(true);
  });

  test('returns false when meal approved 3 days ago', () => {
    const events = [
      createDecisionEvent('1', 'meal-a', 'approved', '2026-01-17T18:00:00Z'),
    ];
    expect(wasMealUsedRecently('meal-a', events, '2026-01-20T17:00:00Z')).toBe(false);
  });

  test('returns false when meal rejected (not approved)', () => {
    const events = [
      createDecisionEvent('1', 'meal-a', 'rejected', '2026-01-20T12:00:00Z'),
    ];
    expect(wasMealUsedRecently('meal-a', events, '2026-01-20T17:00:00Z')).toBe(false);
  });

  test('returns false for different meal', () => {
    const events = [
      createDecisionEvent('1', 'meal-b', 'approved', '2026-01-20T12:00:00Z'),
    ];
    expect(wasMealUsedRecently('meal-a', events, '2026-01-20T17:00:00Z')).toBe(false);
  });

  test('returns false for empty events', () => {
    expect(wasMealUsedRecently('meal-a', [], '2026-01-20T17:00:00Z')).toBe(false);
  });
});

// =============================================================================
// GATE-BY-GATE ELIGIBILITY TESTS
// =============================================================================

describe('Autopilot Eligibility - Gate 1: Time Window', () => {
  test('eligible when within 17:00-18:15 window', () => {
    const ctx = createEligibleContext();
    ctx.nowIso = '2026-01-20T17:30:00Z';
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('all_gates_passed');
  });

  test('not eligible at 16:00 (too early)', () => {
    const ctx = createEligibleContext();
    ctx.nowIso = '2026-01-20T16:00:00Z';
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('outside_autopilot_window');
  });

  test('not eligible at 19:00 (too late)', () => {
    const ctx = createEligibleContext();
    ctx.nowIso = '2026-01-20T19:00:00Z';
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('outside_autopilot_window');
  });

  test('eligible at exactly 17:00 (window start)', () => {
    const ctx = createEligibleContext();
    ctx.nowIso = '2026-01-20T17:00:00Z';
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });

  test('eligible at exactly 18:15 (window end)', () => {
    const ctx = createEligibleContext();
    ctx.nowIso = '2026-01-20T18:15:00Z';
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });
});

describe('Autopilot Eligibility - Gate 2: Calendar Conflict', () => {
  test('not eligible when calendarConflict is true', () => {
    const ctx = createEligibleContext();
    ctx.signal.calendarConflict = true;
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('calendar_conflict');
  });

  test('eligible when calendarConflict is false', () => {
    const ctx = createEligibleContext();
    ctx.signal.calendarConflict = false;
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });

  test('eligible when calendarConflict is undefined', () => {
    const ctx = createEligibleContext();
    ctx.signal.calendarConflict = undefined;
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });
});

describe('Autopilot Eligibility - Gate 3: Energy Level', () => {
  test('not eligible when energy is low', () => {
    const ctx = createEligibleContext();
    ctx.signal.energy = 'low';
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('low_energy');
  });

  test('eligible when energy is normal', () => {
    const ctx = createEligibleContext();
    ctx.signal.energy = 'normal';
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });

  test('eligible when energy is high', () => {
    const ctx = createEligibleContext();
    ctx.signal.energy = 'high';
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });
});

describe('Autopilot Eligibility - Gate 4: Inventory Score', () => {
  test('threshold constant is correct', () => {
    expect(MIN_INVENTORY_SCORE).toBe(0.85);
  });

  test('not eligible when inventoryScore < 0.85', () => {
    const ctx = createEligibleContext();
    ctx.inventoryScore = 0.84;
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('low_inventory_score');
  });

  test('eligible when inventoryScore = 0.85 (boundary)', () => {
    const ctx = createEligibleContext();
    ctx.inventoryScore = 0.85;
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });

  test('eligible when inventoryScore = 1.0', () => {
    const ctx = createEligibleContext();
    ctx.inventoryScore = 1.0;
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });
});

describe('Autopilot Eligibility - Gate 5: Taste Score', () => {
  test('threshold constant is correct', () => {
    expect(MIN_TASTE_SCORE).toBe(0.70);
  });

  test('not eligible when tasteScore < 0.70', () => {
    const ctx = createEligibleContext();
    ctx.tasteScore = 0.69;
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('low_taste_score');
  });

  test('eligible when tasteScore = 0.70 (boundary)', () => {
    const ctx = createEligibleContext();
    ctx.tasteScore = 0.70;
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });

  test('eligible when tasteScore = 1.0', () => {
    const ctx = createEligibleContext();
    ctx.tasteScore = 1.0;
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });
});

describe('Autopilot Eligibility - Gate 6: Recent Usage', () => {
  test('not eligible when meal was used in last 3 days', () => {
    const ctx = createEligibleContext();
    ctx.usedInLast3Days = true;
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('meal_used_recently');
  });

  test('eligible when meal was not used in last 3 days', () => {
    const ctx = createEligibleContext();
    ctx.usedInLast3Days = false;
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });
});

describe('Autopilot Eligibility - Gate 7: Approval Rate', () => {
  test('not eligible when approval rate < 70%', () => {
    const ctx = createEligibleContext();
    ctx.recentEvents = [
      createDecisionEvent('1', 'm1', 'approved', '2026-01-19T18:00:00Z'),
      createDecisionEvent('2', 'm2', 'rejected', '2026-01-18T18:00:00Z'),
      createDecisionEvent('3', 'm3', 'rejected', '2026-01-17T18:00:00Z'),
    ];
    // 33% approval rate
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('low_approval_rate');
  });

  test('eligible when approval rate = 70% (boundary)', () => {
    const ctx = createEligibleContext();
    ctx.recentEvents = [
      createDecisionEvent('1', 'm1', 'approved', '2026-01-19T18:00:00Z'),
      createDecisionEvent('2', 'm2', 'approved', '2026-01-18T18:00:00Z'),
      createDecisionEvent('3', 'm3', 'approved', '2026-01-17T18:00:00Z'),
      createDecisionEvent('4', 'm4', 'approved', '2026-01-16T18:00:00Z'),
      createDecisionEvent('5', 'm5', 'approved', '2026-01-15T18:00:00Z'),
      createDecisionEvent('6', 'm6', 'approved', '2026-01-14T18:00:00Z'),
      createDecisionEvent('7', 'm7', 'approved', '2026-01-13T18:00:00Z'),
      createDecisionEvent('8', 'm8', 'rejected', '2026-01-19T12:00:00Z'),
      createDecisionEvent('9', 'm9', 'rejected', '2026-01-18T12:00:00Z'),
      createDecisionEvent('10', 'm10', 'rejected', '2026-01-17T12:00:00Z'),
    ];
    // 70% approval rate (7/10)
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });

  test('eligible when no decisions to evaluate', () => {
    const ctx = createEligibleContext();
    ctx.recentEvents = []; // No decisions
    const result = evaluateAutopilotEligibility(ctx);
    // Benefit of the doubt
    expect(result.eligible).toBe(true);
  });
});

describe('Autopilot Eligibility - Gate 8: Recent Rejection', () => {
  test('not eligible when rejected in last 24 hours', () => {
    const ctx = createEligibleContext();
    // Create events with high approval rate (80%) but with a recent rejection
    ctx.recentEvents = [
      createDecisionEvent('1', 'm1', 'approved', '2026-01-19T18:00:00Z'),
      createDecisionEvent('2', 'm2', 'approved', '2026-01-18T18:00:00Z'),
      createDecisionEvent('3', 'm3', 'approved', '2026-01-17T18:00:00Z'),
      createDecisionEvent('4', 'm4', 'approved', '2026-01-16T18:00:00Z'),
      createDecisionEvent('5', 'm5', 'approved', '2026-01-15T18:00:00Z'),
      createDecisionEvent('6', 'm6', 'approved', '2026-01-14T18:00:00Z'),
      createDecisionEvent('7', 'm7', 'approved', '2026-01-13T18:00:00Z'),
      // Recent rejection (within 24h) - this should fail gate 8
      createDecisionEvent('recent', 'm-recent', 'rejected', '2026-01-20T10:00:00Z'),
    ];
    // 87.5% approval rate (7/8), so passes gate 7
    // But has recent rejection, so fails gate 8
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('recent_rejection');
  });

  test('eligible when rejection is older than 24 hours', () => {
    const ctx = createEligibleContext();
    // Rejection was 2+ days ago (outside 24h window)
    ctx.recentEvents = [
      createDecisionEvent('1', 'm1', 'approved', '2026-01-19T18:00:00Z'),
      createDecisionEvent('2', 'm2', 'approved', '2026-01-18T18:00:00Z'),
      createDecisionEvent('3', 'm3', 'approved', '2026-01-17T18:00:00Z'),
      createDecisionEvent('4', 'm4', 'approved', '2026-01-16T18:00:00Z'),
      createDecisionEvent('5', 'm5', 'approved', '2026-01-15T18:00:00Z'),
      createDecisionEvent('6', 'm6', 'approved', '2026-01-14T18:00:00Z'),
      createDecisionEvent('7', 'm7', 'approved', '2026-01-13T18:00:00Z'),
      // Old rejection (outside 24h window)
      createDecisionEvent('old', 'm-old', 'rejected', '2026-01-18T10:00:00Z'),
    ];
    // 87.5% approval rate (7/8), passes gate 7
    // No recent rejection, passes gate 8
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });
});

// =============================================================================
// COMBINED SCENARIO TESTS
// =============================================================================

describe('Autopilot Eligibility - Combined Scenarios', () => {
  test('full eligible scenario - all gates pass', () => {
    const ctx = createEligibleContext();
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('all_gates_passed');
  });

  test('multiple failing gates reports first failure', () => {
    const ctx = createEligibleContext();
    ctx.nowIso = '2026-01-20T12:00:00Z'; // Gate 1 fails
    ctx.signal.energy = 'low'; // Gate 3 fails
    ctx.inventoryScore = 0.5; // Gate 4 fails
    
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(false);
    // First gate (time window) should be reported
    expect(result.reason).toBe('outside_autopilot_window');
  });

  test('first passing, second failing gate reports second failure', () => {
    const ctx = createEligibleContext();
    // Gate 1 passes (time within window)
    ctx.signal.calendarConflict = true; // Gate 2 fails
    
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('calendar_conflict');
  });

  test('new user with no history is eligible', () => {
    const ctx: AutopilotContext = {
      nowIso: '2026-01-20T17:30:00Z',
      signal: {
        timeWindow: 'prime',
        energy: 'normal',
        calendarConflict: false,
      },
      mealId: 'meal-first',
      inventoryScore: 0.90,
      tasteScore: 0.75,
      usedInLast3Days: false,
      recentEvents: [], // No history
    };
    
    const result = evaluateAutopilotEligibility(ctx);
    expect(result.eligible).toBe(true);
  });

  test('user with only DRM events is eligible', () => {
    const ctx: AutopilotContext = {
      nowIso: '2026-01-20T17:30:00Z',
      signal: {
        timeWindow: 'prime',
        energy: 'normal',
        calendarConflict: false,
      },
      mealId: 'meal-first',
      inventoryScore: 0.90,
      tasteScore: 0.75,
      usedInLast3Days: false,
      recentEvents: [
        createDecisionEvent('1', 'm1', 'drm_triggered', '2026-01-19T18:00:00Z'),
        createDecisionEvent('2', 'm2', 'drm_triggered', '2026-01-18T18:00:00Z'),
      ],
    };
    
    const result = evaluateAutopilotEligibility(ctx);
    // DRM events are ignored for approval rate
    expect(result.eligible).toBe(true);
  });
});
