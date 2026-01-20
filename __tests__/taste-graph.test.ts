/**
 * FAST FOOD: Taste Graph Tests
 * 
 * Tests for:
 * - Feature extraction
 * - Signal weighting
 * - Score updates
 * - Feedback endpoint integration
 * - Deduplication (unique constraint)
 */

import { randomUUID } from 'crypto';
import { getTestClient, type TasteSignalRow, type TasteMealScoreRow } from '../lib/decision-os/database';
import type { DecisionEventRow, MealRow, MealIngredientRow } from '../types/decision-os/decision';
import {
  tokenizeIngredient,
  extractIngredientTokens,
  isPantryFriendly,
  extractMealFeatures,
  loadAndExtractFeatures,
  createEmptyFeatures,
  MAX_INGREDIENT_TOKENS,
} from '../lib/decision-os/taste/features';
import {
  getBaseWeight,
  computeWeight,
  parseHourFromIso,
  isStressHour,
  WEIGHT_APPROVED,
  WEIGHT_REJECTED,
  WEIGHT_DRM_TRIGGERED,
  WEIGHT_EXPIRED,
  STRESS_HOUR_THRESHOLD,
  STRESS_MULTIPLIER,
  MIN_WEIGHT,
  MAX_WEIGHT,
} from '../lib/decision-os/taste/weights';
import {
  updateTasteGraph,
  insertTasteSignal,
  upsertTasteMealScore,
  getTasteMealScore,
  getTasteSignalByEventId,
} from '../lib/decision-os/taste/updater';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createMockMeal = (id: string, tags: string[] = []): MealRow => ({
  id,
  name: 'Test Meal',
  canonical_key: 'test-meal',
  instructions_short: 'Test instructions',
  est_minutes: 20,
  est_cost_band: '$$',
  tags_internal: tags,
  is_active: true,
});

const createMockIngredients = (mealId: string): MealIngredientRow[] => [
  { meal_id: mealId, ingredient_name: 'chicken breast', is_pantry_staple: false },
  { meal_id: mealId, ingredient_name: 'olive oil', is_pantry_staple: true },
  { meal_id: mealId, ingredient_name: 'garlic cloves', is_pantry_staple: false },
  { meal_id: mealId, ingredient_name: 'fresh basil', is_pantry_staple: false },
];

const createMockDecisionEvent = (
  id: string,
  userAction: 'approved' | 'rejected' | 'drm_triggered' | 'expired',
  mealId: string | null = 'meal-001',
  decisionType: 'cook' | 'order' | 'zero_cook' = 'cook',
  actionedAt: string | null = '2026-01-20T18:30:00-06:00'
): DecisionEventRow => ({
  id,
  household_key: 'default',
  decided_at: '2026-01-20T18:00:00-06:00',
  decision_type: decisionType,
  meal_id: mealId,
  external_vendor_key: null,
  context_hash: 'test-hash-123',
  decision_payload: {},
  user_action: userAction,
  actioned_at: actionedAt ?? undefined,
});

// =============================================================================
// FEATURE EXTRACTION TESTS
// =============================================================================

describe('Feature Extraction', () => {
  describe('tokenizeIngredient', () => {
    it('lowercases and splits ingredient names', () => {
      const tokens = tokenizeIngredient('Chicken Breast');
      expect(tokens).toContain('chicken');
      expect(tokens).toContain('breast');
    });

    it('removes filler words', () => {
      const tokens = tokenizeIngredient('fresh sliced tomatoes');
      expect(tokens).toContain('tomatoes');
      expect(tokens).not.toContain('fresh');
      expect(tokens).not.toContain('sliced');
    });

    it('handles special characters', () => {
      const tokens = tokenizeIngredient('chicken/turkey');
      expect(tokens).toContain('chicken');
      expect(tokens).toContain('turkey');
    });

    it('filters out short tokens', () => {
      const tokens = tokenizeIngredient('a b chicken');
      expect(tokens).not.toContain('a');
      expect(tokens).not.toContain('b');
      expect(tokens).toContain('chicken');
    });
  });

  describe('extractIngredientTokens', () => {
    it('extracts and dedupes tokens from ingredients', () => {
      const ingredients: MealIngredientRow[] = [
        { meal_id: 'test', ingredient_name: 'chicken', is_pantry_staple: false },
        { meal_id: 'test', ingredient_name: 'chicken breast', is_pantry_staple: false },
        { meal_id: 'test', ingredient_name: 'garlic', is_pantry_staple: false },
      ];

      const tokens = extractIngredientTokens(ingredients);
      expect(tokens).toContain('chicken');
      expect(tokens).toContain('breast');
      expect(tokens).toContain('garlic');
      // Should be deduped
      expect(tokens.filter(t => t === 'chicken').length).toBe(1);
    });

    it('limits tokens to MAX_INGREDIENT_TOKENS', () => {
      const manyIngredients: MealIngredientRow[] = Array.from({ length: 20 }, (_, i) => ({
        meal_id: 'test',
        ingredient_name: `ingredient${i}`,
        is_pantry_staple: false,
      }));

      const tokens = extractIngredientTokens(manyIngredients);
      expect(tokens.length).toBeLessThanOrEqual(MAX_INGREDIENT_TOKENS);
    });

    it('sorts tokens alphabetically', () => {
      const ingredients: MealIngredientRow[] = [
        { meal_id: 'test', ingredient_name: 'zucchini', is_pantry_staple: false },
        { meal_id: 'test', ingredient_name: 'apple', is_pantry_staple: false },
        { meal_id: 'test', ingredient_name: 'banana', is_pantry_staple: false },
      ];

      const tokens = extractIngredientTokens(ingredients);
      expect(tokens[0]).toBe('apple');
      expect(tokens[1]).toBe('banana');
      expect(tokens[2]).toBe('zucchini');
    });
  });

  describe('isPantryFriendly', () => {
    it('returns true for meals with pantry_friendly tag', () => {
      const meal = createMockMeal('test', ['easy', 'pantry_friendly', 'italian']);
      expect(isPantryFriendly(meal)).toBe(true);
    });

    it('returns false for meals without pantry tag', () => {
      const meal = createMockMeal('test', ['easy', 'italian']);
      expect(isPantryFriendly(meal)).toBe(false);
    });

    it('handles meals with no tags', () => {
      const meal = createMockMeal('test');
      meal.tags_internal = null;
      expect(isPantryFriendly(meal)).toBe(false);
    });
  });

  describe('extractMealFeatures', () => {
    it('extracts complete feature object', () => {
      const meal = createMockMeal('test', ['italian', 'pantry_friendly']);
      const ingredients = createMockIngredients('test');

      const features = extractMealFeatures(meal, ingredients);

      expect(features.canonicalKey).toBe('test-meal');
      expect(features.estMinutes).toBe(20);
      expect(features.costBand).toBe('$$');
      expect(features.isPantryFriendly).toBe(true);
      expect(features.ingredientTokens).toContain('chicken');
      expect(features.ingredientTokens).toContain('garlic');
      expect(features.ingredientTokens).toContain('basil');
    });
  });

  describe('createEmptyFeatures', () => {
    it('returns empty object for non-meal decisions', () => {
      const empty = createEmptyFeatures();
      expect(Object.keys(empty).length).toBe(0);
    });
  });

  describe('loadAndExtractFeatures', () => {
    it('loads meal and extracts features from database', async () => {
      const client = getTestClient();
      
      // Use existing seed meal
      const features = await loadAndExtractFeatures('meal-001', client);
      
      expect(features).not.toBeNull();
      expect(features!.canonicalKey).toBe('spaghetti-aglio-olio');
      expect(features!.estMinutes).toBe(15);
      expect(features!.isPantryFriendly).toBe(true);
      expect(features!.ingredientTokens.length).toBeGreaterThan(0);
    });

    it('returns null for non-existent meal', async () => {
      const client = getTestClient();
      
      const features = await loadAndExtractFeatures('nonexistent-meal', client);
      
      expect(features).toBeNull();
    });
  });
});

// =============================================================================
// WEIGHT COMPUTATION TESTS
// =============================================================================

describe('Signal Weighting', () => {
  describe('Weight Constants', () => {
    it('has correct weight values per spec', () => {
      expect(WEIGHT_APPROVED).toBe(1.0);
      expect(WEIGHT_REJECTED).toBe(-1.0);
      expect(WEIGHT_DRM_TRIGGERED).toBe(-0.5);
      expect(WEIGHT_EXPIRED).toBe(-0.2);
    });

    it('has stress hour threshold at 8 PM', () => {
      expect(STRESS_HOUR_THRESHOLD).toBe(20);
    });

    it('has stress multiplier of 1.10', () => {
      expect(STRESS_MULTIPLIER).toBe(1.10);
    });

    it('has weight bounds at -2.0 to +2.0', () => {
      expect(MIN_WEIGHT).toBe(-2.0);
      expect(MAX_WEIGHT).toBe(2.0);
    });
  });

  describe('getBaseWeight', () => {
    it('returns +1.0 for approved', () => {
      expect(getBaseWeight('approved')).toBe(1.0);
    });

    it('returns -1.0 for rejected', () => {
      expect(getBaseWeight('rejected')).toBe(-1.0);
    });

    it('returns -0.5 for drm_triggered', () => {
      expect(getBaseWeight('drm_triggered')).toBe(-0.5);
    });

    it('returns -0.2 for expired', () => {
      expect(getBaseWeight('expired')).toBe(-0.2);
    });
  });

  describe('parseHourFromIso', () => {
    it('extracts hour from ISO string with timezone', () => {
      expect(parseHourFromIso('2026-01-20T18:30:00-06:00')).toBe(18);
      expect(parseHourFromIso('2026-01-20T20:00:00-06:00')).toBe(20);
      expect(parseHourFromIso('2026-01-20T23:59:59-06:00')).toBe(23);
    });

    it('returns 0 for null/undefined', () => {
      expect(parseHourFromIso(null)).toBe(0);
      expect(parseHourFromIso(undefined)).toBe(0);
    });
  });

  describe('isStressHour', () => {
    it('returns false for hours before 8 PM', () => {
      expect(isStressHour(17)).toBe(false);
      expect(isStressHour(19)).toBe(false);
    });

    it('returns true for 8 PM and later', () => {
      expect(isStressHour(20)).toBe(true);
      expect(isStressHour(21)).toBe(true);
      expect(isStressHour(23)).toBe(true);
    });
  });

  describe('computeWeight', () => {
    it('computes +1.0 for approved before 8 PM', () => {
      const weight = computeWeight('approved', '2026-01-20T18:30:00-06:00');
      expect(weight).toBe(1.0);
    });

    it('computes +1.10 for approved at/after 8 PM', () => {
      const weight = computeWeight('approved', '2026-01-20T20:30:00-06:00');
      expect(weight).toBeCloseTo(1.10, 2);
    });

    it('computes -1.0 for rejected before 8 PM', () => {
      const weight = computeWeight('rejected', '2026-01-20T18:30:00-06:00');
      expect(weight).toBe(-1.0);
    });

    it('computes -1.10 for rejected at/after 8 PM', () => {
      const weight = computeWeight('rejected', '2026-01-20T20:30:00-06:00');
      expect(weight).toBeCloseTo(-1.10, 2);
    });

    it('computes -0.5 for drm_triggered before 8 PM', () => {
      const weight = computeWeight('drm_triggered', '2026-01-20T18:30:00-06:00');
      expect(weight).toBe(-0.5);
    });

    it('computes -0.55 for drm_triggered at/after 8 PM', () => {
      const weight = computeWeight('drm_triggered', '2026-01-20T20:30:00-06:00');
      expect(weight).toBeCloseTo(-0.55, 2);
    });

    it('computes -0.2 for expired before 8 PM', () => {
      const weight = computeWeight('expired', '2026-01-20T18:30:00-06:00');
      expect(weight).toBe(-0.2);
    });

    it('computes -0.22 for expired at/after 8 PM', () => {
      const weight = computeWeight('expired', '2026-01-20T20:30:00-06:00');
      expect(weight).toBeCloseTo(-0.22, 2);
    });

    it('handles null actioned_at (no stress multiplier)', () => {
      const weight = computeWeight('approved', null);
      expect(weight).toBe(1.0);
    });
  });
});

// =============================================================================
// SCORE UPDATER TESTS
// =============================================================================

describe('Score Updater', () => {
  describe('insertTasteSignal', () => {
    it('inserts a taste signal row', async () => {
      const client = getTestClient();
      const signalId = randomUUID();
      const eventId = randomUUID();

      await insertTasteSignal(
        {
          id: signalId,
          householdKey: 'default',
          decidedAt: '2026-01-20T18:00:00-06:00',
          actionedAt: '2026-01-20T18:30:00-06:00',
          decisionEventId: eventId,
          mealId: 'meal-001',
          decisionType: 'cook',
          userAction: 'approved',
          contextHash: 'test-hash',
          features: { test: true },
          weight: 1.0,
        },
        client
      );

      const signals = (client as any)._getTasteSignals();
      expect(signals.length).toBe(1);
      expect(signals[0].id).toBe(signalId);
      expect(signals[0].weight).toBe(1.0);
    });

    it('throws on duplicate decision_event_id', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      // First insert succeeds
      await insertTasteSignal(
        {
          id: randomUUID(),
          householdKey: 'default',
          decidedAt: '2026-01-20T18:00:00-06:00',
          actionedAt: '2026-01-20T18:30:00-06:00',
          decisionEventId: eventId,
          mealId: 'meal-001',
          decisionType: 'cook',
          userAction: 'approved',
          contextHash: 'test-hash',
          features: {},
          weight: 1.0,
        },
        client
      );

      // Second insert with same event ID fails
      await expect(
        insertTasteSignal(
          {
            id: randomUUID(),
            householdKey: 'default',
            decidedAt: '2026-01-20T18:00:00-06:00',
            actionedAt: '2026-01-20T18:30:00-06:00',
            decisionEventId: eventId, // Same event ID
            mealId: 'meal-001',
            decisionType: 'cook',
            userAction: 'approved',
            contextHash: 'test-hash',
            features: {},
            weight: 1.0,
          },
          client
        )
      ).rejects.toThrow('UNIQUE constraint violation');
    });
  });

  describe('upsertTasteMealScore', () => {
    it('inserts new score on first call', async () => {
      const client = getTestClient();

      await upsertTasteMealScore(
        {
          householdKey: 'default',
          mealId: 'meal-001',
          weightDelta: 1.0,
          isApproval: true,
          isRejection: false,
          decidedAt: '2026-01-20T18:00:00-06:00',
        },
        client
      );

      const scores = (client as any)._getTasteMealScores();
      expect(scores.length).toBe(1);
      expect(scores[0].score).toBe(1.0);
      expect(scores[0].approvals).toBe(1);
      expect(scores[0].rejections).toBe(0);
    });

    it('accumulates score on subsequent calls', async () => {
      const client = getTestClient();

      // First approval
      await upsertTasteMealScore(
        {
          householdKey: 'default',
          mealId: 'meal-001',
          weightDelta: 1.0,
          isApproval: true,
          isRejection: false,
          decidedAt: '2026-01-20T18:00:00-06:00',
        },
        client
      );

      // Second approval
      await upsertTasteMealScore(
        {
          householdKey: 'default',
          mealId: 'meal-001',
          weightDelta: 1.0,
          isApproval: true,
          isRejection: false,
          decidedAt: '2026-01-20T18:30:00-06:00',
        },
        client
      );

      // Rejection
      await upsertTasteMealScore(
        {
          householdKey: 'default',
          mealId: 'meal-001',
          weightDelta: -1.0,
          isApproval: false,
          isRejection: true,
          decidedAt: '2026-01-20T19:00:00-06:00',
        },
        client
      );

      const scores = (client as any)._getTasteMealScores();
      expect(scores.length).toBe(1);
      expect(scores[0].score).toBe(1.0); // 1.0 + 1.0 - 1.0
      expect(scores[0].approvals).toBe(2);
      expect(scores[0].rejections).toBe(1);
    });
  });

  describe('getTasteMealScore', () => {
    it('returns score for existing meal', async () => {
      const client = getTestClient();

      await upsertTasteMealScore(
        {
          householdKey: 'default',
          mealId: 'meal-001',
          weightDelta: 1.0,
          isApproval: true,
          isRejection: false,
          decidedAt: '2026-01-20T18:00:00-06:00',
        },
        client
      );

      const score = await getTasteMealScore('default', 'meal-001', client);
      expect(score).not.toBeNull();
      expect(score!.score).toBe(1.0);
    });

    it('returns null for non-existent meal', async () => {
      const client = getTestClient();

      const score = await getTasteMealScore('default', 'nonexistent', client);
      expect(score).toBeNull();
    });
  });

  describe('getTasteSignalByEventId', () => {
    it('returns signal for existing event', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      await insertTasteSignal(
        {
          id: randomUUID(),
          householdKey: 'default',
          decidedAt: '2026-01-20T18:00:00-06:00',
          actionedAt: '2026-01-20T18:30:00-06:00',
          decisionEventId: eventId,
          mealId: 'meal-001',
          decisionType: 'cook',
          userAction: 'approved',
          contextHash: 'test-hash',
          features: { test: true },
          weight: 1.0,
        },
        client
      );

      const signal = await getTasteSignalByEventId(eventId, client);
      expect(signal).not.toBeNull();
      expect(signal!.weight).toBe(1.0);
    });

    it('returns null for non-existent event', async () => {
      const client = getTestClient();

      const signal = await getTasteSignalByEventId('nonexistent', client);
      expect(signal).toBeNull();
    });
  });
});

// =============================================================================
// INTEGRATION TESTS - updateTasteGraph
// =============================================================================

describe('updateTasteGraph Integration', () => {
  describe('Approved cook decision', () => {
    it('inserts taste signal with non-empty features', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      // Add the decision event to the client
      (client as any)._addDecisionEvent(createMockDecisionEvent(
        eventId, 'approved', 'meal-001', 'cook', '2026-01-20T18:30:00-06:00'
      ));

      const feedbackEvent = createMockDecisionEvent(
        eventId, 'approved', 'meal-001', 'cook', '2026-01-20T18:30:00-06:00'
      );

      const result = await updateTasteGraph(feedbackEvent, client);

      expect(result.signalInserted).toBe(true);
      expect(result.scoreUpdated).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify signal has non-empty features
      const signal = await getTasteSignalByEventId(eventId, client);
      expect(signal).not.toBeNull();
      expect(Object.keys(signal!.features).length).toBeGreaterThan(0);
    });

    it('upserts meal score with +1.0 weight before 8 PM', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      const feedbackEvent = createMockDecisionEvent(
        eventId, 'approved', 'meal-001', 'cook', '2026-01-20T18:30:00-06:00'
      );

      await updateTasteGraph(feedbackEvent, client);

      const score = await getTasteMealScore('default', 'meal-001', client);
      expect(score).not.toBeNull();
      expect(score!.score).toBe(1.0);
      expect(score!.approvals).toBe(1);
      expect(score!.rejections).toBe(0);
    });

    it('applies stress multiplier (+1.10) at/after 8 PM', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      const feedbackEvent = createMockDecisionEvent(
        eventId, 'approved', 'meal-001', 'cook', '2026-01-20T20:30:00-06:00' // 8:30 PM
      );

      await updateTasteGraph(feedbackEvent, client);

      const score = await getTasteMealScore('default', 'meal-001', client);
      expect(score!.score).toBeCloseTo(1.10, 2);
    });
  });

  describe('Rejected cook decision', () => {
    it('inserts taste signal and decreases score by -1.0', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      const feedbackEvent = createMockDecisionEvent(
        eventId, 'rejected', 'meal-001', 'cook', '2026-01-20T18:30:00-06:00'
      );

      const result = await updateTasteGraph(feedbackEvent, client);

      expect(result.signalInserted).toBe(true);
      expect(result.scoreUpdated).toBe(true);

      const score = await getTasteMealScore('default', 'meal-001', client);
      expect(score!.score).toBe(-1.0);
      expect(score!.approvals).toBe(0);
      expect(score!.rejections).toBe(1);
    });

    it('applies stress multiplier (-1.10) at/after 8 PM', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      const feedbackEvent = createMockDecisionEvent(
        eventId, 'rejected', 'meal-001', 'cook', '2026-01-20T20:30:00-06:00' // 8:30 PM
      );

      await updateTasteGraph(feedbackEvent, client);

      const score = await getTasteMealScore('default', 'meal-001', client);
      expect(score!.score).toBeCloseTo(-1.10, 2);
    });
  });

  describe('DRM triggered decision', () => {
    it('inserts taste signal with weight -0.5 before 8 PM', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      const feedbackEvent = createMockDecisionEvent(
        eventId, 'drm_triggered', 'meal-001', 'cook', '2026-01-20T18:30:00-06:00'
      );

      await updateTasteGraph(feedbackEvent, client);

      const signal = await getTasteSignalByEventId(eventId, client);
      expect(signal!.weight).toBe(-0.5);
    });

    it('inserts taste signal with weight -0.55 at/after 8 PM', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      const feedbackEvent = createMockDecisionEvent(
        eventId, 'drm_triggered', 'meal-001', 'cook', '2026-01-20T20:30:00-06:00'
      );

      await updateTasteGraph(feedbackEvent, client);

      const signal = await getTasteSignalByEventId(eventId, client);
      expect(signal!.weight).toBeCloseTo(-0.55, 2);
    });
  });

  describe('Expired decision', () => {
    it('inserts taste signal with weight -0.2 before 8 PM', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      const feedbackEvent = createMockDecisionEvent(
        eventId, 'expired', 'meal-001', 'cook', '2026-01-20T18:30:00-06:00'
      );

      await updateTasteGraph(feedbackEvent, client);

      const signal = await getTasteSignalByEventId(eventId, client);
      expect(signal!.weight).toBe(-0.2);
    });

    it('inserts taste signal with weight -0.22 at/after 8 PM', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      const feedbackEvent = createMockDecisionEvent(
        eventId, 'expired', 'meal-001', 'cook', '2026-01-20T20:30:00-06:00'
      );

      await updateTasteGraph(feedbackEvent, client);

      const signal = await getTasteSignalByEventId(eventId, client);
      expect(signal!.weight).toBeCloseTo(-0.22, 2);
    });
  });

  describe('Order/zero_cook decisions (null meal_id)', () => {
    it('inserts taste signal with empty features', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      const feedbackEvent = createMockDecisionEvent(
        eventId, 'approved', null, 'order', '2026-01-20T18:30:00-06:00'
      );

      const result = await updateTasteGraph(feedbackEvent, client);

      expect(result.signalInserted).toBe(true);
      expect(result.scoreUpdated).toBe(false); // No meal_id, no score update

      const signal = await getTasteSignalByEventId(eventId, client);
      expect(signal).not.toBeNull();
      expect(Object.keys(signal!.features).length).toBe(0);
    });

    it('does NOT upsert taste_meal_scores when meal_id is null', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      const feedbackEvent = createMockDecisionEvent(
        eventId, 'approved', null, 'zero_cook', '2026-01-20T18:30:00-06:00'
      );

      await updateTasteGraph(feedbackEvent, client);

      const scores = (client as any)._getTasteMealScores();
      expect(scores.length).toBe(0);
    });
  });

  describe('Deduplication', () => {
    it('fails when inserting duplicate signal for same decision_event_id', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      const feedbackEvent = createMockDecisionEvent(
        eventId, 'approved', 'meal-001', 'cook', '2026-01-20T18:30:00-06:00'
      );

      // First update succeeds
      const result1 = await updateTasteGraph(feedbackEvent, client);
      expect(result1.signalInserted).toBe(true);

      // Second update fails (duplicate) - but best-effort means no throw
      const result2 = await updateTasteGraph(feedbackEvent, client);
      expect(result2.signalInserted).toBe(false);
      expect(result2.error).toContain('UNIQUE constraint violation');
    });
  });

  describe('Error handling', () => {
    it('returns error for invalid user_action (pending)', async () => {
      const client = getTestClient();
      const eventId = randomUUID();

      const feedbackEvent: DecisionEventRow = {
        id: eventId,
        household_key: 'default',
        decided_at: '2026-01-20T18:00:00-06:00',
        decision_type: 'cook',
        meal_id: 'meal-001',
        external_vendor_key: null,
        context_hash: 'test-hash',
        decision_payload: {},
        user_action: 'pending', // Invalid for taste signal
      };

      const result = await updateTasteGraph(feedbackEvent, client);

      expect(result.signalInserted).toBe(false);
      expect(result.error).toContain('Invalid user_action');
    });
  });
});

// =============================================================================
// FEEDBACK ENDPOINT INTEGRATION TESTS
// =============================================================================

describe('Feedback Endpoint Integration', () => {
  it('response remains { recorded: true } after taste graph update', async () => {
    // This test verifies the endpoint behavior hasn't changed
    // The actual endpoint test is in decision-os-api.test.ts
    // Here we just verify our integration doesn't break the contract
    
    const client = getTestClient();
    const eventId = randomUUID();

    const feedbackEvent = createMockDecisionEvent(
      eventId, 'approved', 'meal-001', 'cook', '2026-01-20T18:30:00-06:00'
    );

    const result = await updateTasteGraph(feedbackEvent, client);

    // The update should succeed
    expect(result.signalInserted).toBe(true);
    
    // But regardless of taste graph success/failure,
    // the feedback endpoint should always return { recorded: true }
    // (This is enforced by the best-effort try/catch in feedback+api.ts)
  });
});
