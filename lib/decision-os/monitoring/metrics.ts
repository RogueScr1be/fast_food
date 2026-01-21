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
 * DB PERSISTENCE:
 * - In production OR when METRICS_DB_ENABLED=true, metrics are also written to DB
 * - DB writes are fail-safe (errors don't crash endpoints)
 * - DB failures increment metrics_db_failed counter
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
  | 'db_flags_error'
  | 'metrics_db_failed'
  | 'readonly_hit';

/**
 * Metrics snapshot type
 */
export type MetricsSnapshot = {
  [K in MetricName]?: number;
};

/**
 * DB client interface for metrics persistence
 */
export interface MetricsDbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// In-memory counters
const counters: Map<MetricName, number> = new Map();

// Optional DB client for persistent metrics
let dbClient: MetricsDbClient | null = null;

/**
 * Set the DB client for persistent metrics
 */
export function setMetricsDbClient(client: MetricsDbClient | null): void {
  dbClient = client;
}

/**
 * Check if DB persistence is enabled
 */
function isDbPersistenceEnabled(): boolean {
  const prod = process.env.NODE_ENV === 'production';
  const explicitlyEnabled = process.env.METRICS_DB_ENABLED === 'true';
  return (prod || explicitlyEnabled) && dbClient !== null;
}

/**
 * Get today's date in YYYY-MM-DD format (UTC)
 */
function getTodayUtc(): string {
  return new Date().toISOString().substring(0, 10);
}

/**
 * Flush metric to database (fire-and-forget, fail-safe)
 */
async function flushToDb(name: MetricName): Promise<void> {
  if (!dbClient) return;
  
  const today = getTodayUtc();
  
  try {
    await dbClient.query(
      `INSERT INTO runtime_metrics_daily (day, metric_key, count, updated_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (day, metric_key) DO UPDATE SET
         count = runtime_metrics_daily.count + 1,
         updated_at = NOW()`,
      [today, name]
    );
  } catch {
    // Fail silently - increment local counter only
    // Avoid recursion by not calling record() here
    const current = counters.get('metrics_db_failed') ?? 0;
    counters.set('metrics_db_failed', current + 1);
  }
}

/**
 * Record (increment) a metric counter
 * 
 * @param name - The metric name to increment
 */
export function record(name: MetricName): void {
  const current = counters.get(name) ?? 0;
  counters.set(name, current + 1);
  
  // Optionally flush to DB (non-blocking)
  if (isDbPersistenceEnabled()) {
    // Fire-and-forget - don't await
    flushToDb(name).catch(() => {
      // Silently ignore - already handled in flushToDb
    });
  }
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
