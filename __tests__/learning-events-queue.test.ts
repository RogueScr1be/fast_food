import AsyncStorage from '@react-native-async-storage/async-storage';

import { buildDecisionEvent, buildFeedbackEvent } from '../lib/learning/events';
import { isKAnonEligible } from '../lib/learning/contracts';
import {
  enqueueLearningRecord,
  getLearningDeadLetterLength,
  getLearningQueueLength,
  getReadyLearningRecords,
  markLearningRecordFailure,
  markLearningRecordSuccess,
} from '../lib/learning/queue';

describe('learning contracts and queue', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useRealTimers();
  });

  test('decision and feedback events keep v1 contract shape', () => {
    const decision = buildDecisionEvent({
      actor: { householdKey: 'hh_1', userProfileId: 7 },
      sessionId: 'ses_1',
      sequence: 1,
      mealId: 'easy-1',
      decisionType: 'cook',
      explanationLine: 'A one-line reason.',
      contextSignature: {
        v: 1,
        weekday: 2,
        hour_block: 'evening',
        season: 'winter',
        temp_bucket: 'cold',
        geo_bucket: 'us-metro:houston',
        energy: 'unknown',
        weather_source: 'cache',
        computed_at: '2026-02-24T18:05:00.000Z',
        mode: 'easy',
        constraints: { exclude_allergens: [] },
      },
      localLatencyMs: 12,
      engineVersion: 'local-v1',
      weightsVersion: 'uw:v1',
      priorsVersion: 'gp:v1',
    });

    const feedback = buildFeedbackEvent({
      actor: { householdKey: 'hh_1', userProfileId: 7 },
      decisionEventId: decision.event_id,
      action: 'accepted',
      source: 'deal_card',
    });

    expect(decision.v).toBe(1);
    expect(decision.idempotency_key).toBe('hh_1:ses_1:1');
    expect(decision.explanation_line.includes('\n')).toBe(false);
    expect(feedback.v).toBe(1);
    expect(feedback.decision_event_id).toBe(decision.event_id);
    expect(feedback.idempotency_key).toBe(`${decision.event_id}:accepted`);
  });

  test('queue deduplicates and removes successfully synced records', async () => {
    await enqueueLearningRecord({
      kind: 'decision_event',
      payload: { test: true } as any,
      idempotencyKey: 'x:v1',
      attempt: 0,
      nextRetryAt: Date.now(),
    });
    await enqueueLearningRecord({
      kind: 'decision_event',
      payload: { test: true } as any,
      idempotencyKey: 'x:v1',
      attempt: 0,
      nextRetryAt: Date.now(),
    });

    expect(await getLearningQueueLength()).toBe(1);

    await markLearningRecordSuccess('x:v1');
    expect(await getLearningQueueLength()).toBe(0);
  });

  test('queue retries with backoff after failure', async () => {
    const now = Date.now();

    await enqueueLearningRecord({
      kind: 'feedback_event',
      payload: { test: true } as any,
      idempotencyKey: 'retry:v1',
      attempt: 0,
      nextRetryAt: now,
    });

    await markLearningRecordFailure('retry:v1');

    const readyNow = await getReadyLearningRecords(10);
    expect(readyNow.some((r) => r.idempotencyKey === 'retry:v1')).toBe(false);
  });

  test('queue moves permanently failing records to dead-letter', async () => {
    await enqueueLearningRecord({
      kind: 'feedback_event',
      payload: { test: true } as any,
      idempotencyKey: 'dlq:v1',
      attempt: 7,
      nextRetryAt: Date.now(),
    });

    await markLearningRecordFailure('dlq:v1', 'validation');

    expect(await getLearningQueueLength()).toBe(0);
    expect(await getLearningDeadLetterLength()).toBe(1);
  });

  test('k-anon helper enforces threshold', () => {
    expect(isKAnonEligible(30, 30)).toBe(true);
    expect(isKAnonEligible(29, 30)).toBe(false);
  });
});
