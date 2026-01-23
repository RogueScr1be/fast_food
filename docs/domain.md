# Fast Food — Domain Definitions (Source of Truth)

## Core Terms

### HARD Constraint
A rule the system must never violate.
Examples:
- Allergies (nuts, shellfish)
- Religious exclusions (pork)
- "Must be vegetarian" (if set as hard)

### SOFT Constraint
A preference the system should try to satisfy but can trade off.
Examples:
- "High protein"
- "Mediterranean"
- "Low cost"

### Pantry
What the household currently has at home.
MVP pantry is user-entered and treated as high confidence.
Future: inferred pantry (receipt scan, photo, CV) treated as lower confidence.

### Leftovers Policy (MVP)
Defines how the system uses leftovers.
Enum:
- **NONE**: plan assumes no leftovers usage
- **LIGHT**: allow 1 leftover reuse per week
- **HEAVY**: allow 2–3 leftover reuses per week

Rules:
- Leftovers cannot violate allergies/exclusions.
- If leftovers are used, grocery list must reflect reduced ingredients.

### Meal Lock
A user action that prevents the system from changing a meal slot during regen.

### Regenerate (Regen)
Rebuild part of a plan while preserving locks.
MVP behavior:
- Preserve all locked meal slots
- Replace all unlocked slots
- Keep constraints identical unless user changed them

### Compliance Report
A human-readable explanation of how the plan met constraints.
Must include:
- hard constraints satisfied: true/false
- any tradeoffs on soft constraints
- notes for user if constraints are conflicting

## Safety + Claims
Fast Food is not medical advice.
- Never claim health outcomes ("cures", "treats", "reduces diabetes", etc.)
- If user enters medical condition: provide disclaimer and treat as preference constraints only.

## Pantry Subtraction
When generating grocery list:
- Subtract pantry items where matching is confident.
- Always show pantry_subtractions so user can verify.
- Never subtract below 0.
- If pantry qty unknown: subtract conservatively (or not at all), note uncertainty.

## Common Failure Modes (and required handling)
- **Conflicting constraints** (nut allergy + only peanut recipes):
  - Must ask user to relax soft constraints; never violate hard.
- **Overly restrictive time**:
  - Offer "quick mode" recipes or reduce complexity.
- **Pantry mismatch**:
  - Provide clear subtractions + allow user to edit pantry.

---

## Gotchas (Learned from Mistakes)

_Record lessons learned here when the AI or system makes a preventable mistake._

### Example Format:
**Date:** YYYY-MM-DD
**Gotcha:** [What went wrong]
**Root Cause:** [Why it happened]
**Fix Applied:** [What was changed to prevent recurrence]

---

_(Add entries as issues are discovered)_
