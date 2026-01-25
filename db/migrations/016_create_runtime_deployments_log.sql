-- Migration 016: Create runtime_deployments_log table
-- Append-only ledger of successful staging deployments for rollback discipline

CREATE TABLE IF NOT EXISTS runtime_deployments_log (
  id BIGSERIAL PRIMARY KEY,
  env TEXT NOT NULL,
  deployment_url TEXT NOT NULL,
  git_sha TEXT NOT NULL,
  run_id TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(env, deployment_url)
);

-- Index for efficient queries by env and time (rollback lookups)
CREATE INDEX IF NOT EXISTS idx_runtime_deployments_log_env_time
ON runtime_deployments_log (env, recorded_at DESC);

COMMENT ON TABLE runtime_deployments_log IS 'Append-only ledger of successful deployments for rollback discipline';
COMMENT ON COLUMN runtime_deployments_log.env IS 'Environment name (staging, production)';
COMMENT ON COLUMN runtime_deployments_log.deployment_url IS 'Vercel deployment URL (unique per env)';
COMMENT ON COLUMN runtime_deployments_log.git_sha IS 'Git commit SHA at deployment time';
COMMENT ON COLUMN runtime_deployments_log.run_id IS 'GitHub Actions run ID';
COMMENT ON COLUMN runtime_deployments_log.recorded_at IS 'Timestamp when deployment was recorded as green';
