import { computeWeightsV1 } from '../lib/learning/weights-v1';

describe('computeWeightsV1', () => {
  const now = Date.parse('2026-02-25T18:00:00.000Z');

  test('is deterministic for identical inputs', () => {
    const entries = [
      { mealId: 'a', rating: 1 as const, timestamp: now - 1000 },
      { mealId: 'b', rating: -1 as const, timestamp: now - 2000 },
    ];

    const first = computeWeightsV1(entries, ['a', 'x', 'b'], now);
    const second = computeWeightsV1(entries, ['a', 'x', 'b'], now);

    expect(Array.from(first.entries())).toEqual(Array.from(second.entries()));
  });

  test('positive and negative feedback shift meal weights', () => {
    const entries = [
      { mealId: 'liked', rating: 1 as const, timestamp: now - 3_600_000 },
      { mealId: 'disliked', rating: -1 as const, timestamp: now - 3_600_000 },
    ];

    const weights = computeWeightsV1(entries, [], now);
    const liked = weights.get('liked') ?? 1;
    const disliked = weights.get('disliked') ?? 1;

    expect(liked).toBeGreaterThan(1);
    expect(disliked).toBeLessThan(1);
  });

  test('legacy-like entries without metadata still contribute', () => {
    const entries = [
      { mealId: 'legacy', rating: 1 as const, timestamp: now - 10_000 },
    ];

    const weights = computeWeightsV1(entries, [], now);
    expect(weights.has('legacy')).toBe(true);
    expect((weights.get('legacy') ?? 0) > 1).toBe(true);
  });
});
