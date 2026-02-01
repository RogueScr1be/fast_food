# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- SQL Style Contract v1 with 11 enforcement rules for tenant isolation
- Golden SQL contract tests (validates all runtime SQL)
- CI grep gate (`npm run sql:contract:gate`) to prevent raw SQL drift
- CTE and subquery detection helpers (`hasAnySubquery`, `hasCte`)
- SQL helper functions (`tenantWhere`, `tenantAnd`, `tenantConflict`, `tenantUpdateWhere`)
- Bypass-proof contract tests for schema-qualified and quoted identifiers
- String literal stripping to prevent false positives in contract checks
- Project documentation: CLAUDE.md, architecture.md, domain.md, decision-log.md

### Changed
- UPDATE queries now use `$1` for household_key (contract compliance)
- `assertTenantSafe()` now performs 3-level checking (style contract + tenant safety + ON CONFLICT)
- `extractTableReferences()` now handles schema-qualified and quoted table names
- `checkSqlStyleContract()` enforces `$1` parameter position for all tenant predicates

### Fixed
- `updateReceiptImportStatus` SQL now uses correct parameter order (`$1` = household_key)
- Harden session hydration to prevent persisted prefs overwriting active session
- Make hydration concurrency-safe (concurrent calls return same promise)

### Security
- Rule 11: CTEs and subqueries banned for tenant SQL (prevents hidden predicates)
- Literal tenant predicates banned (must use parameterized `$1`)
- `ON CONFLICT ON CONSTRAINT` banned (must use column-based conflicts)
- Multi-statement SQL rejected after string literal stripping

### Removed
- (placeholder)
