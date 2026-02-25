import type { FeedbackEntry } from '../state/feedbackLog';

export const LEARNING_MODEL_VERSION = 1 as const;
export const HALF_LIFE_DAYS = 30;
export const MIN_WEIGHT = 0.15;
export const MAX_WEIGHT = 3.0;
export const DEFAULT_WEIGHT = 1.0;
export const COOLDOWN_WINDOW = 3;
export const COOLDOWN_MULTIPLIER = 0.3;

export function toRatingDelta(rating: -1 | 0 | 1): number {
  if (rating === 1) return 1.0;
  if (rating === -1) return -0.6;
  return 0.0;
}

export function decayFactor(entryTimestampMs: number, nowMs: number): number {
  const elapsedMs = Math.max(0, nowMs - entryTimestampMs);
  const daysSince = elapsedMs / 86_400_000;
  return Math.pow(0.5, daysSince / HALF_LIFE_DAYS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeEntries(entries: FeedbackEntry[]): FeedbackEntry[] {
  return entries
    .filter((entry) => typeof entry.mealId === 'string' && entry.mealId.length > 0)
    .filter((entry) => Number.isFinite(entry.timestamp))
    .filter((entry) => entry.rating === -1 || entry.rating === 0 || entry.rating === 1);
}

export function computeWeightsV1(
  entries: FeedbackEntry[],
  recentDeals: string[],
  now: number = Date.now(),
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const entry of normalizeEntries(entries)) {
    const decay = decayFactor(entry.timestamp, now);
    const delta = toRatingDelta(entry.rating);
    const prev = scores.get(entry.mealId) ?? 0;
    scores.set(entry.mealId, prev + delta * decay);
  }

  const weights = new Map<string, number>();
  for (const [mealId, score] of scores.entries()) {
    const raw = DEFAULT_WEIGHT + score;
    weights.set(mealId, clamp(raw, MIN_WEIGHT, MAX_WEIGHT));
  }

  const cooled = recentDeals.slice(-COOLDOWN_WINDOW);
  for (const mealId of cooled) {
    const baseline = weights.get(mealId) ?? DEFAULT_WEIGHT;
    const next = clamp(baseline * COOLDOWN_MULTIPLIER, MIN_WEIGHT, MAX_WEIGHT);
    weights.set(mealId, next);
  }

  return weights;
}

export function mapToObject(weights: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [mealId, weight] of weights.entries()) {
    out[mealId] = weight;
  }
  return out;
}

export function objectToMap(weights: unknown): Map<string, number> {
  if (!weights || typeof weights !== 'object') return new Map<string, number>();
  const map = new Map<string, number>();
  for (const [mealId, value] of Object.entries(weights as Record<string, unknown>)) {
    if (typeof mealId !== 'string' || mealId.length === 0) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    map.set(mealId, clamp(value, MIN_WEIGHT, MAX_WEIGHT));
  }
  return map;
}
