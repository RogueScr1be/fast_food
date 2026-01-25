/**
 * Internal Metrics Summary Endpoint (staging/preview only)
 * 
 * GET /api/decision-os/_internal/metrics-summary?days=14
 * 
 * Provides aggregated session metrics for internal review (no dashboards).
 * 
 * Security:
 * - Production: ALWAYS returns 401 unless INTERNAL_METRICS_ENABLED=true
 * - Dev/Staging: Requires auth if SUPABASE_JWT_SECRET exists
 * 
 * Response (CANONICAL CONTRACT):
 * {
 *   ok: boolean,
 *   days_queried: number,
 *   summary: {
 *     total_sessions: number,
 *     accepted_sessions: number,
 *     rescued_sessions: number,
 *     abandoned_sessions: number,
 *     acceptance_rate: number,      // 0.0 - 1.0
 *     rescue_rate: number,          // 0.0 - 1.0
 *     median_time_to_decision_ms: number | null,
 *     p90_time_to_decision_ms: number | null,
 *     intents: {
 *       easy: number,
 *       cheap: number,
 *       quick: number,
 *       no_energy: number
 *     }
 *   },
 *   computed_at: string  // ISO timestamp
 * }
 * 
 * Error Response (401):
 * { error: 'unauthorized' }
 * 
 * INVARIANTS:
 * - No arrays in response
 * - No user IDs, tokens, meal names, or sensitive data
 * - Uses existing sessions table (no new tables)
 */

import { authenticateRequest } from '../../../../lib/decision-os/auth/helper';
import { getDb } from '../../../../lib/decision-os/db/client';

/**
 * Build error response
 */
function buildErrorResponse(error: string, status = 401): Response {
  return Response.json({ error }, { status });
}

/**
 * Check if internal metrics are enabled in production
 */
function isInternalMetricsEnabledInProduction(): boolean {
  return process.env.INTERNAL_METRICS_ENABLED === 'true';
}

/**
 * Check if auth is required (SUPABASE_JWT_SECRET exists)
 */
function isAuthRequired(): boolean {
  return Boolean(process.env.SUPABASE_JWT_SECRET);
}

/**
 * Metrics summary response structure
 */
interface MetricsSummary {
  total_sessions: number;
  accepted_sessions: number;
  rescued_sessions: number;
  abandoned_sessions: number;
  acceptance_rate: number;
  rescue_rate: number;
  median_time_to_decision_ms: number | null;
  p90_time_to_decision_ms: number | null;
  intents: {
    easy: number;
    cheap: number;
    quick: number;
    no_energy: number;
  };
}

/**
 * Query session counts by outcome
 */
async function querySessionCounts(daysAgo: number): Promise<{
  total: number;
  accepted: number;
  rescued: number;
  abandoned: number;
}> {
  const db = getDb();
  
  // Simple counts query - no tenant isolation needed (global aggregate)
  // Note: This is an internal admin endpoint, intentionally not household-scoped
  const sql = `
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE outcome = 'accepted') as accepted,
      COUNT(*) FILTER (WHERE outcome = 'rescued') as rescued,
      COUNT(*) FILTER (WHERE outcome = 'abandoned') as abandoned
    FROM sessions
    WHERE started_at >= NOW() - INTERVAL '${daysAgo} days'
  `;
  
  try {
    const result = await db.query<{
      total: string;
      accepted: string;
      rescued: string;
      abandoned: string;
    }>(sql);
    
    if (result.rows.length === 0) {
      return { total: 0, accepted: 0, rescued: 0, abandoned: 0 };
    }
    
    const row = result.rows[0];
    return {
      total: parseInt(row.total || '0', 10),
      accepted: parseInt(row.accepted || '0', 10),
      rescued: parseInt(row.rescued || '0', 10),
      abandoned: parseInt(row.abandoned || '0', 10),
    };
  } catch {
    return { total: 0, accepted: 0, rescued: 0, abandoned: 0 };
  }
}

/**
 * Query time-to-decision statistics (median and p90)
 * Computed as: ended_at - started_at for accepted sessions
 */
async function queryTimeToDecision(daysAgo: number): Promise<{
  median_ms: number | null;
  p90_ms: number | null;
}> {
  const db = getDb();
  
  // Calculate duration in milliseconds for accepted sessions
  const sql = `
    SELECT 
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000) as median_ms,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000) as p90_ms
    FROM sessions
    WHERE started_at >= NOW() - INTERVAL '${daysAgo} days'
      AND outcome = 'accepted'
      AND ended_at IS NOT NULL
      AND started_at IS NOT NULL
  `;
  
  try {
    const result = await db.query<{
      median_ms: number | null;
      p90_ms: number | null;
    }>(sql);
    
    if (result.rows.length === 0) {
      return { median_ms: null, p90_ms: null };
    }
    
    const row = result.rows[0];
    return {
      median_ms: row.median_ms !== null ? Math.round(row.median_ms) : null,
      p90_ms: row.p90_ms !== null ? Math.round(row.p90_ms) : null,
    };
  } catch {
    return { median_ms: null, p90_ms: null };
  }
}

/**
 * Query intent button usage from session context
 */
async function queryIntentCounts(daysAgo: number): Promise<{
  easy: number;
  cheap: number;
  quick: number;
  no_energy: number;
}> {
  const db = getDb();
  
  // Count sessions where context.intent.selected contains each intent
  // Uses JSONB containment operator
  const sql = `
    SELECT 
      COUNT(*) FILTER (WHERE context->'intent'->'selected' ? 'easy') as easy,
      COUNT(*) FILTER (WHERE context->'intent'->'selected' ? 'cheap') as cheap,
      COUNT(*) FILTER (WHERE context->'intent'->'selected' ? 'quick') as quick,
      COUNT(*) FILTER (WHERE context->'intent'->'selected' ? 'no_energy') as no_energy
    FROM sessions
    WHERE started_at >= NOW() - INTERVAL '${daysAgo} days'
  `;
  
  try {
    const result = await db.query<{
      easy: string;
      cheap: string;
      quick: string;
      no_energy: string;
    }>(sql);
    
    if (result.rows.length === 0) {
      return { easy: 0, cheap: 0, quick: 0, no_energy: 0 };
    }
    
    const row = result.rows[0];
    return {
      easy: parseInt(row.easy || '0', 10),
      cheap: parseInt(row.cheap || '0', 10),
      quick: parseInt(row.quick || '0', 10),
      no_energy: parseInt(row.no_energy || '0', 10),
    };
  } catch {
    return { easy: 0, cheap: 0, quick: 0, no_energy: 0 };
  }
}

/**
 * GET /api/decision-os/_internal/metrics-summary
 */
export async function GET(request: Request): Promise<Response> {
  const isProd = process.env.NODE_ENV === 'production';
  
  // Production: block unless explicitly enabled
  if (isProd && !isInternalMetricsEnabledInProduction()) {
    return buildErrorResponse('unauthorized');
  }
  
  // Require auth if JWT secret is configured
  if (isAuthRequired()) {
    const authHeader = request.headers.get('Authorization');
    const authResult = await authenticateRequest(authHeader);
    
    if (!authResult.success) {
      return buildErrorResponse('unauthorized');
    }
  }
  
  // Parse days parameter (default: 14)
  const url = new URL(request.url);
  const daysParam = url.searchParams.get('days');
  const days = Math.min(Math.max(parseInt(daysParam || '14', 10), 1), 90); // Clamp to 1-90
  
  // Query data
  const [counts, timeStats, intents] = await Promise.all([
    querySessionCounts(days),
    queryTimeToDecision(days),
    queryIntentCounts(days),
  ]);
  
  // Calculate rates
  const completedSessions = counts.accepted + counts.rescued + counts.abandoned;
  const acceptanceRate = completedSessions > 0 
    ? counts.accepted / completedSessions 
    : 0;
  const rescueRate = completedSessions > 0 
    ? counts.rescued / completedSessions 
    : 0;
  
  // Build summary
  const summary: MetricsSummary = {
    total_sessions: counts.total,
    accepted_sessions: counts.accepted,
    rescued_sessions: counts.rescued,
    abandoned_sessions: counts.abandoned,
    acceptance_rate: Math.round(acceptanceRate * 100) / 100, // 2 decimal places
    rescue_rate: Math.round(rescueRate * 100) / 100,
    median_time_to_decision_ms: timeStats.median_ms,
    p90_time_to_decision_ms: timeStats.p90_ms,
    intents,
  };
  
  // Build response
  const response = {
    ok: true,
    days_queried: days,
    summary,
    computed_at: new Date().toISOString(),
  };
  
  return Response.json(response, { status: 200 });
}
