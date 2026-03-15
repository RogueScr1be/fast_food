# Tier 1 Signoff Matrix

Use this matrix to approve Tier 1 promotion.

## Required Gates

| Gate | Command / Proof | Status | Evidence |
|---|---|---|---|
| Tier 1 tests | `npm run test:tier1` | 🟩 | `docs/reports/tier1-release-readiness/evidence-2026-02-25.md` |
| Tier 1 lint | `npm run lint:tier1` | 🟩 | `docs/reports/tier1-release-readiness/evidence-2026-02-25.md` |
| Tier 1 typecheck | `npm run typecheck:tier1` | 🟩 | `docs/reports/tier1-release-readiness/evidence-2026-02-25.md` |
| Build sanity | `npm run build:sanity` | 🟩 | `docs/reports/tier1-release-readiness/evidence-2026-02-25.md` |
| Staging health | `npm run staging:healthcheck` | 🟥 | `docs/reports/tier1-release-readiness/evidence-2026-02-25.md` |
| Auth fail-closed | `npm run auth:sanity:require401` | 🟥 | `docs/reports/tier1-release-readiness/evidence-2026-02-25.md` |
| Auth success | `npm run auth:sanity:require200` | 🟥 | `docs/reports/tier1-release-readiness/evidence-2026-02-25.md` |
| Tier 1 smoke | `npm run smoke:tier1:staging` | 🟥 | `docs/reports/tier1-release-readiness/evidence-2026-02-25.md` |
| Legacy smoke (non-blocking) | `npm run smoke:staging` | 🟨 | `docs/reports/tier1-signoff/2026-02-25T15-50-35-667Z.md` |

## Acceptance Criteria

- Mobile runtime uses local deterministic decision core.
- Feedback sync is idempotent and durable.
- Per-household weights update after synced feedback.
- `global_priors` endpoint only returns k-anon-eligible rows.
- Local decision latency p95 remains under 100ms.

## Signoff

- Owner: Codex (implementation run)
- Date: 2026-03-14
- Decision: `Block`
- Notes:
  - Strict signoff command executed: `TIER1_SIGNOFF_REQUIRE_STAGING=true npm run signoff:tier1`
  - Output summary: `docs/reports/tier1-release-readiness/evidence-2026-02-25.md`
  - Signoff artifact (latest local): `docs/reports/tier1-signoff/2026-03-15T00-27-19-480Z.md`
  - Main CI run (blocking lane): `https://github.com/RogueScr1be/fast_food/actions/runs/22406085110`
  - Blocking staging gates now support split hosts:
    - `STAGING_WEB_URL` for `/healthz.json`
    - `STAGING_API_URL` for `/api/decision-os/*`
    - `STAGING_URL` remains backward-compatible as single-host fallback
  - Remaining blocker is secrets/runtime configuration, not local gate wiring.
