import type {
  ContextSignature,
  EvaluateDecisionInput,
  EvaluatedDecision,
  MealCandidate,
  Mode,
} from './types';
import { buildOneLineExplanation } from './explain';

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildContextBucketKey(context: ContextSignature): string {
  return `v1|wd${context.weekday}|hb_${context.hour_block}|se_${context.season}|tb_${context.temp_bucket}|geo_${context.geo_bucket}`;
}

export function pickModeFromContext(context: Pick<ContextSignature, 'weekday' | 'hour_block' | 'season'>): Mode {
  const seed = `${context.weekday}|${context.hour_block}|${context.season}`;
  const modes: Mode[] = ['easy', 'cheap', 'fancy'];
  return modes[stableHash(seed) % modes.length];
}

function priorKey(bucketKey: string, mealId: string): string {
  return `${bucketKey}|meal:${mealId}`;
}

function scoreCandidate(
  candidate: MealCandidate,
  input: EvaluateDecisionInput,
  bucketKey: string,
): number {
  const { context, userWeights, history, globalPriors } = input;
  const recencyPenalty =
    userWeights.base.recency_penalty ?? userWeights.base.novelty_penalty;
  const priorWeight = userWeights.base.prior_weight ?? 0.05;

  let score = 0;
  score += userWeights.mode[candidate.mode];
  score += userWeights.hour_block[context.hour_block];
  score += userWeights.season[context.season];
  score += userWeights.temp_bucket[context.temp_bucket];

  if (history.recentMealIds.includes(candidate.mealId)) {
    score += recencyPenalty;
  }
  if (history.recentRejectedMealIds.includes(candidate.mealId)) {
    score += userWeights.base.recent_reject_penalty;
  }

  const pKey = priorKey(bucketKey, candidate.mealId);
  score += (globalPriors[pKey] ?? 0) * priorWeight;

  const learnedMealWeight = input.learnedMealWeights?.get(candidate.mealId) ?? 1.0;
  // Convert meal weight multiplier into stable additive score.
  score += Math.log(Math.max(0.15, Math.min(3.0, learnedMealWeight)));

  // Mild preference for shorter prep in decision-now moments.
  score += Math.max(0, (45 - candidate.estimatedMinutes) / 100);

  // Deterministic tie-break noise (tiny, stable).
  score += (stableHash(`${bucketKey}|${candidate.mealId}`) % 1000) / 1_000_000;

  return score;
}

export function evaluateDecision(input: EvaluateDecisionInput): EvaluatedDecision {
  const start = Date.now();
  const bucketKey = buildContextBucketKey(input.context);

  if (input.candidates.length === 0) {
    throw new Error('No candidates available for deterministic evaluation.');
  }

  let best: MealCandidate | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of input.candidates) {
    const s = scoreCandidate(candidate, input, bucketKey);
    if (s > bestScore) {
      bestScore = s;
      best = candidate;
    }
  }

  if (!best) {
    throw new Error('Failed to select candidate.');
  }

  const latencyMs = Date.now() - start;
  return {
    mealId: best.mealId,
    decisionType: 'cook',
    score: Number(bestScore.toFixed(6)),
    explanationLine: buildOneLineExplanation(best, input.context),
    latencyMs,
    contextBucketKey: bucketKey,
  };
}
