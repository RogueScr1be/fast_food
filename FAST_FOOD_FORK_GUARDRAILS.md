# FAST FOOD: FORK + GUARDRAILS ADDENDUM
## Implementation-Ready Foundation for /decision-os

**Status**: Fork Plan Finalized  
**Date**: January 20, 2026  
**Prerequisite**: FAST_FOOD_DISCOVERY.md

---

## 1. FORK PLAN

### 1.1 Folder/Module Structure

```
/workspace
├── app/
│   ├── (tabs)/                    # LEGACY - QUARANTINED
│   │   ├── _layout.tsx            # frozen
│   │   ├── index.tsx              # frozen
│   │   ├── chat.tsx               # frozen
│   │   └── profile.tsx            # frozen
│   │
│   ├── decision-os/               # NEW BOUNDED CONTEXT
│   │   ├── _layout.tsx            # Decision OS root layout
│   │   ├── index.tsx              # Entry: single decision card
│   │   ├── drm.tsx                # DRM rescue screen
│   │   └── outcome.tsx            # Post-decision execution view
│   │
│   ├── api/
│   │   ├── chat+api.ts            # LEGACY - QUARANTINED
│   │   │
│   │   └── decision-os/           # NEW API ROUTES
│   │       ├── decision+api.ts    # POST: returns single action
│   │       ├── drm+api.ts         # POST: DRM rescue action
│   │       └── feedback+api.ts    # POST: approve/reject signal
│   │
│   └── _layout.tsx                # Root - routes to decision-os by default
│
├── components/
│   ├── legacy/                    # MOVE ALL EXISTING HERE
│   │   ├── ChatMessage.tsx        # quarantined
│   │   ├── SmartSuggestions.tsx   # quarantined
│   │   ├── SuggestionChips.tsx    # quarantined
│   │   └── ...                    # all other existing components
│   │
│   └── decision-os/               # NEW - ISOLATED
│       ├── DecisionCard.tsx       # Single decision display
│       ├── ActionBar.tsx          # Approve | Reject | DRM buttons
│       ├── DRMCard.tsx            # Rescue mode card
│       ├── ExecutionView.tsx      # Recipe/order execution
│       └── ConfidenceIndicator.tsx # Subtle confidence display
│
├── services/
│   ├── legacy/                    # MOVE EXISTING HERE
│   │   ├── ApiService.ts          # quarantined
│   │   ├── ChatService.ts         # quarantined
│   │   └── OptimizedApiService.ts # quarantined
│   │
│   └── decision-os/               # NEW - ISOLATED
│       ├── DecisionService.ts     # Calls /decision-os/decision
│       ├── DRMService.ts          # Calls /decision-os/drm
│       ├── FeedbackService.ts     # Calls /decision-os/feedback
│       └── InventoryService.ts    # Receipt processing + confidence
│
├── contexts/
│   ├── AppContext.tsx             # LEGACY - QUARANTINED
│   │
│   └── DecisionContext.tsx        # NEW - single decision state only
│
├── types/
│   └── decision-os/
│       ├── decision.ts            # DinnerDecision type
│       ├── drm.ts                 # DRM types
│       └── feedback.ts            # Feedback types
│
└── lib/
    └── decision-os/
        ├── invariants.ts          # Runtime invariant checks
        └── guards.ts              # Type guards for single-action
```

### 1.2 Shared vs Duplicated

**DUPLICATED (no sharing)**

| Asset | Reason |
|-------|--------|
| UI components | Legacy has list/browse patterns baked in |
| Context/state | Legacy stores arrays of meals/suggestions |
| API services | Legacy services return multiple items |
| Types | Legacy types model collections |

**SHARED (justified)**

| Asset | Justification | Guard |
|-------|---------------|-------|
| `expo-linear-gradient` | Rendering primitive, no logic | N/A |
| `lucide-react-native` | Icon library, no logic | N/A |
| Font loading (`_layout.tsx` root) | Infrastructure only | N/A |
| `NotificationService.ts` | Reusable for DRM triggers | Review: no suggestion patterns |
| Database connection | Infrastructure | Separate tables, no joins to legacy |

**EXPLICITLY NOT SHARED**

- `AppContext.tsx` - contains `currentMealPlan: MealPlan[]`
- `ReceiptScanner.tsx` - returns suggestion arrays, rebuild for decision-os
- Any component with `map()` rendering multiple actionable items

### 1.3 Routing Plan

**Entry Point Change**

```typescript
// app/_layout.tsx (root)
// CHANGE: Default redirect to /decision-os instead of /(tabs)

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="decision-os" />      {/* NEW DEFAULT */}
      <Stack.Screen name="(tabs)" />           {/* LEGACY - accessible but not default */}
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
```

**Route Isolation**

| Route | Status | Access |
|-------|--------|--------|
| `/decision-os` | NEW | Default entry |
| `/decision-os/drm` | NEW | DRM trigger only |
| `/decision-os/outcome` | NEW | Post-approve/rescue |
| `/(tabs)/*` | QUARANTINED | Deep link only, no nav from decision-os |
| `/api/decision-os/*` | NEW | Decision OS only |
| `/api/*` (legacy) | QUARANTINED | Legacy routes, no cross-calls |

**Navigation Rules**

- `/decision-os` screens may NEVER navigate to `/(tabs)` screens
- `/(tabs)` screens may NEVER navigate to `/decision-os` screens
- No shared navigation state between contexts
- Tab bar is HIDDEN in `/decision-os` (no bottom nav)

---

## 2. QUARANTINE & DRIFT GUARDS

### 2.1 Legacy Screens/Routes to Freeze

**FROZEN - No new development**

| File | Status | Reason |
|------|--------|--------|
| `app/(tabs)/index.tsx` | FROZEN | Multiple meal cards, browse UI |
| `app/(tabs)/chat.tsx` | FROZEN | Chat paradigm, suggestion loops |
| `app/(tabs)/profile.tsx` | FROZEN | Preference toggles |
| `app/(tabs)/_layout.tsx` | FROZEN | Tab navigation |
| `app/recipe/[id].tsx` | FROZEN | Recipe browsing |
| `app/api/chat+api.ts` | FROZEN | Returns suggestions |
| `components/ChatMessage.tsx` | FROZEN | Chat pattern |
| `components/SmartSuggestions.tsx` | FROZEN | Multiple suggestions |
| `components/SuggestionChips.tsx` | FROZEN | Option list |
| `components/ReceiptScanner.tsx` | FROZEN | Returns suggestion arrays |
| `services/ChatService.ts` | FROZEN | Suggestion generation |
| `services/ApiService.ts` | FROZEN | Multi-option responses |
| `contexts/AppContext.tsx` | FROZEN | Array state |

**Action**: Add `// @decision-os:quarantined` comment to top of each file.

### 2.2 Drift Guard Rules (Code Review Checklist)

**MANDATORY REVIEW BLOCKS**

1. **No arrays of options in UI state**
   ```
   BLOCK: useState<Decision[]>
   BLOCK: useState<Meal[]>
   BLOCK: decisions: Decision[]
   ALLOW: currentDecision: Decision | null
   ```

2. **No list rendering of actionable items**
   ```
   BLOCK: {meals.map(meal => <MealCard ... />)}
   BLOCK: {decisions.map(...)}
   BLOCK: {options.map(...)}
   ALLOW: Single <DecisionCard decision={currentDecision} />
   ```

3. **No suggestion/recommendation arrays**
   ```
   BLOCK: suggestions: string[]
   BLOCK: recommendations: Meal[]
   BLOCK: alternatives: any[]
   ```

4. **No chat/conversation patterns**
   ```
   BLOCK: messages: Message[]
   BLOCK: <ChatMessage />
   BLOCK: conversation history rendering
   ```

5. **API response structure**
   ```
   BLOCK: { decisions: [...] }
   BLOCK: { meals: [...] }
   BLOCK: { options: [...] }
   ALLOW: { decision: {...} }
   ```

6. **No browse/explore navigation**
   ```
   BLOCK: router.push('/recipes')
   BLOCK: router.push('/browse')
   BLOCK: router.push('/discover')
   ```

### 2.3 Automated Checks (Lint + Test)

**CHECK A: Decision endpoint returns exactly one action**

```typescript
// tests/decision-os/invariants/single-action.test.ts

describe('Decision API Invariants', () => {
  it('POST /decision-os/decision returns exactly one decision', async () => {
    const response = await POST('/api/decision-os/decision', { household_id: 'test' });
    const data = await response.json();
    
    // MUST have decision field
    expect(data).toHaveProperty('decision');
    
    // decision MUST be object, NOT array
    expect(Array.isArray(data.decision)).toBe(false);
    expect(typeof data.decision).toBe('object');
    
    // MUST NOT have plural fields
    expect(data).not.toHaveProperty('decisions');
    expect(data).not.toHaveProperty('options');
    expect(data).not.toHaveProperty('alternatives');
    expect(data).not.toHaveProperty('suggestions');
  });

  it('POST /decision-os/drm returns exactly one rescue action', async () => {
    const response = await POST('/api/decision-os/drm', { household_id: 'test', trigger: 'user' });
    const data = await response.json();
    
    expect(data).toHaveProperty('rescue');
    expect(Array.isArray(data.rescue)).toBe(false);
    expect(data).not.toHaveProperty('rescues');
    expect(data).not.toHaveProperty('options');
  });
});
```

**CHECK B: UI renders exactly one actionable dinner card**

```typescript
// tests/decision-os/invariants/single-card.test.ts

describe('Decision UI Invariants', () => {
  it('renders exactly one DecisionCard', () => {
    const { getAllByTestId } = render(<DecisionScreen />);
    
    const cards = getAllByTestId('decision-card');
    expect(cards.length).toBe(1);
  });

  it('does not render meal lists', () => {
    const { queryByTestId } = render(<DecisionScreen />);
    
    expect(queryByTestId('meal-list')).toBeNull();
    expect(queryByTestId('meal-grid')).toBeNull();
    expect(queryByTestId('options-list')).toBeNull();
  });

  it('ActionBar has exactly three actions', () => {
    const { getByTestId } = render(<ActionBar />);
    
    expect(getByTestId('action-approve')).toBeTruthy();
    expect(getByTestId('action-reject')).toBeTruthy();
    expect(getByTestId('action-drm')).toBeTruthy();
    
    // No other action buttons
    const allButtons = getAllByRole('button');
    expect(allButtons.length).toBe(3);
  });
});
```

**CHECK C: No browse/list patterns in /decision-os**

```typescript
// eslint-plugin-decision-os/rules/no-browse-patterns.js
// Custom ESLint rule

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow browse/list patterns in decision-os' },
  },
  create(context) {
    const filename = context.getFilename();
    if (!filename.includes('decision-os')) return {};

    return {
      // Block: array.map() returning JSX with meal/decision/option
      CallExpression(node) {
        if (
          node.callee.property?.name === 'map' &&
          node.arguments[0]?.type === 'ArrowFunctionExpression'
        ) {
          const returnJSX = hasJSXReturn(node.arguments[0]);
          if (returnJSX && isMealRelated(node)) {
            context.report({
              node,
              message: 'INVARIANT VIOLATION: List rendering of meals/decisions forbidden in /decision-os',
            });
          }
        }
      },
      
      // Block: useState with array types for decisions/meals
      CallExpression(node) {
        if (node.callee.name === 'useState') {
          const typeArg = getTypeAnnotation(node);
          if (typeArg && isArrayOfMealsOrDecisions(typeArg)) {
            context.report({
              node,
              message: 'INVARIANT VIOLATION: Array state for decisions/meals forbidden in /decision-os',
            });
          }
        }
      },
    };
  },
};
```

**CI Pipeline Integration**

```yaml
# .github/workflows/decision-os-invariants.yml

name: Decision OS Invariants

on:
  pull_request:
    paths:
      - 'app/decision-os/**'
      - 'components/decision-os/**'
      - 'services/decision-os/**'
      - 'app/api/decision-os/**'

jobs:
  invariant-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint (with decision-os rules)
        run: npm run lint -- --rule 'decision-os/no-browse-patterns: error'
      
      - name: Invariant Tests
        run: npm test -- --testPathPattern='decision-os/invariants'
      
      - name: Quarantine Check
        run: |
          # Fail if any quarantined file was modified
          QUARANTINED=$(git diff --name-only origin/main | grep -E '(tabs|legacy)/' || true)
          if [ -n "$QUARANTINED" ]; then
            echo "ERROR: Quarantined files modified:"
            echo "$QUARANTINED"
            exit 1
          fi
```

---

## 3. CONTRACT-FIRST INTERFACES

### 3.1 POST /api/decision-os/decision

**Purpose**: Request tonight's dinner decision. Returns exactly ONE action.

**Request**
```json
{
  "household_id": "uuid",
  "context": {
    "timestamp": "2026-01-20T17:30:00Z",
    "timezone": "America/Los_Angeles"
  },
  "excluded_meal_ids": ["uuid1", "uuid2"]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `household_id` | uuid | yes | Single household v1 |
| `context.timestamp` | ISO8601 | yes | Client time for decision |
| `context.timezone` | string | yes | IANA timezone |
| `excluded_meal_ids` | uuid[] | no | Meals rejected this session |

**Response (success)**
```json
{
  "decision": {
    "decision_id": "uuid",
    "meal_id": "uuid",
    "meal_name": "Quick Chicken Tacos",
    "action_type": "cook",
    "cook_time_minutes": 15,
    "confidence": 0.72,
    "ingredients": [
      { "name": "chicken breast", "quantity": "1 lb", "confidence": 0.85 },
      { "name": "taco shells", "quantity": "8", "confidence": 0.60 }
    ],
    "expires_at": "2026-01-20T20:30:00Z"
  },
  "meta": {
    "decisions_remaining_today": 2,
    "drm_available": true
  }
}
```

**Response (no viable decision → DRM trigger)**
```json
{
  "decision": null,
  "trigger_drm": true,
  "drm_reason": "low_confidence",
  "meta": {
    "decisions_remaining_today": 0,
    "drm_available": true
  }
}
```

**Invariant Enforced**: `decision` is ALWAYS an object or null. NEVER an array.

---

### 3.2 POST /api/decision-os/drm

**Purpose**: Trigger Dinner Rescue Mode. Returns exactly ONE rescue action.

**Request**
```json
{
  "household_id": "uuid",
  "trigger_type": "user_initiated",
  "context": {
    "timestamp": "2026-01-20T19:45:00Z",
    "timezone": "America/Los_Angeles"
  },
  "attempt": 1
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `household_id` | uuid | yes | |
| `trigger_type` | enum | yes | `user_initiated`, `consecutive_rejections`, `low_confidence`, `timeout`, `late_hour`, `inactivity` |
| `context` | object | yes | Same as decision |
| `attempt` | int | yes | 1, 2, or 3 (max attempts) |

**Response (rescue available)**
```json
{
  "rescue": {
    "drm_id": "uuid",
    "meal_id": "uuid",
    "meal_name": "Emergency Pasta",
    "action_type": "cook",
    "cook_time_minutes": 12,
    "is_pantry_meal": true
  },
  "attempts_remaining": 2,
  "can_skip": true
}
```

**Response (DRM exhausted)**
```json
{
  "rescue": null,
  "exhausted": true,
  "skip_confirmed": false,
  "message": "No more rescue options. Skip dinner for tonight?"
}
```

**Invariant Enforced**: `rescue` is ALWAYS an object or null. NEVER an array.

---

### 3.3 POST /api/decision-os/feedback

**Purpose**: Record approve/reject signal. No response payload (fire-and-forget).

**Request (approve)**
```json
{
  "decision_id": "uuid",
  "household_id": "uuid",
  "outcome": "approved",
  "timestamp": "2026-01-20T17:32:00Z"
}
```

**Request (reject)**
```json
{
  "decision_id": "uuid",
  "household_id": "uuid",
  "outcome": "rejected",
  "reason_category": "not_in_mood",
  "timestamp": "2026-01-20T17:32:00Z"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `decision_id` | uuid | yes | From decision response |
| `household_id` | uuid | yes | |
| `outcome` | enum | yes | `approved`, `rejected` |
| `reason_category` | enum | no | Required if rejected: `not_in_mood`, `missing_ingredient`, `not_enough_time`, `too_expensive`, `other` |
| `timestamp` | ISO8601 | yes | |

**Response**
```json
{
  "recorded": true
}
```

**No arrays. No suggestions. No follow-up options.**

---

## 4. MINIMAL SCHEMA DELTA (POSTGRES)

### 4.0 Migrations

| Migration | Tables | Purpose |
|-----------|--------|---------|
| 001_create_decision_os_schema | meals, meal_ingredients, inventory_items, decision_events, drm_events, household_constraints | Core decision OS schema |
| 002_create_receipt_ingestion_tables | receipt_imports, receipt_line_items | Receipt OCR ingestion (Phase 2) |
| 003_add_receipt_dedupe | (columns on receipt_imports) | Receipt deduplication (Phase 3) |
| 004_add_inventory_decay | (columns on inventory_items) | Inventory decay + consumption (Phase 3) |
| 005_create_taste_graph | taste_signals, taste_meal_scores | Behavioral taste learning (Phase 4) |

**Running Migrations**:
```bash
# Set database URL
export DATABASE_URL="postgresql://user:password@localhost:5432/fastfood_dev"

# Run all migrations
psql $DATABASE_URL -f db/migrations/001_create_decision_os_schema.up.sql
psql $DATABASE_URL -f db/migrations/002_create_receipt_ingestion_tables.up.sql

# Run seeds
psql $DATABASE_URL -f db/seeds/001_meals.sql
```

### 4.1 Tables

**meals** (seed data, read-only in v1)
```sql
CREATE TABLE decision_os.meals (
    meal_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    cuisine         TEXT,
    cook_time_min   INTEGER NOT NULL,
    difficulty      TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
    is_pantry_meal  BOOLEAN DEFAULT false,  -- for DRM fallback
    
    -- Hard constraints (allergy flags)
    has_gluten      BOOLEAN DEFAULT false,
    has_dairy       BOOLEAN DEFAULT false,
    has_nuts        BOOLEAN DEFAULT false,
    has_shellfish   BOOLEAN DEFAULT false,
    has_eggs        BOOLEAN DEFAULT false,
    is_vegetarian   BOOLEAN DEFAULT false,
    is_vegan        BOOLEAN DEFAULT false,
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE decision_os.meal_ingredients (
    meal_id         UUID REFERENCES decision_os.meals(meal_id) ON DELETE CASCADE,
    ingredient_name TEXT NOT NULL,  -- denormalized for v1 simplicity
    quantity_desc   TEXT,           -- "1 lb", "2 cups"
    is_essential    BOOLEAN DEFAULT true,
    PRIMARY KEY (meal_id, ingredient_name)
);
```

**inventory_items** (probabilistic)
```sql
CREATE TABLE decision_os.inventory_items (
    inventory_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID NOT NULL,
    ingredient_name TEXT NOT NULL,
    
    confidence      DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    last_seen_at    TIMESTAMPTZ NOT NULL,
    source          TEXT CHECK (source IN ('receipt', 'inferred', 'default')),
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE (household_id, ingredient_name)
);

CREATE INDEX idx_inventory_household ON decision_os.inventory_items(household_id);
```

**decision_events** (append-only)
```sql
CREATE TABLE decision_os.decision_events (
    event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id     UUID NOT NULL,
    household_id    UUID NOT NULL,
    meal_id         UUID REFERENCES decision_os.meals(meal_id),
    
    event_type      TEXT NOT NULL CHECK (event_type IN ('presented', 'approved', 'rejected', 'expired')),
    confidence      DECIMAL(3,2),
    reason_category TEXT,  -- for rejections only
    
    context_json    JSONB NOT NULL,  -- snapshot of context at event time
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_decision_events_household ON decision_os.decision_events(household_id, created_at DESC);
CREATE INDEX idx_decision_events_decision ON decision_os.decision_events(decision_id);

-- APPEND-ONLY: No UPDATE or DELETE allowed
REVOKE UPDATE, DELETE ON decision_os.decision_events FROM PUBLIC;
```

**drm_events**
```sql
CREATE TABLE decision_os.drm_events (
    drm_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID NOT NULL,
    
    trigger_type    TEXT NOT NULL CHECK (trigger_type IN (
        'user_initiated', 'consecutive_rejections', 'low_confidence',
        'timeout', 'late_hour', 'inactivity'
    )),
    
    resolution      TEXT CHECK (resolution IN ('meal_accepted', 'order_accepted', 'skipped', 'exhausted')),
    resolved_meal_id UUID REFERENCES decision_os.meals(meal_id),
    attempts        INTEGER DEFAULT 0,
    
    triggered_at    TIMESTAMPTZ NOT NULL,
    resolved_at     TIMESTAMPTZ,
    context_json    JSONB NOT NULL
);

CREATE INDEX idx_drm_events_household ON decision_os.drm_events(household_id, triggered_at DESC);
```

**receipt_imports** (Phase 2 - OCR ingestion events)
```sql
CREATE TABLE decision_os.receipt_imports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_key   TEXT NOT NULL DEFAULT 'default',
    source          TEXT NOT NULL DEFAULT 'image_upload' 
                        CHECK (source IN ('image_upload', 'email_forward', 'manual_text')),
    vendor_name     TEXT,                      -- nullable
    purchased_at    TIMESTAMPTZ,               -- nullable
    ocr_provider    TEXT,                      -- nullable
    ocr_raw_text    TEXT,                      -- raw OCR for audit/debug
    status          TEXT NOT NULL DEFAULT 'received' 
                        CHECK (status IN ('received', 'parsed', 'failed')),
    error_message   TEXT,                      -- nullable
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_receipt_imports_household_created ON decision_os.receipt_imports(household_key, created_at DESC);
```

**receipt_line_items** (Phase 2 - parsed items)
```sql
CREATE TABLE decision_os.receipt_line_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_import_id       UUID NOT NULL REFERENCES decision_os.receipt_imports(id) ON DELETE CASCADE,
    
    -- Raw data
    raw_line                TEXT NOT NULL,
    raw_item_name           TEXT,
    raw_qty_text            TEXT,
    raw_price               NUMERIC(10,2),
    
    -- Normalized data
    normalized_item_name    TEXT,
    normalized_unit         TEXT,
    normalized_qty_estimated NUMERIC(10,2),
    
    confidence              NUMERIC(3,2) NOT NULL DEFAULT 0.50 
                                CHECK (confidence >= 0 AND confidence <= 1),
    created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_receipt_line_items_receipt ON decision_os.receipt_line_items(receipt_import_id);
CREATE INDEX idx_inventory_items_household_name ON decision_os.inventory_items(household_key, item_name);
```

**Receipt Ingestion Invariants**:
- Inventory is probabilistic and advisory; ingestion NEVER blocks dinner decisions
- No arrays/lists returned to clients as "choices"
- Idempotent-safe and auditable (raw OCR stored for debug/reprocessing)

**Taste Graph Invariants (Phase 4)**:
- Taste Graph is behavioral-only; no user preference UI
- Taste features are internal-only; never sent to client

### 4.2 What Is Omitted

| Table | Reason |
|-------|--------|
| `users` | Single household v1, no auth |
| `households` | Hardcoded single household |
| `recipes` (detailed) | Meal name + ingredients sufficient for v1 |
| `preferences` | No explicit preferences (earned autonomy) |
| `meal_plans` | No planning (single decision paradigm) |

**Note**: `taste_signals` and `taste_meal_scores` (Phase 4) replaced the earlier "derived from decision_events" approach with explicit tables for better learning and cache efficiency.

### 4.3 Multi-Tenant / RLS

**V1 Assumption**: Single household, hardcoded `household_id = 'default'`

**Future-Proofing**: All tables include `household_id` column for easy RLS addition:

```sql
-- Future: Enable RLS
ALTER TABLE decision_os.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY household_isolation ON decision_os.inventory_items
    USING (household_id = current_setting('app.household_id')::uuid);
```

---

## 5. CLARIFICATION RESOLUTION RECOMMENDATIONS

### 5.1 Delivery Ordering in V1

**Decision**: Deep link only. No in-app ordering.

**Rationale**:
- Full ordering requires restaurant/menu integration (scope explosion)
- Deep link preserves single-action UX: "Order this from DoorDash" → opens DoorDash
- User still gets ONE action, execution happens externally
- Reduces liability (no payment processing)

**Implementation**:
```json
// action_type: "order" response
{
  "decision": {
    "action_type": "order",
    "order_target": {
      "restaurant_name": "Chipotle",
      "suggested_item": "Chicken Burrito Bowl",
      "deep_link": "doordash://restaurant/chipotle?item=chicken-bowl"
    }
  }
}
```

**V2 consideration**: In-app ordering if deep link conversion is low.

---

### 5.2 Household Composition

**Decision**: Implicit from first receipt + cooking outcomes.

**Rationale**:
- "How many people?" violates earned autonomy (user toggle)
- Receipt totals + portion sizes signal household size over time
- V1: Assume 2 adults (median US household)
- Adjust based on: portions in scanned receipts, DRM frequency (too small portions → more DRM)

**Implementation**:
- `household_size_estimate: 2` (default)
- After 5+ meals approved, recalculate from average ingredient quantities
- No explicit prompt to user

**Risk**: Early meals may be mis-portioned. Acceptable for v1 (user rejects, system learns).

---

### 5.3 Allergy Handling

**Decision**: One-time safety prompt on first launch. Hard constraints only.

**Rationale**:
- Allergies are safety-critical (cannot be learned from rejection)
- Single prompt ≠ preference toggles (it's a safety gate)
- Ask once, store forever, never show again

**Implementation**:
- On first `/decision-os` entry: "Any food allergies? (safety check)"
- Checkboxes: Gluten, Dairy, Nuts, Shellfish, Eggs, None
- Stored as hard constraints, meals filtered before scoring
- No "edit preferences" UI (if wrong, contact support)

**UI Copy**:
> "For your safety, we need to know about allergies. This is the only question we'll ask—everything else, we learn from your choices."

---

### 5.4 Meal Database Source

**Decision**: 50 curated meals, manually loaded, no external API.

**Rationale**:
- Quality over quantity for v1
- External APIs (Spoonacular, etc.) return option lists (anti-pattern)
- 50 meals × 2 adults × 7 days = 7 weeks before repeat (acceptable)
- Manual curation ensures consistent difficulty/time estimates

**Composition**:
- 15 × "easy" (≤15 min)
- 20 × "medium" (15-30 min)
- 15 × "pantry meals" (shelf-stable ingredients, for DRM)
- Cuisines: 30% American, 20% Mexican, 20% Italian, 15% Asian, 15% Other

**Loading**:
- SQL seed file in repo: `db/seeds/meals.sql`
- Run on deploy
- No admin UI for v1

---

### 5.5 "Skip Dinner" Semantics

**Decision**: Log skip, boost tomorrow's confidence threshold, no guilt.

**Rationale**:
- Skip is a valid outcome (user had other plans, ate out, etc.)
- System should not punish or guilt
- Tomorrow: slightly more confident decision (user may be hungrier)

**Implementation**:
```sql
-- On skip
INSERT INTO decision_os.drm_events (
    household_id, trigger_type, resolution, triggered_at, context_json
) VALUES (
    'default', 'user_initiated', 'skipped', NOW(), '{...}'
);
```

**Tomorrow adjustment**:
- `confidence_threshold = 0.35` (normally 0.40)
- First meal offered is a "comfort meal" (high historical acceptance)
- After successful tomorrow, threshold returns to normal

**UI on skip**:
> "Got it. See you tomorrow. 🍳"

No follow-up questions. No "why did you skip?" prompt.

---

## 6. MIGRATION & ROLLBACK STRATEGY

### 6.1 Migration Path

| Phase | Action | Rollback |
|-------|--------|----------|
| 1 | Create `/decision-os` folder structure | Delete folder |
| 2 | Add `decision_os` schema to Postgres | `DROP SCHEMA decision_os CASCADE` |
| 3 | Move legacy to `/legacy` folders | Move back |
| 4 | Change default route to `/decision-os` | Revert `_layout.tsx` |
| 5 | Enable CI invariant checks | Disable checks |

### 6.2 Rollback Triggers

- DRM rate > 50% for 7 consecutive days
- User retention drop > 30% week-over-week
- Critical bug in decision logic (wrong allergy filtering)

### 6.3 Data Preservation

- `decision_events` is append-only: survives rollback
- If rollback, legacy code ignores `decision_os` schema
- No data migration from legacy required (clean slate)

---

## 7. RISK REGISTRY (FORK-SPECIFIC)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Developers accidentally import from `/legacy` | High | Medium | ESLint rule: block cross-imports |
| Legacy patterns copy-pasted into decision-os | High | High | PR template checklist + invariant tests |
| Feature requests for "just one more option" | Very High | Critical | Product owner veto, documented invariants |
| Decision-os state leaks into AppContext | Medium | High | Separate context files, no shared state |
| CI invariant tests flaky | Medium | Medium | Deterministic mocks, no network calls |

---

## 8. IMPLEMENTATION READINESS CHECKLIST

Before Phase 1 build prompts:

- [ ] Folder structure created (empty files OK)
- [ ] Legacy files moved to `/legacy` subfolders
- [ ] `// @decision-os:quarantined` added to all legacy files
- [ ] ESLint rule `no-browse-patterns` implemented
- [ ] CI workflow `decision-os-invariants.yml` added
- [ ] Postgres `decision_os` schema created
- [ ] 50 seed meals loaded
- [ ] Allergy prompt screen designed
- [ ] Contract types defined in `/types/decision-os/`

---

**END FORK + GUARDRAILS ADDENDUM**

*This document provides implementation-ready guidance for the /decision-os bounded context. Philosophy leakage is prevented through structural isolation, automated checks, and explicit quarantine rules.*
