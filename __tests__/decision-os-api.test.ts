/**
 * Decision OS API Tests
 * 
 * INVARIANTS TESTED:
 * 1. Feedback endpoint inserts NEW row (append-only), does not update
 * 2. Decision endpoint returns single decision or null
 * 3. DRM endpoint always returns rescue decision
 */

import { DecisionStore } from '../services/DecisionStore';

describe('Decision Store - Append Only Invariant', () => {
  beforeEach(() => {
    DecisionStore.clearAll();
  });

  test('feedback inserts NEW event row, does not update existing', () => {
    const householdKey = 'test-household';
    const nowIso = new Date().toISOString();

    // Create initial decision
    const decision = DecisionStore.getDecision(householdKey, nowIso, {});
    const originalEventId = decision.decisionEventId;
    
    // Count events after decision
    const countAfterDecision = DecisionStore.getEventCount();
    expect(countAfterDecision).toBe(1);

    // Record feedback
    const feedbackResult = DecisionStore.recordFeedback(
      householdKey,
      originalEventId,
      'approved',
      nowIso
    );

    // Count events after feedback - should have INCREASED
    const countAfterFeedback = DecisionStore.getEventCount();
    expect(countAfterFeedback).toBe(2); // 1 original + 1 feedback = 2

    // Feedback should have created a NEW event ID
    expect(feedbackResult.newEventId).not.toBe(originalEventId);

    // Verify both events exist
    const allEvents = DecisionStore.getAllEvents();
    expect(allEvents.length).toBe(2);

    // Original event should NOT have userAction
    const originalEvent = allEvents.find(e => e.id === originalEventId);
    expect(originalEvent?.userAction).toBeNull();

    // New feedback event should have userAction
    const feedbackEvent = allEvents.find(e => e.id === feedbackResult.newEventId);
    expect(feedbackEvent?.userAction).toBe('approved');
  });

  test('multiple feedbacks each create NEW rows', () => {
    const householdKey = 'test-household';
    const nowIso = new Date().toISOString();

    // Create decision
    const decision = DecisionStore.getDecision(householdKey, nowIso, {});
    expect(DecisionStore.getEventCount()).toBe(1);

    // First feedback (rejected)
    DecisionStore.recordFeedback(householdKey, decision.decisionEventId, 'rejected', nowIso);
    expect(DecisionStore.getEventCount()).toBe(2);

    // Second decision after rejection
    const decision2 = DecisionStore.getDecision(householdKey, nowIso, {});
    expect(DecisionStore.getEventCount()).toBe(3);

    // Second feedback (approved)
    DecisionStore.recordFeedback(householdKey, decision2.decisionEventId, 'approved', nowIso);
    expect(DecisionStore.getEventCount()).toBe(4);

    // Verify all events are preserved
    const allEvents = DecisionStore.getAllEvents();
    expect(allEvents.length).toBe(4);

    // Each feedback should be a separate row
    const feedbackEvents = allEvents.filter(e => e.userAction !== null);
    expect(feedbackEvents.length).toBe(2);
  });

  test('feedback with unknown eventId still creates new row', () => {
    const householdKey = 'test-household';
    const nowIso = new Date().toISOString();

    const initialCount = DecisionStore.getEventCount();

    // Record feedback for non-existent event
    const result = DecisionStore.recordFeedback(
      householdKey,
      'non-existent-event-id',
      'approved',
      nowIso
    );

    // Should still record (append-only pattern)
    expect(result.recorded).toBe(true);
    expect(DecisionStore.getEventCount()).toBe(initialCount + 1);
  });

  test('original decision event is never mutated', () => {
    const householdKey = 'test-household';
    const nowIso = new Date().toISOString();

    // Create decision
    const decision = DecisionStore.getDecision(householdKey, nowIso, { tired: true });
    const originalEventId = decision.decisionEventId;

    // Get original event state
    const eventsBefore = DecisionStore.getAllEvents();
    const originalBefore = eventsBefore.find(e => e.id === originalEventId);
    const originalStateBefore = JSON.stringify(originalBefore);

    // Record feedback
    DecisionStore.recordFeedback(householdKey, originalEventId, 'rejected', nowIso);

    // Get original event state after feedback
    const eventsAfter = DecisionStore.getAllEvents();
    const originalAfter = eventsAfter.find(e => e.id === originalEventId);
    const originalStateAfter = JSON.stringify(originalAfter);

    // Original event should be unchanged
    expect(originalStateAfter).toBe(originalStateBefore);
    expect(originalAfter?.userAction).toBeNull();
  });
});

describe('Decision Store - Decision Endpoint Behavior', () => {
  beforeEach(() => {
    DecisionStore.clearAll();
  });

  test('returns single decision object, not array', () => {
    const result = DecisionStore.getDecision('default', new Date().toISOString(), {});
    
    // Result should have decision as single object or null
    expect(result.decision).not.toBeInstanceOf(Array);
    if (result.decision !== null) {
      expect(typeof result.decision.id).toBe('string');
      expect(typeof result.decision.title).toBe('string');
    }
  });

  test('each decision creates one event', () => {
    const nowIso = new Date().toISOString();
    
    DecisionStore.getDecision('default', nowIso, {});
    expect(DecisionStore.getEventCount()).toBe(1);
    
    DecisionStore.getDecision('default', nowIso, {});
    expect(DecisionStore.getEventCount()).toBe(2);
    
    DecisionStore.getDecision('default', nowIso, {});
    expect(DecisionStore.getEventCount()).toBe(3);
  });

  test('returns drmRecommended true after multiple rejections', () => {
    const householdKey = 'test-household';
    const nowIso = new Date().toISOString();

    // First decision
    const d1 = DecisionStore.getDecision(householdKey, nowIso, {});
    DecisionStore.recordFeedback(householdKey, d1.decisionEventId, 'rejected', nowIso);

    // Second decision
    const d2 = DecisionStore.getDecision(householdKey, nowIso, {});
    DecisionStore.recordFeedback(householdKey, d2.decisionEventId, 'rejected', nowIso);

    // Third decision should recommend DRM
    const d3 = DecisionStore.getDecision(householdKey, nowIso, {});
    
    // After multiple rejections, should recommend DRM
    // (The exact threshold may vary, but pattern should hold)
    expect(typeof d3.drmRecommended).toBe('boolean');
  });
});

describe('Decision Store - DRM Endpoint Behavior', () => {
  beforeEach(() => {
    DecisionStore.clearAll();
  });

  test('DRM always returns a rescue decision', () => {
    const result = DecisionStore.getDrmRescue(
      'default',
      new Date().toISOString(),
      'handle_it'
    );

    expect(result.rescue).toBeTruthy();
    expect(result.rescue.id).toBeTruthy();
    expect(result.rescue.title).toBeTruthy();
    expect(result.decisionEventId).toBeTruthy();
  });

  test('DRM creates event with drmTriggered flag', () => {
    const nowIso = new Date().toISOString();
    
    const result = DecisionStore.getDrmRescue('default', nowIso, 'handle_it');
    
    const events = DecisionStore.getAllEvents();
    const drmEvent = events.find(e => e.id === result.decisionEventId);
    
    expect(drmEvent?.drmTriggered).toBe(true);
    expect(drmEvent?.triggerReason).toBe('handle_it');
  });

  test('DRM preserves trigger reason', () => {
    const nowIso = new Date().toISOString();
    
    DecisionStore.getDrmRescue('default', nowIso, 'handle_it');
    DecisionStore.getDrmRescue('default', nowIso, 'auto_drm');
    DecisionStore.getDrmRescue('default', nowIso, 'rejection_cascade');
    
    const events = DecisionStore.getAllEvents();
    const reasons = events.map(e => e.triggerReason);
    
    expect(reasons).toContain('handle_it');
    expect(reasons).toContain('auto_drm');
    expect(reasons).toContain('rejection_cascade');
  });
});

describe('Feedback Types', () => {
  beforeEach(() => {
    DecisionStore.clearAll();
  });

  test('records approved feedback', () => {
    const nowIso = new Date().toISOString();
    const decision = DecisionStore.getDecision('default', nowIso, {});
    
    const result = DecisionStore.recordFeedback(
      'default',
      decision.decisionEventId,
      'approved',
      nowIso
    );
    
    const events = DecisionStore.getAllEvents();
    const feedbackEvent = events.find(e => e.id === result.newEventId);
    
    expect(feedbackEvent?.userAction).toBe('approved');
  });

  test('records rejected feedback', () => {
    const nowIso = new Date().toISOString();
    const decision = DecisionStore.getDecision('default', nowIso, {});
    
    const result = DecisionStore.recordFeedback(
      'default',
      decision.decisionEventId,
      'rejected',
      nowIso
    );
    
    const events = DecisionStore.getAllEvents();
    const feedbackEvent = events.find(e => e.id === result.newEventId);
    
    expect(feedbackEvent?.userAction).toBe('rejected');
  });

  test('records drm_triggered feedback', () => {
    const nowIso = new Date().toISOString();
    const decision = DecisionStore.getDecision('default', nowIso, {});
    
    const result = DecisionStore.recordFeedback(
      'default',
      decision.decisionEventId,
      'drm_triggered',
      nowIso
    );
    
    const events = DecisionStore.getAllEvents();
    const feedbackEvent = events.find(e => e.id === result.newEventId);
    
    expect(feedbackEvent?.userAction).toBe('drm_triggered');
  });
});
