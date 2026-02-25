import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DecisionEventV1, FeedbackEventV1 } from './contracts';
import { incrementLearningMetric, setLearningMetricGauge } from './telemetry';

const KEY = 'ff:v1:learning_queue';
const DEAD_LETTER_KEY = 'ff:v1:learning_dead_letter';
const MAX_QUEUE_RECORDS = Number.parseInt(process.env.EXPO_PUBLIC_LEARNING_QUEUE_MAX ?? '500', 10);
const MAX_RETRY_ATTEMPTS = Number.parseInt(process.env.EXPO_PUBLIC_LEARNING_MAX_RETRIES ?? '8', 10);
const DEAD_LETTER_ALERT_THRESHOLD = Number.parseInt(
  process.env.EXPO_PUBLIC_LEARNING_DEAD_LETTER_ALERT_THRESHOLD ?? '20',
  10,
);

type FailureCode = 'auth' | 'validation' | 'transient';

export type LearningRecord = {
  kind: 'decision_event' | 'feedback_event';
  payload: DecisionEventV1 | FeedbackEventV1;
  idempotencyKey: string;
  attempt: number;
  nextRetryAt: number;
  lastFailureCode?: FailureCode;
};

async function loadAll(): Promise<LearningRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LearningRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAll(records: LearningRecord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    // Best effort.
  }
}

async function loadDeadLetter(): Promise<LearningRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(DEAD_LETTER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LearningRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveDeadLetter(records: LearningRecord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(records));
  } catch {
    // Best effort.
  }
}

async function moveToDeadLetter(record: LearningRecord): Promise<void> {
  const existing = await loadDeadLetter();
  existing.push(record);
  const next = existing.slice(-MAX_QUEUE_RECORDS);
  await saveDeadLetter(next);
  incrementLearningMetric('learning_dead_letter_total', 1, {
    reason: record.lastFailureCode ?? 'unknown',
  });
  setLearningMetricGauge('learning_dead_letter_size', next.length);
  if (
    Number.isFinite(DEAD_LETTER_ALERT_THRESHOLD) &&
    DEAD_LETTER_ALERT_THRESHOLD > 0 &&
    next.length >= DEAD_LETTER_ALERT_THRESHOLD
  ) {
    incrementLearningMetric('learning_dead_letter_alert_total', 1, {
      threshold: DEAD_LETTER_ALERT_THRESHOLD,
    });
    console.error(
      `[learning-alert] dead_letter_threshold_exceeded size=${next.length} threshold=${DEAD_LETTER_ALERT_THRESHOLD}`,
    );
  }
}

export async function enqueueLearningRecord(record: LearningRecord): Promise<void> {
  const all = await loadAll();
  if (all.some((r) => r.idempotencyKey === record.idempotencyKey)) return;
  if (all.length >= MAX_QUEUE_RECORDS) {
    const dropped = all.shift();
    if (dropped) {
      await moveToDeadLetter({ ...dropped, lastFailureCode: 'transient' });
    }
  }
  all.push(record);
  await saveAll(all);
}

export async function getReadyLearningRecords(limit = 25): Promise<LearningRecord[]> {
  const now = Date.now();
  const all = await loadAll();
  return all.filter((r) => r.nextRetryAt <= now).slice(0, limit);
}

export async function markLearningRecordSuccess(idempotencyKey: string): Promise<void> {
  const all = await loadAll();
  await saveAll(all.filter((r) => r.idempotencyKey !== idempotencyKey));
}

export async function markLearningRecordFailure(
  idempotencyKey: string,
  failureCode: FailureCode = 'transient',
): Promise<void> {
  const all = await loadAll();
  const failed = all.find((r) => r.idempotencyKey === idempotencyKey);
  if (!failed) return;

  if (failed.attempt + 1 >= MAX_RETRY_ATTEMPTS) {
    await moveToDeadLetter({
      ...failed,
      attempt: failed.attempt + 1,
      lastFailureCode: failureCode,
    });
    await saveAll(all.filter((r) => r.idempotencyKey !== idempotencyKey));
    return;
  }

  const next = all.map((row) => {
    if (row.idempotencyKey !== idempotencyKey) return row;
    const attempt = row.attempt + 1;
    const baseBackoffMs = Math.min(60_000, 1000 * Math.pow(2, attempt));
    const jitter = 0.8 + Math.random() * 0.4;
    const backoffMs = Math.round(baseBackoffMs * jitter);
    return {
      ...row,
      attempt,
      nextRetryAt: Date.now() + backoffMs,
      lastFailureCode: failureCode,
    };
  });
  await saveAll(next);
}

export async function getLearningQueueLength(): Promise<number> {
  const all = await loadAll();
  return all.length;
}

export async function getLearningDeadLetterLength(): Promise<number> {
  const all = await loadDeadLetter();
  return all.length;
}
