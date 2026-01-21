/**
 * Decision OS Metrics
 * 
 * Minimal, privacy-safe monitoring counters.
 * 
 * PRIVACY RULES:
 * - No identifiers (user IDs, household keys, tokens)
 * - No meal names or food data
 * - No arrays or structured data
 * - Only simple numeric counters
 * 
 * Usage:
 *   import { record, getSnapshot } from './metrics';
 *   record('decision_called');
 *   const snapshot = getSnapshot();
 */

/**
 * Valid metric names (privacy-safe counters only)
 */
export type MetricName =
  | 'healthz_hit'
  | 'decision_called'
  | 'decision_unauthorized'
  | 'receipt_called'
  | 'feedback_called'
  | 'drm_called'
  | 'autopilot_inserted'
  | 'undo_received'
  | 'ocr_provider_failed'
  | 'db_flags_loaded'
  | 'db_flags_cache_hit'
  | 'db_flags_error';

/**
 * Metrics snapshot type
 */
export type MetricsSnapshot = {
  [K in MetricName]?: number;
};

// In-memory counters
const counters: Map<MetricName, number> = new Map();

/**
 * Record (increment) a metric counter
 * 
 * @param name - The metric name to increment
 */
export function record(name: MetricName): void {
  const current = counters.get(name) ?? 0;
  counters.set(name, current + 1);
}

/**
 * Get current snapshot of all metrics
 * 
 * @returns Object with metric names as keys and counts as values
 */
export function getSnapshot(): MetricsSnapshot {
  const snapshot: MetricsSnapshot = {};
  for (const [name, count] of counters) {
    snapshot[name] = count;
  }
  return snapshot;
}

/**
 * Reset all counters (for testing only)
 */
export function reset(): void {
  counters.clear();
}

/**
 * Get a single metric value
 * 
 * @param name - The metric name
 * @returns Current count or 0 if not recorded
 */
export function getMetric(name: MetricName): number {
  return counters.get(name) ?? 0;
}

/**
 * Log metrics to console (dev only, no secrets)
 * Only logs in non-production environments
 */
export function logMetricsIfDev(): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  
  const snapshot = getSnapshot();
  const total = Object.values(snapshot).reduce((a, b) => a + (b ?? 0), 0);
  
  if (total > 0) {
    console.log('[Metrics]', JSON.stringify(snapshot));
  }
}
