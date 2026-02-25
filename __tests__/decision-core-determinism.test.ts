import { evaluateDecision, buildContextBucketKey } from '../lib/decision-core/evaluate';
import type { ContextSignature, EvaluateDecisionInput, MealCandidate, UserWeights } from '../lib/decision-core/types';
import type { RecipeSeed } from '../lib/seeds/types';

function makeRecipe(id: string, mode: 'fancy' | 'easy' | 'cheap'): RecipeSeed {
  return {
    id,
    name: `Recipe ${id}`,
    mode,
    vegetarian: false,
    allergens: [],
    constraints: [],
    ingredients: [{ name: 'x', quantity: '1' }],
    steps: ['step'],
    whyReasons: ['reason'],
    estimatedTime: '20 min',
    estimatedCost: '$10',
    imageKey: 'placeholder',
  };
}

const context: ContextSignature = {
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
  constraints: {
    exclude_allergens: [],
    include_constraints: [],
  },
};

const weights: UserWeights = {
  v: 1,
  base: {
    inventory_match: 1.1,
    novelty_penalty: -0.3,
    recent_reject_penalty: -0.7,
  },
  mode: { fancy: 0, easy: 0.4, cheap: 0.2 },
  hour_block: { morning: 0, lunch: 0.1, afternoon: 0, evening: 0.5, late: 0.7 },
  season: { winter: 0.2, spring: 0, summer: -0.1, fall: 0 },
  temp_bucket: { cold: 0.3, mild: 0, hot: -0.2, unknown: 0 },
};

describe('decision core determinism', () => {
  test('returns identical decision for identical inputs', () => {
    const candidates: MealCandidate[] = [
      {
        mealId: 'a',
        mode: 'easy',
        estimatedMinutes: 20,
        estimatedCostCents: 1000,
        recipe: makeRecipe('a', 'easy'),
      },
      {
        mealId: 'b',
        mode: 'easy',
        estimatedMinutes: 25,
        estimatedCostCents: 1200,
        recipe: makeRecipe('b', 'easy'),
      },
    ];

    const input: EvaluateDecisionInput = {
      candidates,
      context,
      constraints: { excludeAllergens: [], includeConstraints: [] },
      history: { recentMealIds: [], recentRejectedMealIds: [] },
      userWeights: weights,
      globalPriors: {},
    };

    const first = evaluateDecision(input);
    const second = evaluateDecision(input);

    expect(first.mealId).toBe(second.mealId);
    expect(first.explanationLine).toBe(second.explanationLine);
    expect(first.contextBucketKey).toBe(second.contextBucketKey);
  });

  test('uses deterministic tie-break when base scores are equal', () => {
    const candidates: MealCandidate[] = [
      {
        mealId: 'tie-a',
        mode: 'easy',
        estimatedMinutes: 20,
        estimatedCostCents: 1000,
        recipe: makeRecipe('tie-a', 'easy'),
      },
      {
        mealId: 'tie-b',
        mode: 'easy',
        estimatedMinutes: 20,
        estimatedCostCents: 1000,
        recipe: makeRecipe('tie-b', 'easy'),
      },
    ];

    const input: EvaluateDecisionInput = {
      candidates,
      context,
      constraints: { excludeAllergens: [], includeConstraints: [] },
      history: { recentMealIds: [], recentRejectedMealIds: [] },
      userWeights: weights,
      globalPriors: {},
    };

    const first = evaluateDecision(input);
    const second = evaluateDecision(input);
    expect(first.mealId).toBe(second.mealId);
  });

  test('buildContextBucketKey stays stable', () => {
    expect(buildContextBucketKey(context)).toBe(
      'v1|wd2|hb_evening|se_winter|tb_cold|geo_us-metro:houston',
    );
  });
});
