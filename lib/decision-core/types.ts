import type { AllergenTag, ConstraintTag, Mode, RecipeSeed } from '../seeds/types';
export type { Mode } from '../seeds/types';

export type HourBlock = 'morning' | 'lunch' | 'afternoon' | 'evening' | 'late';
export type Season = 'winter' | 'spring' | 'summer' | 'fall';
export type TempBucket = 'cold' | 'mild' | 'hot' | 'unknown';
export type EnergyState = 'unknown' | 'low' | 'ok';
export type WeatherSource = 'cache' | 'stale' | 'none';

export interface ContextSignature {
  v: 1;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  hour_block: HourBlock;
  season: Season;
  temp_bucket: TempBucket;
  geo_bucket: string;
  energy: EnergyState;
  weather_source: WeatherSource;
  computed_at: string;
  mode: Mode;
  constraints: {
    exclude_allergens: AllergenTag[];
    include_constraints?: ConstraintTag[];
  };
}

export interface MealCandidate {
  mealId: string;
  mode: Mode;
  estimatedMinutes: number;
  estimatedCostCents: number;
  recipe: RecipeSeed;
}

export interface UserConstraints {
  excludeAllergens: AllergenTag[];
  includeConstraints: ConstraintTag[];
}

export interface DecisionHistory {
  recentMealIds: string[];
  recentRejectedMealIds: string[];
}

export interface UserWeights {
  v: 1;
  base: {
    inventory_match: number;
    novelty_penalty: number;
    recent_reject_penalty: number;
    prior_weight?: number;
    recency_penalty?: number;
  };
  mode: Record<Mode, number>;
  hour_block: Record<HourBlock, number>;
  season: Record<Season, number>;
  temp_bucket: Record<TempBucket, number>;
}

export type GlobalPriorMap = Record<string, number>;

export interface EvaluatedDecision {
  mealId: string;
  decisionType: 'cook';
  score: number;
  explanationLine: string;
  latencyMs: number;
  contextBucketKey: string;
}

export interface EvaluateDecisionInput {
  candidates: MealCandidate[];
  context: ContextSignature;
  constraints: UserConstraints;
  history: DecisionHistory;
  userWeights: UserWeights;
  globalPriors: GlobalPriorMap;
  learnedMealWeights?: Map<string, number>;
}
