/**
 * FAST FOOD: Taste Graph Types
 * 
 * INVARIANTS:
 * - Features are INTERNAL ONLY - never sent to client
 * - taste_signals is append-only
 * - taste_meal_scores is a mutable cache
 */

// =============================================================================
// DATABASE ROW TYPES
// =============================================================================

/**
 * Row type for taste_signals table (APPEND-ONLY)
 */
export interface TasteSignalRow {
  id: string;
  household_key: string;
  decided_at: string;
  actioned_at: string | null;
  decision_event_id: string;
  meal_id: string | null;
  decision_type: 'cook' | 'order' | 'zero_cook';
  user_action: 'approved' | 'rejected' | 'drm_triggered' | 'expired';
  context_hash: string;
  features: Record<string, unknown>; // INTERNAL ONLY - never sent to client
  weight: number;
  created_at: string;
}

/**
 * Row type for taste_meal_scores table (MUTABLE CACHE)
 */
export interface TasteMealScoreRow {
  household_key: string;
  meal_id: string;
  score: number;
  approvals: number;
  rejections: number;
  last_seen_at: string | null;
  updated_at: string;
}

// =============================================================================
// INSERT/UPDATE TYPES
// =============================================================================

/**
 * Data required to insert a taste signal
 */
export interface InsertTasteSignalData {
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
}

/**
 * Data required to upsert a taste meal score
 */
export interface UpsertTasteMealScoreData {
  householdKey: string;
  mealId: string;
  weightDelta: number;
  isApproval: boolean;
  isRejection: boolean;
  decidedAt: string;
}
