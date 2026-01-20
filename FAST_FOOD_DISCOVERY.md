# FAST FOOD FOUNDATION DISCOVERY
## Principal Engineer Systems Assessment

**Status**: Discovery Complete  
**Date**: January 20, 2026  
**Scope**: Foundation architecture for decision-compression dinner OS

---

## 1. SYSTEM MAP (HIGH-LEVEL)

### Current State vs Required State

The existing codebase is a **generic meal planning chat app** built on React Native/Expo. It fundamentally violates the core Fast Food philosophy by:

| Aspect | Current Reality | Required State |
|--------|----------------|----------------|
| Decision Output | Multiple meal plans (7 days) | **Exactly ONE dinner action** |
| User Actions | Browse, plan, discover recipes | **Approve, Reject, or DRM only** |
| Autonomy Model | User-controlled preferences | **Earned autonomy, no toggles** |
| Decision Time | Unbounded (user exploration) | **<180 seconds** |
| Inventory | None | **Probabilistic receipt-based** |
| DRM | Non-existent | **Hard override system** |

### Proposed System Architecture (v1)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FAST FOOD OS                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐       │
│  │   CONTEXT    │───▶│    DECISION      │◀───│   TASTE      │       │
│  │   SERVICE    │    │    ARBITER       │    │   GRAPH      │       │
│  └──────────────┘    │  (Single Source) │    └──────────────┘       │
│         ▲            └────────┬─────────┘           ▲                │
│         │                     │                     │                │
│  ┌──────┴─────┐              │              ┌──────┴─────┐          │
│  │ INVENTORY  │              ▼              │  MEMORY    │          │
│  │  SERVICE   │       ┌──────────────┐      │  STORE     │          │
│  └────────────┘       │  EXECUTION   │      └────────────┘          │
│         ▲             │   ROUTER     │                               │
│         │             └──────┬───────┘                               │
│  ┌──────┴─────┐              │                                      │
│  │  RECEIPT   │              ▼                                      │
│  │    OCR     │       ┌──────────────┐                              │
│  └────────────┘       │     DRM      │                              │
│                       │   SERVICE    │                              │
│                       └──────────────┘                              │
│                                                                      │
│  ════════════════════════════════════════════════════════════════   │
│                         USER INTERFACE                               │
│      [ TONIGHT'S DINNER ] ──── [ APPROVE ] [ REJECT ] [ DRM ]       │
│  ════════════════════════════════════════════════════════════════   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. SERVICE BREAKDOWN

### A. Decision Arbiter (CORE - Must Build)

**Responsibility**: Single source of truth for dinner decisions. Emits exactly ONE action. Never options.

**Inputs**:
- Context signals (time, day, weather from Context Service)
- Inventory confidence scores (from Inventory Service)
- Taste graph weights (from Taste Graph)
- Recent rejection history (from Memory Store)
- DRM state flag

**Outputs**:
- Single `DinnerDecision` object:
  ```
  {
    decision_id: string
    meal_id: string
    action_type: 'cook' | 'order' | 'rescue'
    confidence: 0.0-1.0
    reasoning_hash: string (for debugging, never shown to user)
    expires_at: timestamp
  }
  ```

**Failure Modes**:
- No viable decision → triggers DRM automatically
- Confidence below threshold (0.4) → triggers DRM
- Timeout (>30s processing) → returns cached fallback or DRM

**Explicitly Does NOT**:
- Present multiple options
- Expose scoring internals to UI
- Allow user to browse alternatives
- Store preferences (that's Memory Store's job)

---

### B. Context Service (REQUIRED)

**Responsibility**: Aggregates real-world context signals that influence decision making.

**Inputs**:
- Device clock (time of day, day of week)
- Calendar integration (optional v2)
- Weather API (optional v1.1)
- Location (home detection only)

**Outputs**:
- `ContextSignal` object:
  ```
  {
    current_time: timestamp
    day_of_week: 0-6
    is_weeknight: boolean
    time_until_dinner_window: minutes
    is_in_dinner_window: boolean (5:00 PM - 8:30 PM default)
    weather_advisory: null | 'rain' | 'hot' | 'cold'
  }
  ```

**Failure Modes**:
- Clock unavailable → use server time
- Weather API down → null advisory (graceful degradation)

**Explicitly Does NOT**:
- Make decisions
- Store any user preferences
- Track user behavior

---

### C. Taste Graph Service (REQUIRED)

**Responsibility**: Maintains weighted preference model learned ONLY from accept/reject signals.

**Inputs**:
- Accept signals (meal_id, timestamp)
- Reject signals (meal_id, timestamp, optional reason_category)
- DRM events (what was chosen during rescue)

**Outputs**:
- Meal affinity scores (0.0-1.0) per meal_id
- Ingredient affinity scores
- Cuisine affinity scores
- Time-of-week patterns

**Failure Modes**:
- Cold start (no data) → use population-level defaults
- Corrupt graph → rebuild from Memory Store events

**Explicitly Does NOT**:
- Accept direct user input ("I like X")
- Expose preferences to user
- Allow manual adjustments
- Store allergies (that's a hard constraint, not preference)

---

### D. Inventory Service (REQUIRED - V1 SCOPE)

**Responsibility**: Probabilistic model of what ingredients are likely available.

**Inputs**:
- Receipt OCR data (items, quantities, prices)
- Time decay model (items deplete over time)
- Decision outcomes (if meal was cooked, ingredients were used)

**Outputs**:
- `InventoryState` per ingredient:
  ```
  {
    ingredient_id: string
    confidence: 0.0-1.0  // how sure we are it exists
    estimated_quantity: number | null
    last_seen: timestamp
    depletion_rate: number  // units per day estimate
  }
  ```

**Failure Modes**:
- No receipts scanned → all items at 0.3 confidence (pessimistic)
- OCR errors → items logged with lower confidence (0.5)
- Unknown items → attempt fuzzy match, log for review

**Error Tolerance (per spec: ~70% accuracy)**:
- System tolerates inventory being wrong
- Decisions should work even with 30% error rate
- Missing items: decision can still recommend, user rejects if wrong
- Phantom items: same, rejection feeds back to improve model

**Explicitly Does NOT**:
- Require accurate inventory to function
- Block decisions on missing data
- Ask user to manually update inventory
- Track non-food items

---

### E. DRM Service (CRITICAL)

**Responsibility**: Dinner Rescue Mode - hard override when normal flow fails.

**Explicit Triggers** (user-initiated):
- User taps DRM button
- User says "rescue me" (voice)

**Implicit Triggers** (system-initiated):
- 3 consecutive rejections in one session
- Decision Arbiter confidence < 0.4
- Decision Arbiter timeout
- Time past 7:30 PM with no decision made
- "do nothing" detected (no interaction for 45min in dinner window)

**Override Mechanics**:
1. DRM activates → suspends normal decision flow
2. Presents ONE emergency action (highest-confidence available)
3. If rejected → presents ONE delivery/takeout option
4. If rejected again → presents "skip dinner" acknowledgment
5. After 3 DRM rejections → DRM exhausted, logs event, exits

**Post-DRM Repair Actions**:
- Log DRM event with context
- Reduce confidence in meals rejected during DRM
- Next day: slightly more conservative decision threshold
- If DRM triggered by same meal pattern 3x: mark pattern as "problematic"

**Explicitly Does NOT**:
- Show multiple options
- Enable browsing
- Allow extended rescue sessions
- Guilt or shame user

---

### F. Execution Router (REQUIRED)

**Responsibility**: Translates decision into actionable output.

**Inputs**:
- `DinnerDecision` from Arbiter
- Action type ('cook', 'order', 'rescue')

**Outputs for 'cook'**:
- Recipe card (single view, no alternatives)
- Ingredient checklist
- Cook time estimate
- Optional: start timer

**Outputs for 'order'**:
- Restaurant name + dish
- Deep link to ordering app (UberEats, DoorDash) if available
- Estimated delivery time

**Outputs for 'rescue'**:
- Simplified rescue card
- Minimal info, maximum speed

**Explicitly Does NOT**:
- Show multiple recipes
- Enable recipe browsing
- Present restaurant options list
- Provide comparisons

---

### G. Memory Store (REQUIRED)

**Responsibility**: Append-only event log. Single source of truth for all learning.

**Events Stored**:
```
- DecisionPresented { decision_id, meal_id, timestamp, context_hash }
- DecisionApproved { decision_id, timestamp }
- DecisionRejected { decision_id, timestamp, reason_category? }
- DRMTriggered { trigger_type, context_hash, timestamp }
- DRMResolution { drm_id, resolution_type, meal_id?, timestamp }
- ReceiptScanned { receipt_id, item_count, timestamp }
- MealCompleted { decision_id, timestamp } // user confirms they cooked
```

**Failure Modes**:
- Write failure → retry 3x, then queue locally
- Read failure → use cached aggregates

**Explicitly Does NOT**:
- Store user preferences directly
- Allow deletion of events
- Expose raw events to user
- Enable "undo" of learning

---

## 3. AGENT INTERACTION DIAGRAM (TEXTUAL)

### Normal Decision Flow

```
1. User opens app (or push notification arrives)
           │
           ▼
2. Context Service → emits ContextSignal
           │
           ▼
3. Decision Arbiter receives:
   - ContextSignal
   - queries Inventory Service for confidence scores
   - queries Taste Graph for affinity scores
   - queries Memory Store for recent rejections
           │
           ▼
4. Decision Arbiter computes:
   - Filters meals by hard constraints (allergies via profile)
   - Scores remaining meals by:
     * inventory_confidence × taste_affinity × context_fit
   - Selects TOP 1 (no ties, deterministic tiebreaker)
           │
           ▼
5. Decision Arbiter emits: DinnerDecision
           │
           ▼
6. Execution Router:
   - Renders decision card
   - Presents: [APPROVE] [REJECT] [DRM]
           │
           ├──── User taps APPROVE ────▶ Memory Store logs approval
           │                                    │
           │                                    ▼
           │                            Show execution view (recipe/order)
           │
           ├──── User taps REJECT ─────▶ Memory Store logs rejection
           │                                    │
           │                                    ▼
           │                            Decision Arbiter re-runs
           │                            (with rejected meal excluded)
           │                            Returns to step 5
           │
           └──── User taps DRM ────────▶ DRM Service activates
                                        (see DRM flow below)
```

### DRM Override Flow

```
1. DRM triggered (explicit or implicit)
           │
           ▼
2. DRM Service:
   - Logs trigger event
   - Queries Decision Arbiter for emergency_decision
   - emergency_decision uses relaxed constraints:
     * Lower confidence threshold
     * Include "order" options
     * Faster timeout
           │
           ▼
3. Present rescue card: [USE THIS] [SKIP]
           │
           ├──── USE THIS ──────▶ Execution Router (rescue mode)
           │                              │
           │                              ▼
           │                      Memory Store logs DRM resolution
           │
           └──── SKIP ──────────▶ Cycle through max 2 more options
                                  Then: "Dinner skipped" + exit
```

### Memory Write Safety (No Feedback Loops)

**Problem**: If every signal immediately affects decisions, system oscillates.

**Solution**:
- Memory Store writes are batched
- Taste Graph updates run on 24-hour delay
- Decision Arbiter uses YESTERDAY'S taste weights
- Real-time only: rejection exclusion (hard filter, not weight change)

```
Timeline:
  Day 0: User rejects "Chicken Tacos" 
         → Immediate: Chicken Tacos excluded from Day 0 decisions
         → NOT immediate: Taste Graph weight change
         
  Day 1: Overnight batch job processes Day 0 events
         → Taste Graph recalculates chicken/taco affinity
         → New weights available for Day 1 decisions
```

---

## 4. INITIAL DATA SCHEMAS

### Meals Table

```sql
CREATE TABLE meals (
    meal_id         UUID PRIMARY KEY,
    name            TEXT NOT NULL,
    cuisine_type    TEXT,
    cook_time_min   INTEGER NOT NULL,
    cost_estimate   DECIMAL(5,2),
    difficulty      TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
    
    -- Hard constraints (not preferences)
    contains_gluten     BOOLEAN DEFAULT false,
    contains_dairy      BOOLEAN DEFAULT false,
    contains_nuts       BOOLEAN DEFAULT false,
    contains_shellfish  BOOLEAN DEFAULT false,
    is_vegetarian       BOOLEAN DEFAULT false,
    is_vegan            BOOLEAN DEFAULT false,
    
    created_at      TIMESTAMP DEFAULT NOW(),
    
    -- Intentionally omitted: user ratings, popularity scores
    -- (these create browse/rank behaviors)
);

CREATE TABLE meal_ingredients (
    meal_id         UUID REFERENCES meals(meal_id),
    ingredient_id   UUID REFERENCES ingredients(ingredient_id),
    quantity        TEXT,  -- "2 cups", "1 lb" - display only
    is_essential    BOOLEAN DEFAULT true,
    PRIMARY KEY (meal_id, ingredient_id)
);
```

### Ingredients Table

```sql
CREATE TABLE ingredients (
    ingredient_id   UUID PRIMARY KEY,
    name            TEXT NOT NULL,
    category        TEXT,  -- 'protein', 'vegetable', 'dairy', 'pantry', etc.
    standard_unit   TEXT,  -- 'count', 'lb', 'oz', 'cup'
    avg_shelf_days  INTEGER,  -- for depletion model
    
    created_at      TIMESTAMP DEFAULT NOW()
);
```

### Inventory Items (Probabilistic)

```sql
CREATE TABLE inventory_items (
    inventory_id    UUID PRIMARY KEY,
    household_id    UUID NOT NULL,  -- single household for v1
    ingredient_id   UUID REFERENCES ingredients(ingredient_id),
    
    confidence      DECIMAL(3,2) NOT NULL,  -- 0.00 to 1.00
    estimated_qty   DECIMAL(6,2),
    last_seen_at    TIMESTAMP NOT NULL,
    source          TEXT CHECK (source IN ('receipt', 'inferred', 'manual')),
    
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- No unique constraint on (household_id, ingredient_id)
-- Multiple records can exist, representing uncertainty
```

### Decision Outcomes

```sql
CREATE TABLE decision_outcomes (
    decision_id     UUID PRIMARY KEY,
    household_id    UUID NOT NULL,
    meal_id         UUID REFERENCES meals(meal_id),
    
    presented_at    TIMESTAMP NOT NULL,
    outcome         TEXT CHECK (outcome IN ('approved', 'rejected', 'drm_triggered', 'expired')),
    outcome_at      TIMESTAMP,
    
    -- Context snapshot at decision time
    context_json    JSONB NOT NULL,
    confidence      DECIMAL(3,2) NOT NULL,
    
    -- Intentionally omitted: user comments, detailed feedback
    -- (creates engagement trap, not decision compression)
);
```

### Rejection Reasons (Constrained)

```sql
CREATE TABLE rejection_reasons (
    rejection_id    UUID PRIMARY KEY,
    decision_id     UUID REFERENCES decision_outcomes(decision_id),
    
    -- Constrained categories only, no free text
    reason_category TEXT CHECK (reason_category IN (
        'not_in_mood',      -- taste preference signal
        'missing_ingredient', -- inventory signal  
        'not_enough_time',  -- context signal
        'too_expensive',    -- budget signal
        'other'             -- catch-all, no further detail
    )),
    
    created_at      TIMESTAMP DEFAULT NOW()
    
    -- Intentionally omitted: reason_text, detailed feedback
    -- Users should not explain; system learns from patterns
);
```

### DRM Events

```sql
CREATE TABLE drm_events (
    drm_id          UUID PRIMARY KEY,
    household_id    UUID NOT NULL,
    
    trigger_type    TEXT CHECK (trigger_type IN (
        'user_initiated',
        'consecutive_rejections',
        'low_confidence',
        'timeout',
        'late_hour',
        'inactivity'
    )),
    triggered_at    TIMESTAMP NOT NULL,
    
    resolution_type TEXT CHECK (resolution_type IN (
        'meal_accepted',
        'order_accepted', 
        'skipped',
        'exhausted'
    )),
    resolved_meal_id UUID REFERENCES meals(meal_id),
    resolved_at     TIMESTAMP,
    
    -- Context for post-DRM analysis
    context_json    JSONB NOT NULL,
    attempts_count  INTEGER DEFAULT 0
);
```

### What Is Intentionally Omitted

- **Recipe browsing tables**: No categories, tags, search indexes
- **User preferences table**: No explicit preferences (learned only)
- **Ratings/reviews**: Creates browse behavior
- **Meal plans table**: No weekly planning (one decision at a time)
- **Social tables**: No sharing, no friends, no groups
- **Gamification**: No points, streaks, achievements
- **Nutrition tracking**: Not in v1 scope

---

## 5. DECISION + DRM LOGIC (V1)

### Decision Logic (Rule-Based, Pre-ML)

**Phase 1: Hard Filtering**
```python
def filter_meals(all_meals, household):
    """Remove meals that violate hard constraints"""
    
    eligible = []
    for meal in all_meals:
        # Allergy constraints (absolute)
        if household.has_gluten_allergy and meal.contains_gluten:
            continue
        if household.has_dairy_allergy and meal.contains_dairy:
            continue
        if household.has_nut_allergy and meal.contains_nuts:
            continue
        if household.has_shellfish_allergy and meal.contains_shellfish:
            continue
            
        # Recent rejection (24h exclusion)
        if meal.id in get_rejected_last_24h(household):
            continue
            
        eligible.append(meal)
    
    return eligible
```

**Phase 2: Scoring**
```python
def score_meal(meal, context, inventory, taste_graph):
    """Calculate composite score for single meal"""
    
    # Time fit (0.0 - 1.0)
    time_score = 1.0
    if context.time_until_dinner < meal.cook_time_min:
        time_score = 0.3  # Can still suggest, but penalized
    elif context.time_until_dinner < meal.cook_time_min + 15:
        time_score = 0.7  # Tight but possible
    
    # Inventory confidence (0.0 - 1.0)
    ingredient_confidences = []
    for ingredient in meal.essential_ingredients:
        inv = inventory.get(ingredient.id)
        conf = inv.confidence if inv else 0.3  # Pessimistic default
        ingredient_confidences.append(conf)
    
    inventory_score = min(ingredient_confidences)  # Weakest link
    
    # Taste affinity (0.0 - 1.0)
    taste_score = taste_graph.get_meal_affinity(meal.id)
    if taste_score is None:  # Cold start
        taste_score = 0.5  # Neutral
    
    # Day-of-week bonus (learned pattern)
    dow_bonus = taste_graph.get_dow_affinity(meal.id, context.day_of_week)
    if dow_bonus:
        taste_score = taste_score * 0.8 + dow_bonus * 0.2
    
    # Composite score
    final_score = (
        time_score * 0.25 +
        inventory_score * 0.35 +
        taste_score * 0.40
    )
    
    return final_score
```

**Phase 3: Selection**
```python
def select_decision(eligible_meals, context, inventory, taste_graph):
    """Select exactly ONE meal"""
    
    if not eligible_meals:
        return None  # Triggers DRM
    
    scored = []
    for meal in eligible_meals:
        score = score_meal(meal, context, inventory, taste_graph)
        scored.append((meal, score))
    
    # Sort by score descending
    scored.sort(key=lambda x: x[1], reverse=True)
    
    top_meal, top_score = scored[0]
    
    # Confidence threshold
    if top_score < 0.4:
        return None  # Triggers DRM
    
    # Deterministic tiebreaker (if scores equal to 2 decimal places)
    # Use meal_id hash to ensure consistent ordering
    
    return DinnerDecision(
        meal_id=top_meal.id,
        action_type='cook',
        confidence=top_score
    )
```

### How "Do Nothing" Becomes DRM Trigger

```python
async def monitor_dinner_window(household):
    """Background task running during dinner window"""
    
    window_start = time(17, 0)  # 5:00 PM
    window_end = time(20, 30)   # 8:30 PM
    
    last_interaction = None
    inactivity_threshold = timedelta(minutes=45)
    late_hour_threshold = time(19, 30)  # 7:30 PM
    
    while in_dinner_window():
        current = datetime.now()
        
        # Check for inactivity
        if last_interaction:
            if current - last_interaction > inactivity_threshold:
                trigger_drm('inactivity', household)
                return
        
        # Check for late hour with no decision
        if current.time() > late_hour_threshold:
            if not has_decision_today(household):
                trigger_drm('late_hour', household)
                return
        
        await sleep(60)  # Check every minute
```

---

## 6. KNOWN UNKNOWNS

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Receipt OCR accuracy < 70% | Medium | High | Multiple OCR providers, fuzzy matching, user can reject bad scans |
| Cold start problem (no data) | High | Medium | Population-level defaults, accept more uncertainty early |
| Single-decision UX feels limiting | High | Medium | Strong onboarding explaining philosophy, DRM as safety valve |
| Background task reliability (iOS/Android) | Medium | High | Push notifications as fallback, server-side dinner window tracking |

### Product Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Users want to browse/plan | Very High | Critical | **This is the core bet. Must hold firm.** Provide DRM escape hatch only. |
| Users don't trust single recommendation | High | High | Show confidence subtly, build trust through successful decisions |
| DRM becomes primary mode | Medium | High | Track DRM rate, if >30% investigate cause |
| Users reject repeatedly to "browse" | Medium | Medium | Rate-limit rejections, 3 rejections → forced DRM |

### Data Integrity Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Taste graph poisoned by bad data | Low | High | Anomaly detection, 24h delay before weight updates |
| Inventory drift from reality | High | Medium | Confidence decay over time, reset on new receipt |
| Memory Store corruption | Low | Critical | Append-only design, regular backups, event replay capability |

### Autonomy Trust Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| System makes same mistake repeatedly | Medium | High | Track rejection patterns, auto-demote after 3x |
| User feels powerless | Medium | High | DRM always available, clear "why" indicators |
| System too conservative (same meals) | Medium | Medium | Exploration factor (10% random boost to lower-scored meals) |

---

## 7. RECOMMENDED NEXT BUILD PHASE

### Phase 1: Foundation (Weeks 1-3)

**Goal**: Core decision loop working end-to-end

1. **Decision Arbiter** - stub implementation
   - Rule-based scoring (no ML)
   - Single meal selection
   - Confidence calculation

2. **Memory Store** - event logging
   - Append-only event table
   - Basic event types (approve, reject)

3. **Minimal UI**
   - Single decision card
   - Approve/Reject buttons
   - DRM button (stub)

4. **Seed Data**
   - 50 meals with ingredients
   - Basic ingredient list

### Phase 2: Inventory (Weeks 4-5)

1. **Inventory Service**
   - Receipt OCR integration (use external provider)
   - Confidence scoring
   - Time decay model

2. **Receipt Scanner** (repurpose existing component)
   - Clean up existing code
   - Connect to Inventory Service

### Phase 3: DRM (Weeks 6-7)

1. **DRM Service**
   - Trigger detection
   - Rescue flow
   - Post-DRM logging

2. **Dinner Window Monitor**
   - Background task or server-side
   - Push notification fallback

### Phase 4: Taste Learning (Weeks 8-10)

1. **Taste Graph Service**
   - Batch processing job
   - Affinity calculations
   - Day-of-week patterns

2. **Integration**
   - Connect to Decision Arbiter
   - Feedback loop testing

### Phase 5: Polish (Weeks 11-12)

1. **Confidence display** (subtle)
2. **Decision history** (minimal, not browsable)
3. **Error handling** hardening
4. **Performance optimization** (<180s guarantee)

---

## 8. EXISTING CODE ASSESSMENT

### Components to Repurpose

| Component | Current State | Repurpose Potential |
|-----------|--------------|---------------------|
| `ReceiptScanner.tsx` | Mock OCR, good UI | High - connect to real OCR |
| `ChatService.ts` | Generic chat | Low - wrong paradigm |
| `NotificationService.ts` | Full featured | High - use for DRM/dinner window |
| `AppContext.tsx` | Meal plans, profiles | Medium - simplify drastically |
| `OptimizedApiService.ts` | Caching, retry logic | High - reuse infrastructure |

### Components to Remove/Rebuild

| Component | Reason |
|-----------|--------|
| `app/(tabs)/index.tsx` | Multiple options, browse UI |
| `app/(tabs)/chat.tsx` | Chat paradigm violates single-decision |
| `app/(tabs)/profile.tsx` | User preferences exposed |
| `app/recipe/[id].tsx` | Recipe discovery/browsing |
| `components/SmartSuggestions.tsx` | Multiple suggestions = bad |
| `components/SuggestionChips.tsx` | Options presentation |

### Tech Stack Adjustment

**Current**: React Native / Expo (mobile-first)  
**Spec Assumed**: React (web)

**Recommendation**: Keep React Native/Expo. Mobile-first is actually better for:
- Push notifications (DRM triggers)
- Receipt scanning (camera access)
- Quick interactions (approve/reject)
- Dinner window presence

Backend can remain API-first with Postgres. Consider:
- FastAPI (Python) or Express (Node) for backend
- Supabase or Railway for managed Postgres
- External OCR: Google Cloud Vision or AWS Textract

---

## 9. INVARIANT VIOLATION FLAGS

The following aspects of the current codebase **directly violate** Fast Food invariants:

1. **Weekly meal plans** (`currentMealPlan: MealPlan[]`) - violates "exactly one decision"
2. **Recipe browsing** (`app/recipe/[id].tsx`) - violates "no browsing"
3. **Preference settings** (`userProfile.favorites`, `userProfile.timePreference`) - violates "earned autonomy"
4. **Chat interface** - encourages exploration, not decision compression
5. **Multiple suggestion chips** - violates "never present multiple options"

### Required Removals for Compliance

```diff
- currentMealPlan: MealPlan[]  // Array = multiple options
+ currentDecision: DinnerDecision | null  // Single decision

- favorites: string[]  // User-stated preference
+ // (removed - learned only from accept/reject)

- timePreference: string  // User toggle
+ // (removed - inferred from context)

- skipNights: string[]  // User planning
+ // (removed - no planning UI)
```

---

## 10. CLARIFICATION REQUESTS

Before proceeding to implementation, the following require product decision:

1. **Order flow scope**: Does v1 include delivery ordering, or only "cook at home"?
   - If ordering included: need restaurant/menu data source
   - If not: simplifies significantly

2. **Household composition input**: How do we get # adults/kids?
   - One-time onboarding (violates "no toggles")?
   - Inferred from order sizes over time?
   - Assumed default?

3. **Allergy handling**: Hard constraints require explicit input. How obtained?
   - One-time onboarding (acceptable for safety)?
   - Medical integration (out of scope)?

4. **Meal database source**: Where do the 50+ seed meals come from?
   - Manual curation?
   - Licensed recipe database?
   - AI generation (quality concern)?

5. **"Skip dinner" semantics**: What happens the next day?
   - Ignore?
   - Boost confidence of skipped meal type?
   - Reduce overall suggestion aggressiveness?

---

**END DISCOVERY DOCUMENT**

*This document maps the system required to build Fast Food Foundation. No implementation code was generated. All schemas and logic descriptions are illustrative only.*
