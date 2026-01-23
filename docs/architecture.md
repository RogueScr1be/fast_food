# Fast Food — Architecture

## Purpose
Fast Food compresses the weekly meal decision process into a fast loop:
Profile → Constraints → Pantry → Plan → Edit/Lock → Grocery → Repeat.

The product is multi-agent internally, but outputs are always structured and user-editable.

## High-Level Components
- **Web App (UI)**: profile, pantry, plan, grocery, edit/regen flows
- **API Layer**: validates inputs, orchestrates agents, persists outputs
- **Agents (logical modules)**: ProfileAgent, PlannerAgent, PantryAgent, GroceryAgent, SafetyAgent
- **Database (Supabase Postgres)**: users, households, constraints, pantry, plans, groceries, events
- **Analytics + Observability**: event capture + error capture

## Core Flow (MVP)
1) User creates Household Profile
2) User sets Constraints (hard vs soft)
3) User adds Pantry (manual at MVP)
4) User clicks Generate Plan
5) System:
   - Normalizes inputs (ProfileAgent)
   - Validates constraints + allergy blocks (SafetyAgent)
   - Generates plan (PlannerAgent)
   - Stores plan + rationale
6) User edits:
   - Lock meals
   - Swap a meal
   - Regen rest while preserving locks
7) System generates Grocery List (GroceryAgent)
   - Subtract pantry items (PantryAgent)

## Data Objects (Canonical)
These are the canonical types—UI + API + DB align to these shapes.

### HouseholdProfile
- id
- user_id
- household_size
- ages (optional)
- cooking_time_weeknight_minutes
- cooking_time_weekend_minutes
- equipment (airfryer, instantpot, grill, etc.)
- cuisine_likes (list)
- cuisine_dislikes (list)

### Constraints
Constraints are either HARD (never violate) or SOFT (prefer).
- allergies_hard: [ingredient/tag]
- exclusions_hard: [ingredient/tag] (e.g. pork)
- preferences_soft: [tag] (e.g. high-protein)
- budget_weekly_soft: number
- time_max_minutes_hard_or_soft: number + level
- leftovers_policy: enum (see domain.md)

### PantryState
MVP is manual. Future phases can include receipt scan/computer vision.
- pantry_items: [{ name, quantity?, unit?, category?, expires_at? }]
- confidence: enum (manual=high, inferred=medium/low)

### MealPlan
- id
- week_start_date
- meals: [MealSlot]
- compliance_report: { hard_constraints_met: boolean, notes: string[] }
- generation_metadata: { model, version, latency_ms }

### MealSlot
- slot_id
- day (Mon..Sun)
- meal_type (breakfast/lunch/dinner/snack)
- recipe_ref (or inline recipe object)
- locked: boolean
- tags: [string]
- estimated_time_minutes
- estimated_cost (optional)

### GroceryList
- id
- week_start_date
- items: [{ name, qty, unit?, category, from_recipe? }]
- pantry_subtractions: [{ name, qty_subtracted, reason }]
- store_sections: { produce:[], dairy:[], ... } (optional)

## Agent Boundaries
- **SafetyAgent** runs before and after planning (hard constraint verification)
- **PlannerAgent** proposes plan; must return structured MealPlan
- **PantryAgent** never overwrites manual pantry without explicit action
- **GroceryAgent** must subtract pantry items and explain subtractions

## Non-Goals (MVP)
- Automated ordering
- Receipt scanning
- Nutrition tracking beyond basic tags (avoid medical claims)
- Multi-store price optimization

---

## Dogfooding Rule: Fix Root Cause, Not Symptoms

Whenever AI makes a mistake (wrong file, wrong assumption, broke constraints, etc.):

1) **Identify the root cause:**
   - missing doc? unclear rule? ambiguous requirement? missing test?

2) **Patch the system so it never repeats:**
   - update CLAUDE.md rules / domain definitions / architecture notes
   - add validation or test
   - add a "Stop-and-Ask Trigger" if needed

3) **Record the learning** in decision-log or a short "Gotcha" section in domain.md
