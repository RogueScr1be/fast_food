import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GlobalPriorMap, HourBlock, Mode, Season, TempBucket, UserWeights } from './types';
import { bootstrapLearningActor, getLearningAuthTokenSync } from '../learning/actor';
import { objectToMap } from '../learning/weights-v1';
import { getSupabaseClient } from '../supabase/client';
import { ensureAnonymousAuth } from '../supabase/auth';

const STORAGE_KEYS = {
  userWeights: 'ff:v1:user_weights',
  globalPriors: 'ff:v1:global_priors',
  serverMealWeights: 'ff:v1:server_meal_weights',
} as const;
const API_BASE = process.env.EXPO_PUBLIC_DECISION_OS_API_BASE_URL?.replace(/\/+$/, '') ?? null;

const DEFAULT_MODE: Record<Mode, number> = {
  fancy: 0,
  easy: 0.4,
  cheap: 0.2,
};

const DEFAULT_HOUR_BLOCK: Record<HourBlock, number> = {
  morning: 0,
  lunch: 0.1,
  afternoon: 0,
  evening: 0.5,
  late: 0.7,
};

const DEFAULT_SEASON: Record<Season, number> = {
  winter: 0.2,
  spring: 0,
  summer: -0.1,
  fall: 0,
};

const DEFAULT_TEMP: Record<TempBucket, number> = {
  cold: 0.3,
  mild: 0,
  hot: -0.2,
  unknown: 0,
};

export const DEFAULT_USER_WEIGHTS: UserWeights = {
  v: 1,
  base: {
    inventory_match: 1.1,
    novelty_penalty: -0.3,
    recency_penalty: -0.2,
    recent_reject_penalty: -0.7,
    prior_weight: 0.05,
  },
  mode: DEFAULT_MODE,
  hour_block: DEFAULT_HOUR_BLOCK,
  season: DEFAULT_SEASON,
  temp_bucket: DEFAULT_TEMP,
};

let userWeightsCache: UserWeights = DEFAULT_USER_WEIGHTS;
let globalPriorsCache: GlobalPriorMap = {};
let serverMealWeightsCache = new Map<string, number>();

export function getUserWeightsSync(): UserWeights {
  return userWeightsCache;
}

export function getGlobalPriorsSync(): GlobalPriorMap {
  return globalPriorsCache;
}

export function getServerMealWeightsSync(): Map<string, number> {
  return new Map(serverMealWeightsCache);
}

export async function setUserWeightsLocal(weights: UserWeights): Promise<void> {
  userWeightsCache = weights;
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.userWeights, JSON.stringify(weights));
  } catch {
    // Best effort only.
  }
}

async function setServerMealWeightsLocal(weights: Map<string, number>): Promise<void> {
  serverMealWeightsCache = new Map(weights);
  try {
    const asObject: Record<string, number> = {};
    for (const [mealId, value] of weights.entries()) {
      asObject[mealId] = value;
    }
    await AsyncStorage.setItem(STORAGE_KEYS.serverMealWeights, JSON.stringify(asObject));
  } catch {
    // Best effort only.
  }
}

function trySetMealWeightsFromUnknown(payload: unknown): boolean {
  const weights = objectToMap(payload);
  if (weights.size === 0) return false;
  void setServerMealWeightsLocal(weights);
  return true;
}

function applyRemoteUserWeightsPayload(payload: {
  weights?: unknown;
  meal_weights?: unknown;
}): void {
  const maybeWeights = payload.weights as Partial<UserWeights> | undefined;
  if (
    maybeWeights?.v === 1 &&
    typeof maybeWeights.base === 'object' &&
    maybeWeights.base !== null &&
    typeof maybeWeights.mode === 'object' &&
    maybeWeights.mode !== null
  ) {
    void setUserWeightsLocal(maybeWeights as UserWeights);
  }

  const maybeRoot = payload.weights as { meal_weights?: unknown } | undefined;
  if (!trySetMealWeightsFromUnknown(payload.meal_weights)) {
    if (!trySetMealWeightsFromUnknown(maybeRoot?.meal_weights)) {
      void trySetMealWeightsFromUnknown(payload.weights);
    }
  }
}

export async function setGlobalPriorsLocal(priors: GlobalPriorMap): Promise<void> {
  globalPriorsCache = priors;
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.globalPriors, JSON.stringify(priors));
  } catch {
    // Best effort only.
  }
}

export async function bootstrapDecisionWeights(): Promise<void> {
  try {
    const [weightsRaw, priorsRaw, serverWeightsRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.userWeights),
      AsyncStorage.getItem(STORAGE_KEYS.globalPriors),
      AsyncStorage.getItem(STORAGE_KEYS.serverMealWeights),
    ]);

    if (weightsRaw) {
      const parsed = JSON.parse(weightsRaw) as UserWeights;
      if (parsed?.v === 1) {
        userWeightsCache = parsed;
      }
    }

    if (priorsRaw) {
      const parsed = JSON.parse(priorsRaw) as GlobalPriorMap;
      if (parsed && typeof parsed === 'object') {
        globalPriorsCache = parsed;
      }
    }

    if (serverWeightsRaw) {
      const parsed = JSON.parse(serverWeightsRaw);
      serverMealWeightsCache = objectToMap(parsed);
    }
  } catch {
    // Keep defaults.
  }

  // Refresh remote in background, never blocking app startup.
  void refreshRemote();
}

async function refreshRemote(): Promise<void> {
  const refreshedViaApi = await refreshViaDecisionApi();
  if (!refreshedViaApi) {
    await refreshFromSupabase();
  }
}

async function refreshViaDecisionApi(): Promise<boolean> {
  if (!API_BASE) return false;

  try {
    await bootstrapLearningActor();
    const token = getLearningAuthTokenSync();
    if (!token) return false;

    let anySuccess = false;
    const [weightsRes, priorsRes] = await Promise.all([
      fetch(`${API_BASE}/api/decision-os/user-weights`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      fetch(`${API_BASE}/api/decision-os/global-priors`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
    ]);

    if (weightsRes.ok) {
      anySuccess = true;
      const payload = (await weightsRes.json()) as {
        weights?: unknown;
        meal_weights?: unknown;
      };
      applyRemoteUserWeightsPayload(payload);
    }

    if (priorsRes.ok) {
      anySuccess = true;
      const payload = (await priorsRes.json()) as {
        priors?: Array<{ bucket_key: string; meal_key: string; prior_score: number }>;
      };
      if (Array.isArray(payload.priors)) {
        const map: GlobalPriorMap = {};
        for (const row of payload.priors) {
          if (!row.bucket_key || !row.meal_key) continue;
          map[`${row.bucket_key}|meal:${row.meal_key}`] = Number(row.prior_score ?? 0);
        }
        await setGlobalPriorsLocal(map);
      }
    }

    return anySuccess;
  } catch {
    return false;
  }
}

async function refreshFromSupabase(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    await ensureAnonymousAuth(supabase);

    const [weightsRes, priorsRes] = await Promise.all([
      supabase
        .from('user_weights')
        .select('weights, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('global_priors')
        .select('bucket_key, meal_key, meal_id, prior_score, sample_count, household_count')
        .gte('sample_count', 200)
        .gte('household_count', 30)
        .limit(1000),
    ]);

    if (weightsRes.data?.weights) {
      applyRemoteUserWeightsPayload({
        weights: weightsRes.data.weights,
      });
    }

    if (Array.isArray(priorsRes.data)) {
      const map: GlobalPriorMap = {};
      for (const row of priorsRes.data) {
        const mealKey = row.meal_key ?? (row.meal_id !== null ? String(row.meal_id) : null);
        if (!row.bucket_key || !mealKey) continue;
        const key = `${row.bucket_key}|meal:${String(mealKey)}`;
        map[key] = Number(row.prior_score ?? 0);
      }
      await setGlobalPriorsLocal(map);
    }
  } catch {
    // Remote refresh is best effort.
  }
}
