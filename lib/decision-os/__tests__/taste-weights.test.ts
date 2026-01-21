import {
  computeTasteWeight,
  getBaseWeight,
  isAfter8pm,
  clamp,
  BASE_WEIGHTS,
  STRESS_MULTIPLIER,
  WEIGHT_MIN,
  WEIGHT_MAX,
} from '../taste/weights';
import type { DecisionEvent } from '../../../types/decision-os';

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
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'approved',
      decision_payload: {},
    };
    expect(getBaseWeight(event)).toBe(BASE_WEIGHTS.approved);
    expect(getBaseWeight(event)).toBe(1.0);
  });

  it('returns -1.0 for rejected', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'rejected',
      decision_payload: {},
    };
    expect(getBaseWeight(event)).toBe(BASE_WEIGHTS.rejected);
    expect(getBaseWeight(event)).toBe(-1.0);
  });

  it('returns -0.5 for drm_triggered', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'drm_triggered',
      decision_payload: {},
    };
    expect(getBaseWeight(event)).toBe(BASE_WEIGHTS.drm_triggered);
    expect(getBaseWeight(event)).toBe(-0.5);
  });

  it('returns -0.2 for expired', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'expired',
      decision_payload: {},
    };
    expect(getBaseWeight(event)).toBe(BASE_WEIGHTS.expired);
    expect(getBaseWeight(event)).toBe(-0.2);
  });

  it('returns -0.5 for undo (autonomy penalty)', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'rejected',
      decision_payload: {},
      notes: 'undo_autopilot',
    };
    expect(getBaseWeight(event)).toBe(BASE_WEIGHTS.undo);
    expect(getBaseWeight(event)).toBe(-0.5);
  });

  it('returns 0 for pending', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'pending',
      decision_payload: {},
    };
    expect(getBaseWeight(event)).toBe(0);
  });

  it('uses user_action if available', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-20T10:00:00Z',
      status: 'pending', // Status says pending
      user_action: 'approved', // But user_action says approved
      decision_payload: {},
    };
    expect(getBaseWeight(event)).toBe(1.0);
  });
});

describe('computeTasteWeight', () => {
  describe('base weights without stress multiplier', () => {
    it('approved => +1.0', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: '2026-01-20T12:00:00Z', // Before 8pm
        status: 'approved',
        decision_payload: {},
      };
      expect(computeTasteWeight(event)).toBe(1.0);
    });

    it('rejected => -1.0', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: '2026-01-20T12:00:00Z',
        status: 'rejected',
        decision_payload: {},
      };
      expect(computeTasteWeight(event)).toBe(-1.0);
    });

    it('drm_triggered => -0.5', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: '2026-01-20T12:00:00Z',
        status: 'drm_triggered',
        decision_payload: {},
      };
      expect(computeTasteWeight(event)).toBe(-0.5);
    });

    it('expired => -0.2', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: '2026-01-20T12:00:00Z',
        status: 'expired',
        decision_payload: {},
      };
      expect(computeTasteWeight(event)).toBe(-0.2);
    });

    it('undo => -0.5 (autonomy penalty)', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: '2026-01-20T12:00:00Z',
        status: 'rejected',
        decision_payload: {},
        notes: 'undo_autopilot',
      };
      expect(computeTasteWeight(event)).toBe(-0.5);
    });

    it('pending => 0', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        status: 'pending',
        decision_payload: {},
      };
      expect(computeTasteWeight(event)).toBe(0);
    });
  });

  describe('stress multiplier after 8pm', () => {
    it('approved after 8pm => +1.10', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: '2026-01-20T21:00:00Z', // 9pm
        status: 'approved',
        decision_payload: {},
      };
      expect(computeTasteWeight(event)).toBeCloseTo(1.0 * STRESS_MULTIPLIER);
      expect(computeTasteWeight(event)).toBeCloseTo(1.10);
    });

    it('rejected after 8pm => -1.10', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: '2026-01-20T20:30:00Z', // 8:30pm
        status: 'rejected',
        decision_payload: {},
      };
      expect(computeTasteWeight(event)).toBeCloseTo(-1.0 * STRESS_MULTIPLIER);
      expect(computeTasteWeight(event)).toBeCloseTo(-1.10);
    });

    it('undo after 8pm => -0.55 (autonomy penalty with stress)', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: '2026-01-20T21:00:00Z', // 9pm
        status: 'rejected',
        decision_payload: {},
        notes: 'undo_autopilot',
      };
      expect(computeTasteWeight(event)).toBeCloseTo(-0.5 * STRESS_MULTIPLIER);
      expect(computeTasteWeight(event)).toBeCloseTo(-0.55);
    });

    it('drm_triggered after 8pm => -0.55', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: '2026-01-20T20:00:00Z', // Exactly 8pm
        status: 'drm_triggered',
        decision_payload: {},
      };
      expect(computeTasteWeight(event)).toBeCloseTo(-0.5 * STRESS_MULTIPLIER);
      expect(computeTasteWeight(event)).toBeCloseTo(-0.55);
    });

    it('expired after 8pm => -0.22', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T20:00:00Z', // Decided at 8pm
        status: 'expired',
        decision_payload: {},
      };
      expect(computeTasteWeight(event)).toBeCloseTo(-0.2 * STRESS_MULTIPLIER);
      expect(computeTasteWeight(event)).toBeCloseTo(-0.22);
    });
  });

  describe('clamping to [-2, 2]', () => {
    it('clamps extreme positive values to 2', () => {
      // This test verifies clamping works, even though normal values won't exceed bounds
      expect(clamp(5, WEIGHT_MIN, WEIGHT_MAX)).toBe(2);
    });

    it('clamps extreme negative values to -2', () => {
      expect(clamp(-5, WEIGHT_MIN, WEIGHT_MAX)).toBe(-2);
    });

    it('normal weights are within bounds', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z',
        actioned_at: '2026-01-20T21:00:00Z',
        status: 'rejected',
        decision_payload: {},
      };
      const weight = computeTasteWeight(event);
      expect(weight).toBeGreaterThanOrEqual(WEIGHT_MIN);
      expect(weight).toBeLessThanOrEqual(WEIGHT_MAX);
    });
  });

  describe('timestamp precedence', () => {
    it('uses actioned_at for stress calculation when available', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T10:00:00Z', // Morning
        actioned_at: '2026-01-20T21:00:00Z', // Evening (after 8pm)
        status: 'approved',
        decision_payload: {},
      };
      // Should use actioned_at (9pm) => stress multiplier applies
      expect(computeTasteWeight(event)).toBeCloseTo(1.10);
    });

    it('falls back to decided_at when actioned_at missing', () => {
      const event: DecisionEvent = {
        id: '1',
        user_profile_id: 1,
        decided_at: '2026-01-20T21:00:00Z', // Evening
        status: 'expired',
        decision_payload: {},
      };
      // Should use decided_at (9pm) => stress multiplier applies
      expect(computeTasteWeight(event)).toBeCloseTo(-0.22);
    });
  });
});

describe('Weight semantics documentation', () => {
  it('documents that undo is autonomy penalty, NOT taste rejection', () => {
    // This test documents the intentional design:
    // Undo weight is -0.5 (same as drm_triggered), NOT -1.0 (rejected)
    // Because the user may actually like the food; they just didn't want autopilot
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
