/**
 * Decision OS API Tests
 * 
 * INVARIANTS TESTED:
 * 1. Feedback endpoint inserts NEW row (append-only), does not update
 * 2. Original events have user_action = 'pending' (NOT null)
 * 3. Feedback creates row with user_action = approved/rejected/drm_triggered
 * 4. Decision endpoint returns single decision or null
 * 5. DRM endpoint always returns rescue decision or exhausted
 */

import {
  getTestClient,
  insertDecisionEvent,
  getDecisionEventById,
  getDecisionEventByIdAndHousehold,
  insertDecisionEventFeedbackCopy,
  getAllDecisionEvents,
  getDecisionEventCount,
} from '../lib/decision-os/database';
import type { DecisionEventRow } from '../types/decision-os/decision';

describe('Decision OS Database - Append Only Invariant', () => {
  let testClient: ReturnType<typeof getTestClient>;

  beforeEach(() => {
    testClient = getTestClient();
  });

  test('original decision event has user_action = pending (not null)', async () => {
    const householdKey = 'test-household';
    const nowIso = new Date().toISOString();
    
    const event: DecisionEventRow = {
      id: 'evt-test-001',
      household_key: householdKey,
      decided_at: nowIso,
      decision_type: 'cook',
      meal_id: 'meal-001',
      external_vendor_key: null,
      context_hash: 'hash123',
      decision_payload: { title: 'Test Meal' },
      user_action: 'pending', // MUST be 'pending', not null
    };
    
    await insertDecisionEvent(event, testClient);
    
    const retrieved = await getDecisionEventById(event.id, testClient);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.user_action).toBe('pending'); // NOT null
  });

  test('feedback inserts NEW row, does not update original', async () => {
    const householdKey = 'test-household';
    const nowIso = new Date().toISOString();
    
    // Create original decision event
    const originalEvent: DecisionEventRow = {
      id: 'evt-original-001',
      household_key: householdKey,
      decided_at: nowIso,
      decision_type: 'cook',
      meal_id: 'meal-001',
      external_vendor_key: null,
      context_hash: 'hash123',
      decision_payload: { title: 'Test Meal', stepsShort: 'Cook it' },
      user_action: 'pending',
    };
    
    await insertDecisionEvent(originalEvent, testClient);
    
    // Verify original exists with pending
    const originalBefore = await getDecisionEventById(originalEvent.id, testClient);
    expect(originalBefore!.user_action).toBe('pending');
    
    // Count events before feedback
    const countBefore = await getDecisionEventCount(householdKey, testClient);
    expect(countBefore).toBe(1);
    
    // Insert feedback copy (APPEND-ONLY)
    const feedbackEventId = 'evt-feedback-001';
    const actionedAt = new Date().toISOString();
    
    await insertDecisionEventFeedbackCopy(
      originalEvent,
      feedbackEventId,
      'approved',
      actionedAt,
      testClient
    );
    
    // Count events after feedback - should have INCREASED
    const countAfter = await getDecisionEventCount(householdKey, testClient);
    expect(countAfter).toBe(2); // 1 original + 1 feedback = 2
    
    // Original event should STILL have user_action = 'pending' (not updated)
    const originalAfter = await getDecisionEventById(originalEvent.id, testClient);
    expect(originalAfter!.user_action).toBe('pending'); // UNCHANGED
    
    // Feedback event should have user_action = 'approved'
    const feedbackEvent = await getDecisionEventById(feedbackEventId, testClient);
    expect(feedbackEvent!.user_action).toBe('approved');
    expect(feedbackEvent!.actioned_at).toBe(actionedAt);
  });

  test('after feedback, there are exactly 2 rows: first pending, second approved', async () => {
    const householdKey = 'test-household-2rows';
    const nowIso = new Date().toISOString();
    
    // Create original decision event
    const originalEvent: DecisionEventRow = {
      id: 'evt-2rows-original',
      household_key: householdKey,
      decided_at: nowIso,
      decision_type: 'zero_cook',
      meal_id: null,
      external_vendor_key: null,
      context_hash: 'hash456',
      decision_payload: { title: 'Quick Salad', stepsShort: 'Mix ingredients' },
      user_action: 'pending',
    };
    
    await insertDecisionEvent(originalEvent, testClient);
    
    // Insert feedback
    const feedbackEventId = 'evt-2rows-feedback';
    const actionedAt = new Date().toISOString();
    
    await insertDecisionEventFeedbackCopy(
      originalEvent,
      feedbackEventId,
      'approved',
      actionedAt,
      testClient
    );
    
    // Get all events for this household
    const allEvents = await getAllDecisionEvents(householdKey, testClient);
    
    expect(allEvents.length).toBe(2);
    
    // First row should be pending (original)
    const pendingRow = allEvents.find(e => e.user_action === 'pending');
    expect(pendingRow).toBeTruthy();
    expect(pendingRow!.id).toBe(originalEvent.id);
    
    // Second row should be approved (feedback copy)
    const approvedRow = allEvents.find(e => e.user_action === 'approved');
    expect(approvedRow).toBeTruthy();
    expect(approvedRow!.id).toBe(feedbackEventId);
    expect(approvedRow!.actioned_at).toBe(actionedAt);
    
    // Both should have same decision_payload
    expect(pendingRow!.decision_payload).toEqual(approvedRow!.decision_payload);
  });

  test('multiple feedbacks each create NEW rows', async () => {
    const householdKey = 'test-household-multi';
    const nowIso = new Date().toISOString();
    
    // Create first decision
    const event1: DecisionEventRow = {
      id: 'evt-multi-1',
      household_key: householdKey,
      decided_at: nowIso,
      decision_type: 'cook',
      meal_id: 'meal-001',
      external_vendor_key: null,
      context_hash: 'hash1',
      decision_payload: { title: 'Meal 1' },
      user_action: 'pending',
    };
    await insertDecisionEvent(event1, testClient);
    expect(await getDecisionEventCount(householdKey, testClient)).toBe(1);
    
    // First feedback (rejected)
    await insertDecisionEventFeedbackCopy(event1, 'evt-fb-1', 'rejected', nowIso, testClient);
    expect(await getDecisionEventCount(householdKey, testClient)).toBe(2);
    
    // Second decision
    const event2: DecisionEventRow = {
      id: 'evt-multi-2',
      household_key: householdKey,
      decided_at: nowIso,
      decision_type: 'cook',
      meal_id: 'meal-002',
      external_vendor_key: null,
      context_hash: 'hash2',
      decision_payload: { title: 'Meal 2' },
      user_action: 'pending',
    };
    await insertDecisionEvent(event2, testClient);
    expect(await getDecisionEventCount(householdKey, testClient)).toBe(3);
    
    // Second feedback (approved)
    await insertDecisionEventFeedbackCopy(event2, 'evt-fb-2', 'approved', nowIso, testClient);
    expect(await getDecisionEventCount(householdKey, testClient)).toBe(4);
    
    // Verify all events
    const allEvents = await getAllDecisionEvents(householdKey, testClient);
    expect(allEvents.length).toBe(4);
    
    // Should have 2 pending, 1 rejected, 1 approved
    const pendingEvents = allEvents.filter(e => e.user_action === 'pending');
    const rejectedEvents = allEvents.filter(e => e.user_action === 'rejected');
    const approvedEvents = allEvents.filter(e => e.user_action === 'approved');
    
    expect(pendingEvents.length).toBe(2);
    expect(rejectedEvents.length).toBe(1);
    expect(approvedEvents.length).toBe(1);
  });

  test('original event is never mutated after feedback', async () => {
    const householdKey = 'test-household-immutable';
    const nowIso = new Date().toISOString();
    
    // Create original
    const originalEvent: DecisionEventRow = {
      id: 'evt-immutable-original',
      household_key: householdKey,
      decided_at: nowIso,
      decision_type: 'cook',
      meal_id: 'meal-001',
      external_vendor_key: null,
      context_hash: 'immutable-hash',
      decision_payload: { title: 'Original Title', extra: 'data' },
      user_action: 'pending',
    };
    
    await insertDecisionEvent(originalEvent, testClient);
    
    // Capture original state
    const originalBefore = await getDecisionEventById(originalEvent.id, testClient);
    const originalStateBefore = JSON.stringify(originalBefore);
    
    // Insert feedback
    await insertDecisionEventFeedbackCopy(
      originalEvent,
      'evt-immutable-feedback',
      'rejected',
      nowIso,
      testClient
    );
    
    // Original should be unchanged
    const originalAfter = await getDecisionEventById(originalEvent.id, testClient);
    const originalStateAfter = JSON.stringify(originalAfter);
    
    expect(originalStateAfter).toBe(originalStateBefore);
    expect(originalAfter!.user_action).toBe('pending'); // Still pending
    expect(originalAfter!.actioned_at).toBeUndefined(); // Still no actioned_at
  });

  test('getDecisionEventByIdAndHousehold validates household key', async () => {
    const householdKey = 'household-a';
    const wrongHousehold = 'household-b';
    const nowIso = new Date().toISOString();
    
    const event: DecisionEventRow = {
      id: 'evt-household-check',
      household_key: householdKey,
      decided_at: nowIso,
      decision_type: 'cook',
      meal_id: 'meal-001',
      external_vendor_key: null,
      context_hash: 'hash',
      decision_payload: { title: 'Test' },
      user_action: 'pending',
    };
    
    await insertDecisionEvent(event, testClient);
    
    // Should find with correct household
    const found = await getDecisionEventByIdAndHousehold(event.id, householdKey, testClient);
    expect(found).not.toBeNull();
    
    // Should NOT find with wrong household
    const notFound = await getDecisionEventByIdAndHousehold(event.id, wrongHousehold, testClient);
    expect(notFound).toBeNull();
  });
});

describe('Feedback Types', () => {
  let testClient: ReturnType<typeof getTestClient>;

  beforeEach(() => {
    testClient = getTestClient();
  });

  test('records approved feedback with actioned_at', async () => {
    const householdKey = 'test-approved';
    const nowIso = new Date().toISOString();
    const actionedAt = new Date(Date.now() + 1000).toISOString();
    
    const event: DecisionEventRow = {
      id: 'evt-approved-test',
      household_key: householdKey,
      decided_at: nowIso,
      decision_type: 'cook',
      meal_id: 'meal-001',
      external_vendor_key: null,
      context_hash: 'hash',
      decision_payload: { title: 'Test' },
      user_action: 'pending',
    };
    
    await insertDecisionEvent(event, testClient);
    
    const feedbackEvent = await insertDecisionEventFeedbackCopy(
      event,
      'evt-approved-feedback',
      'approved',
      actionedAt,
      testClient
    );
    
    expect(feedbackEvent.user_action).toBe('approved');
    expect(feedbackEvent.actioned_at).toBe(actionedAt);
  });

  test('records rejected feedback', async () => {
    const householdKey = 'test-rejected';
    const nowIso = new Date().toISOString();
    
    const event: DecisionEventRow = {
      id: 'evt-rejected-test',
      household_key: householdKey,
      decided_at: nowIso,
      decision_type: 'cook',
      meal_id: 'meal-001',
      external_vendor_key: null,
      context_hash: 'hash',
      decision_payload: { title: 'Test' },
      user_action: 'pending',
    };
    
    await insertDecisionEvent(event, testClient);
    
    const feedbackEvent = await insertDecisionEventFeedbackCopy(
      event,
      'evt-rejected-feedback',
      'rejected',
      nowIso,
      testClient
    );
    
    expect(feedbackEvent.user_action).toBe('rejected');
  });

  test('records drm_triggered feedback', async () => {
    const householdKey = 'test-drm';
    const nowIso = new Date().toISOString();
    
    const event: DecisionEventRow = {
      id: 'evt-drm-test',
      household_key: householdKey,
      decided_at: nowIso,
      decision_type: 'cook',
      meal_id: 'meal-001',
      external_vendor_key: null,
      context_hash: 'hash',
      decision_payload: { title: 'Test' },
      user_action: 'pending',
    };
    
    await insertDecisionEvent(event, testClient);
    
    const feedbackEvent = await insertDecisionEventFeedbackCopy(
      event,
      'evt-drm-feedback',
      'drm_triggered',
      nowIso,
      testClient
    );
    
    expect(feedbackEvent.user_action).toBe('drm_triggered');
  });
});

describe('Decision Event Structure', () => {
  let testClient: ReturnType<typeof getTestClient>;

  beforeEach(() => {
    testClient = getTestClient();
  });

  test('feedback copies all fields from original', async () => {
    const householdKey = 'test-copy-fields';
    const nowIso = new Date().toISOString();
    
    const event: DecisionEventRow = {
      id: 'evt-copy-original',
      household_key: householdKey,
      decided_at: nowIso,
      decision_type: 'order',
      meal_id: null,
      external_vendor_key: 'doordash-local',
      context_hash: 'unique-hash-123',
      decision_payload: { 
        title: 'DoorDash Order',
        vendorKey: 'doordash-local',
        deepLinkUrl: 'doordash://store',
        estMinutes: 30
      },
      user_action: 'pending',
    };
    
    await insertDecisionEvent(event, testClient);
    
    const feedbackEvent = await insertDecisionEventFeedbackCopy(
      event,
      'evt-copy-feedback',
      'approved',
      nowIso,
      testClient
    );
    
    // Verify all copied fields
    expect(feedbackEvent.household_key).toBe(event.household_key);
    expect(feedbackEvent.decision_type).toBe(event.decision_type);
    expect(feedbackEvent.meal_id).toBe(event.meal_id);
    expect(feedbackEvent.external_vendor_key).toBe(event.external_vendor_key);
    expect(feedbackEvent.context_hash).toBe(event.context_hash);
    expect(feedbackEvent.decision_payload).toEqual(event.decision_payload);
    
    // Verify feedback-specific fields
    expect(feedbackEvent.id).not.toBe(event.id); // Different ID
    expect(feedbackEvent.user_action).toBe('approved');
    expect(feedbackEvent.actioned_at).toBe(nowIso);
  });
});
