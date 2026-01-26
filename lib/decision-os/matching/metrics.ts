/**
 * FAST FOOD: Matching Metrics (Dev-Only)
 * 
 * Internal metrics aggregator for debugging inventory matching.
 * Only logs in development mode with single-line output.
 * 
 * INVARIANTS:
 * - Dev-only: no logging in production
 * - Single-line log format
 * - No item names, tokens, arrays, or payloads logged
 * - Metrics are per-request, reset between requests
 */

// =============================================================================
// TYPES
// =============================================================================

export interface MatchingMetrics {
  /** Total match attempts */
  matchAttempts: number;
  /** Successful matches (score >= threshold) */
  matchSuccess: number;
  /** Matches rejected due to low score */
  matchRejectedLowScore: number;
}

// =============================================================================
// METRICS STATE
// =============================================================================

/**
 * Current request metrics.
 * Reset at the start of each decision request.
 */
let currentMetrics: MatchingMetrics = {
  matchAttempts: 0,
  matchSuccess: 0,
  matchRejectedLowScore: 0,
};

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Reset metrics for a new request.
 * Should be called at the start of each decision request.
 */
export function resetMetrics(): void {
  currentMetrics = {
    matchAttempts: 0,
    matchSuccess: 0,
    matchRejectedLowScore: 0,
  };
}

/**
 * Record a match attempt.
 * @param success - Whether the match was successful
 * @param rejectedLowScore - Whether the match was rejected due to low score
 */
export function recordMatchAttempt(success: boolean, rejectedLowScore: boolean = false): void {
  currentMetrics.matchAttempts++;
  if (success) {
    currentMetrics.matchSuccess++;
  }
  if (rejectedLowScore) {
    currentMetrics.matchRejectedLowScore++;
  }
}

/**
 * Get current metrics (for testing).
 */
export function getMetrics(): MatchingMetrics {
  return { ...currentMetrics };
}

/**
 * Log metrics in development mode.
 * Outputs a single line: [match] attempts=X success=Y rejected_low=Z
 * 
 * Only logs if NODE_ENV === 'development' and there were any attempts.
 */
export function logMetrics(): void {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }
  
  if (currentMetrics.matchAttempts === 0) {
    return;
  }
  
  console.log(
    `[match] attempts=${currentMetrics.matchAttempts} success=${currentMetrics.matchSuccess} rejected_low=${currentMetrics.matchRejectedLowScore}`
  );
}
