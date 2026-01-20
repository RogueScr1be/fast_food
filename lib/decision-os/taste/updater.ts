/**
 * FAST FOOD: Taste Graph - Score Updater
 * 
 * Updates taste signals and meal scores on feedback events.
 * 
 * INVARIANTS:
 * - Best-effort: failures must not block feedback flow
 * - taste_signals is append-only (DB trigger enforced)
 * - taste_meal_scores is upserted (mutable cache)
 * - Deterministic scoring
 */

import { randomUUID } from 'crypto';
import type { DecisionEventRow } from '@/types/decision-os/decision';
import type { DatabaseClient } from '../database';
import { loadAndExtractFeatures, createEmptyFeatures } from './features';
import { computeWeight, type UserActionForWeight } from './weights';

// =============================================================================
// TYPES
// =============================================================================

export interface TasteUpdateResult {
  signalInserted: boolean;
  scoreUpdated: boolean;
  error?: string;
}

// =============================================================================
// INSERT TASTE SIGNAL
// =============================================================================

/**
 * Insert a taste signal row (append-only).
 * 
 * @param data - Signal data
 * @param client - Database client
 * @throws if insert fails (caught by caller)
 */
export async function insertTasteSignal(
  data: {
    id: string;
    householdKey: string;
    decidedAt: string;
    actionedAt: string | null;
    decisionEventId: string;
    mealId: string | null;
    decisionType: 'cook' | 'order' | 'zero_cook';
    userAction: 'approved' | 'rejected' | 'drm_triggered' | 'expired';
    contextHash: string;
    features: Record<string, unknown>;
    weight: number;
  },
  client: DatabaseClient
): Promise<void> {
  await client.query(
    `INSERT INTO decision_os.taste_signals 
     (id, household_key, decided_at, actioned_at, decision_event_id, meal_id,
      decision_type, user_action, context_hash, features, weight)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      data.id,
      data.householdKey,
      data.decidedAt,
      data.actionedAt,
      data.decisionEventId,
      data.mealId,
      data.decisionType,
      data.userAction,
      data.contextHash,
      JSON.stringify(data.features),
      data.weight,
    ]
  );
}

// =============================================================================
// UPSERT TASTE MEAL SCORE
// =============================================================================

/**
 * Upsert a taste meal score row.
 * 
 * @param data - Score update data
 * @param client - Database client
 */
export async function upsertTasteMealScore(
  data: {
    householdKey: string;
    mealId: string;
    weightDelta: number;
    isApproval: boolean;
    isRejection: boolean;
    decidedAt: string;
  },
  client: DatabaseClient
): Promise<void> {
  // Upsert: INSERT or UPDATE on conflict
  await client.query(
    `INSERT INTO decision_os.taste_meal_scores 
     (household_key, meal_id, score, approvals, rejections, last_seen_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (household_key, meal_id) DO UPDATE SET
       score = decision_os.taste_meal_scores.score + EXCLUDED.score,
       approvals = decision_os.taste_meal_scores.approvals + EXCLUDED.approvals,
       rejections = decision_os.taste_meal_scores.rejections + EXCLUDED.rejections,
       last_seen_at = EXCLUDED.last_seen_at,
       updated_at = NOW()`,
    [
      data.householdKey,
      data.mealId,
      data.weightDelta,
      data.isApproval ? 1 : 0,
      data.isRejection ? 1 : 0,
      data.decidedAt,
    ]
  );
}

// =============================================================================
// MAIN UPDATER
// =============================================================================

/**
 * Process a feedback event and update taste graph.
 * 
 * Called after feedback copy insert succeeds.
 * Must be best-effort - failures don't block feedback response.
 * 
 * @param feedbackEvent - The feedback copy decision event row (has user_action set)
 * @param client - Database client
 * @returns Result indicating what was updated
 */
export async function updateTasteGraph(
  feedbackEvent: DecisionEventRow,
  client: DatabaseClient
): Promise<TasteUpdateResult> {
  const result: TasteUpdateResult = {
    signalInserted: false,
    scoreUpdated: false,
  };
  
  try {
    // Validate user_action is a valid feedback action (not 'pending')
    const userAction = feedbackEvent.user_action;
    if (!['approved', 'rejected', 'drm_triggered', 'expired'].includes(userAction)) {
      result.error = `Invalid user_action for taste signal: ${userAction}`;
      return result;
    }
    
    // Extract features (only if meal_id present)
    let features: Record<string, unknown> = createEmptyFeatures();
    
    if (feedbackEvent.meal_id) {
      const mealFeatures = await loadAndExtractFeatures(feedbackEvent.meal_id, client);
      if (mealFeatures) {
        features = mealFeatures as unknown as Record<string, unknown>;
      }
    }
    
    // Compute weight
    const weight = computeWeight(
      userAction as UserActionForWeight,
      feedbackEvent.actioned_at
    );
    
    // Generate signal ID
    const signalId = randomUUID();
    
    // Insert taste signal (append-only)
    await insertTasteSignal(
      {
        id: signalId,
        householdKey: feedbackEvent.household_key,
        decidedAt: feedbackEvent.decided_at,
        actionedAt: feedbackEvent.actioned_at ?? null,
        decisionEventId: feedbackEvent.id,
        mealId: feedbackEvent.meal_id,
        decisionType: feedbackEvent.decision_type,
        userAction: userAction as 'approved' | 'rejected' | 'drm_triggered' | 'expired',
        contextHash: feedbackEvent.context_hash,
        features,
        weight,
      },
      client
    );
    
    result.signalInserted = true;
    
    // Upsert meal score (only if meal_id present)
    if (feedbackEvent.meal_id) {
      await upsertTasteMealScore(
        {
          householdKey: feedbackEvent.household_key,
          mealId: feedbackEvent.meal_id,
          weightDelta: weight,
          isApproval: userAction === 'approved',
          isRejection: userAction === 'rejected',
          decidedAt: feedbackEvent.decided_at,
        },
        client
      );
      
      result.scoreUpdated = true;
    }
    
    return result;
  } catch (error) {
    // Best-effort: log error but don't throw
    result.error = error instanceof Error ? error.message : 'Unknown error';
    console.warn('Taste graph update failed (non-blocking):', result.error);
    return result;
  }
}

/**
 * Get a taste meal score by household and meal ID.
 * 
 * @param householdKey - Household key
 * @param mealId - Meal ID
 * @param client - Database client
 * @returns Score row or null if not found
 */
export async function getTasteMealScore(
  householdKey: string,
  mealId: string,
  client: DatabaseClient
): Promise<{
  score: number;
  approvals: number;
  rejections: number;
  last_seen_at: string | null;
} | null> {
  const result = await client.query<{
    score: number;
    approvals: number;
    rejections: number;
    last_seen_at: string | null;
  }>(
    `SELECT score, approvals, rejections, last_seen_at 
     FROM decision_os.taste_meal_scores 
     WHERE household_key = $1 AND meal_id = $2`,
    [householdKey, mealId]
  );
  
  return result.rows[0] ?? null;
}

/**
 * Get taste signal by decision event ID.
 * Used primarily for testing deduplication.
 * 
 * @param decisionEventId - The decision event ID
 * @param client - Database client
 * @returns Signal row or null
 */
export async function getTasteSignalByEventId(
  decisionEventId: string,
  client: DatabaseClient
): Promise<{
  id: string;
  household_key: string;
  meal_id: string | null;
  weight: number;
  features: Record<string, unknown>;
} | null> {
  const result = await client.query<{
    id: string;
    household_key: string;
    meal_id: string | null;
    weight: number;
    features: Record<string, unknown>;
  }>(
    `SELECT id, household_key, meal_id, weight, features 
     FROM decision_os.taste_signals 
     WHERE decision_event_id = $1`,
    [decisionEventId]
  );
  
  return result.rows[0] ?? null;
}
