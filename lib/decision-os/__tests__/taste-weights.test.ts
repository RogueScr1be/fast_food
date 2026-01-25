import {
  computeTasteWeight,
  getBaseWeight,
  isAfter8pm,
  clamp,
  shouldSkipTasteMealScores,
  BASE_WEIGHTS,
  STRESS_MULTIPLIER,
  WEIGHT_MIN,
  WEIGHT_MAX,
} from '../taste/weights';
import { NOTES } from '../feedback/handler';
import type { DecisionEvent, DecisionEventInsert } from '../../../types/decision-os';

/**
 * Helper to create a schema-true event (using user_action, not status)
 */
function createEvent(overrides: Partial<DecisionEvent> = {}): DecisionEvent {
  return {
    id: '1',
    user_profile_id: 1,
    decided_at: '2026-01-20T10:00:00Z',
    decision_payload: {},
    ...overrides,
  };
}

describe('isAfter8pm', () => {
  it('returns false for morning times', () => {
    expect(isAfter8pm('2026-01-20T08:00:00Z')).toBe(false);
  });

  it('returns false for afternoon times', () => {
    expect(isAfter8pm('2026-01-20T15:00:00Z')).toBe(false);
  });

  it('returns false at 7:59pm', () => {
    expect(isAfter8pm('2026-01-20T19:59:00Z')).toBe(false);
  });

  it('returns true at exactly 8pm', () => {
    expect(isAfter8pm('2026-01-20T20:00:00Z')).toBe(true);
  });

  it('returns true after 8pm', () => {
    expect(isAfter8pm('2026-01-20T21:30:00Z')).toBe(true);
  });

  it('returns true at 11pm', () => {
    expect(isAfter8pm('2026-01-20T23:00:00Z')).toBe(true);
  });
});

describe('clamp', () => {
  it('returns value when within bounds', () => {
    expect(clamp(0.5, -2, 2)).toBe(0.5);
    expect(clamp(-1.0, -2, 2)).toBe(-1.0);
  });

  it('clamps to min when below', () => {
    expect(clamp(-3, -2, 2)).toBe(-2);
    expect(clamp(-10, -2, 2)).toBe(-2);
  });

  it('clamps to max when above', () => {
    expect(clamp(3, -2, 2)).toBe(2);
    expect(clamp(10, -2, 2)).toBe(2);
  });
});

describe('getBaseWeight', () => {
  it('returns +1.0 for approved', () => {
    const event = createEvent({ user_action: 'approved' });
    expect(getBaseWeight(event)).toBe(BASE_WEIGHTS.approved);
    expect(getBaseWeight(event)).toBe(1.0);
  });

  it('returns -1.0 for rejected', () => {
    const event = createEvent({ user_action: 'rejected' });
    expect(getBaseWeight(event)).toBe(BASE_WEIGHTS.rejected);
    expect(getBaseWeight(event)).toBe(-1.0);
  });

  it('returns -0.5 for drm_triggered', () => {
    const event = createEvent({ user_action: 'drm_triggered' });
    expect(getBaseWeight(event)).toBe(BASE_WEIGHTS.drm_triggered);
    expect(getBaseWeight(event)).toBe(-0.5);
  });

  it('returns -0.2 for expired (runtime status)', () => {
    const event = createEvent({ _runtime_status: 'expired' });
    expect(getBaseWeight(event)).toBe(BASE_WEIGHTS.expired);
    expect(getBaseWeight(event)).toBe(-0.2);
  });

  it('returns -0.5 for undo (autonomy penalty)', () => {
    const event = createEvent({
      user_action: 'rejected',
      notes: NOTES.UNDO_AUTOPILOT,
    });
    expect(getBaseWeight(event)).toBe(BASE_WEIGHTS.undo);
    expect(getBaseWeight(event)).toBe(-0.5);
  });

  it('returns 0 for events without user_action', () => {
    const event = createEvent({});
    expect(getBaseWeight(event)).toBe(0);
  });
});

describe('computeTasteWeight', () => {
  describe('base weights without stress multiplier', () => {
    it('approved => +1.0', () => {
      const event = createEvent({
        actioned_at: '2026-01-20T12:00:00Z', // Before 8pm
        user_action: 'approved',
      });
      expect(computeTasteWeight(event)).toBe(1.0);
    });

    it('rejected => -1.0', () => {
      const event = createEvent({
        actioned_at: '2026-01-20T12:00:00Z',
        user_action: 'rejected',
      });
      expect(computeTasteWeight(event)).toBe(-1.0);
    });

    it('drm_triggered => -0.5', () => {
      const event = createEvent({
        actioned_at: '2026-01-20T12:00:00Z',
        user_action: 'drm_triggered',
      });
      expect(computeTasteWeight(event)).toBe(-0.5);
    });

    it('expired => -0.2', () => {
      const event = createEvent({
        actioned_at: '2026-01-20T12:00:00Z',
        _runtime_status: 'expired',
      });
      expect(computeTasteWeight(event)).toBe(-0.2);
    });

    it('undo => -0.5 (autonomy penalty)', () => {
      const event = createEvent({
        actioned_at: '2026-01-20T12:00:00Z',
        user_action: 'rejected',
        notes: NOTES.UNDO_AUTOPILOT,
      });
      expect(computeTasteWeight(event)).toBe(-0.5);
    });

    it('no user_action => 0', () => {
      const event = createEvent({});
      expect(computeTasteWeight(event)).toBe(0);
    });
  });

  describe('stress multiplier after 8pm', () => {
    it('approved after 8pm => +1.10', () => {
      const event = createEvent({
        actioned_at: '2026-01-20T21:00:00Z', // 9pm
        user_action: 'approved',
      });
      expect(computeTasteWeight(event)).toBeCloseTo(1.0 * STRESS_MULTIPLIER);
      expect(computeTasteWeight(event)).toBeCloseTo(1.10);
    });

    it('rejected after 8pm => -1.10', () => {
      const event = createEvent({
        actioned_at: '2026-01-20T20:30:00Z', // 8:30pm
        user_action: 'rejected',
      });
      expect(computeTasteWeight(event)).toBeCloseTo(-1.0 * STRESS_MULTIPLIER);
      expect(computeTasteWeight(event)).toBeCloseTo(-1.10);
    });

    it('undo after 8pm => -0.55 (autonomy penalty with stress)', () => {
      const event = createEvent({
        actioned_at: '2026-01-20T21:00:00Z', // 9pm
        user_action: 'rejected',
        notes: NOTES.UNDO_AUTOPILOT,
      });
      expect(computeTasteWeight(event)).toBeCloseTo(-0.5 * STRESS_MULTIPLIER);
      expect(computeTasteWeight(event)).toBeCloseTo(-0.55);
    });

    it('drm_triggered after 8pm => -0.55', () => {
      const event = createEvent({
        actioned_at: '2026-01-20T20:00:00Z', // Exactly 8pm
        user_action: 'drm_triggered',
      });
      expect(computeTasteWeight(event)).toBeCloseTo(-0.5 * STRESS_MULTIPLIER);
      expect(computeTasteWeight(event)).toBeCloseTo(-0.55);
    });

    it('expired after 8pm => -0.22', () => {
      const event = createEvent({
        decided_at: '2026-01-20T20:00:00Z', // Decided at 8pm
        _runtime_status: 'expired',
      });
      expect(computeTasteWeight(event)).toBeCloseTo(-0.2 * STRESS_MULTIPLIER);
      expect(computeTasteWeight(event)).toBeCloseTo(-0.22);
    });
  });

  describe('clamping to [-2, 2]', () => {
    it('clamps extreme positive values to 2', () => {
      expect(clamp(5, WEIGHT_MIN, WEIGHT_MAX)).toBe(2);
    });

    it('clamps extreme negative values to -2', () => {
      expect(clamp(-5, WEIGHT_MIN, WEIGHT_MAX)).toBe(-2);
    });

    it('normal weights are within bounds', () => {
      const event = createEvent({
        actioned_at: '2026-01-20T21:00:00Z',
        user_action: 'rejected',
      });
      const weight = computeTasteWeight(event);
      expect(weight).toBeGreaterThanOrEqual(WEIGHT_MIN);
      expect(weight).toBeLessThanOrEqual(WEIGHT_MAX);
    });
  });

  describe('timestamp precedence', () => {
    it('uses actioned_at for stress calculation when available', () => {
      const event = createEvent({
        decided_at: '2026-01-20T10:00:00Z', // Morning
        actioned_at: '2026-01-20T21:00:00Z', // Evening (after 8pm)
        user_action: 'approved',
      });
      // Should use actioned_at (9pm) => stress multiplier applies
      expect(computeTasteWeight(event)).toBeCloseTo(1.10);
    });

    it('falls back to decided_at when actioned_at missing', () => {
      const event = createEvent({
        decided_at: '2026-01-20T21:00:00Z', // Evening
        _runtime_status: 'expired',
      });
      // Should use decided_at (9pm) => stress multiplier applies
      expect(computeTasteWeight(event)).toBeCloseTo(-0.22);
    });
  });
});

describe('shouldSkipTasteMealScores', () => {
  it('returns true for undo events', () => {
    const event = createEvent({
      user_action: 'rejected',
      notes: NOTES.UNDO_AUTOPILOT,
    });
    
    expect(shouldSkipTasteMealScores(event)).toBe(true);
  });

  it('returns false for regular rejection', () => {
    const event = createEvent({
      user_action: 'rejected',
    });
    
    expect(shouldSkipTasteMealScores(event)).toBe(false);
  });

  it('returns false for approved', () => {
    const event = createEvent({
      user_action: 'approved',
    });
    
    expect(shouldSkipTasteMealScores(event)).toBe(false);
  });

  it('returns false for autopilot approval', () => {
    const event = createEvent({
      user_action: 'approved',
      notes: NOTES.AUTOPILOT,
    });
    
    expect(shouldSkipTasteMealScores(event)).toBe(false);
  });
});

describe('Weight semantics documentation', () => {
  it('documents that undo is autonomy penalty, NOT taste rejection', () => {
    // Undo weight is -0.5 (same as drm_triggered), NOT -1.0 (rejected)
    expect(BASE_WEIGHTS.undo).toBe(-0.5);
    expect(BASE_WEIGHTS.rejected).toBe(-1.0);
    expect(BASE_WEIGHTS.undo).not.toBe(BASE_WEIGHTS.rejected);
  });

  it('documents weight hierarchy', () => {
    // Approved is most positive
    expect(BASE_WEIGHTS.approved).toBe(1.0);
    // Rejected is most negative
    expect(BASE_WEIGHTS.rejected).toBe(-1.0);
    // Undo and DRM are moderate negative (autonomy signals)
    expect(BASE_WEIGHTS.undo).toBe(-0.5);
    expect(BASE_WEIGHTS.drm_triggered).toBe(-0.5);
    // Expired is least negative (no engagement)
    expect(BASE_WEIGHTS.expired).toBe(-0.2);
  });
});
