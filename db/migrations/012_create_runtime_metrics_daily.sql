-- Migration 012: Create runtime_metrics_daily table for durable metrics
-- Privacy-safe: No identifiers, no household_key, no arrays

CREATE TABLE IF NOT EXISTS runtime_metrics_daily (
  day DATE NOT NULL,
  metric_key TEXT NOT NULL,
  count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, metric_key)
);

-- Index for efficient lookups by metric
CREATE INDEX IF NOT EXISTS idx_runtime_metrics_daily_metric ON runtime_metrics_daily(metric_key);

-- Index for cleanup of old data
CREATE INDEX IF NOT EXISTS idx_runtime_metrics_daily_day ON runtime_metrics_daily(day);

COMMENT ON TABLE runtime_metrics_daily IS 'Daily aggregated metrics. Privacy-safe: no identifiers, no household_key.';
COMMENT ON COLUMN runtime_metrics_daily.day IS 'Date for this metric (UTC)';
COMMENT ON COLUMN runtime_metrics_daily.metric_key IS 'Metric name (e.g., decision_called, healthz_hit)';
COMMENT ON COLUMN runtime_metrics_daily.count IS 'Cumulative count for this day';
