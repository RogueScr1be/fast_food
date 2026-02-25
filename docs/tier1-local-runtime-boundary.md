# Tier 1 Local Runtime Boundary

## Scope
The shipped mobile runtime decision loop is **local-first and deterministic**.

## Authoritative Path
- `app/tonight.tsx`
- `app/deal.tsx`
- `lib/decision-core/*`
- `lib/context/*`
- `lib/learning/*` (eventing/sync only, non-blocking)

## Non-Authoritative Compatibility Surface
The following paths remain in the repo for compatibility and internal tooling, but are **not** the mobile runtime decision authority:
- `app/api/decision-os/decision+api.ts`
- `lib/decision-os/database.ts`
- `lib/decision-os/arbiter.ts`

## Contract
- Mobile runtime must not call `/api/decision-os/decision` for “Choose for me”.
- Decision render latency must remain local and non-blocking from network.
- Learning sync is asynchronous and never blocks selection.

