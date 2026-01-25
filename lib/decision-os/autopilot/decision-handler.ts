/**
 * Autopilot Decision Handler
 * 
 * Handles the decision endpoint logic for autopilot eligibility and approval.
 * 
 * KEY INVARIANTS:
 * - Autopilot approval is IDEMPOTENT (never creates duplicate rows)
 * - Consumption hooks run ONLY when new row is inserted
 * - Taste hooks run ONLY when new row is inserted
 * - Undo throttles autopilot for 72 hours (recent_undo gate)
 * 
 * CANONICAL MARKERS (schema-true):
 * - Autopilot approval: user_action='approved', notes='autopilot'
 * - Undo: user_action='rejected', notes='undo_autopilot'
 */

import type { DecisionEvent, DecisionEventInsert } from '../../../types/decision-os';
import { 
  checkAutopilotEligibility, 
  type AutopilotEligibility 
} from './policy';
import {
  createAutopilotApproval,
  hasAutopilotApproval,
  isAutopilotApprovalEvent,
  shouldRunConsumption,
  shouldUpdateTasteGraph,
  shouldUpdateTasteMealScores,
  NOTES,
} from '../feedback/handler';
import { computeTasteWeight } from '../taste/weights';

// =============================================================================
// MOCK STORES FOR TESTING (simulates DB)
// =============================================================================

/**
 * In-memory decision events store (mock DB)
 */
const decisionEventsStore: Map<string, DecisionEvent> = new Map();

/**
 * In-memory taste signals store (mock DB)
 */
const tasteSignalsStore: Map<string, { meal_id?: number; weight: number; event_id: string }> = new Map();

/**
 * In-memory taste meal scores store (mock DB)
 */
const tasteMealScoresStore: Map<string, { 
  meal_id: number; 
  score: number; 
  approvals: number; 
  rejections: number;
}> = new Map();

/**
 * In-memory consumption log (mock DB)
 */
const consumptionLogStore: Map<string, { 
  meal_id: number; 
  qty_used_estimated: number;
  event_id: string;
}> = new Map();

/**
 * Clear all stores (for testing)
 */
export function clearAutopilotStores(): void {
  decisionEventsStore.clear();
  tasteSignalsStore.clear();
  tasteMealScoresStore.clear();
  consumptionLogStore.clear();
}

/**
 * Get all decision events (for testing)
 */
export function getDecisionEvents(): DecisionEvent[] {
  return Array.from(decisionEventsStore.values());
}

/**
 * Get decision events for a specific original event (by context_hash)
 */
export function getDecisionEventsByContextHash(contextHash: string): DecisionEvent[] {
  return Array.from(decisionEventsStore.values())
    .filter(e => e.context_hash === contextHash);
}

/**
 * Get taste signals (for testing)
 */
export function getTasteSignals(): Array<{ meal_id?: number; weight: number; event_id: string }> {
  return Array.from(tasteSignalsStore.values());
}

/**
 * Get taste meal scores (for testing)
 */
export function getTasteMealScores(): Map<string, { 
  meal_id: number; 
  score: number; 
  approvals: number; 
  rejections: number;
}> {
  return new Map(tasteMealScoresStore);
}

/**
 * Get consumption log (for testing)
 */
export function getConsumptionLog(): Array<{ meal_id: number; qty_used_estimated: number; event_id: string }> {
  return Array.from(consumptionLogStore.values());
}

/**
 * Insert a decision event (mock DB insert)
 */
export function insertDecisionEvent(event: DecisionEvent | DecisionEventInsert): void {
  decisionEventsStore.set(event.id, event as DecisionEvent);
}

/**
 * Seed events for testing (e.g., user history)
 */
export function seedDecisionEvents(events: DecisionEvent[]): void {
  for (const event of events) {
    decisionEventsStore.set(event.id, event);
  }
}

// =============================================================================
// AUTOPILOT DECISION PROCESSING
// =============================================================================

/**
 * Result of autopilot decision processing
 */
export interface AutopilotDecisionResult {
  autopilotApplied: boolean;
  autopilotEligibility: AutopilotEligibility;
  feedbackCopyInserted: boolean;
  feedbackCopy?: DecisionEventInsert;
  consumptionRan: boolean;
  tasteUpdated: boolean;
  tasteMealScoresUpdated: boolean;
}

/**
 * Process a decision with autopilot eligibility check.
 * 
 * This is the main entry point for the decision endpoint's autopilot logic.
 * 
 * IDEMPOTENCY:
 * - If autopilot approval already exists for this context_hash, NO-OP
 * - Consumption only runs on NEW insert
 * - Taste only updates on NEW insert
 * 
 * @param pendingEvent - The pending decision event
 * @param userHistory - User's historical decision events (for approval rate)
 * @param referenceDate - Reference date for window calculations
 * @returns AutopilotDecisionResult with full outcome
 */
export function processAutopilotDecision(
  pendingEvent: DecisionEvent,
  userHistory: DecisionEvent[],
  referenceDate?: Date
): AutopilotDecisionResult {
  // Check autopilot eligibility
  const eligibility = checkAutopilotEligibility(userHistory, undefined, referenceDate);
  
  // Default result for ineligible
  if (!eligibility.eligible) {
    return {
      autopilotApplied: false,
      autopilotEligibility: eligibility,
      feedbackCopyInserted: false,
      consumptionRan: false,
      tasteUpdated: false,
      tasteMealScoresUpdated: false,
    };
  }
  
  // Check for existing autopilot approval (IDEMPOTENCY)
  const existingCopies = pendingEvent.context_hash 
    ? getDecisionEventsByContextHash(pendingEvent.context_hash)
    : [];
    
  if (hasAutopilotApproval(existingCopies)) {
    // Autopilot approval already exists - NO-OP
    return {
      autopilotApplied: true, // Autopilot was already applied
      autopilotEligibility: eligibility,
      feedbackCopyInserted: false, // No new insert
      consumptionRan: false, // No new consumption
      tasteUpdated: false, // No new taste update
      tasteMealScoresUpdated: false,
    };
  }
  
  // Create autopilot approval
  const feedbackCopy = createAutopilotApproval(pendingEvent);
  
  // Insert the feedback copy (append-only)
  insertDecisionEvent(feedbackCopy);
  
  // Run consumption hook (only for NEW insert)
  let consumptionRan = false;
  if (shouldRunConsumption(feedbackCopy)) {
    runConsumptionHook(feedbackCopy);
    consumptionRan = true;
  }
  
  // Run taste graph update (only for NEW insert)
  let tasteUpdated = false;
  let tasteMealScoresUpdated = false;
  if (shouldUpdateTasteGraph(feedbackCopy)) {
    runTasteSignalHook(feedbackCopy);
    tasteUpdated = true;
    
    if (shouldUpdateTasteMealScores(feedbackCopy)) {
      runTasteMealScoresHook(feedbackCopy);
      tasteMealScoresUpdated = true;
    }
  }
  
  return {
    autopilotApplied: true,
    autopilotEligibility: eligibility,
    feedbackCopyInserted: true,
    feedbackCopy,
    consumptionRan,
    tasteUpdated,
    tasteMealScoresUpdated,
  };
}

/**
 * Run consumption hook for a feedback event.
 * Only runs for approved events.
 */
function runConsumptionHook(event: DecisionEventInsert): void {
  if (!event.meal_id) return;
  
  const logId = `consumption-${event.id}`;
  consumptionLogStore.set(logId, {
    meal_id: event.meal_id,
    qty_used_estimated: 1, // Simplified: 1 serving
    event_id: event.id,
  });
}

/**
 * Run taste signal hook for a feedback event.
 * Inserts taste_signal row with computed weight.
 */
function runTasteSignalHook(event: DecisionEventInsert): void {
  const weight = computeTasteWeight(event);
  
  const signalId = `signal-${event.id}`;
  tasteSignalsStore.set(signalId, {
    meal_id: event.meal_id,
    weight,
    event_id: event.id,
  });
}

/**
 * Run taste meal scores hook for a feedback event.
 * 
 * IMPORTANT: This is SKIPPED for undo events (notes='undo_autopilot')
 */
function runTasteMealScoresHook(event: DecisionEventInsert): void {
  if (!event.meal_id) return;
  
  // CRITICAL: Skip for undo events
  if (event.notes === NOTES.UNDO_AUTOPILOT) {
    return;
  }
  
  const scoreKey = `score-${event.meal_id}`;
  const existing = tasteMealScoresStore.get(scoreKey) || {
    meal_id: event.meal_id,
    score: 0,
    approvals: 0,
    rejections: 0,
  };
  
  const weight = computeTasteWeight(event);
  
  if (event.user_action === 'approved') {
    existing.score += weight;
    existing.approvals += 1;
  } else if (event.user_action === 'rejected') {
    existing.score += weight;
    existing.rejections += 1;
  } else if (event.user_action === 'drm_triggered') {
    existing.score += weight;
    // drm_triggered doesn't count as approval or rejection
  }
  
  tasteMealScoresStore.set(scoreKey, existing);
}

/**
 * Process feedback with proper hook execution.
 * 
 * Used after feedback endpoint creates a feedback copy.
 * Ensures hooks only run for NEW inserts (not duplicates).
 * 
 * @param feedbackCopy - The feedback copy to process
 * @param isNewInsert - Whether this is a new insert (not duplicate)
 */
export function processAutopilotFeedbackHooks(
  feedbackCopy: DecisionEventInsert,
  isNewInsert: boolean
): { consumptionRan: boolean; tasteUpdated: boolean; tasteMealScoresUpdated: boolean } {
  if (!isNewInsert) {
    return {
      consumptionRan: false,
      tasteUpdated: false,
      tasteMealScoresUpdated: false,
    };
  }
  
  // Insert the feedback copy
  insertDecisionEvent(feedbackCopy);
  
  // Run consumption hook
  let consumptionRan = false;
  if (shouldRunConsumption(feedbackCopy)) {
    runConsumptionHook(feedbackCopy);
    consumptionRan = true;
  }
  
  // Run taste graph update
  let tasteUpdated = false;
  let tasteMealScoresUpdated = false;
  if (shouldUpdateTasteGraph(feedbackCopy)) {
    runTasteSignalHook(feedbackCopy);
    tasteUpdated = true;
    
    if (shouldUpdateTasteMealScores(feedbackCopy)) {
      runTasteMealScoresHook(feedbackCopy);
      tasteMealScoresUpdated = true;
    }
  }
  
  return {
    consumptionRan,
    tasteUpdated,
    tasteMealScoresUpdated,
  };
}
