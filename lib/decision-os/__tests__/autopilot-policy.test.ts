import {
  parseLocalDate,
  getWindowDates,
  getEventTimestamp,
  computeApprovalRate,
  shouldAutopilot,
  DEFAULT_AUTOPILOT_CONFIG,
} from '../autopilot/policy';
import type { DecisionEvent } from '../../../types/decision-os';

describe('parseLocalDate', () => {
  it('extracts YYYY-MM-DD from ISO string with Z timezone', () => {
    expect(parseLocalDate('2026-01-20T15:30:00.000Z')).toBe('2026-01-20');
  });

  it('extracts YYYY-MM-DD from ISO string with offset timezone', () => {
    // This would fail with Date() conversion in some timezones
    expect(parseLocalDate('2026-01-20T23:30:00-06:00')).toBe('2026-01-20');
  });

  it('extracts literal date from UTC string (no timezone conversion)', () => {
    // "2026-01-21T04:30:00Z" is 4:30 AM UTC on Jan 21
    // With Date() conversion in US timezones, this would become Jan 20
    // But we want the literal date from the string: Jan 21
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
    // Late night in +05:30 timezone - literal date is still Jan 20
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
    
    expect(dates.has('2026-01-20')).toBe(true); // today
    expect(dates.has('2026-01-19')).toBe(true); // -1
    expect(dates.has('2026-01-14')).toBe(true); // -6
    expect(dates.has('2026-01-13')).toBe(false); // -7 (outside window)
  });

  it('handles month boundaries correctly', () => {
    const refDate = new Date('2026-02-03T12:00:00');
    const dates = getWindowDates(7, refDate);
    
    expect(dates.has('2026-02-03')).toBe(true);
    expect(dates.has('2026-01-28')).toBe(true); // crosses into January
  });
});

describe('getEventTimestamp', () => {
  it('returns actioned_at when present', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-19T10:00:00Z',
      actioned_at: '2026-01-20T15:00:00Z',
      status: 'approved',
      decision_payload: {},
    };
    
    expect(getEventTimestamp(event)).toBe('2026-01-20T15:00:00Z');
  });

  it('returns decided_at when actioned_at is absent', () => {
    const event: DecisionEvent = {
      id: '1',
      user_profile_id: 1,
      decided_at: '2026-01-19T10:00:00Z',
      status: 'pending',
      decision_payload: {},
    };
    
    expect(getEventTimestamp(event)).toBe('2026-01-19T10:00:00Z');
  });
});

describe('computeApprovalRate', () => {
  const createEvent = (
    id: string,
    status: DecisionEvent['status'],
    decided_at: string,
    actioned_at?: string
  ): DecisionEvent => ({
    id,
    user_profile_id: 1,
    decided_at,
    actioned_at,
    status,
    decision_payload: {},
  });

  it('returns 1.0 rate with eligible=false when no events', () => {
    const result = computeApprovalRate([]);
    
    expect(result.rate).toBe(1.0);
    expect(result.total).toBe(0);
    expect(result.eligible).toBe(false);
  });

  it('counts only approved and rejected events', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent('1', 'approved', '2026-01-20T10:00:00Z', '2026-01-20T10:05:00Z'),
      createEvent('2', 'rejected', '2026-01-20T11:00:00Z', '2026-01-20T11:05:00Z'),
      createEvent('3', 'pending', '2026-01-20T12:00:00Z'),
      createEvent('4', 'expired', '2026-01-19T10:00:00Z'),
      createEvent('5', 'drm_triggered', '2026-01-19T11:00:00Z'),
    ];
    
    const result = computeApprovalRate(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    expect(result.approved).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.total).toBe(2);
    expect(result.rate).toBe(0.5);
  });

  it('uses actioned_at for windowing when present', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    
    // Event decided on Jan 10 but actioned on Jan 20 - should be IN window
    const eventInWindow = createEvent('1', 'approved', '2026-01-10T10:00:00Z', '2026-01-20T10:00:00Z');
    
    // Event decided on Jan 20 but actioned on Jan 10 - should be OUT of window
    const eventOutWindow = createEvent('2', 'approved', '2026-01-20T10:00:00Z', '2026-01-10T10:00:00Z');
    
    const result1 = computeApprovalRate([eventInWindow], DEFAULT_AUTOPILOT_CONFIG, refDate);
    expect(result1.approved).toBe(1);
    
    const result2 = computeApprovalRate([eventOutWindow], DEFAULT_AUTOPILOT_CONFIG, refDate);
    expect(result2.approved).toBe(0);
  });

  it('handles near-midnight events correctly by local date', () => {
    // Reference: Jan 20, 2026 at noon
    const refDate = new Date('2026-01-20T12:00:00');
    
    // Event at 11:59 PM on Jan 20 - should be in window
    const lateNightEvent = createEvent(
      '1', 
      'approved', 
      '2026-01-20T23:59:00Z', 
      '2026-01-20T23:59:00Z'
    );
    
    // Event at 00:01 AM on Jan 14 (boundary of 7-day window) - should be in window
    const earlyMorningEvent = createEvent(
      '2', 
      'approved', 
      '2026-01-14T00:01:00Z', 
      '2026-01-14T00:01:00Z'
    );
    
    // Event at 11:59 PM on Jan 13 - should be OUT of window
    const outsideEvent = createEvent(
      '3', 
      'approved', 
      '2026-01-13T23:59:00Z', 
      '2026-01-13T23:59:00Z'
    );
    
    const result = computeApprovalRate(
      [lateNightEvent, earlyMorningEvent, outsideEvent],
      DEFAULT_AUTOPILOT_CONFIG,
      refDate
    );
    
    // Should count 2 events (Jan 20 late night + Jan 14 early morning)
    // Jan 13 event should be excluded
    expect(result.approved).toBe(2);
  });

  it('calculates correct approval rate', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent('1', 'approved', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z'),
      createEvent('2', 'approved', '2026-01-19T10:00:00Z', '2026-01-19T10:00:00Z'),
      createEvent('3', 'approved', '2026-01-18T10:00:00Z', '2026-01-18T10:00:00Z'),
      createEvent('4', 'approved', '2026-01-17T10:00:00Z', '2026-01-17T10:00:00Z'),
      createEvent('5', 'rejected', '2026-01-16T10:00:00Z', '2026-01-16T10:00:00Z'),
    ];
    
    const result = computeApprovalRate(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    expect(result.approved).toBe(4);
    expect(result.rejected).toBe(1);
    expect(result.total).toBe(5);
    expect(result.rate).toBe(0.8); // 4/5 = 80%
    expect(result.eligible).toBe(true); // Meets min 5 decisions and 80% rate
  });

  it('returns eligible=false when below min decisions', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent('1', 'approved', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z'),
      createEvent('2', 'approved', '2026-01-19T10:00:00Z', '2026-01-19T10:00:00Z'),
    ];
    
    const result = computeApprovalRate(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    expect(result.total).toBe(2);
    expect(result.rate).toBe(1.0);
    expect(result.eligible).toBe(false); // Only 2 decisions, need 5
  });

  it('returns eligible=false when below min approval rate', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent('1', 'approved', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z'),
      createEvent('2', 'approved', '2026-01-19T10:00:00Z', '2026-01-19T10:00:00Z'),
      createEvent('3', 'rejected', '2026-01-18T10:00:00Z', '2026-01-18T10:00:00Z'),
      createEvent('4', 'rejected', '2026-01-17T10:00:00Z', '2026-01-17T10:00:00Z'),
      createEvent('5', 'rejected', '2026-01-16T10:00:00Z', '2026-01-16T10:00:00Z'),
    ];
    
    const result = computeApprovalRate(events, DEFAULT_AUTOPILOT_CONFIG, refDate);
    
    expect(result.total).toBe(5);
    expect(result.rate).toBe(0.4); // 2/5 = 40%
    expect(result.eligible).toBe(false); // Below 80% threshold
  });
});

describe('shouldAutopilot', () => {
  const createEvent = (
    id: string,
    status: DecisionEvent['status'],
    decided_at: string,
    actioned_at?: string
  ): DecisionEvent => ({
    id,
    user_profile_id: 1,
    decided_at,
    actioned_at,
    status,
    decision_payload: {},
  });

  it('returns false when autopilot is disabled', () => {
    const events: DecisionEvent[] = [];
    const config = { ...DEFAULT_AUTOPILOT_CONFIG, enabled: false };
    
    expect(shouldAutopilot(events, config)).toBe(false);
  });

  it('returns true when eligible', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent('1', 'approved', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z'),
      createEvent('2', 'approved', '2026-01-19T10:00:00Z', '2026-01-19T10:00:00Z'),
      createEvent('3', 'approved', '2026-01-18T10:00:00Z', '2026-01-18T10:00:00Z'),
      createEvent('4', 'approved', '2026-01-17T10:00:00Z', '2026-01-17T10:00:00Z'),
      createEvent('5', 'approved', '2026-01-16T10:00:00Z', '2026-01-16T10:00:00Z'),
    ];
    
    expect(shouldAutopilot(events, DEFAULT_AUTOPILOT_CONFIG, refDate)).toBe(true);
  });

  it('returns false when not enough decisions', () => {
    const refDate = new Date('2026-01-20T12:00:00');
    const events: DecisionEvent[] = [
      createEvent('1', 'approved', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z'),
    ];
    
    expect(shouldAutopilot(events, DEFAULT_AUTOPILOT_CONFIG, refDate)).toBe(false);
  });
});
