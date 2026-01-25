# Fast Food — Dinner Solved in <3 Minutes

A mobile app that compresses the dinner decision process into a fast, decisive loop. No browsing, no lists, no paralysis—just one executable decision.

## MVP Success Definition

> A user can open the app at ~5pm, provide minimal intent, receive one dinner decision, execute it immediately, or be rescued automatically when dinner collapses.

**Hard constraint:** Anything not required to satisfy the above is out of scope.

## Core Architecture

### Decision Flow

```
User opens app at ~5pm
    ↓
Taps intent button (Easy / Cheap / Quick / No Energy)
    ↓
Decision Arbiter returns ONE decision
    ↓
User approves → Execute instructions → Session ends
    OR
User rejects → Second rejection → DRM triggers → Fallback executes
```

### Key Components

| Component | Purpose |
|-----------|---------|
| **Decision Arbiter** | Collapses context + taste + inventory into single decision |
| **DRM (Dinner Rescue Mode)** | Override authority when Arbiter fails or user gives up |
| **Session Management** | Tracks decision lock, rejection count, outcomes |
| **Receipt Import** | OCR-based inventory estimation (advisory, never blocking) |

### Non-Negotiable Constraints

1. **Exactly ONE decision per session**
2. **ZERO user questions** unless execution is literally impossible
3. **ZERO alternative options**
4. **Execution payload is mandatory**
5. **DRM can override the Arbiter without appeal**

## Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile | React Native + Expo |
| API | Expo Router API routes |
| Database | Supabase Postgres |
| Hosting | Vercel (API) + EAS (mobile builds) |
| CI/CD | GitHub Actions |

## Project Structure

```
/workspace
├── app/                          # Expo Router pages + API routes
│   ├── (tabs)/                   # Tab navigation screens
│   │   ├── tonight.tsx           # Main decision screen
│   │   ├── chat.tsx              # Chat interface
│   │   └── profile.tsx           # User profile
│   ├── api/
│   │   └── decision-os/          # Decision OS API endpoints
│   │       ├── decision+api.ts   # Main decision endpoint
│   │       ├── feedback+api.ts   # Accept/reject feedback
│   │       ├── drm+api.ts        # Dinner Rescue Mode
│   │       └── receipt/
│   │           └── import+api.ts # Receipt scanning
│   └── qa.tsx                    # QA panel (dev/preview only)
├── lib/
│   └── decision-os/              # Core decision logic
│       ├── arbiter/              # Decision Arbiter
│       ├── drm/                  # DRM fallback system
│       ├── inventory/            # Receipt normalization
│       ├── db/                   # Database adapters
│       ├── config/               # Feature flags
│       └── monitoring/           # Metrics
├── db/
│   └── migrations/               # SQL migrations (001-028)
├── scripts/                      # Ops scripts
├── docs/                         # Documentation
└── .github/workflows/            # CI/CD workflows
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)

### Local Development

```bash
# Install dependencies
npm install

# Start Expo dev server
npm start

# Run tests
npm test

# Run build sanity check
npm run build:sanity
```

### Environment Variables

For local development, create `.env.local`:

```bash
# Required for API
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional for local DB testing
DATABASE_URL=postgresql://...
```

## CI/CD Architecture

Three workflows, two protected environments, one release button.

### Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | PR + push to main | Tests, build sanity, migration proof |
| `staging-deploy.yml` | Manual | Migrate DB, deploy, healthcheck |
| `release-testflight.yml` | Manual (approval required) | EAS build + TestFlight submit |

### Protected Environments

| Environment | Secrets | Rules |
|-------------|---------|-------|
| `staging` | DATABASE_URL_STAGING, STAGING_URL, STAGING_AUTH_TOKEN, VERCEL_* | No approval |
| `production` | EXPO_TOKEN, APPLE_ID, ASC_APP_ID, APPLE_TEAM_ID | **Approval required** |

### Release Flow

```bash
# 1. Run preflight checks
npm run release:preflight

# 2. If green, trigger release workflow in GitHub
# → GitHub prompts for production environment approval
# → EAS builds and submits to TestFlight
```

## Key Scripts

| Script | Purpose |
|--------|---------|
| `npm test` | Run all tests (1022 tests) |
| `npm run build:sanity` | Verify EAS configuration |
| `npm run release:preflight` | All pre-release checks |
| `npm run staging:healthcheck` | Smoke + dogfood report |
| `npm run db:migrate:staging` | Run migrations |
| `npm run db:verify:staging` | Verify schema |

## Database Migrations

28 migrations from 001 to 028:

- 001-010: Core tables (users, meals, events, households)
- 011-016: Runtime flags, metrics, deployment ledger
- 017-020: Household partitioning + constraints
- 021-024: Uniqueness + indexes
- 025-027: MVP extensions (meals, households, sessions)
- 028: Household constraints (moved from 014/015)

```bash
# Run migrations
DATABASE_URL=... npm run db:migrate

# Verify schema
DATABASE_URL_STAGING=... npm run db:verify:staging
```

## Feature Flags

### Environment Flags

| Flag | Default (prod) | Purpose |
|------|----------------|---------|
| `DECISION_OS_ENABLED` | false | Master kill switch |
| `FF_MVP_ENABLED` | false | MVP kill switch |
| `FF_QA_ENABLED` | false | QA panel access |

### Runtime Flags (DB-backed)

Flip instantly from Supabase UI without redeploying:

```sql
UPDATE runtime_flags SET enabled = false WHERE key = 'ff_mvp_enabled';
```

## Design Principles

All UI must comply with [docs/design/constitution.md](docs/design/constitution.md).

Key laws:
- **Hick's Law:** Max 1 primary action per screen
- **Fitts's Law:** Primary CTA bottom, ≥48px, full-width
- **Miller's Law:** Max 1 decision, max 7 execution steps

## Documentation

| Document | Purpose |
|----------|---------|
| [RELEASE.md](docs/RELEASE.md) | Build, release, CI/CD guide |
| [TESTFLIGHT.md](docs/TESTFLIGHT.md) | EAS + TestFlight quick reference |
| [DOGFOOD_FIRST_20_DINNERS.md](docs/DOGFOOD_FIRST_20_DINNERS.md) | Internal testing protocol |
| [architecture.md](docs/architecture.md) | System architecture |
| [domain.md](docs/domain.md) | Domain concepts |
| [design/constitution.md](docs/design/constitution.md) | Design system principles |

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npx jest path/to/test.ts
```

Test coverage:
- 27 test suites
- 1022 tests
- Migration ordering proof
- API boundary tests
- Household isolation tests

## License

Private. All rights reserved.
