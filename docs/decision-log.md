# Fast Food — Decision Log

Format:
- Date
- Decision
- Why
- Alternatives considered
- Consequences / follow-ups

---

## 2026-01-22 — Web-first MVP
**Decision:** Build web-first (Next.js) before native.
**Why:** fastest iteration + easiest onboarding + lowest complexity.
**Alternatives:** iOS-first, React Native.
**Consequences:** ensure mobile web UX is excellent; add native later if retention demands.

---

## 2026-01-22 — Supabase for MVP backend
**Decision:** Use Supabase Postgres + RLS.
**Why:** fast auth + DB + policies + manageable ops for small team.
**Alternatives:** Firebase, custom Node + Postgres.
**Consequences:** must be disciplined about RLS + migrations.

---

## 2026-01-22 — Constraints split into HARD vs SOFT
**Decision:** Store constraints as structured data with explicit levels.
**Why:** prevents prompt-only logic; enables reliable verification.
**Alternatives:** "just prompt the model."
**Consequences:** requires schema + validation + compliance checks.

---

## 2026-01-22 — Allergies are always HARD constraints
**Decision:** Allergies can never be violated.
**Why:** safety + trust.
**Alternatives:** allow override.
**Consequences:** must block conflicting plans and ask user to adjust other constraints.

---

## 2026-01-22 — Pantry is manual for MVP
**Decision:** Start with manual pantry entry; no receipt scan yet.
**Why:** reduces scope + risk; still creates personalization value.
**Alternatives:** CV/receipt scan from day one.
**Consequences:** add "confidence" field for future inferred pantry.

---

## 2026-01-22 — Regeneration preserves locks
**Decision:** Regen replaces only unlocked slots; locked slots never change.
**Why:** user control; prevents frustration.
**Alternatives:** full regen with "try to keep."
**Consequences:** planner must be able to operate with fixed slots as constraints.

---

## 2026-01-22 — SQL Style Contract v1 for Tenant Isolation
**Decision:** Implement strict SQL style contract with 11 rules enforced at runtime.
**Why:** Multi-tenant data isolation is critical; regex-based guards provide defense-in-depth until RLS is fully enforced.
**Alternatives:** Trust developers to write correct SQL; rely only on RLS.
**Consequences:** 
- All tenant SQL must use `$1` for household_key
- CTEs and subqueries banned for tenant SQL
- Golden SQL tests prevent drift
- CI grep gate blocks raw SQL outside approved files

---

_(Add new decisions as they are made)_
