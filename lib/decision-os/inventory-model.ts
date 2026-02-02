/**
 * FAST FOOD: Inventory Decay + Consumption Model
 * 
 * MVP-grade inventory model:
 * estimated_remaining = starting_inventory - meals_used - time_decay
 * 
 * INVARIANTS:
 * - Inventory remains probabilistic and advisory; NEVER blocks decisions
 * - All calculations are best-effort; missing data returns null/defaults
 * - Decay is simple linear model for simplicity and inspectability
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Extended inventory item with consumption/decay fields
 */
export interface InventoryItemWithDecay {
  id: string;
  household_key: string;
  item_name: string;
  qty_estimated: number | null;
  qty_used_estimated: number | null;
  unit: string | null;
  confidence: number;
  source: string;
  last_seen_at: string;        // ISO timestamp - when item was observed/added
  last_used_at: string | null; // ISO timestamp - when item was consumed
  expires_at: string | null;
  decay_rate_per_day: number | null;
  created_at: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default decay rate if not specified (5% per day)
 * At this rate, item confidence/qty halves in ~14 days
 */
export const DEFAULT_DECAY_RATE_PER_DAY = 0.05;

/**
 * Minimum confidence floor after decay (20% of original)
 * Prevents complete confidence loss for recent items
 */
export const MIN_CONFIDENCE_FLOOR = 0.2;

/**
 * Confidence decay rate (3% per day)
 * Separate from qty decay - confidence decays slower
 */
export const CONFIDENCE_DECAY_RATE_PER_DAY = 0.03;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate days elapsed since a timestamp
 * @param fromIso - ISO timestamp string
 * @param toIso - ISO timestamp string (defaults to now)
 * @returns Number of days (can be fractional)
 */
export function daysSince(fromIso: string, toIso?: string): number {
  const from = new Date(fromIso);
  const to = toIso ? new Date(toIso) : new Date();
  
  // Handle invalid dates
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return 0;
  }
  
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffMs = to.getTime() - from.getTime();
  
  // Don't return negative days
  return Math.max(0, diffMs / msPerDay);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// =============================================================================
// DECAY FUNCTIONS
// =============================================================================

/**
 * Estimate remaining quantity of an inventory item after usage and decay.
 * 
 * Formula: 
 *   base = qty_estimated - qty_used_estimated
 *   days = days_since(last_seen_at, now)
 *   decayMultiplier = max(0, 1 - days * decay_rate_per_day)
 *   remaining = max(0, base * decayMultiplier)
 * 
 * @param invItem - Inventory item with decay fields
 * @param nowIso - Current time as ISO string (optional, defaults to now)
 * @returns Estimated remaining quantity, or null if qty_estimated is null
 * 
 * INVARIANT: Returns null if qty_estimated is null (unknown quantity)
 */
export function estimateRemainingQty(
  invItem: InventoryItemWithDecay,
  nowIso?: string
): number | null {
  // If we don't know the starting quantity, we can't estimate remaining
  if (invItem.qty_estimated === null || invItem.qty_estimated === undefined) {
    return null;
  }
  
  // Calculate base quantity (starting - used)
  const qtyUsed = invItem.qty_used_estimated ?? 0;
  const base = invItem.qty_estimated - qtyUsed;
  
  // Calculate days since last seen
  const days = daysSince(invItem.last_seen_at, nowIso);
  
  // Calculate decay multiplier
  const decayRate = invItem.decay_rate_per_day ?? DEFAULT_DECAY_RATE_PER_DAY;
  const decayMultiplier = Math.max(0, 1 - days * decayRate);
  
  // Apply decay and ensure non-negative
  const remaining = Math.max(0, base * decayMultiplier);
  
  return remaining;
}

/**
 * Calculate decayed confidence for an inventory item.
 * 
 * Formula:
 *   days = days_since(last_seen_at, now)
 *   multiplier = max(0.2, 1 - days * 0.03)
 *   decayedConfidence = clamp(confidence * multiplier, 0, 1)
 * 
 * @param invItem - Inventory item with confidence and last_seen_at
 * @param nowIso - Current time as ISO string (optional, defaults to now)
 * @returns Decayed confidence value between 0 and 1
 * 
 * INVARIANT: Result is always between 0 and 1
 * INVARIANT: Result is always at least MIN_CONFIDENCE_FLOOR * original confidence
 */
export function decayConfidence(
  invItem: Pick<InventoryItemWithDecay, 'confidence' | 'last_seen_at'>,
  nowIso?: string
): number {
  // Calculate days since last seen
  const days = daysSince(invItem.last_seen_at, nowIso);
  
  // Calculate decay multiplier with floor
  const multiplier = Math.max(MIN_CONFIDENCE_FLOOR, 1 - days * CONFIDENCE_DECAY_RATE_PER_DAY);
  
  // Apply multiplier and clamp to valid range
  const decayedConfidence = clamp(invItem.confidence * multiplier, 0, 1);
  
  return decayedConfidence;
}

/**
 * Check if an inventory item is likely still available.
 * Combines remaining quantity (if known) and decayed confidence.
 * 
 * @param invItem - Inventory item
 * @param nowIso - Current time
 * @param confidenceThreshold - Minimum confidence to consider available (default 0.60)
 * @returns true if item is likely available
 */
export function isItemLikelyAvailable(
  invItem: InventoryItemWithDecay,
  nowIso?: string,
  confidenceThreshold: number = 0.60
): boolean {
  // Check decayed confidence first
  const decayedConf = decayConfidence(invItem, nowIso);
  if (decayedConf < confidenceThreshold) {
    return false;
  }
  
  // If we have quantity info, check if any remains
  const remaining = estimateRemainingQty(invItem, nowIso);
  if (remaining !== null && remaining <= 0) {
    return false;
  }
  
  return true;
}

/**
 * Get the effective score for an inventory item for arbiter scoring.
 * Uses remaining quantity if available, otherwise decayed confidence.
 * 
 * @param invItem - Inventory item
 * @param nowIso - Current time
 * @returns Score between 0 and 1
 */
export function getInventoryScore(
  invItem: InventoryItemWithDecay,
  nowIso?: string
): number {
  const remaining = estimateRemainingQty(invItem, nowIso);
  const decayedConf = decayConfidence(invItem, nowIso);
  
  // If we have remaining quantity and it's > 0, use confidence
  // If remaining is 0 or negative, score is 0 (used up)
  if (remaining !== null) {
    if (remaining <= 0) {
      return 0;
    }
    // Item has remaining quantity - use decayed confidence as score
    return decayedConf;
  }
  
  // No quantity info - just use decayed confidence
  return decayedConf;
}

// =============================================================================
// CONSUMPTION HELPER
// =============================================================================

/**
 * Parse a simple numeric quantity from qty_text.
 * Only handles simple patterns like "2", "1.5", "3 lb", "2 cups".
 * 
 * @param qtyText - Raw quantity text (e.g., "2 lb", "1.5")
 * @returns Parsed number or 1 if unparseable
 */
export function parseSimpleQty(qtyText: string | null | undefined): number {
  if (!qtyText) return 1;
  
  // Try to extract leading number
  const match = qtyText.match(/^(\d+(?:\.\d+)?)/);
  if (match) {
    const parsed = parseFloat(match[1]);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  
  return 1; // Default to 1 if unparseable
}
